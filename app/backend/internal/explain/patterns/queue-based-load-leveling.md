# Queue-Based Load Leveling
Aliases: load leveling, write buffering, buffer with a queue, async processing
Gist: A queue absorbs bursts so the service behind it works at a steady rate.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling

## Beginner
Queue-based load leveling puts a waiting line between the part of a system that sends work and the part that does it. Think of a bakery ticket machine: when a crowd arrives at once, people take numbers, and the staff serve them one by one at their normal pace. Requests go into the queue, and the service takes them out as fast as it can safely handle. A sudden rush makes the line longer for a while instead of overwhelming the service.

## Intermediate
Producers put messages on a queue and return at once, and the consumer service pulls messages at its own steady rate. This shields slow or fragile backends, like a database or a rate-limited third-party API, from traffic spikes, and lets you size them for average load instead of peak load. The cost is delay and asynchrony: the caller does not get the result right away, so it needs another way to learn the outcome, such as polling a status or receiving a notification. Pick it for work that can finish a little later, such as sending emails, processing uploads or recording analytics. Avoid it when the caller needs an immediate answer, or when load is high all the time, because a queue only smooths bursts and cannot rescue a consumer that is too slow on average.

## Expert
Bound the queue or alert on its depth and oldest-message age, because when arrivals outpace capacity for long the backlog grows without limit and messages wait past their useful life, so pair it with back pressure, load shedding or message expiry. Autoscaling consumers on queue depth brings back the downstream spikes the queue was meant to absorb, so cap consumer concurrency at what the backend can take. Delivery is usually at-least-once, so handlers must be idempotent, and poison messages need a retry limit and a dead-letter queue so they do not block or loop.
