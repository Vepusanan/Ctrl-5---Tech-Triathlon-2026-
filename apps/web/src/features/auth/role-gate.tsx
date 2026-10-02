import { useQuery, useQueryClient } from '@tanstack/react-query';
import { currentUserResponseSchema, type Role, type User } from '@waypoint/shared';
import { type ReactNode, useEffect, useState } from 'react';
import { Button, ErrorState, LoadingState } from '../../components/waypoint';
import { api, HttpError, message, noContent } from '../../lib/api';
import { replaceSession } from '../../lib/session';
import '../store/store.css';

// Session check, sign-in and role check for a workspace route. It uses the same session
// query and endpoints as the Store and Dispatcher workspaces. The server still enforces
// every role and scope; this only decides which screen to show.
export function RoleGate<R extends Role>({
  requiredRole,
  title,
  description,
  children,
}: {
  requiredRole: R;
  title: string;
  description: string;
  children: (user: Extract<User, { role: R }>) => ReactNode;
}) {
  const client = useQueryClient();
  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api('/auth/me', currentUserResponseSchema),
    retry: false,
  });
  useEffect(() => {
    const expired = () => client.setQueryData(['session'], null);
    window.addEventListener('waypoint:unauthenticated', expired);
    return () => window.removeEventListener('waypoint:unauthenticated', expired);
  }, [client]);
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

export function SignOut() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <>
      <Button
        variant="tertiary"
        busy={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
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
