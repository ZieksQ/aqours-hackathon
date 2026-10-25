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
export async function csrf() {
  const response = await fetch("/api/auth/web/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok)
    throw new ApiError(
      response.status,
      "Could not secure your request. Please try again.",
    );
  return ((await response.json()) as { requestToken: string }).requestToken;
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers:
        body === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "X-CSRF-TOKEN": await csrf(),
            },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "Cannot reach Aqours. Check your connection and try again.",
    );
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
