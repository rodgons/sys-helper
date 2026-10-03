# AI turn and Proposals

## One turn (`internal/assistant`)

`POST /api/projects/{slug}/reply` → `Assistant.Reply`:

1. Rejects with `ErrUnavailable` (no model), `usage.ErrDailyLimit` (→ 429, checked before **every** model call, the proposal retry included; a limit hit on the retry saves the reply with a note instead), `ErrBusy` (a reply or a New Conversation for this User+Project is already running; in-memory `inFlight`, so it is per process) or `ErrNothingToReply`. There is something to reply to when the last Message is from the User, **or** is an AI Message whose Proposal the User just accepted or rejected. That review counts as the User's turn and is sent as a synthetic user message (`[I accepted proposal #2 "…". Continue.]`).
2. Builds `llm.Request` (`request()`): **one** system message (some chat templates allow only one) = `systemPrompt` (`prompt.go`) + `describeKnowledge` (trimmed to `knowledgeBudget`, 24k characters, with a note of how many items it left out) + the canvas JSON (`describeCanvas`: no positions, trimmed to `canvasBudget`, 40k characters, with a note of what it left out). Then the last `HistoryLimit` (30) Messages, which are all `Reply` reads (`conversation.Store.Recent`). Earlier Proposals are summarized inline with their status. `MaxTokens` is 4096: enough for thinking models to reason before calling the tool, and close to what a Message can store. If a model runs out of budget before calling the tool, raise it.
3. Offers the `propose_changes` tool unless `mustNotPropose` says otherwise: right after a rejection, or after 3 Proposals without a User message in between. That also bounds the turns that follow reviews without a new User message: a turn without a Proposal leaves nothing to review, so the chain ends after at most 4 AI turns.
4. Streams. On a tool call: `proposal.FromCall` → `Normalize` → `Validate`. `FromCall` also takes a call named after an op (models call `set_experience_level` as a tool) as a one-change Proposal, and turns a call to any other tool into an error, so it is retried instead of the reply ending empty. If invalid, the model gets its call back with the error as a tool result and **one** more attempt (`proposalAttempts = 2`). If that fails too, the reply is saved with a note and no Proposal, and the problems are logged.
5. Caps the text at `conversation.MaxReply` (20,000 characters, the `messages.body` check) with `CapReply`, which ends a cut reply with `…[reply truncated]`. Saves only a complete reply, with `context.WithoutCancel`, via `conversation.Store.AppendReply`. That call locks the Project, supersedes the pending Proposal and inserts the new one with `base_version` = the Architecture version the model saw. Its `seq` is taken from the forward-only counter `projects.next_proposal_seq` (advanced in the same transaction), never "highest + 1", so a number is not reused after its Proposal is deleted.

**New Conversation** (`Assistant.NewConversation`, `POST …/conversation`): reserves the same `inFlight` guard for the whole reset, so a reset during a reply and a reply during a reset both get `ErrBusy`. Otherwise a reply that finishes after the reset would be saved into the new Conversation. It then delegates to `conversation.Store.StartNew`, which picks the Welcome Message: the "picking up" one (`PickUpMessage`) when the Project has Components or Requirements. No model is called, so it works without one. The AI needs no "new conversation" flag: the prompt tells it not to re-ask what the recorded Requirements already cover.

SSE contract (`httpapi/reply.go`): errors before the first byte are plain JSON (`busy`, `ai_unavailable`, …); after streaming starts, a failure is an `error` event. Nothing is saved on failure, so the client retries by calling the endpoint again. The handler clears the write deadline because replies outlast `WriteTimeout`.

## Models (`internal/llm`)

