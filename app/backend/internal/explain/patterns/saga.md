# Saga
Aliases: saga orchestration, saga choreography, orchestration, choreography, long-running transaction
Gist: A multi-service operation runs as local steps, each with a compensating step if a later one fails.
Reference: https://microservices.io/patterns/data/saga.html

## Beginner
Some actions span several services, such as placing an order that must reserve stock, charge a card and book a delivery. Each service has its own database, so they cannot all save in one go. A saga does the steps one after another, and if a later step fails it runs "undo" steps for the earlier ones, like refunding the charge. It is like booking a trip: if the hotel is full, you cancel the flight you already booked.

## Intermediate
Each step is a local transaction in one service, followed by a message or command that triggers the next step. Every step that can be followed by a failure has a compensating action that semantically undoes it, for example a refund rather than deleting the payment. In choreography, services react to each other's events with no central controller; in orchestration, one coordinator tells each service what to do and tracks progress. Choreography suits short flows, while orchestration is easier to follow and change once there are more than a few steps. The main trade-off is that there is no isolation: other requests can see intermediate states. Use a saga when a business operation must span services with separate databases; avoid it when the data can live in one database and one local transaction would do.

## Expert
Without isolation you get dirty reads and lost updates between concurrent sagas, so use countermeasures such as semantic locks (a `PENDING` status), commutative updates, or ordering steps so that the pivot transaction comes after the steps that may fail. Compensations must be idempotent and retryable, since they can be redelivered or fail themselves, and steps after the pivot should be retryable rather than compensatable. Orchestrators need durable state, usually a workflow engine or a state table with an outbox, so a crash resumes the saga instead of stranding it. Monitor for stuck sagas with timeouts, because a missing reply otherwise leaves resources reserved forever.
