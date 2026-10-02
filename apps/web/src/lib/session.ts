import type { QueryClient } from '@tanstack/react-query';
import type { CurrentUserResponse } from '@waypoint/shared';

// Signs a user in or out on the client. The session is written before the other cached
// queries are dropped: clearing the whole cache first detaches the mounted session query,
// so the screen would not change until a reload.
export function replaceSession(client: QueryClient, session: CurrentUserResponse | null): void {
  client.setQueryData(['session'], session);
  client.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
}
