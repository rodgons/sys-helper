// Package assistant runs one AI turn in a Project's Conversation: it builds the model's context,
// streams the reply, and saves it once it is complete.
package assistant

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"sys-helper/backend/internal/architecture"
	"sys-helper/backend/internal/conversation"
	"sys-helper/backend/internal/knowledge"
	"sys-helper/backend/internal/llm"
	"sys-helper/backend/internal/proposal"
	"sys-helper/backend/internal/usage"
)

var (
	// ErrNothingToReply means the Conversation ends with neither a User message nor a Proposal the
	// User has just reviewed.
	ErrNothingToReply = errors.New("the conversation has nothing to reply to")
	// ErrBusy means a reply for this Project is already being generated.
	ErrBusy = errors.New("a reply is already in progress")
	// ErrUnavailable means no model can answer: none is configured, or every free model is busy
	// (llm.ErrExhausted), which passes.
	ErrUnavailable = errors.New("no AI model is available")
)

type Assistant struct {
	Model         llm.ChatModel
	Conversations interface {
		Recent(ctx context.Context, userID, suffix string, n int) ([]conversation.Message, error)
		AppendReply(ctx context.Context, userID, suffix, body, model string, changes *proposal.Changes, baseVersion int) (conversation.Message, error)
	}
	Architectures interface {
		Get(ctx context.Context, userID, suffix string) (architecture.Versioned, error)
	}
	Knowledge interface {
		Get(ctx context.Context, userID, suffix string) (knowledge.Knowledge, error)
	}
	// Usage records each model call against the User's daily cap (usage.Meter). It returns
	// usage.ErrDailyLimit once the cap is reached.
	Usage interface {
		Record(ctx context.Context, userID string) error
	}
	// HistoryLimit is how many recent Messages the model sees. The Architecture, Requirements and
	// Decisions carry the long-term memory, so older chat matters less.
	HistoryLimit int
	// Timeout bounds a whole reply.
	Timeout time.Duration

	inFlight sync.Map // userID + suffix → struct{}
}

// proposalAttempts is how many times the model may submit propose_changes in one reply: an
// invalid Proposal is sent back with the validation error so the model can correct it.
const proposalAttempts = 2

// maxProposalsInARow is how many Proposals the AI may make without a User message in between.
// Each review gives the AI another turn, so without a cap it could keep proposing indefinitely.
const maxProposalsInARow = 3

