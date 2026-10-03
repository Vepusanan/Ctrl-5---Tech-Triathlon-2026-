import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { currentUserResponseSchema, type User } from '@waypoint/shared';
import { createContext, type ReactNode, useContext, useEffect, useRef } from 'react';
import { Button, ErrorState, LoadingState } from '../../components/waypoint';
import { api, HttpError, message, noContent, resetApiRequests } from '../../lib/api';

const authKey = ['auth', 'me'] as const;
const AuthContext = createContext<{
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error('AuthProvider required');
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const identity = useRef<string | null>(null);
  const session = useQuery({
    queryKey: authKey,
    queryFn: async () => {
      try {
        const user = (await api('/auth/me', currentUserResponseSchema)).user;
        const next = JSON.stringify(user);
        if (identity.current !== next) {
          client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
          identity.current = next;
        }
        return user;
      } catch (error) {
        if (error instanceof HttpError && error.status === 401) {
          client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
          identity.current = null;
          return null;
        }
        // Existing verified sessions may keep recording locally during a network outage.
        if (error instanceof HttpError && error.status === 0 && !navigator.onLine) {
          const cached = client.getQueryData<User | null>(authKey);
          if (cached) return cached;
        }
        throw error;
      }
    },
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
  });
  useEffect(() => {
    const expired = async () => {
      await client.cancelQueries();
      resetApiRequests();
      client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
      client.getMutationCache().clear();
      client.setQueryData(authKey, null);
    };
    window.addEventListener('waypoint:unauthenticated', expired);
    return () => window.removeEventListener('waypoint:unauthenticated', expired);
  }, [client]);
  const user = session.data ?? null;
  const signature = user ? JSON.stringify(user) : null;
  if (session.isPending)
    return (
      <main className="store-signin">
        <LoadingState label="Checking your session…" />
      </main>
    );
  if (session.error)
    return (
      <main className="store-signin">
        <ErrorState description={message(session.error)} onRetry={() => void session.refetch()} />
      </main>
    );
  return (
    <AuthContext.Provider
      value={{
        user,
        login: async (email, password) => {
          await api('/auth/login', currentUserResponseSchema, {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          // Confirm that the browser accepted the session cookie before entering a workspace.
          const result = await api('/auth/me', currentUserResponseSchema);
          await client.cancelQueries();
          resetApiRequests();
          client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
          client.getMutationCache().clear();
          identity.current = JSON.stringify(result.user);
          client.setQueryData(authKey, result.user);
        },
        logout: async () => {
          try {
            await api('/auth/logout', noContent, { method: 'POST' });
          } catch (error) {
            if (!(error instanceof HttpError && error.status === 401)) throw error;
          }
          await client.cancelQueries();
          resetApiRequests();
          client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' });
          client.getMutationCache().clear();
          client.setQueryData(authKey, null);
          // IndexedDB belongs to its account; never delete unsynced driver records here.
        },
      }}
    >
      <div key={signature}>{children}</div>
    </AuthContext.Provider>
  );
}

export function SignOut() {
  const auth = useAuth();
  const logout = useMutation({ mutationFn: auth.logout });
  return (
    <>
      <Button variant="secondary" busy={logout.isPending} onClick={() => logout.mutate()}>
        Sign out
      </Button>
      {logout.error && <p role="alert">{message(logout.error)}</p>}
    </>
  );
}
