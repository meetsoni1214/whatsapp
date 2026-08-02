import type { AuthenticatedSession, PublicUser } from "@event-chat/contracts";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";

interface ErrorBody {
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthenticatedSession> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseUser(value: unknown): PublicUser {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.username !== "string"
  ) {
    throw new ApiError("The API returned an invalid user", 502);
  }

  return { id: value.id, username: value.username };
}

function parseSession(value: unknown): AuthenticatedSession {
  if (!isRecord(value) || typeof value.accessToken !== "string") {
    throw new ApiError("The API returned an invalid session", 502);
  }

  return {
    accessToken: value.accessToken,
    user: parseUser(value.user),
  };
}

function parseUsers(value: unknown): PublicUser[] {
  if (!Array.isArray(value)) {
    throw new ApiError("The API returned an invalid user list", 502);
  }

  return value.map(parseUser);
}

async function errorFrom(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return new ApiError(body.message ?? "Something went wrong", response.status);
}

async function refresh(): Promise<AuthenticatedSession> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok) {
    accessToken = null;
    throw await errorFrom(response);
  }

  const session = parseSession(await response.json());
  accessToken = session.accessToken;
  return session;
}

export function restoreSession(): Promise<AuthenticatedSession> {
  refreshPromise ??= refresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function authenticate(
  path: "login" | "register",
  credentials: { username: string; password: string },
): Promise<AuthenticatedSession> {
  const response = await fetch(`${API_URL}/auth/${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) throw await errorFrom(response);

  const session = parseSession(await response.json());
  accessToken = session.accessToken;
  return session;
}

export const login = (username: string, password: string) =>
  authenticate("login", { username, password });

export const register = (username: string, password: string) =>
  authenticate("register", { username, password });

export async function logout(): Promise<void> {
  try {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } finally {
    accessToken = null;
  }
}

async function searchRequest(query: string): Promise<PublicUser[]> {
  const response = await fetch(
    `${API_URL}/users/search?q=${encodeURIComponent(query)}`,
    {
      headers: { Authorization: `Bearer ${accessToken ?? ""}` },
      credentials: "include",
    },
  );

  if (!response.ok) throw await errorFrom(response);
  return parseUsers(await response.json());
}

export async function searchUsers(query: string): Promise<PublicUser[]> {
  try {
    return await searchRequest(query);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
    await restoreSession();
    return searchRequest(query);
  }
}
