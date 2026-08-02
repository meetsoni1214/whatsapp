import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { searchUsers } from "@/api";
import { queryKeys } from "@/lib/query-keys";

export function useUserSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.users.search(query),
    queryFn: () => searchUsers(query),
    enabled: query.length > 0,
    placeholderData: keepPreviousData,
  });
}
