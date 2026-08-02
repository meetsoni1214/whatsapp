import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthenticatedSession } from "@event-chat/contracts";
import { login, logout, register, restoreSession } from "@/api";
import { queryKeys } from "@/lib/query-keys";

type AuthMode = "login" | "register";

interface AuthCredentials {
  mode: AuthMode;
  username: string;
  password: string;
}

export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: restoreSession,
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function useAuthenticate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ mode, username, password }: AuthCredentials) =>
      mode === "login"
        ? login(username, password)
        : register(username, password),
    onSuccess: (session: AuthenticatedSession) => {
      queryClient.setQueryData(queryKeys.session, session);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSettled: async () => {
      queryClient.setQueryData(queryKeys.session, null);
      await queryClient.cancelQueries({ queryKey: queryKeys.users.all });
      queryClient.removeQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export type { AuthMode };
