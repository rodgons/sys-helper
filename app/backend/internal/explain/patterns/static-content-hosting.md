# Static Content Hosting
Aliases: static website hosting, static assets in object storage, serve from blob storage
Gist: Put static files in object storage and let clients fetch them directly, usually through a CDN.
Reference: https://learn.microsoft.com/en-us/azure/architecture/patterns/static-content-hosting

## Beginner
Many files a website sends, like images, style sheets, scripts and downloads, are the same for every visitor. Instead of having your application servers send them, you put them in object storage, a cheap service built to store and serve files. Browsers then download those files straight from storage, often through a CDN (a network of servers close to users). It is like putting free brochures on a rack by the door, so staff at the desk only deal with people who need real help.

## Intermediate
Static files are uploaded to an object store such as S3 or Azure Blob Storage, usually during the build or deploy step, and served over HTTPS from there or from a CDN in front of it. Pages reference them by URL, so application servers only handle dynamic requests. This cuts compute cost, because object storage is cheaper per request than app servers, and it scales without effort. The trade-offs are a second deployment target to keep in sync with the app, and no server-side logic for those files: no per-user rendering, and access control needs signed URLs or similar. Pick it for front-end bundles, media and public downloads; don't use it for content that must change per request or per user.

## Expert
Deploys must be ordered so the new HTML never references assets that are not uploaded yet, and old hashed assets should stay for a while so clients holding the previous HTML don't get 404s. Serving through a CDN with the bucket locked to the CDN's identity (origin access control) avoids public buckets, egress costs and direct hot-linking. Single-page apps need the host or CDN to rewrite unknown paths to `index.html`, and correct `Content-Type`, compression and CORS headers must be set at upload or on the CDN because no app server sets them. For private files, short-lived signed URLs (the valet key pattern) keep the direct download path without exposing the bucket.
