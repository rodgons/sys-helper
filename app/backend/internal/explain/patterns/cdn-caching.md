# CDN Caching
Aliases: CDN, CDN offload, edge caching, content delivery network, pull CDN, push CDN, origin offload
Gist: Serve cacheable content from edge servers near users instead of the origin.
Reference: https://learn.microsoft.com/en-us/azure/architecture/best-practices/cdn

## Beginner
A CDN (content delivery network) is a set of servers spread around the world that keep copies of your files, such as images, videos and scripts. When a user asks for a file, the nearest of these servers sends it, instead of your own server far away. This makes pages load faster and takes a lot of work off your servers. It is like a chain of local shops that stock a popular product, so people don't all have to order it from the factory.

## Intermediate
Clients resolve your content's hostname to a nearby edge server. On a hit the edge returns its copy; on a miss it fetches the file from your origin (a server or object storage), caches it according to the `Cache-Control` headers, and returns it. That is a pull CDN; a push CDN instead has you upload content ahead of time, which suits large files that rarely change. The gain is lower latency for distant users and much less traffic and load on the origin. The cost is staleness: an updated file may keep being served until its TTL ends or you purge it, so version file names (for example a content hash in the name) for assets that change. It works best for static or public content; personalized or rapidly changing responses gain little and risk serving one user's data to another if cache keys are wrong.

## Expert
Cache key design matters most: varying on too many headers, cookies or query strings fragments the cache and destroys the hit rate, while varying on too few leaks private responses, so mark personalized responses `private` or `no-store`. Expiry of a hot object or a global purge can send a burst of misses to the origin; request collapsing at the edge and an origin shield (a mid-tier cache) contain it, and `stale-while-revalidate` and `stale-if-error` keep serving during refresh or origin outages. Purges propagate in seconds to minutes and are not transactional, so immutable versioned URLs are more reliable than invalidation for deploys. The CDN also becomes a dependency and a security boundary, so lock the origin to accept only CDN traffic and plan for a CDN outage.
