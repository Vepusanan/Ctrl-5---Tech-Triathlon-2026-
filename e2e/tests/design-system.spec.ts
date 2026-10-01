import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/design-system');
  await page.evaluate(() => document.fonts.ready);
});

test('gallery assets, semantic states and desktop accessibility', async ({ page }, testInfo) => {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'A shared language for every journey.',
  );
  const images = await page.locator('img').evaluateAll((nodes: HTMLImageElement[]) =>
    nodes.map((node) => ({
      source: node.getAttribute('src'),
      loaded: node.complete && node.naturalWidth > 0,
      natural: [node.naturalWidth, node.naturalHeight],
      rendered: [node.width, node.height],
    })),
  );
  expect(
    images.filter(
      (image) => !image.loaded || image.natural.some((size, i) => size !== image.rendered[i]),
    ),
  ).toEqual([]);
  await expect(page.getByRole('meter', { name: 'Over limit', exact: true })).toHaveAttribute(
    'aria-valuetext',
    '103 of 100 kg, 103%, over capacity',
  );
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('waypoint-desktop.png'), fullPage: false });
});

test('table sorting, mixed selection, recommendation and retry', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Sample orders' });
  await expect(table.getByRole('checkbox', { name: 'Select all rows' })).toHaveJSProperty(
    'indeterminate',
    true,
  );
  await table.getByRole('checkbox', { name: 'Select all rows' }).check();
  await expect(table.getByRole('checkbox', { checked: true })).toHaveCount(4);
  await table.getByRole('button', { name: 'Weight kg' }).click();
  await table.getByRole('button', { name: 'Weight kg' }).click();
  await expect(table.locator('tbody tr').first()).toContainText('720');
  await page.getByRole('button', { name: 'Accept', exact: true }).first().click();
  await expect(page.locator('#intelligence')).toContainText('✓ Accepted');
  await page.getByRole('button', { name: 'Reset recommendation example' }).click();
  await expect(page.getByRole('button', { name: 'Accept', exact: true }).first()).toBeEnabled();
  await page.locator('#feedback').getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('heading', { name: 'Connection restored' })).toBeVisible();
});

test('mobile layout, touch targets and navigation focus', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const trigger = page.getByRole('button', { name: 'Open navigation' });
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Tab');
  expect(
    await page.getByRole('dialog').evaluate((node) => node.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  const smallTargets = await page
    .locator('button:not(:disabled), summary, .wp-checkbox-target')
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const r = node.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
        })
        .map((node) => node.textContent),
    );
  expect(smallTargets).toEqual([]);
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('waypoint-mobile.png'), fullPage: false });
});
