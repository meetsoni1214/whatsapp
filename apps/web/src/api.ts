import {
  directConversationSchema,
  directConversationsSchema,
  messagePageSchema,
  type AuthenticatedSession,
  type DirectConversation,
  type MessagePage,
  type PublicUser,
} from "@event-chat/contracts";

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

async function protectedRequest(
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const send = () => {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${accessToken ?? ""}`);
    return fetch(`${API_URL}${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  };

  let response = await send();
  if (response.status === 401) {
    await restoreSession();
    response = await send();
  }
  if (!response.ok) throw await errorFrom(response);
  return response.json();
}

export async function searchUsers(query: string): Promise<PublicUser[]> {
  const value = await protectedRequest(
    `/users/search?q=${encodeURIComponent(query)}`,
  );
  return parseUsers(value);
}

export async function createDirectConversation(
  participantId: string,
): Promise<DirectConversation> {
  const value = await protectedRequest("/conversations/direct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantId }),
  });
  return parseResponse(directConversationSchema, value);
}

export async function listConversations(): Promise<DirectConversation[]> {
  const value = await protectedRequest("/conversations");
  return parseResponse(directConversationsSchema, value);
}

export async function getMessageHistory(
  conversationId: string,
  cursor?: string,
): Promise<MessagePage> {
  const search = new URLSearchParams({ limit: "50" });
  if (cursor) search.set("cursor", cursor);
  const value = await protectedRequest(
    `/conversations/${encodeURIComponent(conversationId)}/messages?${search}`,
  );
  return parseResponse(messagePageSchema, value);
}

function parseResponse<T>(
  schema: {
    safeParse(value: unknown): { success: true; data: T } | { success: false };
  },
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError("The API returned an invalid response", 502);
  }
  return parsed.data;
}
