# OpenRouter free tier: limits and failure modes

Research for issue #20 (map #18). Checked 2026-10-01 against OpenRouter's official docs. Each claim cites the page that owns it. The docs serve raw Markdown at `<page>.md`. Code references are to `app/backend/internal/llm/openai.go` at `3e01a0e`.

Sources:

- [Limits][limits]: `docs/api/reference/limits`
- [Errors and debugging][errors]: `docs/api/reference/errors-and-debugging`
- [Streaming][streaming]: `docs/api/reference/streaming`
- [API overview][overview]: `docs/api/reference/overview`
- [Reasoning tokens][reasoning]: `docs/guides/best-practices/reasoning-tokens`
- [Tool calling][tools]: `docs/guides/features/tool-calling`
- [App attribution][attr]: `docs/app-attribution`
- [FAQ][faq], [Free variant][free], [Model fallbacks][fallbacks], [Provider logging][logging]

## 1. Free-model rate limits

Free models are the variants whose ID ends in `:free` ([limits]):

| Credits purchased (all time) | Requests/minute | Requests/day |
| --- | --- | --- |
| < $10 | 20 | 50 |
| >= $10 | 20 | 1,000 |

- **The day is a UTC day.** `GET /api/v1/key` returns `free_model_daily_requests: { used, limit, remaining }` for the current UTC day. That endpoint does **not** report the per-minute limit ([limits]).
- **Tier.** The tier depends on all-time credits *purchased*, not on the current balance or on `is_free_tier`. The higher ceiling starts one credit below the threshold, at $9, to absorb fees ([limits]).
- **Scope.** The limits are per **account**, not per key: "Making additional accounts or API keys will not affect your rate limits, as we govern capacity globally. We do however have different rate limits for different models, so you can share the load that way" ([limits], Tip). The daily counter is a single account-wide number, `free_model_daily_requests`. The docs don't say whether the 20 RPM is per model or account-wide. The "different rate limits for different models" sentence suggests some per-model capacity, but the docs don't specify it.
- **Not documented:** whether a request rejected with 429, or one that errors mid-stream, counts toward the daily 50/1,000. Treat each model attempt as one request: fallback attempts and the Proposal retry each spend one.
- **Negative balance.** A negative credit balance can return **402 even for free models** ([limits], Credit limits #1). The in-flight spending budget does *not* apply to free models ([limits]).
- **Other limits.** Cloudflare DDoS protection blocks "requests that dramatically exceed reasonable usage" ([limits]). Upstream providers can also rate-limit. OpenRouter first retries other providers *for the same model* ([limits], Handling 429).
- **Server-side fallback exists.** OpenRouter can fall back across models itself: send a `models: [...]` array in priority order, and "any error", including rate limits, downtime and context-length errors, moves to the next model. The response's `model` field names the model that answered ([fallbacks]). This is an alternative to our client-side `Fallback`, but our errors and timeouts would no longer be visible per attempt.
- **The docs' own assessment:** free models "have low rate limits … and are usually not suitable for production use" ([faq]).

**What this means for us:** at 50/day, one reply costs at least one request, and up to `proposalAttempts` × (number of models tried). Buying $10 of credit once raises the cap to 1,000/day.

## 2. What errors look like

### Error body (pre-stream and non-streaming)

```ts
type ErrorResponse = { error: { code: number; message: string; metadata?: Record<string, unknown> } };
```

The HTTP status equals `error.code` ([errors]). Chat Completions puts a normalized type at `error.metadata.error_type` ([errors], Typed Error Codes). The values that matter for fallback:

| Status | `error_type` | Meaning |
| --- | --- | --- |
| 429 | `rate_limit_exceeded` | OpenRouter platform limit (free RPM/RPD, DDoS) **or** upstream provider |
| 502 | `provider_unavailable` | Model down or invalid provider response |
| 503 | `provider_overloaded` | No provider meets routing requirements |
| 504 | `timeout` | Provider didn't respond in time |
| 408 | — | Request timeout |
| 400 | `context_length_exceeded`, `max_tokens_exceeded`, `invalid_request`, … | Request problem (some of these are model-specific) |
| 401 / 402 / 403 | `authentication` / `payment_required` / `permission_denied`, `content_policy_violation` | Key, credits, moderation or guardrail |
| 404 | `not_found` | E.g. no endpoint satisfies the account's data policy |
| 500 | `server`, `unmapped` | Generic |

A 429 example ([limits]):

```json
{ "error": { "code": 429, "message": "Rate limit exceeded", "metadata": { "error_type": "rate_limit_exceeded" } } }
```

A 429 from an upstream provider carries `error.metadata.provider_code` (the provider's original code) when available ([limits]).

### Headers

- **`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`** appear **only** when OpenRouter itself returns 429 for a *platform* limit. Successful responses never carry `X-RateLimit-*` ([limits], Note). The docs don't give the format of `X-RateLimit-Reset`.
- **`Retry-After`** (seconds) can appear on 429, 503 and on 402 with `limit_source: openrouter_in_flight_budget` ([errors]). On 429 it appears only "when every attempted provider returned a retry hint" ([limits]), so it is often absent.
- **`X-Generation-Id`** is on every response and helps when debugging ([streaming]).

**Practical signal:** a 429 that carries `X-RateLimit-*` is an account-level OpenRouter cap. If it is the daily cap, every free model is exhausted until UTC midnight, and advancing to the next model only burns time. A 429 without those headers, or one with `metadata.provider_code`, is an upstream limit specific to that model, and advancing is the right move.

### Data-policy 404

Account privacy settings have a separate "allow providers that may train on prompts" switch for free models ([logging]). Many free endpoints may train. If that switch is off, requests to those models fail because no endpoint matches, which shows up as a 404 ([provider-selection] notes that a request no provider satisfies fails with 404). The deploy account must allow it. That matches the map's decision to allow models that log or train on prompts.

### Streaming: before the response is committed

Failures before OpenRouter commits the response come back as a normal JSON error with a real HTTP status. That covers failures before a provider is reached, connection errors, and non-2xx upstream statuses. OpenRouter may first retry other providers ([streaming], Handling errors during streaming).

### Streaming: mid-stream

Once the provider has returned headers, the response is `200 OK` "even if no token has been produced yet". After that point, errors arrive as a `data:` event with a **top-level `error`** and `finish_reason: "error"` ([streaming]):

```text
data: {"id":"cmpl-abc123","object":"chat.completion.chunk","created":1234567890,"model":"openai/gpt-4o","provider":"openai","error":{"code":"server_error","message":"Provider disconnected unexpectedly"},"choices":[{"index":0,"delta":{"content":""},"finish_reason":"error"}]}
```

- "The stream is terminated after this unified error event." It "can be the first and only event in the stream, so treat a `200` carrying an `error` chunk with no content as a failure, not a success" ([streaming]).
- **`error.code` is not always a number.** The streaming page shows `"code":"server_error"` (a string), while the [errors] and [limits] pages show numbers (`"code":429`). Decode it as raw JSON.
- The docs **don't say** whether `data: [DONE]` follows an error event.
- Mid-stream rate limits use the same shape, with `"error":{"code":429,…}` ([limits], Mid-stream rate limits).

### Other stream details

- **Keep-alive comments.** OpenRouter sends `: OPENROUTER PROCESSING` lines. Skip lines that start with `:` ([streaming]).
- **Usage chunk.** Every Chat Completions stream ends with a usage chunk just before `[DONE]`. It has **one** choice with an empty `delta` (`"content":"", "role":"assistant"`) that repeats `finish_reason`, plus `usage`. This deliberately differs from OpenAI, which sends an empty `choices` array ([streaming], [overview]).
- **Null content.** `delta.content` is typed `string | null` ([overview]).
- **Answering model.** Every chunk carries `model` (and `provider` on error chunks). That gives us the answering model id the map wants stored ([overview], [streaming]).

## 3. Tool calls and reasoning

- **Tool calls.** The interface is OpenAI's: `tools: [{type:"function", function:{name, description, parameters}}]`, `tool_choice`, and `parallel_tool_calls`, which defaults to true for most models. Streamed `delta.tool_calls` fragments are accumulated until `finish_reason: "tool_calls"` ([tools]). Models are filtered with `supported_parameters=tools` ([tools]). Parameters a model doesn't support are silently ignored ([overview]).
- **Reasoning is on by default.** It is returned "by default if the model decides to output them", in the `reasoning` field. Streaming also sends `delta.reasoning_details[]`, typed objects such as `reasoning.text`, `reasoning.summary` and `reasoning.encrypted` ([reasoning]). `reasoning_content` is accepted as an alias of `reasoning` on input ([reasoning], Preserving Reasoning).
- **Reasoning counts against `max_tokens`.** "If the limit is small enough that the model spends all of it reasoning, the response returns `finish_reason: "length"` with an empty `content`" ([reasoning]). Our `MaxTokens` is 4096 (docs/ai.md). Request controls are `reasoning: {effort | max_tokens, exclude, enabled}`.
- **Replaying reasoning.** To keep reasoning across tool calls, send back `message.reasoning` or the unmodified `message.reasoning_details`, in order ([reasoning]). The docs frame this as preserving continuity. For providers whose signed reasoning must be replayed (encrypted blocks, Gemini/Claude signatures), you replay it here, not via our `extra_content`.
- **Headers.** None are required. `HTTP-Referer` and `X-OpenRouter-Title` (`X-Title` is still accepted) are optional and only control app attribution and rankings. `HTTP-Referer` is "required for app attribution", nothing more ([overview], [attr]).

## 4. Will `OpenAIClient` break on what OpenRouter sends?

The client mostly works. Nothing OpenRouter documents makes it crash. But it mishandles mid-stream errors, and it can't tell failure kinds apart.

**Works as is:**

| OpenRouter behavior | Code | Result |
| --- | --- | --- |
| `: OPENROUTER PROCESSING` comments | `openai.go:80-83`: lines without a `data:` prefix are skipped | OK |
| `data: ` prefix with a space | `openai.go:84` TrimSpace | OK |
| Usage chunk (one choice, empty delta) | `openai.go:120-121`: no text, so no event | OK |
| `delta.content: null` | `encoding/json` leaves the `string` empty | OK |
| Extra fields (`usage`, `provider`, `native_finish_reason`, `reasoning_details`) | Unknown fields are ignored by `chunk` (`openai.go:55-64`) | OK; `reasoning_details` is silently dropped |
| `delta.reasoning` string | `openai.go:60,120` | Shown as Reasoning |
| OpenAI-style indexed tool-call fragments | `openai.go:101-119` | OK (index plus id-change logic) |
| Non-200 before streaming | `openai.go:173-177` returns an error, so `Fallback` advances (`fallback.go:59-62`) | Works, but see gaps 2 and 3 |
| Lines up to 1 MiB | `openai.go:78` | Fine for SSE chunks |

**Gaps (ordered by impact on the fallback design):**

1. **Mid-stream `error` chunks are ignored.** `chunk` has no top-level `error` field and never checks `finish_reason` (`openai.go:55-64`). The error chunk decodes cleanly and yields nothing. What happens next depends on something the docs leave unspecified:
   - **No `[DONE]` follows:** we return `stream ended without [DONE]` (`openai.go:132`). The status and message (for example a 429) are lost, but `Fallback` still advances if nothing was emitted yet.
   - **`[DONE]` follows:**
     - If the error was the only event, the stream ends with zero events and no error. `Fallback` treats that as "the primary finished with an empty reply" and **does not fall back** (`fallback.go:59-60`). The assistant then fails with `model reply: empty` (`assistant.go`).
     - If the error came mid tool call, the partial arguments are emitted as a complete call (`openai.go:85-92`), and the Proposal validation retry absorbs the failure.

   **Fix:** add `Error *struct{ Code json.RawMessage; Message string; Metadata json.RawMessage }` to `chunk` and yield it as an error. Decode `code` as raw JSON, because it can be a string.
2. **HTTP errors are untyped strings** (`openai.go:176`: `"%s: HTTP %d: %s"`). Fallback ranking and the model-health memory need the status, `error.metadata.error_type`, `provider_code`, `Retry-After`, and whether `X-RateLimit-*` was present (platform cap versus upstream). We need a typed error, for example `*llm.HTTPError{Status, Type, RetryAfter, PlatformLimit}`.
3. **The daily-cap 429 isn't recognized.** Without gap 2 fixed, an exhausted account cap makes us try every free model in turn, each attempt failing fast with 429, before we return 503. That is cheap but noisy, and it may spend more of the counter if rejected requests count (undocumented).
4. **Reasoning starts the stream.** `Fallback` commits to a model on its first event, and a reasoning-only event counts (`fallback.go:47-58`). That matches the "never abandon mid-stream" rule. The consequence: a model that reasons and then fails with `finish_reason: "length"` (reasoning used up the 4096 budget) or a mid-stream error can't be replaced. Note that tool calls are only emitted at `[DONE]` (`openai.go:85-92`).
5. **Reasoning isn't replayed on the Proposal retry.** `assistant.go` appends the assistant tool call and the tool result, but no `reasoning` or `reasoning_details`. `wireMessage` has no field for them (`openai.go:27-32`). Most models tolerate this. Models that require signed reasoning to be echoed with tool calls may reject the retry with a 400 or lose context. This only affects the retry path.
6. **`finish_reason` is never read**, so `"length"` (budget exhausted) looks the same as a normal end. That's useful for logging or demotion, and harmless to parsing.

[limits]: https://openrouter.ai/docs/api/reference/limits
[errors]: https://openrouter.ai/docs/api/reference/errors-and-debugging
[streaming]: https://openrouter.ai/docs/api/reference/streaming
[overview]: https://openrouter.ai/docs/api/reference/overview
[reasoning]: https://openrouter.ai/docs/guides/best-practices/reasoning-tokens
[tools]: https://openrouter.ai/docs/guides/features/tool-calling
[attr]: https://openrouter.ai/docs/app-attribution
[faq]: https://openrouter.ai/docs/faq
[free]: https://openrouter.ai/docs/guides/routing/model-variants/free
[fallbacks]: https://openrouter.ai/docs/guides/routing/model-fallbacks
[logging]: https://openrouter.ai/docs/guides/privacy/provider-logging
[provider-selection]: https://openrouter.ai/docs/guides/routing/provider-selection
