# Service
Gist: Your own application code running as a server process, handling requests and business logic.
Reference: https://github.com/donnemartin/system-design-primer#application-layer

## Beginner
A service is a program you write that does the real work of your product, such as creating orders or logging users in. It waits for requests, does the job, often reads or saves data, and sends back an answer. It is like a kitchen in a restaurant: orders come in, the cooks prepare them, and plates go out. The **runtime** property is the language or platform it runs on, and **instances** is how many copies run at once.

## Intermediate
A service usually sits behind a load balancer or API gateway and talks to databases, caches, queues and other services. Running several **instances** gives you capacity and survives a crash of one copy, but only if the service is **stateless**: anything that must survive, like sessions or uploads, lives in a database, cache or object store. Instances can be a fixed number or autoscaled on CPU, request rate or queue depth. The **runtime** affects memory use, start-up time and concurrency model, which matters for autoscaling and cold starts. Splitting into many small services lets teams deploy independently, but adds network calls, partial failures and harder debugging, so start with fewer, larger services until there is a clear reason to split.

## Expert
Every synchronous call to another component needs a timeout, bounded retries and ideally a circuit breaker, or one slow dependency ties up all threads and spreads the outage. Autoscaling lags behind spikes and can overwhelm a database with new connections, so size connection pools against the database limit, not per instance. Graceful shutdown, readiness checks and idempotent handlers matter more than raw instance count when deploys and restarts are frequent.
