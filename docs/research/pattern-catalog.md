# Pattern catalog: seed list, names and aliases

Research for issue #82 (map #81). Checked 2026-10-03 against the sources below. Component Types use the ids from `architecture.ComponentTypes` (`app/backend/internal/architecture/document.go`). Code references are to `origin/main` at `7741b07`.

## TL;DR

- **Seed list: 55 Patterns**, 29 must-have and 26 nice-to-have (table below). They cover what the app's Users draw: caching, read scaling, partitioning, async work through queues, resilience, file upload and delivery, feeds, and consistency across services.
- **Most of the names come from the Azure Architecture Center catalog.** It is the only source that is a maintained catalog with one page per pattern, a stable URL and a one-line summary, and 26 of the 55 rows link one of its pattern pages. System Design Primer and DDIA cover the data-layer and scaling vocabulary that Azure leaves out (replication modes, failover, fan-out, consistent hashing, CDN push/pull, write-behind). microservices.io covers the messaging patterns (Transactional Outbox, CDC, API Gateway, Database per Service). AWS Prescriptive Guidance adds few new names, but the AWS caching whitepaper and Builders' Library are the best references for caching aliases and retries.
- **The AI writes descriptive phrases, not catalog names.** The only pattern logged from a real model is `"Primary-Replica relational database"` (Gemini, `TestProposalsTheModelGotWrongInProduction` in `assistant/assistant_test.go`). It mixes a Pattern (leader-follower) with a technology. Exact-name matching alone would link almost nothing until the prompt lists the catalog's names.
- **The worst alias collisions:** "replication" (leader-follower vs read replicas vs multi-leader), "fan-out" (feeds vs pub/sub vs gateway aggregation), "partitioning" (sharding vs vertical vs functional, and federation), "rate limiting" (Azure uses it for a *client* limiting its own calls, while system-design usage means a *server* limiting callers, which Azure calls Throttling), "active-active"/"active-passive" (both failover and replication), and "lazy loading" (cache-aside, but also front-end image loading).

## Sources

| Source | What it gives | URL |
| --- | --- | --- |
| Azure Architecture Center, Cloud Design Patterns | 44 patterns, each with a summary and its own page. Page updated 2026-09-29. | https://learn.microsoft.com/en-us/azure/architecture/patterns/ |
| Azure best-practice and architecture-style guides | Caching, CDN, data partitioning (horizontal/vertical/functional), autoscaling, load balancing, web-queue-worker, event-driven | https://learn.microsoft.com/en-us/azure/architecture/best-practices/data-partitioning (and siblings, linked per row) |
| microservices.io (Chris Richardson) | Microservice patterns: data, transactional messaging, API gateway, discovery, reliability | https://microservices.io/patterns/index.html |
| AWS Prescriptive Guidance, cloud design patterns | 12 patterns (ACL, API routing, circuit breaker, event sourcing, hexagonal, pub-sub, retry with backoff, sagas, scatter-gather, strangler fig, transactional outbox) | https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/introduction.html |
| AWS whitepaper, Database Caching Strategies Using Redis | "Cache-Aside (Lazy Loading)" and "Write-Through" as named caching patterns. Marked "for historical reference only", but still the clearest primary statement of the alias. | https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html |
| Amazon Builders' Library | Retries, backoff and jitter. Load shedding. | https://builder.aws.com/content/3EumjoZascWd1oZiEgL8ORlv3qE/timeouts-retries-and-backoff-with-jitter |
| System Design Primer (donnemartin) | Interview vocabulary: CDN push/pull, active-passive/active-active failover, master-slave/master-master replication, federation, sharding, denormalization, cache-aside/write-through/write-behind/refresh-ahead, task queues, back pressure | https://github.com/donnemartin/system-design-primer |
| *Designing Data-Intensive Applications* (Kleppmann) | Replication (single-leader, multi-leader, leaderless), partitioning, transactions, stream processing and CDC, the Twitter home-timeline fan-out example | https://dataintensive.net/ |

