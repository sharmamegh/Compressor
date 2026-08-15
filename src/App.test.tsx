import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CompressionResult } from './lib/ffmpeg/ffmpegClient'

const { mockCompress, mockCancel } = vi.hoisted(() => ({
  mockCompress: vi.fn(),
  mockCancel: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

vi.mock('./lib/ffmpeg/ffmpegClient', () => ({
  ffmpegClient: {
    compress: mockCompress,
    cancel: mockCancel,
  },
}))

vi.mock('./features/compression/compression', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./features/compression/compression')>()
  return {
    ...actual,
    getVideoMetadata: vi.fn().mockResolvedValue({
      duration: 12,
      width: 1280,
      height: 720,
    }),
  }
})

import App from './App'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

async function chooseVideo(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  const input = document.querySelector('input[type="file"]')
  expect(input).toBeInstanceOf(HTMLInputElement)
  await user.upload(
    input as HTMLInputElement,
    new File(['video'], 'clip.mp4', { type: 'video/mp4' }),
  )
  expect(
    await screen.findByRole('button', { name: /compress video/i }),
  ).toBeInTheDocument()
}

describe('App', () => {
  beforeEach(() => {
    mockCompress.mockReset()
    mockCancel.mockReset()
  })

  it('explains the private product and presents the compressor', () => {
    render(<App />)

    expect(
      screen.getByRole('heading', { name: /smaller videos/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/never leave this device/i)).toBeInTheDocument()
    expect(screen.getByText(/drop a video here/i)).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /main navigation/i }),
    ).toBeInTheDocument()
  })

  it('shows an actionable error for unsupported files', async () => {
    const user = userEvent.setup({ applyAccept: false })
    render(<App />)
    const input = document.querySelector('input[type="file"]')
    expect(input).toBeInstanceOf(HTMLInputElement)

    await user.upload(
      input as HTMLInputElement,
      new File(['notes'], 'notes.txt', { type: 'text/plain' }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(/supported video/i)
  })

  it('does not start a second compression from a double click', async () => {
    const user = userEvent.setup()
    const compression = deferred<CompressionResult>()
    mockCompress.mockReturnValue(compression.promise)
    render(<App />)
    await chooseVideo(user)

    const compressButton = screen.getByRole('button', {
      name: /compress video/i,
    })
    fireEvent.click(compressButton)
    fireEvent.click(compressButton)

    expect(mockCompress).toHaveBeenCalledTimes(1)

    compression.resolve({
      blob: new Blob([1, 2, 3]),
      fileName: 'clip-compressed.mp4',
    })
    expect(await screen.findByText(/ready to download/i)).toBeInTheDocument()
  })

  it('does not apply a stale failure from a cancelled job to a newer run', async () => {
    const user = userEvent.setup()
    const first = deferred<CompressionResult>()
    const second = deferred<CompressionResult>()
    mockCompress
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    render(<App />)
    await chooseVideo(user)

    await user.click(screen.getByRole('button', { name: /compress video/i }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    await user.click(screen.getByRole('button', { name: /compress video/i }))

    first.reject(new Error('The compression engine could not process this video.'))
    await screen.findByText(/working on it/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    second.resolve({
      blob: new Blob([1, 2, 3]),
      fileName: 'clip-compressed.mp4',
    })
    expect(await screen.findByText(/ready to download/i)).toBeInTheDocument()
  })
})
