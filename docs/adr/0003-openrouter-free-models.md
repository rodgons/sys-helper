# The assistant runs on OpenRouter's free models, discovered at runtime and chained by us

The AI architect uses OpenRouter's free models instead of fixed NVIDIA and Gemini providers. The API reads OpenRouter's model list at startup and every hour. It keeps the free models that can call `propose_changes`, stream, and hold the prompt, then ranks them best first. Our own `llm.Chain` tries up to three per call. A hobby deployment can then run with no paid key and no model names in `.env`, and keep working as free models come and go.

## Considered Options

- **Pinned providers (NVIDIA, Gemini).** Replaced. Each needs its own key and quota, and a retired model means a config change and a redeploy. `AI_MODELS` keeps pinning available as an escape hatch.
- **Letting OpenRouter fall back.** Rejected. Its `models` array doesn't document how it streams when it switches models. `openrouter/free` picks a random model from a pool we can't restrict, and `openrouter/auto` can route to paid models. Our Chain keeps the rules the assistant relies on: fall back only before the first token and never abandon a model mid-reply, give each model `AI_FIRST_TOKEN_TIMEOUT` to start, demote models that fail, and record which model answered on the Message.
- **Paid models.** Out of scope for a hobby deployment.

## Consequences

- **Shared quota.** The free quota belongs to the whole OpenRouter account and every User shares it: 50 requests a day, or 1,000 after buying $10 of credit. That's why `AI_GLOBAL_DAILY_LIMIT` exists alongside the per-User cap. When every model is busy or the account cap is hit, Users get 503 `ai_unavailable`, and there is no server-side retry loop.
- **Privacy.** The account must allow free endpoints whose providers may log or train on prompts, and Users are told so.
- **Model quality varies.** Some free models make invalid Proposals, and some are reserved for other apps (a 403 that the metadata doesn't show). `make test-ai-live` checks the current best ones. `AI_EXCLUDE_MODELS` and `AI_MODELS` steer around bad ones without a code change.