DDIA chapter references are to the **1st edition** (ch. 1 Reliable, Scalable and Maintainable Applications; ch. 5 Replication; ch. 6 Partitioning; ch. 9 Consistency and Consensus; ch. 11 Stream Processing). The 2nd edition renumbers some chapters, so cite DDIA by chapter title, not number. The book is not online, so the table links a free primary source for each DDIA-sourced row instead.

## Names the AI produces today

| Where | `pattern` value | Catalog match |
| --- | --- | --- |
| `app/backend/internal/llm/fake.go` (`FakeProposal`) | `Cache-aside` | Cache-Aside (exact, case differs) |
| `app/backend/internal/assistant/assistant_test.go` (logged from Gemini in production, 2026-10-01) | `Primary-Replica relational database` | Leader-Follower Replication (alias + technology noise) |
| `app/frontend/demo/workspace.capture.ts` (hand-written demo) | `Cache-aside`, `CDN offload`, `Event-driven indexing` | Cache-Aside, CDN Caching (alias), Search Index Sync (alias) |
| `app/frontend/src/knowledge/panels.test.tsx` (fixture) | `Single primary` | Ambiguous: Leader-Follower Replication, or simply "one database, no replicas" |

`app/backend/internal/assistant/prompt.go` only says "name the pattern or technology" (lines 12, 19, 20). It names no pattern, so today the model chooses its own wording. Note that the AI writes **technologies** in the same field ("Redis", "WebSocket", "PostgreSQL"). Those should stay plain text, not be forced onto a Pattern.

The `alternative` field holds pattern names too (`"Read replicas: more to operate for the same win"` in `fake.go`). Linking it is not in this map's scope, but the same matcher would work there.

## Seed catalog

Tier: **M** = must-have (comes up in most designs of URL shorteners, feeds, chat, e-commerce or file storage, or is the usual rejected alternative to one that does). **N** = nice-to-have.

### Caching and content delivery

| Pattern (canonical) | Aliases and spellings | Gist | Component Types | Reference | Tier |
| --- | --- | --- | --- | --- | --- |
| Cache-Aside | cache aside, lazy loading, lazy caching, look-aside cache, read-aside | The app reads the cache first. On a miss it loads from the database and fills the cache. | `service`, `cache`, `database` | https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside | M |
| Write-Through | write-through cache, write through | Every write goes to the cache and the database together, so the cache stays current. | `service`, `cache`, `database` | https://docs.aws.amazon.com/whitepapers/latest/database-caching-strategies-using-redis/caching-patterns.html | M |
| Write-Behind | write-back, write behind, write-back cache, write-behind caching | Writes land in the cache and are flushed to the database later, asynchronously. | `service`, `cache`, `database`, `queue` | https://github.com/donnemartin/system-design-primer#write-behind-write-back | N |
| Refresh-Ahead | refresh ahead, read-ahead, proactive refresh, cache prefetching | The cache refreshes hot entries before they expire. | `cache`, `database` | https://github.com/donnemartin/system-design-primer#refresh-ahead | N |
| CDN Caching | CDN offload, edge caching, content delivery network, pull CDN, push CDN, origin offload | Serve cacheable content from edge servers near users instead of the origin. | `client`, `cdn`, `object_store`, `service` | https://learn.microsoft.com/en-us/azure/architecture/best-practices/cdn | M |
| Static Content Hosting | static website hosting, static assets in object storage, serve from blob storage | Put static files in object storage and let clients fetch them directly, usually through a CDN. | `client`, `cdn`, `object_store` | https://learn.microsoft.com/en-us/azure/architecture/patterns/static-content-hosting | M |

### Traffic, scaling and the edge

