import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  MAX_FILE_SIZE,
  buildFFmpegArgs,
  formatBytes,
  formatDuration,
  getVideoMetadata,
  inputExtension,
  makeOutputName,
  validateVideoFile,
  type CompressionJob,
} from './compression'

afterEach(() => {
  vi.restoreAllMocks()
})

const metadata = { duration: 60, width: 1920, height: 1080 }

function makeFile(
  name = 'demo.mp4',
  options: { size?: number; type?: string } = {},
): File {
  const file = new File(['video'], name, {
    type: options.type ?? 'video/mp4',
  })
  if (options.size !== undefined) {
    Object.defineProperty(file, 'size', { value: options.size })
  }
  return file
}

function makeJob(
  overrides: Partial<CompressionJob['settings']> = {},
): CompressionJob {
  return {
    file: makeFile(),
    metadata,
    settings: {
      format: 'mp4',
      quality: 'balanced',
      resolution: '720',
      ...overrides,
    },
  }
}

describe('validateVideoFile', () => {
  it('accepts supported video files and extension-only MKV files', () => {
    expect(validateVideoFile(makeFile())).toBeNull()
    expect(
      validateVideoFile(
        makeFile('clip.mkv', { type: 'application/octet-stream' }),
      ),
    ).toBeNull()
  })

  it('rejects empty, unsupported, and oversized files', () => {
    expect(validateVideoFile(makeFile('empty.mp4', { size: 0 }))).toMatch(
      /empty/i,
    )
    expect(
      validateVideoFile(makeFile('notes.txt', { type: 'text/plain' })),
    ).toMatch(/supported/i)
    expect(
      validateVideoFile(makeFile('huge.mp4', { size: MAX_FILE_SIZE + 1 })),
    ).toMatch(/2 GB/i)
  })
})

describe('buildFFmpegArgs', () => {
  it('builds a scaled, compatible MP4 command', () => {
    const args = buildFFmpegArgs(makeJob(), 'input.mp4', 'output.mp4')

    expect(args).toContain('libx264')
    expect(args).toContain('yuv420p')
    expect(args).toContain('scale=1280:720')
    expect(args).toContain('+faststart')
    expect(args.at(-1)).toBe('output.mp4')
  })

  it('forces 8-bit 4:2:0 so 4:4:4 and 10-bit sources stay browser-playable', () => {
    const mp4 = buildFFmpegArgs(makeJob(), 'input.mp4', 'output.mp4')
    const webm = buildFFmpegArgs(
      makeJob({ format: 'webm', resolution: 'source' }),
      'input.mov',
      'output.webm',
    )

    expect(mp4.slice(mp4.indexOf('-c:v'), mp4.indexOf('-crf'))).toEqual(
      expect.arrayContaining(['-pix_fmt', 'yuv420p']),
    )
    expect(webm).toEqual(expect.arrayContaining(['-pix_fmt', 'yuv420p']))
  })

  it('does not upscale a low-resolution source', () => {
    const job = makeJob({ resolution: '1080' })
    job.metadata = { duration: 20, width: 640, height: 360 }

    expect(buildFFmpegArgs(job, 'in.mp4', 'out.mp4')).not.toContain('-vf')
  })

  it('snaps odd source dimensions so yuv420 encoders can run', () => {
    const keepSource = makeJob({ resolution: 'source' })
    keepSource.metadata = { duration: 8, width: 853, height: 480 }

    const withinCap = makeJob({ resolution: '720' })
    withinCap.metadata = { duration: 8, width: 640, height: 361 }

    expect(buildFFmpegArgs(keepSource, 'in.mp4', 'out.mp4')).toEqual(
      expect.arrayContaining(['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2']),
    )
    expect(buildFFmpegArgs(withinCap, 'in.mp4', 'out.mp4')).toEqual(
      expect.arrayContaining(['-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2']),
    )
  })

  it('uses VP8 and Vorbis for WebM so ffmpeg.wasm 0.12 does not crash the tab', () => {
    const args = buildFFmpegArgs(
      makeJob({ format: 'webm', resolution: 'source' }),
      'input.mov',
      'output.webm',
    )

    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-pix_fmt'))).toEqual([
      '-c:v',
      'libvpx',
      '-deadline',
      'realtime',
      '-cpu-used',
      '4',
    ])
    expect(args).toEqual(
      expect.arrayContaining(['-c:a', 'libvorbis', '-b:a', '112k']),
    )
    expect(args).not.toContain('libvpx-vp9')
    expect(args).not.toContain('libopus')
  })

  it('gives VP8 quality mode a high bitrate ceiling so CRF is not capped at 256k', () => {
    const balanced = buildFFmpegArgs(
      makeJob({ format: 'webm', resolution: 'source' }),
      'input.mov',
      'output.webm',
    )
    const quality = buildFFmpegArgs(
      makeJob({ format: 'webm', quality: 'quality', resolution: 'source' }),
      'input.mov',
      'output.webm',
    )

    expect(balanced.slice(balanced.indexOf('-crf'))).toEqual(
      expect.arrayContaining(['-crf', '35', '-b:v', '8M']),
    )
    expect(quality.slice(quality.indexOf('-crf'))).toEqual(
      expect.arrayContaining(['-crf', '29', '-b:v', '8M']),
    )
    expect(balanced).not.toEqual(expect.arrayContaining(['-b:v', '0']))
  })

  it('builds WebM settings and a target bitrate', () => {
    const args = buildFFmpegArgs(
      makeJob({ format: 'webm', targetSizeMB: 10, resolution: 'source' }),
      'input.mov',
      'output.webm',
    )

    expect(args).toContain('libvpx')
    expect(args).not.toContain('libvpx-vp9')
    expect(args).toContain('libvorbis')
    expect(args).not.toContain('libopus')
    expect(args).toContain('yuv420p')
    expect(args).toContain('-maxrate')
    expect(args).not.toContain('-crf')
  })
})

describe('formatting helpers', () => {
  it('creates safe output names and known input extensions', () => {
    expect(makeOutputName('My summer video!!.MOV', 'mp4')).toBe(
      'My-summer-video-compressed.mp4',
    )
    expect(makeOutputName('.mp4', 'webm')).toBe('video-compressed.webm')
    expect(inputExtension(makeFile('CLIP.MKV'))).toBe('mkv')
    expect(inputExtension(makeFile('unknown.bin'))).toBe('mp4')
  })

  it('formats sizes and durations for people', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(12 * 1024 * 1024)).toBe('12 MB')
    expect(formatDuration(65)).toBe('1:05')
  })
})

describe('getVideoMetadata', () => {
  it('reads valid metadata and releases the temporary URL', async () => {
    const video = {
      duration: 42,
      videoWidth: 1280,
      videoHeight: 720,
      preload: '',
      src: '',
      onloadedmetadata: null,
      onerror: null,
      removeAttribute: vi.fn(),
      load: vi.fn(),
    } as unknown as HTMLVideoElement
    vi.spyOn(document, 'createElement').mockReturnValue(video)
    const revoke = vi.spyOn(URL, 'revokeObjectURL')

    const pending = getVideoMetadata(makeFile())
    video.onloadedmetadata?.(new Event('loadedmetadata'))

    await expect(pending).resolves.toEqual({
      duration: 42,
      width: 1280,
      height: 720,
    })
    expect(revoke).toHaveBeenCalled()
  })
})