- `ChatModel.Stream(ctx, req) iter.Seq2[Event, error]`. Tool calls are emitted only once complete; an event with `Calling` set marks the first fragment of one.
- `OpenAIClient` streams one model from OpenRouter's OpenAI-compatible `/chat/completions` (`AI_BASE_URL` overrides). A non-200 is an `*HTTPError`; `AccountLimited` marks OpenRouter's own 429 (it carries `X-RateLimit-*` headers, a provider's doesn't). An SSE chunk with a top-level `error` (OpenRouter's way of failing after a 200) ends the stream with an error.
- `Catalog` (`catalog.go`) finds the models: `GET /models` at startup and every `AI_MODELS_REFRESH` (1h), retrying every minute while it has none and keeping the last good list on failure. **Eligible:** id ends in `:free`, both prices `"0"`, text output, `tools` in `supported_parameters`, `context_length` ≥ 64K, `max_completion_tokens` (if given) ≥ 4096, no past `expiration_date`, not in `AI_EXCLUDE_MODELS`. **Ranked:** Artificial Analysis agentic index, then coding index (unrated last), then newest, then largest context. `AI_MODELS` pins the list instead (still minus `AI_EXCLUDE_MODELS`). A model that fails is demoted to the back for 10 minutes, or for an hour when OpenRouter reserves it for other apps (a 403 "only available on agentic harnesses", `HTTPError.Gated`), which the model metadata doesn't show.
- `Chain` (`chain.go`) tries up to 3 models per call, best first. It moves on (and demotes) when a model fails, answers nothing, or sends nothing within `AI_FIRST_TOKEN_TIMEOUT` (20s); reasoning and the first fragment of a tool call count as starting (`OpenAIClient` emits a `Calling` event for it, since the call itself is only emitted whole at the end). Once a model has started it is never abandoned. It stops early, with `ErrExhausted`, on the account's 429 and on 401/402 (the key is refused or out of credit), since no other model would answer. A cancelled stream ends with the context's error, never as a complete reply. Every attempt first spends the global `usage.Budget` (`AI_GLOBAL_DAILY_LIMIT`, default 50: OpenRouter's free quota is account-wide). Each event carries the `Model` that produced it; the assistant saves the last one on the Message (`messages.model`).
- `llm.ErrExhausted` → `ErrUnavailable` → 503 `ai_unavailable` ("try again in a minute"); there is no server-side backoff. No key → `chatModel` returns nil → the same 503.
- An invalid Proposal's retry sets `Request.Avoid` to the model that made it, so `Chain` tries another one first. If no model takes the retry (exhausted, or the global budget is spent), the reply so far is saved with a note.
- `AI_FAKE=1` → `llm.Fake`: echoes the last user message, and when that message contains "propose", sends `FakeProposal` (it touches every knowledge op). E2E relies on it, so keep it valid when ops change.
- `make test-ai-live` discovers the free models and checks the best 3 (`AI_LIVE_COUNT`, or `AI_LIVE_MODELS=a,b`): text, a tool call, a replayed call, a valid Proposal, and time to first token. It spends about a dozen requests of the free quota. Add models that fail it to `AI_EXCLUDE_MODELS`.

## Proposal ops (`internal/proposal`)

Ops: `add_/update_/remove_component`, `add_/update_/remove_connection`, `add_/update_/remove_requirement`, `add_decision`, `set_experience_level`. Which fields each op uses is documented on `proposal.Change`.

- **Refs vs ids:** existing items are named by id (canvas ids, `R1`); new items get a `ref` that later changes in the same Proposal use. Ids and refs share one namespace.
- **`Normalize`** fixes common model slips before validation: a missing `op`, an op given in `type`, `id` used instead of `ref` on add, an unnamed component, and adds ordered after their uses.
- **`Validate`** checks against the current Architecture and Knowledge. Its messages are written **for the model** (they go back to it on retry), so make them say how to fix the call.
- **Ids of accepted items:** `ComponentID(seq, ref)` = `p{seq}-{ref}`, and `ConnectionID` = `p{seq}-{ref}` or `p{seq}-k{index}`. The client mirrors this in `src/architecture/proposal.ts`. Both sides must agree, because Decisions target these ids.

## Accept and reject

Accepting is split across both sides:
- **Client** (canvas ops): checks staleness, applies the Proposal to the canvas it holds, places new components, and POSTs the resulting document with its base version to `…/proposals/{seq}/accept` (see `docs/frontend.md`).
- **Server** (one transaction, `architecture.Store.SaveWith` + `conversation.Accept(seq)`): version check → mark accepted (`ErrNotPending` if already resolved, or if no Proposal has that number any more) → `applyKnowledge` (Requirement/Decision/level ops) → save document → `PruneDecisions`.

`applyKnowledge` is lenient: ops on Requirements the User has since deleted are skipped, and Decisions on items no longer on the canvas get pruned. Reject only flips the status.

## Changing the prompt

`prompt.go` holds the behaviour rules (interview first, but don't re-ask what the recorded Requirements already cover and build on them instead, one coherent step per Proposal, record Decisions, stop when the requirements are covered). Rules that must hold regardless of the model belong in code (`mustNotPropose`, `Validate`), not only in the prompt. `assistant_test.go` asserts on the request the model receives; update it with prompt-structure changes.