| Pattern (canonical) | Aliases and spellings | Gist | Component Types | Reference | Tier |
| --- | --- | --- | --- | --- | --- |
| Load Balancing | load balancer, round robin, least connections, L4/L7 load balancing, layer 7 routing | Spread requests across identical instances and route around unhealthy ones. | `client`, `load_balancer`, `service` | https://learn.microsoft.com/en-us/azure/architecture/guide/technology-choices/load-balancing-overview | M |
| Horizontal Scaling | scale out, scaling out, stateless services, stateless app tier, add more instances | Run many interchangeable stateless instances behind a load balancer instead of a bigger machine. | `load_balancer`, `service` | https://github.com/donnemartin/system-design-primer#horizontal-scaling | M |
| Autoscaling | auto-scaling, auto scaling, elastic scaling, scale on demand | Add and remove instances automatically from load metrics. | `service`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/best-practices/auto-scaling | N |
| API Gateway | gateway, single entry point, edge service, API front door | One entry point routes client calls to services and handles cross-cutting concerns. | `client`, `api_gateway`, `service` | https://microservices.io/patterns/apigateway.html | M |
| Backends for Frontends | BFF, backend for frontend, backend-for-frontend | A separate backend per client type (web, mobile) shapes the API for that client. | `client`, `api_gateway`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends | N |
| Gateway Aggregation | API composition, request aggregation, scatter-gather, gateway fan-out | The gateway calls several services and returns one combined response. | `client`, `api_gateway`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-aggregation | N |
| Gateway Offloading | TLS termination, SSL offloading, offload auth to the gateway | Move shared concerns (TLS, auth, compression) from services into the gateway. | `api_gateway`, `load_balancer`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/gateway-offloading | N |
| Rate Limiting | throttling, rate limiter, token bucket, leaky bucket, sliding window, request quotas | Cap how many requests a caller may make in a time window and reject the rest (429). | `client`, `api_gateway`, `service`, `cache` | https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling | M |
| Load Shedding | shedding load, admission control, graceful degradation | Under overload, reject low-priority work early so the rest still succeeds. | `load_balancer`, `api_gateway`, `service` | https://aws.amazon.com/builders-library/using-load-shedding-to-avoid-overload/ | N |
| Geode | geo-distribution, multi-region active-active, global deployment, geo-routing | Deploy full copies in several regions. Any region serves any user, routed by DNS. | `dns`, `load_balancer`, `service`, `database` | https://learn.microsoft.com/en-us/azure/architecture/patterns/geodes | N |
| Deployment Stamps | cells, cell-based architecture, scale units, stamps | Deploy many independent copies of the whole stack, each serving a subset of tenants. | `dns`, `service`, `database` | https://learn.microsoft.com/en-us/azure/architecture/patterns/deployment-stamp | N |

### Data: replication, partitioning, read models

