import { expect, test } from '@playwright/test';
import type { DeliveryStop, StopEventInput } from '../../packages/shared/src/index.ts';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const driver = {
  id: uid(1),
  name: 'First Driver',
  email: 'first@example.com',
  role: 'driver',
  vehicleId: 'VEH001',
};
const other = {
  ...driver,
  id: uid(2),
  name: 'Second Driver',
  email: 'second@example.com',
  vehicleId: 'VEH002',
};

test('driver records offline, preserves outbox through account switching, uploads POD and syncs once', async ({
  page,
  context,
}) => {
  let user: typeof driver | null = driver;
  let allowSync = false;
  const applied: string[] = [];
  const calls: string[] = [];
  let stop: DeliveryStop = {
    id: uid(5),
    tripId: uid(4),
    tripStatus: 'departed',
    tripVersion: 1,
    seq: 1,
    plannedArrival: '2026-10-03T07:00:00+05:30',
    eta: '2026-10-03T07:00:00+05:30',
    status: 'pending',
    late: false,
    windowClose: '08:00',
    failureReason: null,
    pod: null,
    order: {
      id: uid(6),
      outletId: 'OUT001',
      brand: 'Fresh',
      temp: 'chilled',
      requestedDate: '2026-10-03',
      units: 4,
      weightKg: 20,
      volumeM3: 1,
      status: 'dispatched',
    },
  };
  const trip = () => ({
    id: uid(4),
    runId: uid(3),
    vehicleId: 'VEH001',
    tripNo: 1,
    brand: 'Fresh',
    district: 'Colombo',
    status: 'departed',
    version: 1,
    plannedMinutes: 60,
    plannedKm: 20,
    run: {
      id: uid(3),
      depotId: 'Peliyagoda',
      serviceDate: '2026-10-03',
      status: 'published',
      planVersion: 1,
    },
    vehicle: { id: 'VEH001', type: 'van', temp: 'reefer', depotId: 'Peliyagoda' },
    stops: [
      {
        id: stop.id,
        tripId: stop.tripId,
        orderId: stop.order.id,
        seq: 1,
        plannedArrival: stop.plannedArrival,
        status: stop.status,
        order: stop.order,
      },
    ],
    loadingStatus: 'departed',
    exceptions: [],
    lastEvent: null,
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');
    if (path === '/auth/me')
      await route.fulfill(
        user
          ? { json: { user } }
          : {
              status: 401,
              json: { error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } },
            },
      );
    else if (path === '/auth/login') {
      user = route.request().postDataJSON().email === driver.email ? driver : other;
      await route.fulfill({ json: { user } });
    } else if (path === '/auth/logout') {
      user = null;
      await route.fulfill({ status: 204 });
    } else if (path === '/trips')
      await route.fulfill({
        json: {
          items: user?.id === driver.id ? [trip()] : [],
          total: user?.id === driver.id ? 1 : 0,
        },
      });
    else if (path === `/stops/${stop.id}`) await route.fulfill({ json: stop });
    else if (path.startsWith('/sync/trips/'))
      await route.fulfill({ json: { changed: false, tripId: stop.tripId, version: 1 } });
    else if (path === `/stops/${stop.id}/pod`) {
      expect(user?.id).toBe(driver.id);
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      calls.push('pod');
      stop = {
        ...stop,
        pod: {
          id: uid(8),
          stopId: stop.id,
          recipientName: 'Recipient',
          hasPhoto: false,
          clientTime: '2026-10-03T07:00:00+05:30',
        },
      };
      await route.fulfill({ status: 201, json: stop.pod });
    } else if (path === '/sync/events') {
      if (!allowSync) {
        await route.abort();
        return;
      }
      expect(user?.id).toBe(driver.id);
      const events: StopEventInput[] = route.request().postDataJSON().events;
      for (const event of events) {
        expect(applied).not.toContain(event.clientEventId);
        applied.push(event.clientEventId);
        calls.push(event.type);
        if (event.type === 'delivered') expect(event.payload.podId).toBe(stop.pod?.id);
        stop = { ...stop, status: event.type };
      }
      await route.fulfill({
        json: {
          results: events.map((event) => ({
            clientEventId: event.clientEventId,
            status: 'applied',
          })),
        },
      });
    } else await route.fulfill({ json: { items: [], total: 0 } });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/driver');
  await page.getByRole('link', { name: 'Open trip' }).click();
  await page.getByRole('link', { name: 'Open stop' }).click();
  await expect(page.getByRole('button', { name: 'Arrived', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Arrived', exact: true }).click();
  await expect(page.getByText('1 pending sync', { exact: false })).toBeVisible();
  await page.getByLabel('Recipient name').fill('Recipient');
  const canvas = page.getByLabel('Recipient signature');
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Signature canvas not visible');
  await page.mouse.move(box.x + 10, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 50, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Delivered', exact: true }).click();
  await expect(page.getByText('2 pending sync', { exact: false })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  const login = async (email: string) => {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill('test-password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/driver$/);
  };
  await login(other.email);
  await page.getByRole('link', { name: 'Sync (0)' }).click();
  await expect(page.getByText('Pending sync', { exact: true })).toHaveCount(0);
  expect(applied).toHaveLength(0);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await login(driver.email);
  await expect(page.getByRole('link', { name: 'Sync (2)' })).toBeVisible();
  allowSync = true;
  await page.getByRole('link', { name: 'Sync (2)' }).click();
  await page.getByRole('button', { name: 'Sync now' }).click();
  await expect(page.getByRole('link', { name: 'Sync (0)' })).toBeVisible();
  expect(calls).toEqual(['arrived', 'pod', 'delivered']);
  await page.getByRole('button', { name: 'Sync now' }).click();
  expect(applied).toHaveLength(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
