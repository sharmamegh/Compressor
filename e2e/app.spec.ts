import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('presents the private compression experience', async ({ page }) => {
  await page.goto('/')

  await expect(
    page.getByRole('heading', { name: /smaller videos/i }),
  ).toBeVisible()
  await expect(page.getByText(/drop a video here/i)).toBeVisible()
  await expect(page.getByText(/zero uploads/i)).toBeVisible()

  const headers = await page.request.get('/')
  expect(headers.headers()['cross-origin-opener-policy']).toBe('same-origin')
  expect(headers.headers()['cross-origin-embedder-policy']).toBe('require-corp')
})

test('rejects a non-video file with a useful message', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a video'),
  })

  await expect(page.getByRole('alert')).toContainText('supported video')
})

test('has no automatically detectable accessibility violations', async ({
  page,
}) => {
  await page.goto('/')
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
