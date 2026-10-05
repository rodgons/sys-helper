# Client
Gist: The program a person uses, such as a browser or mobile app, that sends requests into the system.
Reference: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Server-side/First_steps/Client-Server_overview

## Beginner
A client is the part of the system that people actually touch: a website in a browser, a phone app, or a program on a computer. It shows information and sends requests to the servers when the user taps or types something. Think of it as a customer at a restaurant counter: it asks for things and waits for the answer, but it does not cook. The **platform** property says where it runs, for example Web, iOS or Android.

## Intermediate
A client sits at the edge of the Architecture and starts most flows: it resolves a name through DNS, then calls a CDN, load balancer or API over HTTPS. It runs on hardware you do not control, so anything it sends must be checked again on the server, and any secret shipped inside it should be treated as public. The **platform** matters in practice: web clients update the moment you deploy, while mobile apps stay on old versions for months, so the API must stay backward compatible. Clients also face slow or flaky networks, which favours fewer, larger requests, caching on the device and clear loading and offline states. Draw separate Client boxes when platforms differ in what they call or how they authenticate; one box is enough when they share the same API.

## Expert
Long-lived mobile versions turn every API change into a compatibility contract, so plan for versioning, feature flags and a minimum supported version you can enforce. Client retry logic is a classic cause of retry storms after an outage: use exponential backoff with jitter, idempotency keys on writes, and honour `Retry-After`. Thick clients with local state and offline sync move complexity into conflict resolution, while thin clients pay for it in round trips and latency.
