import { QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/api";
import { queryKeys } from "@/lib/query-keys";

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        queryClient.setQueryData(queryKeys.session, null);
      }
    },
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status < 500) && failureCount < 2,
      staleTime: 30_000,
    },
    mutations: {
      retry: false,
    },
  },
});
