export type ApiError = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

export async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as ApiError;
    return payload.error?.message ?? payload.message ?? fallback;
  } catch {
    return fallback;
  }
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(input, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers,
  });
}
