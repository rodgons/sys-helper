# Valet Key
Aliases: pre-signed URL, presigned URL, signed URL, SAS token, direct-to-storage upload
Gist: Give the client a short-lived, scoped token to read or write object storage directly.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/valet-key

## Beginner
Large files such as photos or videos do not need to pass through the application's own servers. Instead, the server hands the user's app a temporary pass that allows one specific action, such as uploading one file, and the app talks to the file storage directly. It is like a valet key for a car, which can start the engine but cannot open the boot, and only works for a short time. This keeps the servers free for other work.

## Intermediate
The client asks the API for permission, the API checks the user's rights, and returns a signed URL or token limited to one object, one operation and a short expiry. The client then uploads or downloads straight to object storage, so file bytes never pass through the application servers. This cuts bandwidth, memory use and latency on the API, and lets storage and CDNs handle the heavy traffic. The trade-off is less control: the server does not see the content as it arrives, so validation, virus scanning and metadata updates must happen afterwards, usually triggered by a storage event. Use it for uploads and downloads of large or numerous files. Avoid it when every byte must be inspected or transformed before it is stored.

## Expert
A token can be replayed until it expires and usually cannot be revoked individually, so keep expiries short, scope it to an exact key, and constrain content type and size where the provider supports it (for example, an S3 presigned POST policy with `content-length-range`). Never let the client choose the object key freely, or it can overwrite other users' data. The upload completing is not a transaction with your database, so record a pending row first and confirm it on the storage notification, with a sweeper for abandoned uploads. Signed URLs leak through logs, referrers and shared links, so treat them as bearer credentials.
