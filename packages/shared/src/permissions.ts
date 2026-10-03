import type { User } from './entities/user.ts';
import type { Role } from './enums.ts';

const homeRoutes = {
  dispatcher: '/dispatcher',
  loader: '/loader',
  driver: '/driver',
  store_manager: '/store',
} as const satisfies Record<Role, string>;

export function getHomeRoute(role: Role): string {
  return homeRoutes[role];
}

const permissionRoles = {
  'orders:create': ['store_manager'],
  'orders:editOwn': ['store_manager'],
  'planning:view': ['dispatcher'],
  'planning:allocate': ['dispatcher'],
  'planning:publish': ['dispatcher'],
  'loading:update': ['loader'],
  'loading:acknowledge': ['dispatcher'],
  'loading:acceptPlan': ['loader'],
  'delivery:update': ['driver'],
  'pod:create': ['driver'],
  'receipt:confirm': ['store_manager'],
  'issue:create': ['store_manager'],
  'dashboard:view': ['dispatcher'],
} as const satisfies Record<string, readonly Role[]>;

export function can(user: User | null, permission: keyof typeof permissionRoles): boolean {
  const roles: readonly Role[] = permissionRoles[permission];
  return user !== null && roles.includes(user.role);
}
