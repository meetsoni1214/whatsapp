import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "@/App";

vi.mock("@/features/auth/queries", () => ({
  useSession: () => ({
    isPending: false,
    data: {
      user: {
        id: "426aa224-2ec1-4530-898c-d0c48f8b59c9",
        username: "alice",
      },
    },
  }),
  useLogout: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/features/realtime/realtime-context", () => ({
  RealtimeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/features/conversations/conversation-workspace", () => ({
  ConversationWorkspace: ({ onFindPeople }: { onFindPeople: () => void }) => (
    <button onClick={onFindPeople}>Open directory</button>
  ),
}));

vi.mock("@/features/users/people-workspace", () => ({
  PeopleWorkspace: () => <h1>People workspace</h1>,
}));

describe("App workspace navigation", () => {
  it("starts in conversations and switches to people", async () => {
    render(<App />);
    expect(
      screen.getByRole("button", { name: "Open directory" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Open directory" }),
    );
    expect(
      screen.getByRole("heading", { name: "People workspace" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getAllByRole("button", { name: "Conversations" })[0],
    );
    expect(
      screen.getByRole("button", { name: "Open directory" }),
    ).toBeInTheDocument();
  });
});
