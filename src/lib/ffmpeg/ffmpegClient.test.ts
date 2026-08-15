import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { CompressionJob } from '../../features/compression/compression'

const { instances, MockFFmpeg } = vi.hoisted(() => {
  class MockFFmpeg {
    load = vi.fn().mockResolvedValue(undefined)
    exec = vi.fn().mockResolvedValue(0)
    writeFile = vi.fn().mockResolvedValue(undefined)
    readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3, 4]))
    deleteFile = vi.fn().mockResolvedValue(undefined)
    terminate = vi.fn()
    on = vi.fn()
    off = vi.fn()

    constructor() {
      instances.push(this)
    }
  }

  const instances: MockFFmpeg[] = []
  return { instances, MockFFmpeg }
})

vi.mock('@ffmpeg/ffmpeg', () => ({
  FFmpeg: MockFFmpeg,
}))

vi.mock('@ffmpeg/util', () => ({
  fetchFile: vi.fn().mockResolvedValue(new Uint8Array([9])),
}))

import { FFmpegClient } from './ffmpegClient'

function makeJob(): CompressionJob {
  return {
    file: new File(['video'], 'demo.mp4', { type: 'video/mp4' }),
    metadata: { duration: 12, width: 1280, height: 720 },
    settings: {
      format: 'mp4',
      quality: 'balanced',
      resolution: '720',
    },
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('FFmpegClient', () => {
  beforeEach(() => {
    instances.length = 0
  })

  it('keeps a cancelled run from failing a restarted compression', async () => {
    const client = new FFmpegClient()
    const firstEngine = instances[0]
    expect(firstEngine).toBeDefined()
    const firstExec = deferred<number>()
    firstEngine.exec.mockReturnValue(firstExec.promise)

    const first = client.compress(makeJob(), vi.fn(), vi.fn())
    await vi.waitFor(() => {
      expect(firstEngine.exec).toHaveBeenCalled()
    })

    client.cancel()
    const second = client.compress(makeJob(), vi.fn(), vi.fn())
    await expect(second).resolves.toMatchObject({
      fileName: 'demo-compressed.mp4',
    })

    firstExec.reject(new Error('worker terminated'))
    await expect(first).rejects.toThrow('Compression cancelled.')
    expect(firstEngine.terminate).toHaveBeenCalled()
    expect(instances.length).toBeGreaterThan(1)
  })

  it('isolates overlapping compress() calls onto separate engines', async () => {
    const client = new FFmpegClient()
    const firstEngine = instances[0]
    expect(firstEngine).toBeDefined()
    const firstExec = deferred<number>()
    firstEngine.exec.mockReturnValue(firstExec.promise)

    const first = client.compress(makeJob(), vi.fn(), vi.fn())
    await vi.waitFor(() => {
      expect(firstEngine.exec).toHaveBeenCalled()
    })

    const second = client.compress(makeJob(), vi.fn(), vi.fn())
    await expect(second).resolves.toMatchObject({
      fileName: 'demo-compressed.mp4',
    })

    firstExec.reject(new Error('FS error after overlapping write'))
    await expect(first).rejects.toThrow('Compression cancelled.')
    expect(firstEngine.terminate).toHaveBeenCalled()
    expect(instances.at(-1)?.exec).toHaveBeenCalled()
    expect(firstEngine.deleteFile).toHaveBeenCalled()
    expect(instances.at(-1)?.deleteFile).toHaveBeenCalled()
  })
})