| Pattern (canonical) | Aliases and spellings | Gist | Component Types | Reference | Tier |
| --- | --- | --- | --- | --- | --- |
| Leader-Follower Replication | primary-replica, primary/secondary, master-slave, single-leader, leader-based replication, active/passive replication, single primary | One node takes writes and streams them to followers that hold copies. | `database` (+ `replication` connections) | https://github.com/donnemartin/system-design-primer#master-slave-replication (DDIA "Replication") | M |
| Read Replicas | read replica, replica reads, read scaling, read-only replicas, read/write splitting | Send reads to follower copies so the primary only handles writes. | `service`, `database` (+ `replication`) | https://aws.amazon.com/rds/features/read-replicas/ | M |
| Multi-Leader Replication | master-master, multi-master, multi-primary, active-active replication | Several nodes accept writes and replicate to each other, so conflicts must be resolved. | `database` (+ `replication`) | https://github.com/donnemartin/system-design-primer#master-master-replication (DDIA "Replication") | N |
| Leaderless Replication | quorum reads and writes, Dynamo-style replication, N/R/W quorum, sloppy quorum | Any replica takes reads and writes, and a quorum of them must agree. | `database` | https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf (DDIA "Replication") | N |
| Failover | fail-over, active-passive failover, hot standby, warm standby, active-active failover, automatic failover | When a node dies, a standby takes over its traffic or role. | `dns`, `load_balancer`, `service`, `database` | https://github.com/donnemartin/system-design-primer#fail-over | M |
| Sharding | horizontal partitioning, partitioning, shards, hash partitioning, range partitioning, partition key | Split one dataset across several databases by a shard key. | `database`, `cache`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/patterns/sharding | M |
| Consistent Hashing | hash ring, consistent hash ring, virtual nodes, vnodes | Map keys and nodes onto a ring, so adding a node moves only a small share of keys. | `cache`, `database`, `load_balancer` | https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf | M |
| Federation | functional partitioning, split databases by function, vertical split | Give each functional area (users, products, orders) its own database. | `service`, `database` | https://github.com/donnemartin/system-design-primer#federation | N |
| Database per Service | database-per-service, private database, own your data | Each service owns its data, and others reach it only through its API. | `service`, `database` | https://microservices.io/patterns/data/database-per-service.html | N |
| Denormalization | denormalized data, duplicating data, precomputed joins | Copy data into the rows that read it, trading write cost and duplication for faster reads. | `database` | https://github.com/donnemartin/system-design-primer#denormalization | M |
| Materialized View | precomputed view, read model, projection, summary table | Precompute and store query results shaped for how they are read. | `service`, `database`, `cache` | https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view | M |
| CQRS | command query responsibility segregation, command-query separation (loosely), separate read and write models | Writes and reads go through separate models, often separate stores. | `service`, `database`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs | M |
| Event Sourcing | event store, append-only event log, event log as source of truth | Store every change as an event and rebuild state by replaying them. | `service`, `database`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing | N |
| Index Table | secondary index table, lookup table | Keep a separate table keyed by a field queries filter on, pointing at the main records. | `database` | https://learn.microsoft.com/en-us/azure/architecture/patterns/index-table | N |
| Search Index Sync | dedicated search index, event-driven indexing, search indexing, full-text search index, index sync | Copy searchable data into a search engine, kept in sync from the database (often through CDC or a queue). | `service`, `database`, `queue`, `search_index` | https://learn.microsoft.com/en-us/azure/architecture/data-guide/scenarios/search | M |
| Change Data Capture | CDC, transaction log tailing, binlog streaming, WAL streaming, Debezium-style | Read the database's own change log and publish each change as an event. | `database`, `queue`, `search_index`, `cache` | https://microservices.io/patterns/data/transaction-log-tailing.html (DDIA "Stream Processing") | M |
| Distributed ID Generation | Snowflake IDs, unique ID generator, ticket server, key generation service, KGS | Generate unique, roughly time-ordered ids without one central counter. | `service`, `database` | https://github.com/twitter-archive/snowflake | N |

### Async work and messaging

