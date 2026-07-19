import { expect, test } from '@playwright/test'

test.skip(
  process.env.REAL_COMPRESSION !== '1',
  'Set REAL_COMPRESSION=1 to run the WebAssembly smoke test.',
)

test('compresses a generated video entirely in the browser', async ({
  page,
}) => {
  test.setTimeout(240_000)
  const diagnostics: string[] = []
  page.on('console', (message) => diagnostics.push(message.text()))
  page.on('pageerror', (error) => diagnostics.push(error.message))
  await page.goto('/')

  await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 160
    canvas.height = 90
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas is unavailable.')

    const stream = canvas.captureStream(12)
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' })
    const chunks: BlobPart[] = []
    recorder.ondataavailable = (event) => chunks.push(event.data)
    const stopped = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })

    recorder.start()
    const started = performance.now()
    while (performance.now() - started < 1_000) {
      const elapsed = performance.now() - started
      context.fillStyle = `hsl(${elapsed / 4} 70% 50%)`
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = 'white'
      context.font = '20px sans-serif'
      context.fillText('CompressIt', 26, 52)
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
    recorder.stop()
    await stopped
    stream.getTracks().forEach((track) => track.stop())

    const file = new File(chunks, 'generated.webm', { type: 'video/webm' })
    const transfer = new DataTransfer()
    transfer.items.add(file)
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')
    if (!input) throw new Error('File input is unavailable.')
    input.files = transfer.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await expect(page.getByText('Choose a result')).toBeVisible()
  await page.getByRole('button', { name: 'Compress video' }).click()
  const outcome = await Promise.race([
    page
      .getByText('Ready to download')
      .waitFor({ timeout: 220_000 })
      .then(() => 'complete' as const),
    page
      .getByRole('alert')
      .waitFor({ timeout: 220_000 })
      .then(() => 'error' as const),
  ])
  if (outcome === 'error') {
    throw new Error(
      `${await page.getByRole('alert').innerText()}\n${diagnostics.join('\n')}`,
    )
  }
  await expect(
    page.getByRole('link', { name: 'Download video' }),
  ).toHaveAttribute('download', /generated-compressed\.mp4/)
})

test('compresses a common H264 MP4 without stalling', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page
    .locator('input[type="file"]')
    .setInputFiles('e2e/fixtures/h264-input.mp4')

  await expect(page.getByText('Choose a result')).toBeVisible()
  await page.getByRole('button', { name: 'Compress video' }).click()
  await expect(page.getByText('Ready to download')).toBeVisible({
    timeout: 100_000,
  })
  await expect(
    page.getByRole('link', { name: 'Download video' }),
  ).toHaveAttribute('download', 'h264-input-compressed.mp4')
})
