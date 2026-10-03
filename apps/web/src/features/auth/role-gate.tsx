import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CurrentUserResponse,
  currentUserResponseSchema,
  type Role,
  type User,
} from '@waypoint/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Button, ErrorState, LoadingState } from '../../components/waypoint';
import { api, HttpError, message, noContent } from '../../lib/api';
import { replaceSession } from '../../lib/session';
import '../store/store.css';

/**
 * Where a workspace that must open offline keeps the last confirmed session (the driver,
 * SYSTEM_DESIGN §10.3). It is only read when the server cannot be reached; a 401 clears it.
 */
export interface OfflineSession {
  read: () => Promise<CurrentUserResponse | undefined>;
  save: (session: CurrentUserResponse) => Promise<void>;
  clear: () => Promise<void>;
}

// Session check, sign-in and role check for a workspace route. It uses the same session
// query and endpoints as the Store and Dispatcher workspaces. The server still enforces
// every role and scope; this only decides which screen to show.
export function RoleGate<R extends Role>({
  requiredRole,
  title,
  description,
  offlineSession,
  children,
}: {
  requiredRole: R;
  title: string;
  description: string;
  offlineSession?: OfflineSession;
  children: (user: Extract<User, { role: R }>) => ReactNode;
}) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try {
        const me = await api('/auth/me', currentUserResponseSchema);
        await offlineSession?.save(me);
        return me;
      } catch (cause) {
        if (offlineSession && cause instanceof HttpError) {
          if (cause.status === 401) await offlineSession.clear();
          if (cause.status === 0) {
            const cached = await offlineSession.read();
            if (cached) return cached;
          }
        }
        throw cause;
      }
    },
    retry: false,
    // An offline-capable workspace still runs the check without a network, to reach the cache.
    networkMode: offlineSession ? 'always' : 'online',
  });
  useEffect(() => {
    const expired = () => {
      client.setQueryData(['session'], null);
      void offlineSession?.clear();
    };
    window.addEventListener('waypoint:unauthenticated', expired);
    return () => window.removeEventListener('waypoint:unauthenticated', expired);
  }, [client, offlineSession]);
  if (session.isPending) {
    return (
      <main className="store-signin">
        <LoadingState label="Checking your session…" />
      </main>
    );
  }
  if (session.error && !(session.error instanceof HttpError && session.error.status === 401)) {
    return (
      <main className="store-signin">
        <ErrorState description={message(session.error)} onRetry={() => void session.refetch()} />
      </main>
    );
  }
  if (!session.data) return <SignIn title={title} description={description} />;
  const user = session.data.user;
  if (!isRole(user, requiredRole)) {
    return (
      <main className="store-signin">
        <ErrorState
          title={`${title} access required`}
          description="This workspace is not available to your role."
        />
        <SignOut />
      </main>
    );
  }
  return children(user);
}

function isRole<R extends Role>(user: User, role: R): user is Extract<User, { role: R }> {
  return user.role === role;
}

function SignIn({ title, description }: { title: string; description: string }) {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="store-signin">
      <a className="wp-brand" href="/">
        <span>W</span>Waypoint
      </a>
      <form
        className="wp-card store-form"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          try {
            const data = await api('/auth/login', currentUserResponseSchema, {
              method: 'POST',
              body: JSON.stringify({ email, password }),
            });
            replaceSession(client, data);
          } catch (cause) {
            setError(message(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>{title} sign in</h1>
        <p className="wp-muted">{description}</p>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <Button type="submit" busy={busy}>
          Sign in
        </Button>
      </form>
    </main>
  );
}

export function SignOut({
  disabled = false,
  offlineSession,
}: {
  disabled?: boolean;
  /** Forgotten before the server session ends, so an offline reload cannot reopen the app. */
  offlineSession?: OfflineSession;
} = {}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        variant="tertiary"
        busy={busy}
        disabled={disabled}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await offlineSession?.clear();
            await api('/auth/logout', noContent, { method: 'POST' });
            replaceSession(client, null);
          } catch (cause) {
            setError(message(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        Sign out
      </Button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
