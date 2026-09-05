/** Authentication hook: provides current user state and login/logout methods. */
import { trpc } from "@/lib/trpc";

export function useAuth() {
  // retry:false — unauthenticated (null session) is the normal public case,
  // not a transient error worth hammering the server for.
  const meQuery = trpc.auth.me.useQuery(undefined, { retry: false, staleTime: 30_000 });
  const utils = trpc.useUtils();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      // Drop cached identity first so the UI cannot flash the old user,
      // then reload to settle on the anonymous state (both cookies cleared
      // server-side, sessionVersion revoked).
      await utils.auth.me.invalidate().catch(() => undefined);
      window.location.reload();
    },
  });

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    logout: () => logoutMutation.mutate(),
    isLoggingOut: logoutMutation.isPending,
  };
}
