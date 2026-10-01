import fp from 'fastify-plugin';

// SYSTEM_DESIGN §1.2 / §12.2. Cutoff and other operational decisions read this clock.
// Production follows the host clock until the demo admin endpoint pins a time.
// Callers must not read Date.now() themselves.
export interface OperatingClock {
  now(): Date;
  pin(now: Date): void;
  unpin(): void;
}

function createOperatingClock(): OperatingClock {
  let pinned: Date | null = null;
  return {
    now() {
      return pinned === null ? new Date() : new Date(pinned.getTime());
    },
    pin(now) {
      pinned = new Date(now.getTime());
    },
    unpin() {
      pinned = null;
    },
  };
}

export const clockPlugin = fp(
  async (app) => {
    app.decorate('clock', createOperatingClock());
  },
  { name: 'clock' },
);
