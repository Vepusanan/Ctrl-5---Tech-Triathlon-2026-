import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card } from '../../components/waypoint';
import { message } from '../../lib/api';
import { SystemStatus } from '../health/system-status';
import { useAuth } from './auth';
export function SignIn() {
  const { login: signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: () => signIn(email, password),
  });
  return (
    <main className="store-signin">
      <a className="wp-brand" href="/">
        <span>W</span>Waypoint
      </a>
      <Card>
        <h1>Sign in to Waypoint</h1>
        <p className="wp-muted">Sign in with your Waypoint account to open your workspace.</p>
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
      <SystemStatus />
    </main>
  );
}
