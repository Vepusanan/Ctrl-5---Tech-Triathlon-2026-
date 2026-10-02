import { expect, test } from '@playwright/test';
import type { LoadingState, LoadingStop } from '../../packages/shared/src/api/loading.ts';

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stop = (n: number): LoadingStop => ({
  id: uid(n + 10),
  seq: n,
  plannedArrival: `2026-10-08T0${n + 6}:00:00+05:30`,
  chilled: n === 1,
  access: n === 1 ? 'van_only' : 'normal',
  order: {
    id: uid(n + 20),
    outletId: `OUT00${n}`,
    brand: 'Fresh',
    temp: n === 1 ? 'chilled' : 'ambient',
    requestedDate: '2026-10-08',
    units: 4,
    weightKg: 20,
    volumeM3: 1,
    status: 'loading',
  },
});

test('tablet loading journey, stale plan gate and Dispatcher acknowledgement', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const capture = async (screen: string) => {
    await page.evaluate(() => document.fonts.ready);
    const smallTargets = await page
      .locator('button:visible, a:visible, select:visible, input:visible, textarea:visible')
      .evaluateAll((nodes) =>
        nodes
          .filter((node) => {
            const target =
              node instanceof HTMLInputElement && node.type === 'checkbox'
                ? (node.closest('label') ?? node)
                : node;
            const rect = target.getBoundingClientRect();
            return rect.width < 48 || rect.height < 48;
          })
          .map((node) => node.textContent || node.getAttribute('aria-label')),
      );
    expect(smallTargets).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`${screen}.png`), fullPage: true });
    expect(
      await page
        .locator('img:visible')
        .evaluateAll((imgs: HTMLImageElement[]) =>
          imgs
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  };
  let state: LoadingState = {
    tripId: uid(1),
    status: 'not_started',
    loaderId: null,
    tripVersion: 1,
    planVersion: 1,
    acceptedTripVersion: null,
    acceptedPlan: null,
    planStale: false,
    verifiedAt: null,
    vehicle: { id: 'VEH001', type: 'van', temp: 'reefer', depotId: 'Kandy' },
    stops: [stop(1), stop(2)],
    issues: [],
  };
  const calls: string[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    let body: unknown;
    if (url.pathname.endsWith('/auth/me'))
      body = {
        user: {
          id: uid(2),
          role: 'loader',
          depotId: 'Kandy',
          name: 'Kasun P.',
          email: 'loader@example.com',
        },
      };
    else if (url.pathname.endsWith('/trips'))
      body = {
        total: 1,
        items: [
          {
            id: uid(1),
            runId: uid(3),
            vehicleId: 'VEH001',
            tripNo: 1,
            brand: 'Fresh',
            district: 'Kandy',
            status: 'published',
            version: 1,
            plannedMinutes: 80,
            plannedKm: 30,
            run: {
              id: uid(3),
              depotId: 'Kandy',
              serviceDate: '2026-10-08',
              status: 'published',
              planVersion: 1,
            },
            vehicle: state.vehicle,
            stops: state.stops.map((s) => ({
              ...s,
              tripId: uid(1),
              orderId: s.order.id,
              status: 'pending',
            })),
            loadingStatus: state.status,
            exceptions: state.issues,
            lastEvent: null,
          },
        ],
      };
    else if (url.pathname.includes('/loading')) {
      if (route.request().method() === 'POST') {
        const action = url.pathname.split('/').pop() ?? '';
        calls.push(action);
        expect(route.request().headers()['if-match']).toBe(String(state.tripVersion));
        if (action === 'start')
          state = {
            ...state,
            status: 'in_progress',
            loaderId: uid(2),
            acceptedTripVersion: 1,
            acceptedPlan: { tripVersion: 1, planVersion: 1, stops: structuredClone(state.stops) },
          };
        if (action === 'verify')
          state = {
            ...state,
            planStale: false,
            acceptedTripVersion: state.tripVersion,
            verifiedAt: '2026-10-08T05:00:00+05:30',
            acceptedPlan: {
              tripVersion: state.tripVersion,
              planVersion: state.planVersion,
              stops: structuredClone(state.stops),
            },
          };
        if (action === 'issues')
          state = {
            ...state,
            status: 'exception',
            issues: [
              {
                ...route.request().postDataJSON(),
                id: uid(40),
                tripId: uid(1),
                loaderId: uid(2),
                acknowledgedBy: null,
                acknowledgedAt: null,
                createdAt: '2026-10-08T05:00:00+05:30',
              },
            ],
          };
        if (action === 'ready') state = { ...state, status: 'ready' };
      }
      body = state;
    } else {
      await route.fulfill({ status: 404, json: { message: 'Not found' } });
      return;
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/loader');
  await expect(page.getByRole('heading', { name: 'Assigned loads' })).toBeVisible();
  await capture('L01');
  await page.getByRole('link', { name: 'View plan & start loading' }).click();
  await expect(page.locator('.loader-stop').first()).toContainText('OUT002');
  await page.getByRole('button', { name: 'Start loading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Verify loading', exact: true })).toBeVisible();
  await capture('L02');
  await page.getByRole('button', { name: 'Verify loading', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm verification' })).toBeDisabled();
  for (const outlet of ['OUT002', 'OUT001']) {
    await page.locator('.loader-stop').filter({ hasText: outlet }).click();
    await page.getByRole('spinbutton', { name: 'Loaded quantity' }).fill('4');
  }
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.setViewportSize({ width: 768, height: 1024 });
  await capture('L03-portrait');
  await page.setViewportSize({ width: 1180, height: 820 });
  await capture('L03');
  await page.getByRole('button', { name: 'Confirm verification' }).click();
  await expect(page.getByRole('button', { name: 'Mark load Ready' })).toBeEnabled();
  await page.getByRole('button', { name: 'Report exception', exact: true }).click();
  await page.getByLabel('Notes').fill('Two cartons damaged on dock.');
  await page.getByRole('button', { name: 'Damaged', exact: true }).click();
  await page.getByLabel('Affected quantity').fill('2');
  await capture('L04');
  await page.getByRole('button', { name: 'Send to Dispatcher' }).click();
  await expect(page.getByText('Awaiting Dispatcher', { exact: true })).toBeVisible();
  state = {
    ...state,
    tripVersion: 2,
    planVersion: 2,
    planStale: true,
    stops: [
      { ...stop(1), seq: 2 },
      { ...stop(2), seq: 1 },
    ],
  };
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('OUT001: stop 1 → 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark load Ready' })).toHaveCount(0);
  await capture('L05');
  await page.reload();
  await expect(page.getByText('OUT001: stop 1 → 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Review complete · reverify load' }).click();
  await expect(page.getByRole('button', { name: 'Acknowledge & verify plan' })).toBeDisabled();
  for (const outlet of ['OUT001', 'OUT002']) {
    await page.locator('.loader-stop').filter({ hasText: outlet }).click();
    await page.getByRole('spinbutton', { name: 'Loaded quantity' }).fill('4');
  }
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: 'Acknowledge & verify plan' }).click();
  await expect(page.getByRole('button', { name: 'Mark load Ready' })).toBeDisabled();
  state = {
    ...state,
    status: 'in_progress',
    issues: state.issues.map((i) => ({
      ...i,
      acknowledgedBy: uid(50),
      acknowledgedAt: '2026-10-08T05:10:00+05:30',
    })),
  };
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByText('Dispatcher acknowledged', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark load Ready' }).click();
  await expect(page.getByText('Load marked Ready.', { exact: true })).toBeVisible();
  expect(calls).toEqual(['start', 'verify', 'issues', 'verify', 'ready']);
  const broken = await page
    .locator('img')
    .evaluateAll((images: HTMLImageElement[]) =>
      images
        .filter(
          (i) =>
            !i.complete ||
            !i.naturalWidth ||
            i.width !== i.naturalWidth ||
            i.height !== i.naturalHeight,
        )
        .map((i) => i.src),
    );
  expect(broken).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
