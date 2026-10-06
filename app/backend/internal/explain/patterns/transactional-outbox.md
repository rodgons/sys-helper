# Transactional Outbox
Aliases: outbox, polling publisher
Gist: Write the event to an outbox table in the same transaction as the data, then relay it to the queue.
Reference: https://microservices.io/patterns/data/transactional-outbox.html

## Beginner
A service often needs to save something and also tell other services about it. If it saves the data and then crashes before sending the message, the rest of the system never hears about the change. The outbox fixes this by writing the message into a table in the same database, at the same moment as the data. It is like putting a letter in your own outbox tray while filing the paperwork, and a mail clerk later collects everything in the tray and posts it.

## Intermediate
The service writes the business row and an outbox row in one local database transaction, so either both exist or neither does. A separate relay reads unsent outbox rows, publishes them to the broker, and marks them sent or deletes them. The relay can poll the table or tail the database's change log. This avoids a distributed transaction between the database and the broker. The trade-offs are extra latency before the event appears, an extra process to run and monitor, and duplicates when the relay publishes but crashes before marking a row sent. Pick it whenever a state change and its event must not diverge; skip it when losing an occasional event is acceptable.

## Expert
Delivery is at-least-once, so consumers must be idempotent, and the relay should publish with the outbox row id as the message id. Polling with `SELECT ... FOR UPDATE SKIP LOCKED` scales to several relays but can reorder events across rows, so per-aggregate ordering needs a partition key or a single relay per partition. Log-tailing relays (CDC on the outbox table) cut polling load and latency but add a connector to operate. Purge or partition the outbox table, because a growing table and long-running transactions slow the poll query and can make the relay skip rows whose ids committed out of order.
