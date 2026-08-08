import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DirectConversation } from "@event-chat/contracts";
import {
  createDirectConversation,
  getMessageHistory,
  listConversations,
} from "@/api";
import { queryKeys } from "@/lib/query-keys";

export function useConversations() {
  return useQuery({
    queryKey: queryKeys.conversations.list(),
    queryFn: listConversations,
  });
}

export function useCreateDirectConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDirectConversation,
    onSuccess: (conversation: DirectConversation) => {
      queryClient.setQueryData<DirectConversation[]>(
        queryKeys.conversations.list(),
        (current = []) => [
          conversation,
          ...current.filter((item) => item.id !== conversation.id),
        ],
      );
    },
  });
}

export function useMessageHistory(conversationId: string | null) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId ?? "none"),
    queryFn: ({ pageParam }) => getMessageHistory(conversationId!, pageParam),
    enabled: Boolean(conversationId),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
