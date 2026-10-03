import { expect, test } from '@playwright/test';

const date = '2026-10-05';
const user = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Nirosha Fernando',
  email: 'dispatcher@example.com',
  role: 'dispatcher',
  depotId: 'Peliyagoda',
};
const orders = ['Colombo', 'Colombo', 'Kandy', 'Gampaha'].map((district, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 10).padStart(12, '0')}`,
  outletId: `OUT00${index + 1}`,
  brand: 'Fresh',
  temp: 'chilled',
  requestedDate: date,
  units: 12,
  weightKg: 120,
  volumeM3: 1.2,
  status: 'confirmed',
  submittedAt: null,
  lockedAt: null,
  version: 1,
  deferredYesterday: false,
  daysSinceLastServed: 1,
  previousDeferral: null,
  outlet: {
    id: `OUT00${index + 1}`,
    district,
    depotId: 'Peliyagoda',
    parkingConstraint: 'normal',
    window: { open: '06:00', close: '08:00' },
    mallWindow: null,
  },
}));

test('sign-in and dispatcher layouts fit desktop, tablet and phone; login and queue remain connected', async ({
  page,
}, testInfo) => {
  let signedIn = false;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let json: unknown = { items: [], total: 0 };
    if (path === '/api/health') json = { status: 'ok', database: 'up' };
    else if (path.endsWith('/auth/me')) {
      if (!signedIn)
        return route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } },
        });
      json = { user };
    } else if (path.endsWith('/auth/login')) {
      expect(route.request().postDataJSON()).toEqual({
        email: user.email,
        password: 'test-password',
      });
      signedIn = true;
      json = { user };
    } else if (path.endsWith('/calendar'))
      json = {
        items: [
          {
            date,
            dow: 1,
            isoYear: 2026,
            isoWeek: 41,
            isPayday: false,
            festival: null,
            festivalRamp: 0,
            isHoliday: false,
            monsoon: false,
            isOperating: true,
          },
        ],
        total: 1,
      };
    else if (path.endsWith('/admin/clock'))
      return route.fulfill({
        status: 404,
        json: { error: { code: 'NOT_FOUND', message: 'Unavailable' } },
      });
    else if (path.endsWith('/queue'))
      json = { items: orders, total: orders.length, depotId: 'Peliyagoda', planVersion: 1 };
    else if (path.endsWith('/dashboard/summary'))
      json = {
        date,
        orders: {
          confirmed: 4,
          allocated: 8,
          deferred: 1,
          loading: 0,
          dispatched: 0,
          delivered: 0,
          failed: 0,
          receiptConfirmed: 0,
        },
        repeatDeferrals: 1,
        loading: { notStarted: 2, inProgress: 1, exception: 0, ready: 0, departed: 0 },
        activeTrips: 3,
        stops: { pending: 8, arrived: 0, delivered: 12, failed: 0 },
        pendingLoadingIssues: 0,
        pendingSyncConflicts: 0,
        fleet: { available: 10, unavailable: 1 },
        utilization: { weight: 0.7, volume: 0.8, reefer: 0.88, van: 0.6 },
        fuelUsedL: 14,
        tightWindowStops: 0,
        drivers: [],
      };
    else if (path.endsWith('/dashboard/exceptions')) json = { date, items: [], total: 0 };
    else if (path.endsWith('/dashboard/stream'))
      return route.fulfill({
        contentType: 'text/event-stream',
        body: 'event: ready\ndata: {"type":"ready","pollIntervalMs":15000}\n\n',
      });
    await route.fulfill({ json });
  });
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(
      await page
        .locator('img:visible')
        .evaluateAll((nodes: HTMLImageElement[]) =>
          nodes
            .filter(
              (i) =>
                !i.complete ||
                !i.naturalWidth ||
                i.width !== i.naturalWidth ||
                i.height !== i.naturalHeight,
            )
            .map((i) => i.src),
        ),
    ).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  };
  await page.route('**/api/health', (route) =>
    route.fulfill({ json: { status: 'ok', database: 'up' } }),
  );
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1024 });
    await capture(`login-${width}`);
  }
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password').fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Operations command center' })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'Orders awaiting planning by district' }),
  ).toContainText('Colombo');
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1024 });
    await capture(`dashboard-${width}`);
  }
  await page.getByRole('link', { name: 'Open planning queue' }).click();
  await expect(page.getByRole('heading', { name: 'Planning queue', exact: true })).toBeVisible();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1024 });
    await capture(`queue-${width}`);
  }
  await page.getByRole('combobox', { name: /^District/ }).selectOption('Kandy');
  await expect(page.getByRole('table').getByText('OUT003')).toBeVisible();
  await expect(page.getByRole('table').getByText('OUT001')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('store home and order entry fit desktop, tablet and phone without changing entered quantities', async ({
  page,
}, testInfo) => {
  const manager = { ...user, role: 'store_manager', outletId: 'OUT001' };
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith('/auth/me')
      ? { user: manager }
      : path.endsWith('/store/workspace')
        ? {
            serverNow: '2026-10-04T11:40:00+05:30',
            outlet: { ...orders[0]?.outlet, brand: 'Fresh', dockType: 'rear_dock' },
            cutoffAt: '2026-10-04T16:00:00+05:30',
            nextServiceDate: date,
            eligibleServiceDate: date,
            serviceDates: [{ date, cutoffAt: '2026-10-04T16:00:00+05:30' }],
            orders: [],
            issues: [],
          }
        : { items: [], total: 0 };
    await route.fulfill({ json });
  });
  const capture = async (name: string) => {
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  };
  await page.goto('/store');
  await expect(page.getByRole('heading', { name: /Good morning/ })).toBeVisible();
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1024 });
    await capture(`store-${width}`);
  }
  await page.goto('/store/orders/new');
  await page.getByLabel('Chilled units', { exact: true }).fill('12');
  for (const width of [1440, 1024, 390, 320]) {
    await page.setViewportSize({ width, height: 1024 });
    await capture(`order-${width}`);
    await expect(page.getByLabel('Chilled units', { exact: true })).toHaveValue('12');
  }
  expect(errors).toEqual([]);
});
