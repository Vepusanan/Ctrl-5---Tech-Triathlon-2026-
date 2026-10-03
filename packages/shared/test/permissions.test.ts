import { describe, expect, it } from 'vitest';
import { can, getHomeRoute, type User } from '../src/index.ts';

const base = {
  id: '00000000-0000-7000-8000-000000000001',
  name: 'Test',
  email: 'test@example.com',
};
const users: User[] = [
  { ...base, role: 'dispatcher', depotId: 'Peliyagoda' },
  { ...base, role: 'loader', depotId: 'Peliyagoda' },
  { ...base, role: 'driver', vehicleId: 'VEH001' },
  { ...base, role: 'store_manager', outletId: 'OUT001' },
];
describe('role access contracts', () => {
  it('maps every account role to a distinct operational home', () => {
    expect(users.map((user) => getHomeRoute(user.role))).toEqual([
      '/dispatcher',
      '/loader',
      '/driver',
      '/store',
    ]);
  });
  it('keeps operational permissions separate and denies anonymous access', () => {
    for (const user of users) {
      expect(can(user, 'planning:publish')).toBe(user.role === 'dispatcher');
      expect(can(user, 'loading:update')).toBe(user.role === 'loader');
      expect(can(user, 'delivery:update')).toBe(user.role === 'driver');
      expect(can(user, 'pod:create')).toBe(user.role === 'driver');
      expect(can(user, 'orders:create')).toBe(user.role === 'store_manager');
      expect(can(user, 'receipt:confirm')).toBe(user.role === 'store_manager');
    }
    expect(can(null, 'planning:publish')).toBe(false);
  });
});
