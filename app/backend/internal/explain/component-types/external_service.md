# External Service
Gist: A third-party system your Architecture calls but does not run, such as a payment or email provider.
Reference: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults

## Beginner
An external service is a system run by another company that your product relies on, such as Stripe for payments or a service that sends emails. You send it requests over the internet, but you cannot see inside it or fix it when it breaks. It is like hiring a courier: you hand over the parcel and trust them to deliver, but their delays become your delays. The **provider** property names who runs it.

## Intermediate
Your services call it over the network, usually with an API key, and its availability, latency, rate limits and pricing become part of your system. Calls can fail or slow down for reasons you cannot control, so use timeouts, retries with backoff for temporary errors, and a fallback or degraded mode where possible. Slow or non-critical calls, such as sending email, are better made from a background worker fed by a queue than inside a user request. Many providers report results through **webhooks** (calls back into your system), which you must verify and handle more than once safely. Buying a service saves building and running it, but adds a dependency and its outages; check the provider's SLA against yours.

## Expert
Your availability is capped by the product of your synchronous dependencies' availabilities, so keep critical-path calls few and isolate them with bulkheads and circuit breakers. Retries on non-idempotent operations like charges cause double side effects unless you send an idempotency key, and webhooks arrive late, out of order or duplicated. Wrap the provider behind your own interface to contain lock-in, record what you sent and received for reconciliation, and keep credentials in a secret store with rotation.