| Pattern (canonical) | Aliases and spellings | Gist | Component Types | Reference | Tier |
| --- | --- | --- | --- | --- | --- |
| Queue-Based Load Leveling | queue-based load leveling, load leveling, write buffering, buffer with a queue, async processing | A queue absorbs bursts so the service behind it works at a steady rate. | `service`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/patterns/queue-based-load-leveling | M |
| Competing Consumers | worker pool, work queue, task queue, background workers, consumer group | Several workers pull from one queue, and each message goes to one of them. | `queue`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/competing-consumers | M |
| Publisher-Subscriber | pub/sub, pub-sub, publish-subscribe, publish/subscribe, topics, event bus, message broadcast | A publisher emits events to a topic, and every subscriber gets its own copy. | `service`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/patterns/publisher-subscriber | M |
| Asynchronous Request-Reply | async request-response, 202 Accepted + polling, job status endpoint, long-running operation | Accept the request at once, do the work in the background, and let the client poll or be called back. | `client`, `service`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/patterns/asynchronous-request-reply | N |
| Web-Queue-Worker | background jobs, web + worker, offload to worker, task queues | A web front end hands slow work to workers through a queue. | `service`, `queue`, `database` | https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/web-queue-worker | N |
| Priority Queue | prioritized queue, priority messaging | Higher-priority messages are processed before lower-priority ones. | `queue`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/priority-queue | N |
| Idempotent Consumer | idempotency, idempotency key, idempotent receiver, deduplication, exactly-once processing (loosely) | Processing the same message or request twice has the same effect as once. | `queue`, `service`, `database` | https://learn.microsoft.com/en-us/azure/architecture/patterns/idempotent-consumer | M |
| Transactional Outbox | outbox, outbox pattern, polling publisher | Write the event to an outbox table in the same transaction as the data, then relay it to the queue. | `service`, `database`, `queue` | https://microservices.io/patterns/data/transactional-outbox.html | M |
| Saga | saga orchestration, saga choreography, orchestration, choreography, long-running transaction | A multi-service operation runs as local steps, each with a compensating step if a later one fails. | `service`, `queue`, `database` | https://microservices.io/patterns/data/saga.html | M |
| Compensating Transaction | compensation, undo step, compensating action | Undo the completed steps of a failed multi-step operation. | `service`, `database` | https://learn.microsoft.com/en-us/azure/architecture/patterns/compensating-transaction | N |
| Two-Phase Commit | 2PC, XA transactions, distributed transaction, atomic commit | A coordinator makes every participant commit or abort together. Usually the rejected alternative to a Saga. | `service`, `database` | https://dataintensive.net/ (DDIA "Consistency and Consensus") | N |
| Fan-out on Write | push model, write fan-out, precomputed timelines, timeline cache, inbox per user | On each post, write it into every follower's feed so reads are a single lookup. | `service`, `queue`, `cache`, `database` | https://www.infoq.com/presentations/Twitter-Timeline-Scalability/ (DDIA ch. 1, Twitter example) | M |
| Fan-out on Read | pull model, read fan-out, merge on read, query-time feed assembly | Build a feed when it is read by merging recent posts from everyone the user follows. | `service`, `database`, `cache` | https://www.infoq.com/presentations/Twitter-Timeline-Scalability/ (DDIA ch. 1, Twitter example) | M |
| Event-Driven Architecture | event-driven, EDA, event-driven design | Components react to events instead of calling each other directly. | `service`, `queue` | https://learn.microsoft.com/en-us/azure/architecture/guide/architecture-styles/event-driven | N |

### Resilience and files

| Pattern (canonical) | Aliases and spellings | Gist | Component Types | Reference | Tier |
| --- | --- | --- | --- | --- | --- |
| Retry with Backoff | retry, retries, exponential backoff, backoff with jitter, retry pattern | Retry transient failures, waiting longer (with jitter) after each attempt. | `service`, `external_service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/retry | M |
| Circuit Breaker | circuit-breaker, breaker, fail fast | Stop calling a failing dependency for a while, then probe before resuming. | `service`, `external_service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker | M |
| Bulkhead | bulkheads, resource isolation, isolated pools | Give each dependency or tenant its own pool so one failure can't exhaust them all. | `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead | N |
| Health Endpoint Monitoring | health check, health check API, liveness/readiness probe | Expose a health endpoint the load balancer or orchestrator polls. | `load_balancer`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/health-endpoint-monitoring | N |
| Valet Key | pre-signed URL, presigned URL, signed URL, SAS token, direct-to-storage upload | Give the client a short-lived, scoped token to read or write object storage directly. | `client`, `service`, `object_store` | https://learn.microsoft.com/en-us/azure/architecture/patterns/valet-key | M |
| Claim Check | reference-based messaging, large payload offload, store payload, pass reference | Put a large payload in object storage and send only its reference through the queue. | `queue`, `object_store`, `service` | https://learn.microsoft.com/en-us/azure/architecture/patterns/claim-check | N |
| Multipart Upload | chunked upload, resumable upload, chunking | Upload a large file in independent parts that can be retried and run in parallel. | `client`, `object_store` | https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html | N |

