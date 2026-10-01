# AI turn and Proposals

## One turn (`internal/assistant`)

`POST /api/projects/{slug}/reply` → `Assistant.Reply`:

1. Rejects with `ErrUnavailable` (no model), `ErrBusy` (a reply for this User+Project is already running; in-memory `inFlight`, so it is per process) or `ErrNothingToReply`. There is something to reply to when the last Message is from the User, **or** is an AI Message whose Proposal the User just accepted or rejected. That review counts as the User's turn and is sent as a synthetic user message (`[I accepted proposal #2 "…". Continue.]`).
2. Builds `llm.Request` (`request()`): **one** system message (some chat templates allow only one) = `systemPrompt` (`prompt.go`) + `describeKnowledge` + the canvas JSON. Then the last `HistoryLimit` (30) Messages. Earlier Proposals are summarized inline with their status. `MaxTokens` is 4096: enough for thinking models to reason before calling the tool, and close to what a Message can store. If a model runs out of budget before calling the tool, raise it.
3. Offers the `propose_changes` tool unless `mustNotPropose` says otherwise: right after a rejection, or after 3 Proposals without a User message in between.
4. Streams. On a tool call: `json.Unmarshal` → `Normalize` → `Validate`. If invalid, the model gets its call back with the error as a tool result and **one** more attempt (`proposalAttempts = 2`). If that fails too, the reply is saved with a note and no Proposal, and the problems are logged.
5. Caps the text at `conversation.MaxReply` (20,000 characters, the `messages.body` check) with `CapReply`, which ends a cut reply with `…[reply truncated]`. Saves only a complete reply, with `context.WithoutCancel`, via `conversation.Store.AppendReply`. That call locks the Project, supersedes the pending Proposal and inserts the new one with the next `seq` and `base_version` = the Architecture version the model saw.

SSE contract (`httpapi/reply.go`): errors before the first byte are plain JSON (`busy`, `ai_unavailable`, …); after streaming starts, a failure is an `error` event. Nothing is saved on failure, so the client retries by calling the endpoint again. The handler clears the write deadline because replies outlast `WriteTimeout`.

## Models (`internal/llm`)

- `ChatModel.Stream(ctx, req) iter.Seq2[Event, error]`. Tool calls are emitted only once complete.
- `OpenAIClient` speaks OpenAI-compatible `/chat/completions` for `AI_PROVIDER` = `nvidia` | `gemini` (key variable and base URL in `config.providers`; `AI_BASE_URL` overrides). `ToolCall.Extra` round-trips Gemini's thought signature; keep it when replaying calls.
- Models come only from `.env`: `AI_MODEL` is required once the provider key is set. There is no default in code. `Fallback` switches to `AI_FALLBACK_MODEL` only if the primary fails or sends nothing within `AI_FIRST_TOKEN_TIMEOUT` (20s). Once the primary has started, it is never abandoned.
- No key → `chatModel` returns nil → 503 `ai_unavailable`.
- `AI_FAKE=1` → `llm.Fake`: echoes the last user message, and when that message contains "propose", sends `FakeProposal` (it touches every knowledge op). E2E relies on it, so keep it valid when ops change.
- `make test-ai-live` checks the real configured models (costs credits).

## Proposal ops (`internal/proposal`)

Ops: `add_/update_/remove_component`, `add_/update_/remove_connection`, `add_/update_/remove_requirement`, `add_decision`, `set_experience_level`. Which fields each op uses is documented on `proposal.Change`.

- **Refs vs ids:** existing items are named by id (canvas ids, `R1`); new items get a `ref` that later changes in the same Proposal use. Ids and refs share one namespace.
- **`Normalize`** fixes common model slips before validation: a missing `op`, an op given in `type`, `id` used instead of `ref` on add, an unnamed component, and adds ordered after their uses.
- **`Validate`** checks against the current Architecture and Knowledge. Its messages are written **for the model** (they go back to it on retry), so make them say how to fix the call.
- **Ids of accepted items:** `ComponentID(seq, ref)` = `p{seq}-{ref}`, and `ConnectionID` = `p{seq}-{ref}` or `p{seq}-k{index}`. The client mirrors this in `src/architecture/proposal.ts`. Both sides must agree, because Decisions target these ids.

## Accept and reject

Accepting is split across both sides:
- **Client** (canvas ops): checks staleness, applies the Proposal to the canvas it holds, places new components, and POSTs the resulting document with its base version to `…/proposals/{seq}/accept` (see `docs/frontend.md`).
- **Server** (one transaction, `architecture.Store.SaveWith` + `conversation.Accept(seq)`): version check → mark accepted (`ErrNotPending` if already resolved) → `applyKnowledge` (Requirement/Decision/level ops) → save document → `PruneDecisions`.

`applyKnowledge` is lenient: ops on Requirements the User has since deleted are skipped, and Decisions on items no longer on the canvas get pruned. Reject only flips the status.

## Changing the prompt

`prompt.go` holds the behaviour rules (interview first, one coherent step per Proposal, record Decisions, stop when the requirements are covered). Rules that must hold regardless of the model belong in code (`mustNotPropose`, `Validate`), not only in the prompt. `assistant_test.go` asserts on the request the model receives; update it with prompt-structure changes.
