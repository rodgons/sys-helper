# Write-Through
Aliases: write-through cache
Gist: Every write goes to the cache and the database together, so the cache stays current.
Reference: https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html

## Beginner
A cache is a small, fast store that keeps copies of data so the app can read it quickly. With write-through, every time the app saves something, it saves it to both the database and the cache at the same time. Because of that, the cache always has the latest version of anything that was written. It is like updating both your paper calendar and the one on your phone whenever you book a meeting, so whichever you look at is correct.

## Intermediate
On each write, the app (or a cache layer in front of the database) writes the value to the database and to the cache in the same operation, and reports success only when both are done. Reads then hit the cache and rarely see stale data for keys that were written through it. The trade-off is slower writes, because each one does two writes, and a cache that fills with data that may never be read. It is usually combined with cache-aside, so keys that were never written still load on a read miss, and with a TTL so unused entries expire. Pick it when data is read soon after it is written and stale reads are costly, such as user profiles or session data; avoid it for write-heavy data that is rarely read.

## Expert
The two writes are not atomic: if the database write succeeds and the cache write fails (or the reverse), the stores diverge, so either delete the key on failure or rely on TTLs to repair it. Concurrent writers can still apply cache updates in a different order from the database commits, leaving an old value cached; versioned writes or invalidating after commit avoid that. Writes made outside the app path, such as migrations, admin scripts or another service, bypass the cache and need their own invalidation, for example from change data capture. Write-behind is the variant that acknowledges after the cache write and flushes to the database asynchronously, trading durability for lower write latency.