Counts: 6 + 11 + 17 + 14 + 7 = **55** (29 M, 26 N). Two rows are architecture styles more than patterns (Event-Driven Architecture, Web-Queue-Worker). Drop them if the catalog should hold patterns only, which leaves 53.

## Alias collisions a matcher must handle

Normalize before matching: lowercase, treat `-`, `/`, `_` and spaces alike, drop a trailing "pattern", and drop surrounding technology words when they are a known Component Type or engine ("Redis", "PostgreSQL", "relational database"). Even then, these collide:

1. **"Replication."** Alone, it could mean Leader-Follower Replication, Read Replicas or Multi-Leader Replication. It is also a Connection kind (`replication`) in the app. Map bare "replication" to Leader-Follower Replication (the default in DDIA and SDP), and keep "read replica(s)" for Read Replicas. "Primary-replica" goes to Leader-Follower, not Read Replicas.
2. **"Active-active" / "active-passive".** SDP uses them for *failover* ("active-passive failover … master-slave failover"). DDIA uses "active/passive" for *leader-based replication*. Match only the long forms ("active-passive failover" → Failover), and leave the bare words unlinked or send them to Failover.
3. **"Master-slave" / "master-master".** These are legacy terms that SDP and older docs still use. They are aliases of Leader-Follower and Multi-Leader. Keep them as aliases so they match, but the catalog's display names should use leader/follower or primary/replica.
4. **"Partitioning."** Azure: horizontal (= sharding), vertical, functional. SDP: "Federation (or functional partitioning)". DDIA: "partitioning" = sharding (a shard is also called a partition, region, tablet, vnode or vBucket depending on the database). Map bare "partitioning" and "horizontal partitioning" to Sharding. Map "functional partitioning" to Federation. "Vertical partitioning" has no entry; leave it plain text.
5. **"Federation" vs "Federated Identity".** These are unrelated: a data split vs delegated sign-in (Azure). Federated Identity is not in the seed list. Don't let "federated" fuzzy-match Federation.
6. **"Rate limiting" vs "Throttling".** Azure's *Rate Limiting* pattern (`rate-limiting-pattern`) is about a **client** limiting its own calls to avoid being throttled. Azure's *Throttling* pattern is the **server** limiting its callers. In system-design interviews, "rate limiter" means the server side. The catalog entry is named **Rate Limiting**, with "throttling" as an alias and Azure Throttling as its reference.
7. **"Fan-out."** This can mean feed fan-out (on write or read), pub/sub delivering one message to many subscribers, or a gateway calling many services (scatter-gather). Bare "fan-out" should not link. "Fan-out on write" / "push model" and "fan-out on read" / "pull model" link. "Push" and "pull" alone also collide with "push CDN" / "pull CDN".
8. **"Lazy loading."** In caching this is Cache-Aside (AWS: "Cache-Aside (Lazy Loading)"). In UI it means deferring images or code. Accept it, because Decisions are about Architectures, but don't add "lazy" alone.
9. **"Write-back" vs "write-behind".** These are the same Pattern (SDP heading "Write-behind (write-back)").
10. **"CQRS" vs "read/write splitting".** "Read/write splitting" usually means Read Replicas (routing reads to replicas), not separate models. Keep it on Read Replicas.
11. **Component names vs Patterns.** "CDN", "Load balancer", "API gateway", "Queue", "Cache" are also Component Types. A Decision whose pattern is just "Load balancer" should link to Load Balancing. "Cache" alone is too vague to link. "CDN" alone links to CDN Caching. Treat a bare Component Type name as matching only where the table lists it as an alias.
12. **"Consistent hashing" vs "hash partitioning".** DDIA (1st ed., ch. 6, "Partitioning by Hash of Key") notes that "consistent hashing" is often used loosely for any hash partitioning, and suggests calling that "hash partitioning". Keep two entries: "hash partitioning" is an alias of Sharding, and "consistent hashing" / "hash ring" is its own Pattern.
13. **"Orchestration" / "Choreography".** Azure has a *Choreography* pattern of its own, while microservices.io and AWS use both words as the two styles of Saga. In this app they almost always appear with sagas, so both go to Saga as aliases. Revisit if a standalone Choreography entry is added.
14. **"Exactly-once", "distributed transaction".** These are loose aliases: Idempotent Consumer achieves effectively-once processing, and "distributed transaction" usually means Two-Phase Commit but is sometimes used for Saga. List them as aliases of one entry only (Idempotent Consumer and Two-Phase Commit) and accept the occasional wrong link, or leave them out.
15. **"Single primary"** (frontend fixture). This is ambiguous between "one leader with followers" and "one database, no replicas". Don't map it. It's a good example of free text that should stay plain.
16. **Strangler Application vs Strangler Fig, API Composition vs Gateway Aggregation, Index Table vs Search Index Sync.** These are the same idea or near neighbours with different names in different sources. The table puts each under one canonical name.

