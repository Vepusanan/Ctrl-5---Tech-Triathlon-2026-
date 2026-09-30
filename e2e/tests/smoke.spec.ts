import { expect, test } from '@playwright/test';

test('web app renders and reports system status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Waypoint' })).toBeVisible();

  const status = page.getByRole('region', { name: 'System status' }).getByRole('status');
  await expect(status).not.toHaveText('Checking…');
});
