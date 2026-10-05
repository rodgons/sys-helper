# Retry with Backoff
Aliases: retry, retries, exponential backoff, backoff with jitter
Gist: Retry transient failures, waiting longer (with jitter) after each attempt.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry

## Beginner
Some failures are brief, such as a network blip or a busy server, and the same request works a moment later. Retrying means trying again automatically, and backoff means waiting a bit longer before each new try. It is like redialling a busy phone line: you wait a minute, then two, then four, instead of calling nonstop. A small random delay, called jitter, keeps everyone from calling back at the exact same moment.

## Intermediate
The caller retries only errors that are likely transient, such as timeouts, connection resets, 429 and 503, and never errors like 400 or 404 that will fail again. The wait grows exponentially, for example 100 ms, 200 ms, 400 ms, up to a cap and a maximum number of attempts or total time. Jitter randomises each wait so that many clients that failed together do not retry in sync. Retries are only safe when the operation is idempotent, or carries an idempotency key. The trade-off is added latency and extra load on a service that may already be struggling. Use it for calls across a network; avoid it for user-facing paths with tight latency budgets and for failures that are not transient.

## Expert
Retries multiply across layers: three attempts at each of three layers is 27 calls to the bottom service, so retry at one layer only and use retry budgets (for example, retries capped at 10% of requests) to prevent retry storms. Full jitter (a random wait between zero and the exponential cap) spreads load better than adding small noise to a fixed schedule. Respect `Retry-After`, stop retrying once the caller's deadline has passed, and pair retries with a circuit breaker so a hard outage fails fast instead of being hammered.
