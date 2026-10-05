# Object Store
Gist: Cheap, durable storage for files and blobs, addressed by key over HTTP, such as Amazon S3.
Reference: https://aws.amazon.com/what-is/object-storage/

## Beginner
An object store keeps files such as photos, videos, backups and documents. Each file gets a name, and you save or fetch the whole file using that name. It is like a coat check: you hand over a coat, get a ticket, and later use the ticket to get the same coat back. It can hold huge amounts of data cheaply and rarely loses anything.

## Intermediate
Objects live in buckets and are read and written whole through an HTTP API by key, with metadata attached; there are no partial updates, joins or queries. It scales almost without limit and is very durable because the provider copies data across devices and zones. Large files should not pass through your services: clients upload and download directly with **pre-signed URLs**, and a CDN usually serves public content. Store the file in the object store and its key plus searchable metadata in a database. Storage classes trade price against retrieval speed, so lifecycle rules can move old data to colder, cheaper tiers.

## Expert
Per-request latency is tens of milliseconds and per-prefix request rates are limited, so many small objects or chatty access patterns perform badly; batch them or use a database instead. Listing is slow and costly at scale, so keep your own index rather than scanning keys. The bill is often driven by requests and egress, not storage, and public-bucket misconfiguration is a common breach, so default to private buckets with versioning or object lock for data you cannot afford to lose.
