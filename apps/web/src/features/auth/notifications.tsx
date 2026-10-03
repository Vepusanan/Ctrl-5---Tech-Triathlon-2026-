import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type NotificationFeedItem,
  notificationFeedItemSchema,
  notificationListResponseSchema,
  type User,
} from '@waypoint/shared';
import { Button, Card, ErrorState, LoadingLabel, SkeletonCard } from '../../components/waypoint';
import { api, message } from '../../lib/api';

export function Notifications({ user }: { user: User }) {
  const client = useQueryClient();
  const key = ['notifications', user.id];
  const feed = useQuery({
    queryKey: key,
    queryFn: () => api('/notifications', notificationListResponseSchema),
    refetchInterval: 30_000,
  });
  const read = useMutation({
    mutationFn: (item: NotificationFeedItem) =>
      api(
        `/notifications/${item.id}/${item.actionRequired ? 'acknowledge' : 'read'}`,
        notificationFeedItemSchema,
        { method: 'POST' },
      ),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: key });
    },
  });
  if (feed.isPending)
    return (
      <section>
        <h1>Notifications</h1>
        <LoadingLabel label="Loading notifications…" />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </section>
    );
  if (!feed.data)
    return <ErrorState description={message(feed.error)} onRetry={() => void feed.refetch()} />;
  return (
    <section>
      <h1>Notifications</h1>
      {read.error && <p role="alert">{message(read.error)}</p>}
      {!feed.data.items.length && <p>No notifications yet.</p>}
      {feed.data.items.map((item) => (
        <Card key={item.id}>
          <h2>{item.type.replaceAll('_', ' ')}</h2>
          <p>{new Date(item.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Colombo' })}</p>
          {(!item.readAt || item.actionRequired) && (
            <Button
              busy={read.isPending && read.variables?.id === item.id}
              disabled={read.isPending}
              onClick={() => read.mutate(item)}
            >
              {item.actionRequired ? 'Acknowledge' : 'Mark read'}
            </Button>
          )}
        </Card>
      ))}
    </section>
  );
}
