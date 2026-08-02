export const queryKeys = {
  session: ["session"] as const,
  users: {
    all: ["users"] as const,
    search: (query: string) => ["users", "search", query] as const,
  },
};
