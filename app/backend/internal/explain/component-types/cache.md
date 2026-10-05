# Cache
Gist: A fast, usually in-memory store that keeps copies of frequently read data to cut latency and load.
Reference: https://github.com/donnemartin/system-design-primer#cache

## Beginner
A cache keeps copies of data that is asked for often, in fast memory, so the system does not have to fetch it from the slower database every time. It is like keeping the books you use daily on your desk instead of walking to the library. The copies can get out of date, so they are usually kept only for a limited time. The **engine** is the product, such as Redis, and **eviction** is the rule for what to throw out when the cache is full.

## Intermediate
A cache usually sits beside a service and in front of a database, holding results keyed by something like a user ID or query. On a hit it answers in well under a millisecond; on a miss the service reads the source and stores the result with a **TTL** (time to live). Memory is limited, so the **eviction** policy decides what goes: LRU drops the least recently used entries, LFU the least frequently used, and TTL-only setups drop expired keys first. The trade-off is staleness and extra failure modes in exchange for speed and lower database load. Use it for data read much more often than it changes and that can be slightly stale; avoid it where every read must be exact, like account balances.

## Expert
Invalidation is the hard part: delete-on-write races with concurrent reads and can repopulate stale values, so many systems combine short TTLs with versioned keys. When a hot key expires, many requests miss at once and stampede the database; request coalescing, early probabilistic refresh or locks prevent it. Treat the cache as disposable: if a restart or eviction storm overloads the database, capacity planning was relying on the hit rate, and the database must be sized for a cold cache or protected by load shedding.
