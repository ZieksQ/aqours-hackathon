import { queryClient } from "../../shared/query";
export type Role = "Admin" | "Staff" | "Customer";
export type Account = {
  id: string;
  email: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  role: Role;
  requiresPasswordChange: boolean;
};
export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  constructor(
    status: number,
    message: string,
    errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}
export async function csrf(signal?: AbortSignal) {
  const response = await fetch("/api/auth/web/csrf", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    if (response.status === 401) queryClient.setQueryData(["account"], null);
    throw new ApiError(
      response.status,
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : "Could not secure your request. Please try again.",
    );
  }
  return ((await response.json()) as { requestToken: string }).requestToken;
}
export async function api<T>(
  path: string,
  body?: unknown | FormData,
  method?: "POST" | "PUT",
  signal?: AbortSignal,
  timeoutMs = 15000,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  let response: Response;
  try {
    const isMultipart =
      typeof FormData !== "undefined" && body instanceof FormData;
    const headers =
      body === undefined
        ? {}
        : {
            ...(!isMultipart ? { "Content-Type": "application/json" } : {}),
            "X-CSRF-TOKEN": await csrf(controller.signal),
          };
    response = await fetch(`/api${path}`, {
      signal: controller.signal,
      method: body === undefined ? "GET" : (method ?? "POST"),
      credentials: "same-origin",
      cache: "no-store",
      headers,
      body:
        body === undefined
          ? undefined
          : isMultipart
            ? body
            : JSON.stringify(body),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        0,
        "The request took too long. Check your connection and try again.",
      );
    throw new ApiError(
      0,
      "Cannot reach Aqours. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== "/auth/web/login")
      queryClient.setQueryData(["account"], null);
    throw new ApiError(
      response.status,
      response.status === 401
        ? "Your session has expired. Please sign in again."
        : response.status === 403
          ? "You do not have permission to do this."
          : response.status === 404
            ? "This report is unavailable."
            : response.status === 409
              ? (detail.detail ??
                "This ticket has changed. Refresh and try again.")
              : response.status === 400
                ? "Check the highlighted fields and try again."
                : "Aqours could not complete your request. Please try again.",
      detail.errors ?? {},
    );
  }
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
export async function currentAccount() {
  try {
    return await api<Account>("/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
