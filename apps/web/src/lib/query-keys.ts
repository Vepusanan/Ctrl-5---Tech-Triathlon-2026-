export const queryKeys = {
  health: ['health'] as const,
  driver: {
    all: (userId: string) => ['driver', userId] as const,
    // Outside ['driver', userId] so refreshing the driver's data does not re-read the clock.
    clock: (userId: string) => ['driver-clock', userId] as const,
    trips: (userId: string) => ['driver', userId, 'trips'] as const,
    trip: (userId: string, tripId: string) => ['driver', userId, 'trip', tripId] as const,
    stop: (userId: string, stopId: string) => ['driver', userId, 'stop', stopId] as const,
    route: (userId: string, tripId: string) => ['driver', userId, 'route', tripId] as const,
    outlets: (userId: string) => ['driver', userId, 'outlets'] as const,
    notifications: (userId: string) => ['driver', userId, 'notifications'] as const,
  },
};
