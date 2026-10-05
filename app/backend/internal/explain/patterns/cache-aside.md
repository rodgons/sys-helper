# Cache-Aside
Aliases: lazy loading, lazy caching, look-aside cache, read-aside
Gist: The app reads the cache first. On a miss it loads from the database and fills the cache.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside

## Beginner
A cache is a small, fast store that keeps copies of data the app asks for often. With cache-aside, the app always checks the cache first, and only goes to the slower database when the answer is not there. When it does go to the database, it saves a copy in the cache so the next request is fast. It is like keeping the books you read most on your desk and walking to the library only for the ones you don't have yet.

## Intermediate
On a read, the app looks up the key in the cache. On a hit it returns the value; on a miss it reads the database, writes the result to the cache with a TTL (time to live), and returns it. On a write, the app updates the database and then deletes the cache entry, so the next read reloads it. Only data that is actually requested ends up in the cache, and the app keeps working if the cache goes down, only slower. The cost is a slow first read for every key and a window where the cache can serve stale data. Pick it for read-heavy data that tolerates brief staleness; avoid it when every read must see the latest write, or when nearly every request is a different key and the hit rate stays low.

## Expert
A popular key that expires can cause a stampede (dogpile) of concurrent misses on the database; mitigate it with request coalescing (single-flight), a lock per key, probabilistic early refresh or stale-while-revalidate. Deleting rather than updating the entry on write narrows but does not close the race where a slow reader writes an old value back after the invalidation, so keep TTLs as the backstop, or use versioned values or leases (a token issued on a miss that a later invalidation voids). Caching "not found" results with a short TTL protects the database from repeated misses on absent keys. A cold cache after a restart or failover sends the full read load to the database, so size the database for that or warm the cache first.
