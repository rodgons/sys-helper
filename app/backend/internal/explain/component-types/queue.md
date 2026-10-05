# Queue / Stream
Gist: A buffer that holds messages between producers and consumers, so work happens asynchronously.
Reference: https://github.com/donnemartin/system-design-primer#message-queues

## Beginner
A queue holds messages from one part of the system until another part is ready to handle them. The sender drops off its message and moves on without waiting. It is like a ticket rail in a kitchen: waiters pin orders up, and cooks take them one by one at their own pace. The **engine** is the software that runs the queue, and **delivery** says how sure you can be that each message is handled.

## Intermediate
Producers write messages and consumers read them later, which smooths out bursts, lets slow work happen in the background, and lets each side scale and fail on its own. A **queue** (SQS, RabbitMQ) hands each message to one consumer and deletes it once acknowledged; a **stream** (Kafka, Kinesis) keeps an ordered log for a retention period, so several consumer groups can each read everything and replay it. The **delivery** guarantee is usually at most once (may lose messages) or at least once (may deliver duplicates); at least once is the common default, so consumers must be idempotent. The cost is eventual consistency and harder debugging, since the caller no longer learns the outcome directly. Do not use a queue when the user needs the result in the same request.

## Expert
End-to-end exactly-once does not exist across arbitrary side effects; engines that offer it do so only inside their own transactions, so deduplicate with idempotency keys or an outbox and inbox. Ordering holds only within a partition or FIFO group, which caps parallelism and lets one slow key block everything behind it. Watch consumer lag and add dead-letter queues for poison messages, or one bad message retries forever; a backlog that grows faster than it drains means the queue is only hiding an overload.
