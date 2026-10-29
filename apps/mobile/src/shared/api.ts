export type Account = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  requiresPasswordChange: boolean;
};

export type Session = {
  account: Account;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string | null;
  refreshTokenExpiresAt: string | null;
};

export type ReportAddress = {
  regionCode: string;
  regionName: string;
  provinceCode: string | null;
  provinceName: string | null;
  cityMunicipalityCode: string;
  cityMunicipalityName: string;
  subMunicipalityCode: string | null;
  subMunicipalityName: string | null;
  barangayCode: string;
  barangayName: string;
  details: string;
};

export type Report = {
  id: string;
  issueType: "NoWater" | "LowPressure" | "DirtyWater";
  description: string;
  address: ReportAddress;
  latitude: number;
  longitude: number;
  status: "Submitted" | "InProgress" | "Resolved";
  createdAt: string;
};

export type Message = {
  id: string;
  senderName: string;
  senderRole: string;
  body: string;
  createdAt: string;
};

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;
  constructor(
    message: string,
    status: number,
    errors: Record<string, string[]> = {},
  ) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

// Tokens stay in memory. Closing the app requires a new sign-in.
export class ApiClient {
  private session: Session | null = null;
  private listeners = new Set<() => void>();
  private refreshing: Promise<void> | null = null;
  readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.trim().replace(/\/+$/, "");
  }

  getSession = () => this.session;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setSession(session: Session | null) {
    this.session = session;
    this.listeners.forEach((listener) => listener());
  }

  async login(email: string, password: string) {
    const session = await this.request<Session>(
      "/auth/mobile/login",
      { email, password },
      false,
    );
    if (session.account.role !== "Customer") {
      throw new ApiError("Use your supplier-provided Customer account.", 403);
    }
    this.setSession(session);
  }

  async changePassword(currentPassword: string, newPassword: string) {
    const session = await this.request<Session>("/auth/change-password", {
      currentPassword,
      newPassword,
    });
    this.setSession(session);
  }

  async logout() {
    const token = this.session?.refreshToken;
    // Clear local access immediately, even when the phone is offline.
    this.setSession(null);
    if (token)
      await this.request<void>(
        "/auth/mobile/logout",
        { refreshToken: token },
        false,
      );
  }

  private async refresh() {
    if (this.refreshing) return this.refreshing;
    const current = this.session;
    if (!current?.refreshToken) {
      this.setSession(null);
      throw new ApiError("Your session expired. Please sign in again.", 401);
    }
    this.refreshing = (async () => {
      try {
        const next = await this.request<Session>(
          "/auth/mobile/refresh",
          { refreshToken: current.refreshToken },
          false,
        );
        // A pending refresh must never restore a session after sign-out.
        if (this.session === current) this.setSession(next);
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.status === 401 &&
          this.session === current
        )
          this.setSession(null);
        throw error;
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  async getAccessToken(): Promise<string> {
    if (
      this.session &&
      Date.parse(this.session.accessTokenExpiresAt) <= Date.now()
    )
      await this.refresh();
    if (!this.session)
      throw new ApiError("Your session expired. Please sign in again.", 401);
    return this.session.accessToken;
  }

  async request<T>(
    path: string,
    body?: object,
    authenticated = true,
    retry = true,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.baseUrl)
      throw new ApiError(
        "Set EXPO_PUBLIC_API_URL to your supplier API address before signing in.",
        0,
      );
    const token = authenticated ? await this.getAccessToken() : undefined;
    let response: Response;
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timeout = setTimeout(abort, 15000);
    if (signal?.aborted) controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      response = await fetch(`${this.baseUrl}/api${path}`, {
        method: body ? "POST" : "GET",
        credentials: "omit",
        headers: {
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(
        "Cannot reach your supplier. Check your connection and try again.",
        0,
      );
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
    if (response.status === 401 && authenticated && retry) {
      // Another request may already have rotated this access token.
      if (this.session?.accessToken === token) await this.refresh();
      return this.request<T>(path, body, true, false, signal);
    }
    if (!response.ok) {
      if (response.status === 401 && authenticated) this.setSession(null);
      const problem = (await response.json().catch(() => null)) as {
        errors?: Record<string, string[]>;
        detail?: string;
      } | null;
      const validation = Object.values(problem?.errors ?? {})
        .flat()
        .join(" ");
      throw new ApiError(
        response.status === 401
          ? authenticated
            ? "Your session expired. Please sign in again."
            : "Email or password is incorrect, or this session has expired."
          : response.status === 429
            ? "Too many attempts. Please wait a moment and try again."
            : response.status >= 500
              ? "Your supplier is temporarily unavailable. Please try again."
              : validation ||
                problem?.detail ||
                "This request could not be completed. Please try again.",
        response.status,
        problem?.errors,
      );
    }
    return response.status === 204
      ? (undefined as T)
      : (response.json() as Promise<T>);
  }
}
