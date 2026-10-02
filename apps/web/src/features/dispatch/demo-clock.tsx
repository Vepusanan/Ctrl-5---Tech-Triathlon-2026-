import { useMutation, useQueryClient } from '@tanstack/react-query';
import { operatingClockSchema } from '@waypoint/shared';
import { Button } from '../../components/waypoint';
import { api, message } from '../../lib/api';
import { clockLabel } from '../store/shared';

// DEMO_MODE only (GET/PUT /admin/clock). Jumps the operating clock to the walkthrough's
// moments around the selected run: before and after the 4 PM cutoff that closes it, and the
// service-day morning when Fresh trips leave (03:30, SYSTEM_DESIGN §7.3).
export function DemoClock({
  now,
  date,
  dates,
  onMoved,
}: {
  now: string;
  date: string;
  dates: readonly string[];
  onMoved: () => void;
}) {
  const client = useQueryClient();
  const cutoffDay = dates.filter((day) => day < date).at(-1);
  const presets = [
    ...(cutoffDay
      ? [
          { label: 'Before cutoff', at: `${cutoffDay}T15:50:00.000+05:30` },
          { label: 'After cutoff', at: `${cutoffDay}T16:01:00.000+05:30` },
        ]
      : []),
    { label: 'Service morning', at: `${date}T03:30:00.000+05:30` },
  ];
  const move = useMutation({
    mutationFn: (at: string) =>
      api('/admin/clock', operatingClockSchema, {
        method: 'PUT',
        body: JSON.stringify({ now: at }),
      }),
    onSuccess: async () => {
      onMoved();
      // Every screen reads the operating clock, so refetch everything.
      await client.invalidateQueries();
    },
  });
  return (
    <section className="dispatch-demo-clock" aria-label="Demo clock">
      <strong>Demo clock</strong>
      <p className="wp-muted">Demo mode only. {clockLabel(Date.parse(now))}</p>
      {presets.map((preset) => (
        <Button
          key={preset.label}
          variant="secondary"
          busy={move.isPending && move.variables === preset.at}
          disabled={move.isPending || preset.at === now}
          onClick={() => move.mutate(preset.at)}
        >
          {preset.label}
        </Button>
      ))}
      {move.error && <p role="alert">{message(move.error)}</p>}
    </section>
  );
}
