import { useMemo } from "react";
import type { DirectConversation, PublicUser } from "@event-chat/contracts";
import {
  AlertCircle,
  ArrowLeft,
  Inbox,
  LoaderCircle,
  LockKeyhole,
  MessageSquareText,
  Plus,
  Send,
} from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useConversations,
  useMessageHistory,
} from "@/features/conversations/queries";
import { cn } from "@/lib/utils";

interface ConversationWorkspaceProps {
  currentUser: PublicUser;
  onFindPeople: () => void;
  onSelect: (conversationId: string | null) => void;
  selectedConversationId: string | null;
}

const activityFormatter = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});
const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

function ConversationListSkeleton() {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div className="flex h-20 items-center gap-3 px-5" key={item}>
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-36" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ConversationList({
  conversations,
  onFindPeople,
  onSelect,
  selectedConversationId,
}: {
  conversations: DirectConversation[];
  onFindPeople: () => void;
  onSelect: (conversationId: string) => void;
  selectedConversationId: string | null;
}) {
  return (
    <>
      <header className="border-b border-border px-5 py-6 sm:px-7">
        <p className="text-[10px] font-bold tracking-[0.16em] text-primary uppercase">
          Direct messages
        </p>
        <div className="mt-2 flex items-end justify-between gap-4">
          <h1 className="font-serif text-4xl font-normal tracking-[-0.045em]">
            Conversations
          </h1>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Find someone"
            className="rounded-full text-primary hover:bg-primary/8"
            onClick={onFindPeople}
          >
            <Plus />
          </Button>
        </div>
      </header>

      {conversations.length === 0 ? (
        <div className="grid flex-1 place-items-center px-7 py-12 text-center">
          <div className="max-w-56">
            <Inbox className="mx-auto size-7 text-primary" />
            <h2 className="mt-5 font-serif text-2xl font-normal tracking-tight">
              No conversations yet
            </h2>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Find someone in the directory to start a direct conversation.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-6 rounded-none"
              onClick={onFindPeople}
            >
              Find people
            </Button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto" role="list">
          {conversations.map((conversation, index) => {
            const activity =
              conversation.lastMessageAt ?? conversation.createdAt;
            const isSelected = selectedConversationId === conversation.id;

            return (
              <button
                type="button"
                role="listitem"
                className={cn(
                  "group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-border px-5 py-4 text-left transition-colors duration-200 hover:bg-primary/5 sm:px-7",
                  isSelected && "bg-primary/8",
                )}
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                aria-current={isSelected ? "true" : undefined}
              >
                <UserAvatar username={conversation.participant.username} />
                <span className="grid min-w-0 gap-1">
                  <strong className="truncate text-xs">
                    {conversation.participant.username}
                  </strong>
                  <span className="truncate text-[10px] text-muted-foreground">
                    No messages yet
                  </span>
                </span>
                <span className="grid justify-items-end gap-2 text-[9px] text-muted-foreground tabular-nums">
                  {activityFormatter.format(new Date(activity))}
                  <span className="text-primary/70">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

function ConversationThread({
  conversation,
  currentUser,
  onBack,
}: {
  conversation: DirectConversation;
  currentUser: PublicUser;
  onBack: () => void;
}) {
  const history = useMessageHistory(conversation.id);
  const messages = useMemo(
    () => history.data?.pages.flatMap((page) => page.data).reverse() ?? [],
    [history.data],
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col animate-in fade-in slide-in-from-right-2 duration-300">
      <header className="flex h-[5.5rem] shrink-0 items-center gap-3 border-b border-border px-4 sm:px-7">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Back to conversations"
          className="-ml-2 lg:hidden"
          onClick={onBack}
        >
          <ArrowLeft />
        </Button>
        <UserAvatar username={conversation.participant.username} />
        <div className="grid min-w-0 gap-0.5">
          <h2 className="truncate font-serif text-xl font-normal tracking-tight">
            {conversation.participant.username}
          </h2>
          <span className="text-[10px] text-muted-foreground">
            Direct conversation
          </span>
        </div>
        <LockKeyhole
          className="ml-auto size-3.5 text-primary"
          aria-label="Private"
        />
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(rgba(16,32,25,0.03)_1px,transparent_1px)] bg-[length:100%_4.5rem] px-4 py-6 sm:px-8"
        aria-live="polite"
        aria-busy={history.isPending}
      >
        {history.hasNextPage && (
          <div className="mb-7 flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[10px] text-muted-foreground"
              onClick={() => history.fetchNextPage()}
              disabled={history.isFetchingNextPage}
            >
              {history.isFetchingNextPage && (
                <LoaderCircle className="animate-spin" />
              )}
              Load earlier
            </Button>
          </div>
        )}

        {history.isPending && (
          <div className="space-y-5" aria-hidden="true">
            <Skeleton className="h-16 w-3/5 rounded-2xl rounded-bl-sm" />
            <Skeleton className="ml-auto h-20 w-2/3 rounded-2xl rounded-br-sm" />
            <Skeleton className="h-14 w-2/5 rounded-2xl rounded-bl-sm" />
          </div>
        )}

        {history.isError && (
          <Alert variant="destructive" className="mx-auto mt-6 max-w-lg">
            <AlertCircle />
            <AlertDescription>
              {history.error instanceof Error
                ? history.error.message
                : "Message history is unavailable."}
            </AlertDescription>
          </Alert>
        )}

        {!history.isPending && !history.isError && messages.length === 0 && (
          <div className="grid min-h-full place-items-center py-16 text-center">
            <div className="max-w-64">
              <MessageSquareText className="mx-auto size-8 text-primary" />
              <h3 className="mt-5 font-serif text-2xl font-normal tracking-tight">
                A quiet conversation
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                There are no messages in this thread yet.
              </p>
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <ol className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.map((message) => {
              const isMine = message.senderId === currentUser.id;
              return (
                <li
                  className={cn(
                    "flex",
                    isMine ? "justify-end" : "justify-start",
                  )}
                  key={message.id}
                >
                  <div
                    className={cn(
                      "max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-xs sm:max-w-[70%]",
                      isMine
                        ? "rounded-br-sm bg-primary text-primary-foreground"
                        : "rounded-bl-sm bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words">
                      {message.content}
                    </p>
                    <time
                      className={cn(
                        "mt-1.5 block text-right text-[9px] tabular-nums",
                        isMine
                          ? "text-primary-foreground/65"
                          : "text-muted-foreground",
                      )}
                      dateTime={message.createdAt}
                    >
                      {messageTimeFormatter.format(new Date(message.createdAt))}
                    </time>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <footer className="shrink-0 border-t border-border bg-background px-4 py-4 sm:px-7">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <Input
            disabled
            aria-label="Message composer"
            placeholder="Live messaging is not enabled yet"
            className="h-11 rounded-full bg-muted/45 px-5 text-xs"
          />
          <Button
            disabled
            size="icon"
            className="shrink-0 rounded-full"
            aria-label="Send message"
          >
            <Send />
          </Button>
        </div>
        <p className="mx-auto mt-2 max-w-3xl px-2 text-[9px] text-muted-foreground">
          Sending becomes available with live messaging in the next milestone.
        </p>
      </footer>
    </section>
  );
}

export function ConversationWorkspace({
  currentUser,
  onFindPeople,
  onSelect,
  selectedConversationId,
}: ConversationWorkspaceProps) {
  const conversations = useConversations();
  const selectedConversation =
    conversations.data?.find((item) => item.id === selectedConversationId) ??
    null;

  return (
    <section className="min-h-0 min-w-0 flex-1 bg-background lg:grid lg:h-svh lg:grid-cols-[21rem_minmax(0,1fr)]">
      <aside
        className={cn(
          "min-h-[calc(100svh-8.75rem)] flex-col border-r border-border lg:flex lg:min-h-0",
          selectedConversation ? "hidden" : "flex",
        )}
      >
        {conversations.isPending ? (
          <>
            <header className="border-b border-border px-5 py-6 sm:px-7">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-3 h-9 w-52" />
            </header>
            <ConversationListSkeleton />
          </>
        ) : conversations.isError ? (
          <div className="grid flex-1 place-items-center px-6">
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>
                {conversations.error instanceof Error
                  ? conversations.error.message
                  : "Conversations are unavailable."}
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <ConversationList
            conversations={conversations.data ?? []}
            selectedConversationId={selectedConversationId}
            onSelect={onSelect}
            onFindPeople={onFindPeople}
          />
        )}
      </aside>

      <div
        className={cn(
          "min-h-[calc(100svh-8.75rem)] min-w-0 lg:flex lg:min-h-0",
          selectedConversation ? "flex" : "hidden",
        )}
      >
        {selectedConversation ? (
          <ConversationThread
            conversation={selectedConversation}
            currentUser={currentUser}
            onBack={() => onSelect(null)}
          />
        ) : (
          <div className="grid flex-1 place-items-center px-8 text-center">
            <div className="max-w-xs">
              <MessageSquareText className="mx-auto size-9 text-primary" />
              <h2 className="mt-6 font-serif text-3xl font-normal tracking-tight">
                Choose a conversation
              </h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Select a person from the conversation list to view its history.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
