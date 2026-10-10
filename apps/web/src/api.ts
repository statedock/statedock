export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-actor-id": "web-user",
      "x-actor-type": "human",
      "x-actor-name": "Web UI",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      details?: unknown;
    };
    throw new ApiError(
      response.status,
      error.error ?? "request_failed",
      error.message ?? error.error ?? `Request failed (${response.status})`,
      error.details,
    );
  }
  const text = await response.text();
  return text ? (JSON.parse(text).data as T) : (undefined as T);
}
