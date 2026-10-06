# Sharding
Aliases: horizontal partitioning, partitioning, shards, hash partitioning, range partitioning, partition key
Gist: Split one dataset across several databases by a shard key.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding

## Beginner
Sharding splits one big database into several smaller ones, each holding part of the data. Think of a library that puts its books in several rooms by the author's last name: A to H in one room, I to P in the next, and so on. To find a record, the app first works out which database holds it from a chosen field, such as the user ID. Each database then has less data and less work, so the whole system can grow by adding more of them.

## Intermediate
Each row has a **shard key**, and a routing rule maps the key to a shard: a hash of the key for an even spread, key ranges for efficient range scans, or a lookup table for full control. Queries that include the shard key go to one shard, while queries without it must fan out to every shard and merge the results. Sharding scales writes and storage, which read replicas cannot, but it costs you cross-shard joins, cross-shard transactions and global unique constraints. Rebalancing data when you add shards is also real work. Pick it when one primary can no longer handle the write volume or data size, and the main access paths share one natural key such as tenant or user ID. Try vertical scaling, read replicas, caching and archiving first, because sharding is hard to undo.

## Expert
Key choice decides most outcomes: a monotonic key under range sharding sends every insert to the last shard, and a celebrity key under hash sharding makes a hot shard that resharding cannot fix without splitting the key itself (for example, by salting it). Routing by `hash(key) mod N` moves almost every key when N changes, so use many fixed logical partitions mapped to nodes, consistent hashing or a directory, and plan online moves with dual reads or writes. Secondary indexes are either local (writes stay on one shard, reads scatter and gather) or global (reads hit one place, writes become distributed and usually asynchronous). Cross-shard invariants need sagas or two-phase commit, and schema changes, backups and failover now run once per shard.
