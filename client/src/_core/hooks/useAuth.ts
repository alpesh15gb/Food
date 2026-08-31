/** Authentication hook: provides current user state and login/logout methods. */
import { trpc } from "@/lib/trpc";

export function useAuth() {
  const meQuery = trpc.auth.me.useQuery();
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  return {
    user: meQuery.data ?? null,
    loading: meQuery.isLoading,
    logout: () => logoutMutation.mutate(),
  };
}
