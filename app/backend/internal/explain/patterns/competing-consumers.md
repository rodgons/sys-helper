# Competing Consumers
Aliases: worker pool, work queue, task queue, background workers, consumer group
Gist: Several workers pull from one queue, and each message goes to one of them.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers

## Beginner
Competing consumers means several workers take jobs from the same list, and each job is done by only one of them. Think of a supermarket with one shared line feeding several cashiers: whoever is free calls the next customer. If the line gets long, the shop opens another register. If one cashier leaves, the others keep serving.

## Intermediate
Producers put messages on one queue, and many identical consumer instances pull from it. The broker hands each message to a single consumer, usually hiding it until that consumer acknowledges it, and makes it visible again if the consumer crashes or times out. This spreads the load, lets you scale by adding workers, and keeps processing going when one worker fails. The trade-off is that order across messages is no longer guaranteed, and a message can be processed more than once. Pick it for independent tasks such as resizing images, sending emails or processing orders. Avoid it when messages must be handled strictly in order, unless you partition by key so each key goes to one consumer at a time.

## Expert
Delivery is at-least-once: a worker that finishes but crashes before acknowledging, or whose visibility timeout expires mid-task, causes a redelivery, so handlers must be idempotent and timeouts longer than the worst processing time (or extended with heartbeats). In a partitioned log such as Kafka, a consumer group assigns each partition to one consumer, so parallelism is capped at the partition count, order holds only within a partition, and one slow message blocks its partition. Poison messages need a retry limit and a dead-letter queue, and adding workers moves the bottleneck to whatever they write to.