## Tiers: why these 29 are must-have

- **URL shortener:** Cache-Aside, Read Replicas, Leader-Follower Replication, Sharding, Consistent Hashing, Load Balancing, Horizontal Scaling, Rate Limiting, CDN Caching. (Distributed ID Generation is N, because most answers use hashing or base62 of a counter.)
- **News feed / social:** Fan-out on Write, Fan-out on Read, Denormalization, Materialized View, Publisher-Subscriber, Queue-Based Load Leveling, Competing Consumers, Search Index Sync, Change Data Capture, Valet Key, CDN Caching.
- **Chat:** Publisher-Subscriber, Sharding, Consistent Hashing, Idempotent Consumer, Load Balancing. (WebSockets and long polling are protocols, not Patterns. Leave them as plain text.)
- **E-commerce:** Saga, Transactional Outbox, Idempotent Consumer, CQRS, Retry with Backoff, Circuit Breaker, API Gateway, Failover.
- **File storage / media:** Valet Key, Static Content Hosting, CDN Caching, Write-Through (metadata caches), Queue-Based Load Leveling (processing pipelines).

Nice-to-have entries are real, well-sourced patterns that are rarer in these designs (Geode, Deployment Stamps, Bulkhead, Two-Phase Commit) or that refine a must-have one (Write-Behind, Refresh-Ahead, Multi-Leader, Leaderless).

**Considered and left out:** Ambassador, Sidecar, Anti-Corruption Layer, Strangler Fig, Gatekeeper, Quarantine, Messaging Bridge, Sequential Convoy, Scheduler Agent Supervisor, External Configuration Store, Compute Resource Consolidation, Pipes and Filters, Leader Election, Federated Identity, Service Discovery and Service Registry, Hexagonal Architecture, Microservice/Monolithic architecture (styles), testing and observability patterns. These are mostly deployment, migration, code-structure or ops concerns with no Component Type on the canvas. Back Pressure (SDP) is close to Load Shedding and Queue-Based Load Leveling; add it as an alias of Load Shedding if needed.

## Open points for later tickets

- **The prompt should list the canonical names** (map decision: "The AI is given the catalog's names and prefers them"). The production sample shows models add technology words, so the prompt should ask for the bare Pattern name and put technologies in the rationale.
- **Matching:** the alias lists above are enough for an exact match after normalization. Fuzzy matching is risky because of collisions 1, 4, 5 and 7.
- **Ids:** a slug of the canonical name (`cache-aside`, `leader-follower-replication`) is stable and readable in both Go and TypeScript.
