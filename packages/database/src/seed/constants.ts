// Fixed inputs so a reset rebuilds the same day (SYSTEM_DESIGN §1.2, §12.3).
export const RNG_SEED = 20260626;
export const SEED_VERSION = '1';
export const SEED_META_ID = 'waypoint';
export const HOME_DEPOT_ID = 'Peliyagoda';
export const DEMO_SERVICE_DATE = '2026-06-26';
export const DEFAULT_SEED_PASSWORD = 'waypoint-demo';

export const DEMO_USERS = {
  dispatcher: {
    key: 'user:dispatcher',
    role: 'dispatcher',
    name: 'Peliyagoda Dispatcher',
    email: 'dispatcher@waypoint.test',
  },
  loader: {
    key: 'user:loader',
    role: 'loader',
    name: 'Peliyagoda Loader',
    email: 'loader@waypoint.test',
  },
  driver: {
    key: 'user:driver',
    role: 'driver',
    name: 'Peliyagoda Van Driver',
    email: 'driver@waypoint.test',
  },
  storeManager: {
    key: 'user:store-manager',
    role: 'store_manager',
    name: 'Fresh Store Manager',
    email: 'store.manager@waypoint.test',
  },
} as const;
