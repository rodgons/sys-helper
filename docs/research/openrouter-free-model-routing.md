# OpenRouter: how free models are exposed and routed

Research for issue #19 (map #18). Snapshot taken 2026-10-01 (UTC 2026-10-02 02:47) against the public models endpoint and OpenRouter's official docs. Where the docs are silent, this note says so instead of guessing.

## TL;DR

- **List:** `GET https://openrouter.ai/api/v1/models`. The API reference declares bearer auth, but the endpoint answered **200 with no `Authorization` header** and is Cloudflare-cached (`cache-control: public, max-age=120, stale-while-revalidate=3600`). Send the key anyway, since the docs say it is required.
- **Identify free models:** select ids ending in **`:free`**, and check `pricing.prompt == "0"` and `pricing.completion == "0"` as well. Zero pricing on its own is too broad: it also matches the `openrouter/free` router, time-limited "stealth" models and non-chat (music) models.
- **Eligibility fields:** `supported_parameters` contains `"tools"` (and `"tool_choice"`), `context_length` / `top_provider.context_length`, `top_provider.max_completion_tokens`, `architecture.output_modalities` contains `"text"`, `expiration_date`. For ranking: `created` and `benchmarks.artificial_analysis.{intelligence_index,coding_index,agentic_index}` (often `null`). For live health, the per-model `/endpoints` call returns `uptime_last_5m`, `uptime_last_30m` and `uptime_last_1d`.
- **Today:** 464 models in total. 17 have the `:free` suffix, and **16 of those list `tools`**. Every one of the 16 has a context of at least 64K, and 15 have at least 256K.
- **Server-side routing:** a `models` fallback array (tried in order on error, rate limit, downtime or context failure), the `openrouter/free` random router, `openrouter/auto` with an `allowed_models` plugin, and per-request `provider` preferences (`order`, `only`, `ignore`, `allow_fallbacks`, `require_parameters`, `data_collection`, `zdr`, `sort`…). The docs never say how any of these behave after streaming has started. What they do define: errors before the stream starts are HTTP statuses, and errors after it starts are a `200` stream that ends with an SSE chunk carrying `error` and `finish_reason: "error"`.
- **Free quota:** 20 requests/min, plus **50 requests/day (under $10 of credits ever purchased) or 1000 requests/day (at least $10)**. The quota is global per account. The docs do not say whether failed attempts count.

## 1. Listing models

