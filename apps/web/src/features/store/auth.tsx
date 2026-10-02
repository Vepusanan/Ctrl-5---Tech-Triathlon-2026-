import { useMutation, useQueryClient } from '@tanstack/react-query';
import { currentUserResponseSchema } from '@waypoint/shared';
import { useState } from 'react';
import { Button, Card } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { replaceSession } from '../../lib/session';
export function StoreSignIn() {
  const client = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () =>
      api('/auth/login', currentUserResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      }),
    onSuccess: (data) => {
      replaceSession(client, data);
    },
  });
  return (
    <main className="store-signin">
      <a className="wp-brand" href="/">
        <span>W</span>Waypoint
      </a>
      <Card>
        <h1>Sign in to your store</h1>
        <p className="wp-muted">Place orders, track deliveries and confirm receipt.</p>
        <form
          className="store-form"
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {login.error && (
            <p role="alert" className="store-error">
              {message(login.error)}
            </p>
          )}
          <Button type="submit" busy={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </Card>
    </main>
  );
}