// Reply answers the Conversation's last User message, possibly with a Proposal. If the Conversation
// instead ends with a Proposal the User accepted or rejected, Reply continues from that review, so
// the AI keeps leading until it stops proposing. onText receives
// the reply as it streams; the reply is saved only if it completes, so a failed reply can simply be
// retried.
func (a *Assistant) Reply(ctx context.Context, userID, suffix string, onText func(string)) (conversation.Message, error) {
	if a.Model == nil {
		return conversation.Message{}, ErrUnavailable
	}
	key := userID + "/" + suffix
	if _, busy := a.inFlight.LoadOrStore(key, struct{}{}); busy {
		return conversation.Message{}, ErrBusy
	}
	defer a.inFlight.Delete(key)

	// The model sees only the recent history, so only that is read.
	msgs, err := a.Conversations.Recent(ctx, userID, suffix, a.HistoryLimit)
	if err != nil {
		return conversation.Message{}, err
	}
	if len(msgs) == 0 || (msgs[len(msgs)-1].Role != conversation.RoleUser && reviewed(msgs[len(msgs)-1]) == nil) {
		return conversation.Message{}, ErrNothingToReply
	}
	arch, err := a.Architectures.Get(ctx, userID, suffix)
	if err != nil {
		return conversation.Message{}, err
	}
	known, err := a.Knowledge.Get(ctx, userID, suffix)
	if err != nil {
		return conversation.Message{}, err
	}
	req, err := a.request(msgs, arch.Document, known)
	if err != nil {
		return conversation.Message{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, a.Timeout)
	defer cancel()
	var reply strings.Builder
	var accepted *proposal.Changes
	var problems []string  // why each rejected propose_changes call was invalid
	var arguments []string // and what it sent
	note := ""             // appended to the reply when it ends without the Proposal the model was making
	model := ""            // the model that answered the last call
	for attempt := 1; ; attempt++ {
		// Every model call costs money, retries included, so each one counts against the cap.
		if err := a.Usage.Record(ctx, userID); err != nil {
			if attempt > 1 && errors.Is(err, usage.ErrDailyLimit) {
				note = "(I've reached today's AI limit, so I couldn't finish this proposal. It resets at midnight UTC.)"
				break
			}
			return conversation.Message{}, err
		}
		text, call, answered, err := a.stream(ctx, req, onText)
		if err != nil {
			// A retry no model could take, or that the global budget refused, failed before sending
			// anything: keep the reply so far.
			if attempt > 1 && (errors.Is(err, llm.ErrExhausted) || errors.Is(err, usage.ErrDailyLimit)) {
				slog.Warn("no model took the proposal retry", "project", suffix, "error", err)
				note = "(I couldn't finish this proposal because the AI is busy right now. Ask me to try again shortly.)"
				break
			}
			if errors.Is(err, llm.ErrExhausted) {
				return conversation.Message{}, fmt.Errorf("%w: %w", ErrUnavailable, err)
			}
			return conversation.Message{}, err
		}
		model = answered
		reply.WriteString(text)
		if call == nil {
			break
		}
		changes, problem := parseChanges(*call, arch.Document, known)
		if problem == nil {
			accepted = &changes
			break
		}
		problems = append(problems, problem.Error())
		arguments = append(arguments, call.Arguments)
		if attempt == proposalAttempts {
			note = "(I couldn't turn this into a valid proposal for the canvas. Ask me to try again.)"
			// The User only sees a generic note, so tell the developer what the model got wrong.
			slog.Warn("model gave up on a proposal: every propose_changes call was invalid",
				"project", suffix, "attempts", attempt, "problems", problems, "arguments", arguments)
			break
		}
		// Show the call and what was wrong with it, and let another model try, if there is one: the
		// same model tends to repeat its mistake.
		if model != "" {
			req.Avoid = append(req.Avoid, model)
		}
		req.Messages = append(req.Messages,
			llm.Message{Role: llm.RoleAssistant, Content: text, ToolCalls: []llm.ToolCall{*call}},
			llm.Message{Role: llm.RoleTool, ToolCallID: call.ID, Content: "The proposal was not saved: " + problem.Error() + ". Call propose_changes again with corrected changes."},
		)
	}

	body := strings.TrimSpace(reply.String())
	if note != "" {
		body = strings.TrimSpace(body + "\n\n" + note)
	}
	if body == "" && accepted != nil {
		body = accepted.Summary
	}
	if body == "" {
		return conversation.Message{}, errors.New("model reply: empty")
	}
	body = conversation.CapReply(body)
	// Save even if the client went away mid-stream: the reply is complete and paid for.
	return a.Conversations.AppendReply(context.WithoutCancel(ctx), userID, suffix, body, model, accepted, arch.Version)
}

// stream runs one model call, forwarding text to onText. It returns the text, the first tool
// call, if any, and the model that answered ("" if unknown).
func (a *Assistant) stream(ctx context.Context, req llm.Request, onText func(string)) (text string, call *llm.ToolCall, model string, err error) {
	var b strings.Builder
	for ev, err := range a.Model.Stream(ctx, req) {
		if err != nil {
			return "", nil, "", fmt.Errorf("model reply: %w", err)
		}
		if ev.Model != "" {
			model = ev.Model
		}
		if ev.Text != "" {
			b.WriteString(ev.Text)
			onText(ev.Text)
		}
		if ev.ToolCall != nil && call == nil {
			call = ev.ToolCall
		}
	}
	return b.String(), call, model, nil
}

// parseChanges reads a tool call as a Proposal and checks it. Calls to other tools are invalid
// too, so the model hears about them instead of the reply ending empty.
func parseChanges(call llm.ToolCall, doc architecture.Document, known knowledge.Knowledge) (proposal.Changes, error) {
	changes, err := proposal.FromCall(call.Name, call.Arguments)
	if err != nil {
		return proposal.Changes{}, err
	}
	changes.Normalize()
	return changes, changes.Validate(doc, known)
}

func (a *Assistant) request(msgs []conversation.Message, doc architecture.Document, known knowledge.Knowledge) (llm.Request, error) {
	canvas, err := describeCanvas(doc)
	if err != nil {
		return llm.Request{}, err
	}
	req := llm.Request{
		// Enough for thinking models (e.g. GLM-5.3), which spend thousands of tokens reasoning before
		// they call propose_changes, while keeping a reply's text near the 20,000 characters a
		// Message can store. Longer text is cut by conversation.CapReply.
		MaxTokens: 4096,
		// One system message: some chat templates (e.g. Gemma's) accept only one.
		Messages: []llm.Message{
			{Role: llm.RoleSystem, Content: systemPrompt + "\n\n" + describeKnowledge(known) + "\n\n" + architectureNote + canvas},
		},
	}
	why := mustNotPropose(msgs)
	if why == "" {
		req.Tools = []llm.Tool{proposal.Tool}
	}
	if len(msgs) > a.HistoryLimit {
		msgs = msgs[len(msgs)-a.HistoryLimit:]
	}
	for _, m := range msgs {
		if m.Role == conversation.RoleUser {
			req.Messages = append(req.Messages, llm.Message{Role: llm.RoleUser, Content: m.Body})
			continue
		}
		content := m.Body
		if p := m.Proposal; p != nil {
			// The model only sees text history, so note what became of its earlier Proposals.
			content += fmt.Sprintf("\n\n[Proposal #%d \"%s\": %s by the user]", p.Seq, p.Summary, describeStatus(p.Status))
		}
		req.Messages = append(req.Messages, llm.Message{Role: llm.RoleAssistant, Content: content})
	}
	if p := reviewed(msgs[len(msgs)-1]); p != nil {
		// Chat templates expect a user turn last; the review is the User's turn.
		content := fmt.Sprintf("[I %s proposal #%d \"%s\". Continue.]", p.Status, p.Seq, p.Summary)
		if why != "" {
			content = fmt.Sprintf("[I %s proposal #%d \"%s\". %s]", p.Status, p.Seq, p.Summary, why)
		}
		req.Messages = append(req.Messages, llm.Message{Role: llm.RoleUser, Content: content})
	}
	return req, nil
}

// mustNotPropose says why the AI's next turn may only talk, or "" if it may propose. After a
// rejection it should find out what didn't fit rather than propose again, and after
// maxProposalsInARow Proposals with no User message in between it should check in with the User.
func mustNotPropose(msgs []conversation.Message) string {
	if p := reviewed(msgs[len(msgs)-1]); p != nil && p.Status == conversation.ProposalRejected {
		return "Don't propose anything now: ask what I'd change, or describe another approach and let me ask for it."
	}
	inARow := 0
	for i := len(msgs) - 1; i >= 0 && msgs[i].Role != conversation.RoleUser; i-- {
		if msgs[i].Proposal != nil {
			inARow++
		}
	}
	if inARow >= maxProposalsInARow {
		return "Don't propose anything now: sum up where the design stands and ask me how to continue."
	}
	return ""
}

// reviewed returns m's Proposal if the User accepted or rejected it.
func reviewed(m conversation.Message) *conversation.Proposal {
	if p := m.Proposal; p != nil && (p.Status == conversation.ProposalAccepted || p.Status == conversation.ProposalRejected) {
		return p
	}
	return nil
}

func describeStatus(s conversation.ProposalStatus) string {
	switch s {
	case conversation.ProposalPending:
		return "not yet reviewed"
	case conversation.ProposalSuperseded:
		return "replaced by a later proposal, not reviewed"
	default:
		return string(s)
	}
}

// canvasBudget caps the characters of the canvas JSON in each prompt. An Architecture can hold up to
// 500 Components, far more than a free model's context takes; past the budget it is trimmed.
const canvasBudget = 40000

// describeCanvas writes the Architecture as JSON for the system prompt, without positions (the
// model never needs them). Components go in order until the budget is spent, then the Connections
// between those shown, with a note of what was left out.
func describeCanvas(doc architecture.Document) (string, error) {
	type component struct {
		ID         string            `json:"id"`
		Type       string            `json:"type"`
		Name       string            `json:"name"`
		Properties map[string]string `json:"properties,omitempty"`
	}
	var components, connections []string
	shown := map[string]bool{}
	used := 0
	for _, c := range doc.Components {
		b, err := json.Marshal(component{c.ID, c.Type, c.Name, c.Properties})
		if err != nil {
			return "", err
		}
		if used+len(b) > canvasBudget {
			break
		}
		used += len(b) + 1
		components = append(components, string(b))
		shown[c.ID] = true
	}
	hiddenConnections := 0
	for _, c := range doc.Connections {
		b, err := json.Marshal(c)
		if err != nil {
			return "", err
		}
		if !shown[c.Source] || !shown[c.Target] || used+len(b) > canvasBudget {
			hiddenConnections++
			continue
		}
		used += len(b) + 1
		connections = append(connections, string(b))
	}
	out := `{"components":[` + strings.Join(components, ",") + `],"connections":[` + strings.Join(connections, ",") + `]}`
	if hidden := len(doc.Components) - len(components); hidden > 0 || hiddenConnections > 0 {
		out += fmt.Sprintf("\n(%d more components and %d more connections not shown, to keep this prompt short. "+
			"Don't refer to items you can't see; ask the user about that part of the design instead.)", hidden, hiddenConnections)
	}
	return out, nil
}

// knowledgeBudget caps the characters of Requirements and Decisions in each prompt. A Project can
// hold far more (knowledge.MaxRequirements, MaxDecisions); past the budget the lists are trimmed.
const knowledgeBudget = 24000

// describeKnowledge writes the Project's knowledge as plain text for the system prompt.
func describeKnowledge(k knowledge.Knowledge) string {
	var b strings.Builder
	level := k.ExperienceLevel
	if level == "" {
		level = "unknown (ask early, then record it with a set_experience_level change in propose_changes)"
	}
	fmt.Fprintf(&b, "The user's experience level: %s.\n\nRequirements:\n", level)

	requirements := make([]string, len(k.Requirements))
	for i, r := range k.Requirements {
		requirements[i] = fmt.Sprintf("- %s [%s] %s\n", knowledge.RequirementID(r.Num), r.Category, r.Statement)
	}
	decisions := make([]string, len(k.Decisions))
	for i, d := range k.Decisions {
		cites := make([]string, len(d.Requirements))
		for j, n := range d.Requirements {
			cites[j] = knowledge.RequirementID(n)
		}
		line := fmt.Sprintf("- %s %s (on %s; serves %s; by %s)", knowledge.DecisionID(d.Num), d.Title,
			strings.Join(d.Targets, ", "), orNone(strings.Join(cites, ", ")), d.Author)
		if d.NeedsReview {
			line += " NEEDS REVIEW: a requirement it cites changed"
		}
		decisions[i] = line + "\n"
	}
	// Each list gets half the budget, plus whatever the other one doesn't need.
	requirementBudget := max(knowledgeBudget/2, knowledgeBudget-length(decisions))
	decisionBudget := knowledgeBudget - min(length(requirements), requirementBudget)

	writeList(&b, requirements, requirementBudget, "requirements")
	b.WriteString("\nDecisions:\n")
	writeList(&b, decisions, decisionBudget, "decisions")
	return strings.TrimRight(b.String(), "\n")
}

// writeList writes lines in order until the next one would exceed budget, then notes how many it
// left out.
func writeList(b *strings.Builder, lines []string, budget int, noun string) {
	if len(lines) == 0 {
		b.WriteString("(none recorded yet)\n")
		return
	}
	used := 0
	for i, line := range lines {
		if used += len(line); used > budget {
			fmt.Fprintf(b, "- (%d more %s not shown, to keep this prompt short)\n", len(lines)-i, noun)
			return
		}
		b.WriteString(line)
	}
}

func length(lines []string) int {
	n := 0
	for _, l := range lines {
		n += len(l)
	}
	return n
}

func orNone(s string) string {
	if s == "" {
		return "no requirement"
	}
	return s
}
