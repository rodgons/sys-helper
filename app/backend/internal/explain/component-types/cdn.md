# CDN
Gist: A content delivery network: servers spread around the world that serve cached content close to users.
Reference: https://github.com/donnemartin/system-design-primer#content-delivery-network

## Beginner
A CDN is a network of servers in many cities that keep copies of your files, such as images, scripts and videos. When someone opens your site, they get the files from the nearest copy instead of from your main server far away. It is like a chain of local shops stocked from one central warehouse: customers shop nearby and the warehouse gets fewer visits. This makes pages faster and protects your servers from heavy traffic.

## Intermediate
The CDN sits between clients and your **origin** (an object store, load balancer or service). Each edge location answers from its cache when it can and fetches from the origin on a miss, keeping the copy for as long as the `Cache-Control` headers allow. It works best for static, public content like assets and media; personalised or fast-changing responses are hard to cache and often pass straight through. The main trade-off is freshness: long cache times give high hit rates but serve stale content until you purge or use versioned file names. Many CDNs also terminate TLS, absorb DDoS traffic and run a web application firewall, so the box is often the public entry point even for uncached API calls.

## Expert
Cache key design decides the hit rate: varying on cookies, query strings or headers like `Accept-Language` fragments the cache, and caching a response keyed too loosely leaks one user's data to another. A cold or purged cache sends a burst of misses to the origin, which origin shielding and request collapsing reduce. Prefer immutable, content-hashed asset names over purges, and remember that `stale-while-revalidate` and `stale-if-error` trade freshness for availability when the origin is down.
