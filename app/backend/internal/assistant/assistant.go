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
)

var (
	// ErrNothingToReply means the Conversation ends with neither a User message nor a Proposal the
	// User has just reviewed.
	ErrNothingToReply = errors.New("the conversation has nothing to reply to")
	// ErrBusy means a reply for this Project is already being generated.
	ErrBusy = errors.New("a reply is already in progress")
	// ErrUnavailable means no model is configured.
	ErrUnavailable = errors.New("no AI model is configured")
)

type Assistant struct {
	Model         llm.ChatModel
	Conversations interface {
		List(ctx context.Context, userID, suffix string) ([]conversation.Message, error)
		AppendReply(ctx context.Context, userID, suffix, body string, changes *proposal.Changes, baseVersion int) (conversation.Message, error)
	}
	Architectures interface {
		Get(ctx context.Context, userID, suffix string) (architecture.Versioned, error)
	}
	Knowledge interface {
		Get(ctx context.Context, userID, suffix string) (knowledge.Knowledge, error)
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

	msgs, err := a.Conversations.List(ctx, userID, suffix)
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
	gaveUp := false
	for attempt := 1; ; attempt++ {
		text, call, err := a.stream(ctx, req, onText)
		if err != nil {
			return conversation.Message{}, err
		}
		reply.WriteString(text)
		if call == nil {
			break
		}
		changes, problem := parseChanges(call.Arguments, arch.Document, known)
		if problem == nil {
			accepted = &changes
			break
		}
		problems = append(problems, problem.Error())
		arguments = append(arguments, call.Arguments)
		if attempt == proposalAttempts {
			gaveUp = true
			// The User only sees a generic note, so tell the developer what the model got wrong.
			slog.Warn("model gave up on a proposal: every propose_changes call was invalid",
				"project", suffix, "attempts", attempt, "problems", problems, "arguments", arguments)
			break
		}
		// Show the model its call and what was wrong with it, and let it try again.
		req.Messages = append(req.Messages,
			llm.Message{Role: llm.RoleAssistant, Content: text, ToolCalls: []llm.ToolCall{*call}},
			llm.Message{Role: llm.RoleTool, ToolCallID: call.ID, Content: "The proposal was not saved: " + problem.Error() + ". Call propose_changes again with corrected changes."},
		)
	}

	body := strings.TrimSpace(reply.String())
	if gaveUp {
		body = strings.TrimSpace(body + "\n\n(I couldn't turn this into a valid proposal for the canvas. Ask me to try again.)")
	}
	if body == "" && accepted != nil {
		body = accepted.Summary
	}
	if body == "" {
		return conversation.Message{}, errors.New("model reply: empty")
	}
	// Save even if the client went away mid-stream: the reply is complete and paid for.
	return a.Conversations.AppendReply(context.WithoutCancel(ctx), userID, suffix, body, accepted, arch.Version)
}

// stream runs one model call, forwarding text to onText. It returns the text and the first
// propose_changes call, if any.
func (a *Assistant) stream(ctx context.Context, req llm.Request, onText func(string)) (string, *llm.ToolCall, error) {
	var text strings.Builder
	var call *llm.ToolCall
	for ev, err := range a.Model.Stream(ctx, req) {
		if err != nil {
			return "", nil, fmt.Errorf("model reply: %w", err)
		}
		if ev.Text != "" {
			text.WriteString(ev.Text)
			onText(ev.Text)
		}
		if ev.ToolCall != nil && ev.ToolCall.Name == proposal.Tool.Name && call == nil {
			call = ev.ToolCall
		}
	}
	return text.String(), call, nil
}

func parseChanges(arguments string, doc architecture.Document, known knowledge.Knowledge) (proposal.Changes, error) {
	var changes proposal.Changes
	if err := json.Unmarshal([]byte(arguments), &changes); err != nil {
		return proposal.Changes{}, fmt.Errorf("arguments are not valid JSON for this tool: %w", err)
	}
	changes.Normalize()
	return changes, changes.Validate(doc, known)
}

func (a *Assistant) request(msgs []conversation.Message, doc architecture.Document, known knowledge.Knowledge) (llm.Request, error) {
	canvas, err := json.Marshal(doc)
	if err != nil {
		return llm.Request{}, err
	}
	req := llm.Request{
		// Generous: thinking models (e.g. GLM-5.3) spend thousands of tokens reasoning before they
		// call propose_changes, and run out of budget otherwise.
		MaxTokens: 16384,
		// One system message: some chat templates (e.g. Gemma's) accept only one.
		Messages: []llm.Message{
			{Role: llm.RoleSystem, Content: systemPrompt + "\n\n" + describeKnowledge(known) + "\n\n" + architectureNote + string(canvas)},
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

// describeKnowledge writes the Project's knowledge as plain text for the system prompt.
func describeKnowledge(k knowledge.Knowledge) string {
	var b strings.Builder
	level := k.ExperienceLevel
	if level == "" {
		level = "unknown (ask early, then record it with set_experience_level)"
	}
	fmt.Fprintf(&b, "The user's experience level: %s.\n\nRequirements:\n", level)
	if len(k.Requirements) == 0 {
		b.WriteString("(none recorded yet)\n")
	}
	for _, r := range k.Requirements {
		fmt.Fprintf(&b, "- %s [%s] %s\n", knowledge.RequirementID(r.Num), r.Category, r.Statement)
	}
	b.WriteString("\nDecisions:\n")
	if len(k.Decisions) == 0 {
		b.WriteString("(none recorded yet)\n")
	}
	for _, d := range k.Decisions {
		cites := make([]string, len(d.Requirements))
		for i, n := range d.Requirements {
			cites[i] = knowledge.RequirementID(n)
		}
		fmt.Fprintf(&b, "- %s %s (on %s; serves %s; by %s)", knowledge.DecisionID(d.Num), d.Title,
			strings.Join(d.Targets, ", "), orNone(strings.Join(cites, ", ")), d.Author)
		if d.NeedsReview {
			b.WriteString(" NEEDS REVIEW: a requirement it cites changed")
		}
		b.WriteString("\n")
	}
	return strings.TrimRight(b.String(), "\n")
}

func orNone(s string) string {
	if s == "" {
		return "no requirement"
	}
	return s
}
