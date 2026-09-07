import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { DirectConversation } from "@event-chat/contracts";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMessageHistory, listConversations } from "@/api";
import { ConversationWorkspace } from "./conversation-workspace";

const sendMessage = vi.fn();
const retryMessage = vi.fn();
const presenceFor = vi.fn();
const setTyping = vi.fn(() => true);
const isTyping = vi.fn(() => false);

vi.mock("@/features/realtime/realtime-state", () => ({
  useRealtime: () => ({
    error: null,
    pendingMessages: [],
    retryMessage,
    sendMessage,
    presenceFor,
    setTyping,
    isTyping,
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
  presence: {
    userId: "1685bc61-ac88-45e7-8437-593219fefb10",
    online: false,
    lastSeenAt: null,
  },
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
    presenceFor.mockReset();
    retryMessage.mockReset();
    setTyping.mockReset();
    setTyping.mockReturnValue(true);
    isTyping.mockReset();
    isTyping.mockReturnValue(false);
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
    expect(setTyping).toHaveBeenCalledWith(conversation.id, true);
    expect(setTyping).toHaveBeenLastCalledWith(conversation.id, false);

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

  it("uses realtime presence in the list and active thread", async () => {
    presenceFor.mockReturnValue({
      userId: conversation.participant.id,
      online: true,
      lastSeenAt: null,
    });
    vi.mocked(listConversations).mockResolvedValue([conversation]);
    vi.mocked(getMessageHistory).mockResolvedValue({
      data: [],
      nextCursor: null,
    });
    renderWorkspace();

    expect(await screen.findByLabelText("bob is online")).toBeInTheDocument();
    await userEvent.click(screen.getByText("bob"));
    expect(screen.getByText("Online")).toBeInTheDocument();
    expect(screen.getAllByLabelText("bob is online")).toHaveLength(2);
  });
  it("shows the peer's typing in the thread and preserves avatar presence", async () => {
    isTyping.mockReturnValue(true);
    presenceFor.mockReturnValue({
      userId: conversation.participant.id,
      online: true,
      lastSeenAt: null,
    });
    vi.mocked(listConversations).mockResolvedValue([conversation]);
    vi.mocked(getMessageHistory).mockResolvedValue({
      data: [],
      nextCursor: null,
    });
    renderWorkspace();
    await userEvent.click(await screen.findByText("bob"));
    expect(screen.getByRole("status")).toHaveTextContent("Typing…");
    expect(isTyping).toHaveBeenCalledWith(
      conversation.id,
      conversation.participant.id,
    );
    expect(screen.getAllByLabelText("bob is online")).toHaveLength(2);
    isTyping.mockReturnValue(false);
    fireEvent.change(screen.getByLabelText("Message composer"), {
      target: { value: "new edit" },
    });
    expect(screen.getByRole("status")).toHaveTextContent("Online");
    fireEvent.blur(screen.getByLabelText("Message composer"));
    expect(setTyping).toHaveBeenLastCalledWith(conversation.id, false);
  });

  it("does not submit Enter while an input method is composing", async () => {
    vi.mocked(listConversations).mockResolvedValue([conversation]);
    vi.mocked(getMessageHistory).mockResolvedValue({
      data: [],
      nextCursor: null,
    });
    renderWorkspace();
    await userEvent.click(await screen.findByText("bob"));
    const composer = screen.getByLabelText("Message composer");
    fireEvent.change(composer, { target: { value: "draft" } });
    expect(
      fireEvent.keyDown(composer, { key: "Enter", isComposing: true }),
    ).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
  });
});
