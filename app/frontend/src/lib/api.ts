export const baseUrl = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The API's machine-readable error code (`{"error": "…"}`), if it sent one. */
    readonly code: string | undefined,
    message: string,
    /** The whole error body, for codes that carry details (e.g. `not_allowed` lists identities). */
    readonly body?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** The API refused because a Project or User is at one of its limits (409 `limit_reached`). */
export const isLimit = (err: unknown) => err instanceof ApiError && err.code === 'limit_reached';

/** Calls the Go API. Pass `token` (the Supabase access token) for endpoints that need a User. */
export async function apiFetch<T>(
  path: string,
  { token, headers, ...init }: RequestInit & { token?: string } = {},
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(headers as Record<string, string>),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => undefined)) as
      | ({ error?: string } & Record<string, unknown>)
      | undefined;
    throw new ApiError(
      res.status,
      body?.error,
      `${init.method ?? 'GET'} ${path} failed with ${res.status}`,
      body,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
