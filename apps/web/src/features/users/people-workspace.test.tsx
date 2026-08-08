import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DirectConversation } from "@event-chat/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createDirectConversation, searchUsers } from "@/api";
import { PeopleWorkspace } from "./people-workspace";

vi.mock("@/api", () => ({
  createDirectConversation: vi.fn(),
  searchUsers: vi.fn(),
}));

vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

describe("PeopleWorkspace", () => {
  it("creates a direct conversation from a search result", async () => {
    const user = userEvent.setup();
    const onConversationCreated = vi.fn();
    const conversation: DirectConversation = {
      id: "426aa224-2ec1-4530-898c-d0c48f8b59c9",
      type: "direct",
      participant: {
        id: "1685bc61-ac88-45e7-8437-593219fefb10",
        username: "bob",
      },
      createdAt: "2026-08-02T08:00:00.000Z",
      lastMessageAt: null,
    };
    vi.mocked(searchUsers).mockResolvedValue([conversation.participant]);
    vi.mocked(createDirectConversation).mockResolvedValue(conversation);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <PeopleWorkspace onConversationCreated={onConversationCreated} />
      </QueryClientProvider>,
    );

    await user.type(
      screen.getByRole("textbox", { name: "Search users by username" }),
      "bob",
    );
    await user.click(await screen.findByRole("button", { name: "Start chat" }));

    expect(vi.mocked(createDirectConversation).mock.calls[0]?.[0]).toBe(
      "1685bc61-ac88-45e7-8437-593219fefb10",
    );
    expect(onConversationCreated.mock.calls[0]?.[0]).toEqual(conversation);
  });
});
