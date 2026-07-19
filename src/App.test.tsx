import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}))

vi.mock('./lib/ffmpeg/ffmpegClient', () => ({
  ffmpegClient: {
    compress: vi.fn(),
    cancel: vi.fn(),
  },
}))

describe('App', () => {
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
})
