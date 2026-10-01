const baseUrl = import.meta.env.VITE_API_URL;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The API's machine-readable error code (`{"error": "…"}`), if it sent one. */
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
  }
}

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
    const body = (await res.json().catch(() => undefined)) as { error?: string } | undefined;
    throw new ApiError(
      res.status,
      body?.error,
      `${init.method ?? 'GET'} ${path} failed with ${res.status}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
