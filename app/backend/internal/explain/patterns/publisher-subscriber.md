# Publisher-Subscriber
Aliases: pub/sub, publish-subscribe, topics, event bus, message broadcast
Gist: A publisher emits events to a topic, and every subscriber gets its own copy.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber

## Beginner
One part of the system announces that something happened, and any other part that cares hears about it. It works like a newsletter: the writer sends one issue, and every subscriber gets their own copy without the writer knowing who they are. The announcement goes to a named channel called a topic. New listeners can join later without changing the sender.

## Intermediate
The publisher writes an event to a topic on a broker, and the broker delivers a copy to each subscription. Each subscription is consumed independently, so a slow or failing subscriber does not hold up the others, and several workers can share one subscription to split its load. This decouples the publisher from the number and identity of consumers, which makes it easy to add a search indexer, a notifier or an analytics feed later. The cost is a broker to run, eventual consistency between services, and harder debugging because the flow is no longer one call chain. Pick it when one event must trigger several independent reactions. Do not use it when the sender needs an answer back or when there is only ever one consumer, where a plain queue or a direct call is simpler.

## Expert
Most brokers give at-least-once delivery, so subscribers must be idempotent, and ordering usually holds only within a partition or ordering key, not across a topic. Durable subscriptions with retention let a subscriber catch up after downtime, while ephemeral fan-out (Redis pub/sub, for example) drops messages for anyone not connected. Watch for poison messages without a dead-letter queue, unbounded backlog on one lagging subscription, and schema changes that break consumers you did not know existed, which is why event schemas need versioning and a registry or contract tests.
