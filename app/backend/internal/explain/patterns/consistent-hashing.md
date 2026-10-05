# Consistent Hashing
Aliases: hash ring, consistent hash ring, virtual nodes, vnodes
Gist: Map keys and nodes onto a ring, so adding a node moves only a small share of keys.
Reference: https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf

## Beginner
Consistent hashing decides which server stores each piece of data, so that adding or removing a server moves very little data. Picture a round clock face: each server takes a spot on the clock, and each piece of data also lands on a spot. A piece of data belongs to the first server you reach going clockwise from its spot. When a new server joins, it takes over only the data just behind it on the clock, and everything else stays where it was.

## Intermediate
A hash function maps both node IDs and keys onto the same circular range, and each key belongs to the next node clockwise. Adding or removing one of N nodes moves about 1/N of the keys, while plain `hash(key) mod N` moves almost all of them. Each physical node usually takes many points on the ring (**virtual nodes**), which evens out the load and lets a bigger machine take more points. Replicas go on the next distinct nodes clockwise. It suits distributed caches and key-value stores where nodes join and leave often. If the node set rarely changes, or a directory already maps partitions to nodes, a fixed number of partitions is simpler.

## Expert
With few points per node the load spread is uneven (with one point each, some nodes own several times the average), but many vnodes enlarge routing metadata and slow repair and streaming in Dynamo-style stores, which is why Cassandra 4.0 cut its default token count from 256 to 16. It balances keys, not traffic, so hot keys still need replication, key splitting or a cache in front. Alternatives include rendezvous (highest random weight) hashing, jump consistent hash for numbered buckets, and consistent hashing with bounded loads, which caps each node at a set factor above the mean. Clients and nodes must agree on ring membership, usually through gossip or a coordinator, and a stale view sends requests to the wrong owner while membership changes.
