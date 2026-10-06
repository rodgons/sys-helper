# Idempotent Consumer
Aliases: idempotency, idempotency key, idempotent receiver, deduplication, exactly-once processing
Gist: Processing the same message or request twice has the same effect as once.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/idempotent-consumer

## Beginner
Networks sometimes deliver the same message twice, or a client retries because it never saw the answer. An idempotent consumer makes sure that handling a repeat does no extra harm, so a payment is charged once even if the request arrives twice. It is like a lift button: pressing it five times still calls the lift only once. The usual trick is to give each request a unique id and remember which ids were already handled.

## Intermediate
Each message or request carries a unique key, either a message id from the producer or an idempotency key the client generates. The consumer records processed keys in a store and skips, or returns the saved result for, any key it has already seen. The record must be written in the same transaction as the business change, otherwise a crash between the two leaves them out of step. Some operations are naturally idempotent, such as setting a value or an upsert, and need no key table. The cost is extra storage and a lookup per message, plus a decision on how long to keep keys. It is needed whenever delivery is at-least-once or clients retry, which covers most queues and payment-style APIs.

## Expert
The dedup record and the side effect must commit atomically: a unique constraint on the key inside the same database transaction is the robust form, while a separate cache lookup leaves a race between check and write. Side effects outside your database, such as emails or third-party charges, need the downstream system's own idempotency key, or a state machine that records intent before the call. Bound the key retention window to at least the maximum redelivery and client retry horizon, and return the original response on a duplicate so the client sees a consistent result rather than a conflict. "Exactly-once" in brokers usually means exactly-once within the broker; end to end it is at-least-once delivery plus idempotent processing.