`GET /api/v1/models` ([API reference](https://openrouter.ai/docs/api/api-reference/models/get-models)).

- **Auth:** the reference lists a bearer `apiKey` security scheme. Observed: an unauthenticated `curl` returned 200 with the full list. Headers: `cf-cache-status: HIT`, `age: 48`, `cache-control: public, max-age=120, stale-while-revalidate=3600, stale-if-error=3600`, `access-control-allow-origin: *`. So the list is edge-cached for about 2 minutes. Fetching it hourly is far below any reasonable limit.
- **Response:** `{ "data": [...], "total_count": 464, "links": { "next": null } }`. The unfiltered call returned every model in one page (`limit` max is 1000 per the reference, `offset` paginates). Follow `links.next` if it is ever non-null.
- **Query filters (documented):** `supported_parameters` (comma list), `context` (min tokens), `min_price`/`max_price`, `input_modalities`, `output_modalities`, `category`, `q`, `sort`, `min_age_days`/`max_age_days`, Artificial Analysis index min/max, `min_tool_success_rate`/`max_tool_success_rate`, `zdr`, `region`, `providers`, `model_authors`, and others.
  - **Observed, do not rely on them:** `?max_price=0&supported_parameters=tools&context=100000` returned 17 models. That set included `liquid/lfm-2.5-2.6b:free` (context 65536, so `context` was not applied) and the zero-priced `stealth/space-bunny-alpha`, but excluded `openrouter/free`. Adding `min_tool_success_rate=0.9` dropped `liquid/lfm-2.5-2.6b:free` and `poolside/laguna-xs-2.1:free`. No tool success rate field appears in the model objects, so that signal is only reachable as a filter.
  - **Recommendation:** fetch the unfiltered list and filter on the client. The server filters are lightly documented and not all of them are applied. `min_tool_success_rate` is the one server-only signal worth considering, and only as an optional extra call.

### Model object (real example)

```json
{
  "id": "apodex/apodex-1.1-mini:free",
  "canonical_slug": "apodex/apodex-1.1-mini-20261001",
  "name": "Apodex: Apodex 1.1 Mini (free)",
  "created": 1790875335,
  "context_length": 262144,
  "architecture": { "modality": "text->text", "input_modalities": ["text"], "output_modalities": ["text"], "tokenizer": "Other", "instruct_type": null },
  "pricing": { "prompt": "0", "completion": "0" },
  "top_provider": { "context_length": 262144, "max_completion_tokens": 235929, "is_moderated": false },
  "per_request_limits": null,
  "supported_parameters": ["frequency_penalty","include_reasoning","max_tokens","presence_penalty","reasoning","repetition_penalty","response_format","seed","stop","structured_outputs","temperature","tool_choice","tools","top_k","top_p"],
  "default_parameters": {},
  "knowledge_cutoff": null,
  "expiration_date": null,
  "links": { "details": "/api/v1/models/apodex/apodex-1.1-mini-20261001/endpoints" },
  "reasoning": { "mandatory": false }
}
```

Every top-level key observed across the 464 models: `id, canonical_slug, hugging_face_id, name, created, description, context_length, architecture, pricing, top_provider, per_request_limits, supported_parameters, default_parameters, supported_voices, knowledge_cutoff, expiration_date, links, reasoning, benchmarks, alias_target`.

- **`pricing`:** values are **strings** of USD per token. Keys seen: `prompt, completion, image, audio, web_search, internal_reasoning, input_cache_read, input_cache_write, input_cache_write_1h, input_audio_cache, image_output, audio_output, overrides`. Most are optional.
- **`alias_target`:** set on `~vendor/...-latest` alias ids (for example `~z-ai/glm-latest` maps to `z-ai/glm-5.3`). None of the free models has one.
- **`benchmarks`:** `{ "artificial_analysis": { intelligence_index, coding_index, agentic_index }, "design_arena": [...] }`, or `null`. Among the 16 tool-capable free models, 5 have `benchmarks: null` and several have partial nulls. This is a weak ranking signal on its own.
- **`reasoning.mandatory`:** true means the model always reasons. Reasoning content arrives as extra delta fields, and `include_reasoning` / `reasoning` control it.
- **`top_provider.is_moderated`:** true means OpenRouter moderates inputs, and a flagged prompt returns 403. Only `cohere/north-mini-code:free` was moderated today.

### Per-model endpoints (health signal)

`GET /api/v1/models/{id}/endpoints`, observed unauthenticated for `qwen/qwen3.8-27b:free`. It returns `data.endpoints[]`, one entry per provider, with:
`provider_name` ("ModelRun"), `tag`, `quantization` ("fp4"), `context_length`, `max_completion_tokens`, `max_prompt_tokens`, `pricing` (adds `discount`), `supported_parameters`, **`supports_tool_choice`** (`{"none":false,"auto":true,"required":true,"function":true}`), `status` (0), **`uptime_last_5m` (100), `uptime_last_30m` (98.13), `uptime_last_1d` (98.12)**, `latency_last_30m`, `throughput_last_30m` (both `null` here), `supports_implicit_caching`, `native_tools`.

Free variants usually have a single provider endpoint, so provider-level fallback rarely helps them. Note that `supports_tool_choice.none` can be `false`.

## 2. Identifying free models

- The `:free` variant is "its own entry in the models API with its own pricing, context length, and endpoints" ([`:free` variant](https://openrouter.ai/docs/guides/routing/model-variants/free)). The free-model rate limits apply to "IDs ending in `:free`" ([Limits](https://openrouter.ai/docs/api/reference/limits)).
- **Observed:** all 17 `:free` ids have zero prompt and completion pricing. Four zero-priced models **lack** the suffix:
  - `openrouter/free` is the free router (see §3).
  - `stealth/space-bunny-alpha` is an anonymous "stealth" model with `expiration_date: "2026-10-05"`.
  - `google/lyria-3-pro-preview` and `google/lyria-3-clip-preview` are music generation models, not chat.
- **Rule:** `id` ends with `:free`, both prices are `"0"`, `"text"` is in `output_modalities`, and `expiration_date` is null or in the future. Excluding stealth models is a product choice. They are free but disappear within days, and their providers typically log prompts.

### Today's eligible set (`:free`, `tools` listed)

| id | context | max completion | created | AA agentic idx |
|---|---|---|---|---|
| thinkingmachines/inkling-small:free | 1,048,576 | 262,144 | 2026-07-30 | 23.5 |
| thinkingmachines/inkling:free | 1,048,576 | 262,144 | 2026-07-17 | (arena only) |
| nvidia/nemotron-3.5-lightning:free | 1,000,000 | 65,536 | 2026-08-11 | 3.5 |
| nvidia/nemotron-3-ultra-550b-a55b:free | 1,000,000 | 65,536 | 2026-06-04 | (arena only) |
| dots-studio/dots-3-note-preview:free | 512,000 | 460,800 | 2026-08-14 | null (expires 2026-12-31) |
| apodex/apodex-1.1-mini:free | 262,144 | 235,929 | 2026-10-01 | null |
| inclusionai/ling-3.0-flash-sante:free | 262,144 | 32,768 | 2026-09-04 | null |
| qwen/qwen3.8-27b:free | 262,144 | 235,929 | 2026-08-14 | 45.8 |
| poolside/laguna-s-2.1:free | 262,144 | 32,768 | 2026-07-21 | null |
| poolside/laguna-xs-2.1:free | 262,144 | 32,768 | 2026-07-02 | null |
| google/gemma-4-26b-a4b-it:free | 262,144 | 32,768 | 2026-04-03 | null |
| google/gemma-4-31b-it:free | 262,144 | 32,768 | 2026-04-02 | 4.2 |
| nvidia/nemotron-3-super-120b-a12b:free | 262,144 | 235,929 | 2026-03-11 | 1.7 |
| cohere/north-mini-code:free | 256,000 | 64,000 | 2026-06-17 | 1.1 (moderated) |
| nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free | 256,000 | 65,536 | 2026-04-28 | null |
| liquid/lfm-2.5-2.6b:free | 65,536 | 8,192 | 2026-08-11 | null |

The one `:free` model without `tools` is `nvidia/nemotron-3.5-content-safety:free`, a classifier. Not every eligible model lists `tool_choice`: `inkling` and `inkling-small` list `tools` but not `tool_choice`. If the backend forces `tool_choice`, it must also require `tool_choice` in `supported_parameters` (or send `provider.require_parameters: true`).

**Streaming** is not exposed as a per-model field. Any chat model can be called with `stream: true`, so the streaming gate cannot be checked from metadata. It only shows up as a failure at call time.

### How often the list changes

The docs give no cadence. The FAQ says only that OpenRouter adds models "as quickly as we can… as soon as they are available" ([FAQ](https://openrouter.ai/docs/faq)), and the `:free` and free-router docs both warn that availability "can vary; some may be temporarily unavailable". Observed: 60 of the 464 models were created in the last 30 days, and 1 free model was created on the day of the snapshot. `created` is the model's creation time, not the date its free variant appeared. Free entries also carry `expiration_date` when OpenRouter knows when they will end. An hourly refresh is more than enough.

## 3. Server-side routing options

### `models` fallback array

([Model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks))

- Send `"models": ["a:free", "b:free", ...]` in the chat completion body. With the OpenAI SDK it goes in `extra_body`. "If the first model returns an error, OpenRouter will automatically try the next model in the list."
- **Triggers:** "context length validation errors, moderation flags for filtered models, rate-limiting, and downtime".
- **Response:** the `model` field reports the model that actually answered, and billing follows that model.
- **Length:** the chat completion API reference gives no `maxItems` ([reference](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request)). The Anthropic-Messages-compatible `fallbacks` parameter is capped at 3 and cannot be combined with `models`.
- **Not documented:** behaviour with `stream: true`, and whether an empty reply or a malformed tool call triggers a fallback. Because errors before the stream starts are HTTP statuses (see §4), any server-side fallback must happen before the first byte. A failure after streaming begins arrives as an in-stream error and will not be retried on the next model. This matches our "fall back only before the first token" rule, but it is inferred, not documented.
- **Caveat for us:** each attempt the server makes is invisible to the client. We cannot see which models were skipped or why, so per-model health memory and logging of 429s become impossible. The docs also do not say whether each skipped attempt counts against the 20/min and 50 or 1000/day free quota.

### `openrouter/free` (Free Models Router)

([Free router](https://openrouter.ai/docs/guides/routing/routers/free-router))

- Zero-priced router id (context 200,000 in the list, `supported_parameters` includes `tools` and `tool_choice`). "A model is randomly selected from the filtered pool." It "filters available free models to those supporting your request's requirements" (vision, tool calling, structured outputs).
- The response `model` field "show[s] which free model was actually used".
- **Limits:** you cannot steer or restrict the pool ("You cannot control which specific model is selected"), and the docs do not say whether it retries another free model on a 429. Random selection is the opposite of best-first ordering.

### `openrouter/auto` (Auto Router)

([Auto router](https://openrouter.ai/docs/guides/routing/routers/auto-router))

- Classifies the prompt and ranks models by community usage over 7 days. "Routes with fallbacks."
- It can be restricted with the `auto-router` plugin's `allowed_models` (wildcard patterns). Patterns such as `*:free` could restrict it to free models, but the docs do not say whether `:free` wildcards are supported. You "pay the standard rate for whichever model is selected", so a pattern that matches a paid model costs money. Tool calling is supported.

### `provider` object (per-request provider routing)

([Provider selection](https://openrouter.ai/docs/guides/routing/provider-selection))

This routes across the **providers of one model**, not across models.

- **Fields:** `order`, `allow_fallbacks` (default `true`), `require_parameters` (default `false`), `data_collection` (`"allow"`, the default, or `"deny"`), `zdr`, `enforce_distillable_text`, `only`, `ignore`, `quantizations`, `sort` (price/throughput/latency, string or object; the deprecated top-level `route` aliases `provider.sort.partition`), `preferred_min_throughput`, `preferred_max_latency`, `max_price`.
- **Default balancing:** prefers providers without "significant outages in the last 30 seconds", then picks weighted by inverse square of price. The rest are fallbacks.
- **`require_parameters: true`:** routes only to providers that support every parameter in the request. Without it, unsupported parameters may be silently ignored.
- **Tools:** with `tools` present, the provider docs say OpenRouter "makes a best effort to route to providers known to support tool use". The tool-calling guide says it "only routes to providers that support tool calling" and that a per-provider Tool Call Error Rate feeds routing ([Tool calling](https://openrouter.ai/docs/guides/features/tool-calling)).
- **`data_collection: "deny"`:** excludes providers that store data non-transiently. The provider page's wording about free models under `deny` is ambiguous. Our standing decision allows logging and training providers, so leave it at the default (`allow`).
- **Account-level privacy settings:** there are "separate settings for paid and free models" ([Provider logging](https://openrouter.ai/docs/guides/privacy/provider-logging)), and "if you opt out of training… OpenRouter will not route to providers that train". **An account whose settings exclude training or logging endpoints can make free models unroutable.** The production account must allow free endpoints. If it does not, requests fail with 503 "no available model provider that meets your routing requirements" (assumed; the docs do not name the error for this case).

## 4. Streaming and tool calls

([Streaming](https://openrouter.ai/docs/api/reference/streaming), [Errors](https://openrouter.ai/docs/api/reference/errors-and-debugging))

- **Errors before the stream starts:** a normal JSON error `{ "error": { "code", "message", "metadata"? } }` with a matching HTTP status: 400, 401, 402, 403 (moderation or guardrail), 408, **429**, 502 (model down or invalid response), **503** (no provider meets the routing requirements).
- **Errors after the stream starts:** HTTP `200`, then an SSE chunk with a top-level `error` plus `choices[].finish_reason: "error"`, and the stream ends. "The error can be the first and only event in the stream, so treat a `200` carrying an `error` chunk with no content as a failure." A 429 that hits after the stream has started shows up the same way ([Limits](https://openrouter.ai/docs/api/reference/limits)). **Implication for `OpenAIClient`:** a `200` whose first event is an error chunk must count as a failure before the first token and move on to the next model.
- **Keepalives:** the server sends SSE comment lines `: OPENROUTER PROCESSING`. Ignore them, and do not count them as the first token for `AI_FIRST_TOKEN_TIMEOUT`.
- **End of stream:** a final chunk carries `usage` before `[DONE]` (always sent; `stream_options.include_usage` is deprecated and has no effect). That chunk has an empty `delta` that repeats `finish_reason`.
- **Cancellation:** closing the connection stops generation only for providers that support it.
- **Tool calls:** standard OpenAI deltas (`tool_calls` fragments, `finish_reason: "tool_calls"`). `tool_choice` accepts `auto` (default), `none`, or a specific function. `parallel_tool_calls` defaults to true.
- **Rate-limit headers:** successful responses carry **no** `X-RateLimit-*` headers. A platform 429 carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset`.

## 5. Free quota

([Limits](https://openrouter.ai/docs/api/reference/limits))

| Credits purchased (all time) | Requests per minute | Requests per day |
|---|---|---|
| Less than 10 | 20 | 50 |
| At least 10 | 20 | 1000 |

- Daily counters reset at the start of each UTC day. "Making additional accounts or API keys will not affect your rate limits, as we govern capacity globally."
- `GET /api/v1/key` (with the key) returns `free_model_daily_requests: { used, limit, remaining }`, `limit_remaining`, and `usage_daily` / `usage_weekly` / `usage_monthly`. This could feed a health check or startup log line.
- An **upstream provider** can also return 429 for its own capacity, separately from the platform quota.
- **Not documented:** whether failed attempts or server-side `models` fallback hops count toward the quota. Treat each attempt as one request.
- **Sizing:** with 50/day the whole deployment gets 50 AI calls a day, retries included. A one-time $10 purchase raises that to 1000/day and is the main lever for production. `AI_DAILY_REPLY_LIMIT` should sit under it.

## 6. Implications for downstream tickets

- **Discovery:** fetch `/api/v1/models` with the key. Filter on the client: `:free` suffix, both prices `"0"`, text output, `tools` in `supported_parameters` (plus `tool_choice` if we force it), `context_length` ≥ our minimum, and no past `expiration_date`. All 16 current candidates already pass a 64K floor.
- **Ranking:** there is no single authoritative field. The candidates are `benchmarks.artificial_analysis.agentic_index` (sparse), `context_length`, `top_provider.max_completion_tokens`, `created` (recency), and `/endpoints` uptime (one extra call per model).
- **Fallback:** client-side iteration keeps visibility, health memory, the first-token rule and the answering-model id under our control. The server-side `models` array gives that up in exchange for fewer round trips, and its streaming semantics are undocumented. Even when we iterate ourselves, read the response `model` field for the stored answering-model id.
- **Errors:** treat 429, 502, 503 and 408, and a `200` whose first SSE event is an error, as "advance to the next model". Treat 401 and 402 as configuration errors and do not advance. Treat 400 as a request bug. A 403 is a moderation hit: advancing is reasonable.
- **Ops:** the production account's privacy settings must allow free endpoints, and the quota is account-wide (50 or 1000 a day).
