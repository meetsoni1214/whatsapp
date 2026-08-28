import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  DirectConversation,
  Message,
  MessagePage,
} from "@event-chat/contracts";
import { queryKeys } from "@/lib/query-keys";

export function upsertRealtimeMessage(
  queryClient: QueryClient,
  message: Message,
): void {
  queryClient.setQueryData<InfiniteData<MessagePage>>(
    queryKeys.conversations.messages(message.conversationId),
    (current) => {
      if (!current || current.pages.length === 0) return current;

      const pages = current.pages.map((page) => ({
        ...page,
        data: page.data.filter(
          (item) =>
            item.id !== message.id &&
            item.clientMessageId !== message.clientMessageId,
        ),
      }));
      pages[0] = {
        ...pages[0],
        data: [message, ...pages[0].data],
      };
      return { ...current, pages };
    },
  );

  queryClient.setQueryData<DirectConversation[]>(
    queryKeys.conversations.list(),
    (current) => {
      if (!current) return current;

      return current
        .map((conversation) =>
          conversation.id === message.conversationId
            ? { ...conversation, lastMessageAt: message.createdAt }
            : conversation,
        )
        .sort((left, right) => {
          const leftActivity = left.lastMessageAt ?? left.createdAt;
          const rightActivity = right.lastMessageAt ?? right.createdAt;
          return (
            new Date(rightActivity).getTime() -
            new Date(leftActivity).getTime()
          );
        });
    },
  );
}

export function recoverRealtimeQueries(queryClient: QueryClient): void {
  void queryClient.resetQueries({
    queryKey: queryKeys.conversations.all,
  });
}
