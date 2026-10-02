# Users sign in with GitHub or Google, linked by verified email

Users can sign in with GitHub or Google. When a second provider's identity arrives with the same verified email, Supabase Auth links it to the existing User (automatic linking), so the person keeps one set of Projects. The beta allowlist still matches only immutable provider ids: numeric GitHub ids in `ALLOWED_GITHUB_IDS` and Google `sub` values in `ALLOWED_GOOGLE_IDS`. A User is admitted if any of their identities is listed. The API reads identities from `auth.identities`, never from `user_metadata`.

## Considered Options

- **Separate Users per provider.** Rejected because a person who switches providers would lose their Projects.
- **Allowlisting by email.** Rejected even though it's easier to operate. Emails can be reassigned (for example by Workspace admins), while ids can't. To make the id-based allowlist workable, the not-allowed page shows the Google id so the person can send it in.
- **Manual linking from Settings.** Deferred. Without it, a GitHub account with no verified email that matches the Google email stays a separate User.

## Consequences

Undoing automatic linking later means splitting Users whose Projects already mix work done under both providers.
