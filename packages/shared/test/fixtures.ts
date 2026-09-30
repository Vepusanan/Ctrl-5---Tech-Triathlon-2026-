export const ids = {
  user: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a70',
  order: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a71',
  trip: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a72',
  stop: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a73',
  run: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a74',
  event: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a75',
  pod: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a76',
  other: '0192f5e8-7b3a-7c3e-9a1b-2c3d4e5f6a77',
} as const;

export const colomboTime = '2026-06-01T05:21:00+05:30';

export const outletRow = {
  id: 'OUT001',
  brand: 'Fresh',
  district: 'Colombo',
  depotId: 'Peliyagoda',
  dockType: 'street',
  parkingConstraint: 'van_only',
  window: { open: '05:00', close: '07:30' },
  mallWindow: null,
};

export const vehicleRow = {
  id: 'VEH001',
  type: 'truck',
  temp: 'reefer',
  weightCapKg: 5510,
  volumeCapM3: 26.4,
  fuelType: 'diesel',
  kmPerL: 4.7,
  weeklyFuelQuotaL: 340,
  depotId: 'Peliyagoda',
};

export const orderRow = {
  id: ids.order,
  outletId: 'OUT001',
  brand: 'Fresh',
  temp: 'chilled',
  requestedDate: '2026-06-02',
  units: 80,
  weightKg: 448.6,
  volumeM3: 2.445,
  status: 'confirmed',
  submittedAt: '2026-06-01T10:15:00+05:30',
  lockedAt: '2026-06-01T16:00:00+05:30',
  version: 2,
};
