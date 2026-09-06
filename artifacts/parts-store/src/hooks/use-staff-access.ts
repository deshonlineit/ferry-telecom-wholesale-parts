import { useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAccountAccessQueryKey,
  useGetAccountAccess,
} from '@workspace/api-client-react';

const STAFF_ACCESS_STALE_TIME = 30_000;

function isAdminQuery(queryKey: readonly unknown[]): boolean {
  return typeof queryKey[0] === 'string' && queryKey[0].startsWith('/api/admin');
}

/**
 * Reads staff access from the server. The cache is scoped to both the Clerk
 * identity and session so access from one account can never be reused by
 * another account.
 */
export function useStaffAccess({
  refetchOnMount = 'always',
}: {
  refetchOnMount?: 'always' | boolean;
} = {}) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  const queryClient = useQueryClient();
  const canCheckAccess = isLoaded && isSignedIn === true;

  const accessQuery = useGetAccountAccess({
    query: {
      queryKey: [
        ...getGetAccountAccessQueryKey(),
        userId ?? null,
        sessionId ?? null,
      ],
      enabled: canCheckAccess,
      staleTime: STAFF_ACCESS_STALE_TIME,
      refetchOnMount,
      refetchOnWindowFocus: 'always',
      retry: false,
      placeholderData: undefined,
    },
  });

  const accessDenied =
    isLoaded &&
    (isSignedIn !== true ||
      accessQuery.isError ||
      accessQuery.data?.isStaff === false);

  useEffect(() => {
    if (!accessDenied) return;

    // A revoked or failed access check must also discard any previously
    // fetched administration data, not merely hide the administration shell.
    queryClient.removeQueries({
      predicate: (query) => isAdminQuery(query.queryKey),
    });
  }, [accessDenied, queryClient]);

  const isChecking =
    !isLoaded ||
    (canCheckAccess && (accessQuery.isPending || accessQuery.isFetching));

  return {
    isLoaded,
    isSignedIn: isSignedIn === true,
    isStaff:
      canCheckAccess &&
      !accessQuery.isError &&
      !accessQuery.isFetching &&
      accessQuery.data?.isStaff === true,
    isChecking,
    isError: canCheckAccess && accessQuery.isError,
    refetch: accessQuery.refetch,
  };
}