export const queryKeys = {
  session: ["session"] as const,
  conversations: {
    all: ["conversations"] as const,
    list: () => ["conversations", "list"] as const,
    messages: (conversationId: string) =>
      ["conversations", conversationId, "messages"] as const,
  },
  users: {
    all: ["users"] as const,
    search: (query: string) => ["users", "search", query] as const,
  },
};
