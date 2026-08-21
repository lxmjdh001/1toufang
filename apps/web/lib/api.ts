export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type ApiErrorPayload = {
  code?: string;
  message?: string | string[] | { code?: string; message?: string };
  error?: string;
  statusCode?: number;
  required?: string[];
};

export class ApiError extends Error {
  status?: number;
  code?: string;
  payload?: ApiErrorPayload;

  constructor(message: string, payload?: ApiErrorPayload, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.code ?? nestedErrorCode(payload?.message);
    this.payload = payload;
  }
}

function nestedErrorCode(message: ApiErrorPayload["message"]) {
  return message && !Array.isArray(message) && typeof message === "object" ? message.code : undefined;
}

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("accessToken") ?? window.sessionStorage.getItem("accessToken");
}

export function saveAuthTokens(accessToken: string, refreshToken: string, remember = true) {
  const storage = remember ? window.localStorage : window.sessionStorage;
  const otherStorage = remember ? window.sessionStorage : window.localStorage;
  otherStorage.removeItem("accessToken");
  otherStorage.removeItem("refreshToken");
  storage.setItem("accessToken", accessToken);
  storage.setItem("refreshToken", refreshToken);
}

export function clearAuthTokens() {
  window.localStorage.removeItem("accessToken");
  window.localStorage.removeItem("refreshToken");
  window.sessionStorage.removeItem("accessToken");
  window.sessionStorage.removeItem("refreshToken");
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {})
    }
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorPayload;
    const rawMessage = body.message;
    const message =
      typeof rawMessage === "string"
        ? rawMessage
        : Array.isArray(rawMessage)
          ? rawMessage.join("；")
          : rawMessage?.message ?? body.error ?? `Request failed: ${response.status}`;

    throw new ApiError(message, body, response.status);
  }

  return response.json() as Promise<T>;
}
