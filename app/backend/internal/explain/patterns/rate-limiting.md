# Rate Limiting
Aliases: throttling, rate limiter, token bucket, leaky bucket, sliding window, request quotas
Gist: Cap how many requests a caller may make in a time window and reject the rest (429).
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling

## Beginner
Rate limiting puts a cap on how many requests each user or client can send in a given time, such as 100 per minute. Requests above the cap are turned away with a message telling the client to slow down and try later. This stops one heavy or misbehaving client from slowing the system down for everyone else. It is like a ride at a theme park that lets only a fixed number of people on each turn, so the line moves fairly and the ride doesn't break.

## Intermediate
The server identifies each caller by API key, user id or IP address and counts its requests with an algorithm such as a token bucket, which allows short bursts up to a limit, or a sliding window, which counts requests in the last N seconds. Requests over the limit get HTTP 429 Too Many Requests, ideally with a `Retry-After` header. The check usually runs at the API gateway or load balancer, with counters in a shared fast store such as Redis when there are many instances. It protects capacity and enforces fair use or paid tiers, but limits set too low reject legitimate traffic, and a shared counter store adds latency and a dependency. Use it on any public or multi-tenant API; it does not replace capacity planning, because it rejects the excess rather than serving it.

## Expert
Distributed counters face a choice: a central store gives exact limits but adds a round trip and a failure mode (decide in advance whether to fail open or closed), while local per-instance counters are fast but let a caller exceed the global limit by the number of instances. Fixed windows allow double the rate across a window boundary; sliding-window counters or the generic cell rate algorithm (GCRA) avoid that with little memory. Keying on IP address punishes users behind shared NAT and is easy to evade with many addresses, so key on authenticated identity where possible and keep IP limits as a coarse outer layer. Rejected clients that retry immediately amplify load, so return `Retry-After`, make clients back off with jitter, and pair per-caller limits with global load shedding for overload that comes from many well-behaved callers.
