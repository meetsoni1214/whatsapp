import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DirectConversation } from "@event-chat/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessageHistory, listConversations } from "@/api";
import { ConversationWorkspace } from "./conversation-workspace";

const sendMessage = vi.fn();
const retryMessage = vi.fn();

vi.mock("@/features/realtime/realtime-state", () => ({
  useRealtime: () => ({
    error: null,
    pendingMessages: [],
    retryMessage,
    sendMessage,
    status: "live",
  }),
}));

vi.mock("@/api", () => ({
  getMessageHistory: vi.fn(),
  listConversations: vi.fn(),
}));

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

function renderWorkspace(onFindPeople = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  function Harness() {
    const [selected, setSelected] = useState<string | null>(null);
    return (
      <ConversationWorkspace
        currentUser={{
          id: "af6ea967-9188-4a24-9908-81f8c0fc9443",
          username: "alice",
        }}
        selectedConversationId={selected}
        onSelect={setSelected}
        onFindPeople={onFindPeople}
      />
    );
  }

  render(
    <QueryClientProvider client={queryClient}>
      <Harness />
    </QueryClientProvider>,
  );
}

describe("ConversationWorkspace", () => {
  beforeEach(() => {
    vi.mocked(listConversations).mockReset();
    vi.mocked(getMessageHistory).mockReset();
    sendMessage.mockReset();
    retryMessage.mockReset();
  });

  it("links the empty inbox to user discovery", async () => {
    const onFindPeople = vi.fn();
    vi.mocked(listConversations).mockResolvedValue([]);
    renderWorkspace(onFindPeople);

    await userEvent.click(
      await screen.findByRole("button", { name: "Find people" }),
    );
    expect(onFindPeople).toHaveBeenCalledOnce();
  });

  it("opens a thread, loads older messages, and sends through realtime", async () => {
    vi.mocked(listConversations).mockResolvedValue([conversation]);
    vi.mocked(getMessageHistory)
      .mockResolvedValueOnce({
        data: [
          {
            id: "30000000-0000-4000-8000-000000000000",
            conversationId: conversation.id,
            senderId: conversation.participant.id,
            clientMessageId: "30000000-0000-4000-8000-000000000001",
            content: "Newer hello",
            createdAt: "2026-08-02T08:01:00.000Z",
          },
        ],
        nextCursor: "older-page",
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "20000000-0000-4000-8000-000000000000",
            conversationId: conversation.id,
            senderId: "af6ea967-9188-4a24-9908-81f8c0fc9443",
            clientMessageId: "20000000-0000-4000-8000-000000000001",
            content: "Older hello",
            createdAt: "2026-08-02T08:00:00.000Z",
          },
        ],
        nextCursor: null,
      });
    renderWorkspace();

    await userEvent.click(await screen.findByText("bob"));
    expect(await screen.findByText("Newer hello")).toBeInTheDocument();
    const composer = screen.getByLabelText("Message composer");
    await userEvent.type(composer, "  Live hello  ");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(sendMessage).toHaveBeenCalledWith(conversation.id, "Live hello");

    await userEvent.click(screen.getByRole("button", { name: "Load earlier" }));
    expect(await screen.findByText("Older hello")).toBeInTheDocument();
    await waitFor(() =>
      expect(getMessageHistory).toHaveBeenLastCalledWith(
        conversation.id,
        "older-page",
      ),
    );

    const older = screen.getByText("Older hello");
    const newer = screen.getByText("Newer hello");
    expect(older.compareDocumentPosition(newer)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
