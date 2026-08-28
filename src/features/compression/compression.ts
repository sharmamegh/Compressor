export const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024
export const LARGE_FILE_WARNING_SIZE = 500 * 1024 * 1024

const VIDEO_EXTENSIONS = new Set([
  'avi',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'webm',
])

export type OutputFormat = 'mp4' | 'webm'
export type QualityPreset = 'smaller' | 'balanced' | 'quality'
export type ResolutionPreset = 'source' | '1080' | '720' | '480'

export interface VideoMetadata {
  duration: number
  width: number
  height: number
}

export interface CompressionSettings {
  format: OutputFormat
  quality: QualityPreset
  resolution: ResolutionPreset
  targetSizeMB?: number
}

export interface CompressionJob {
  file: File
  metadata: VideoMetadata
  settings: CompressionSettings
}

export const DEFAULT_SETTINGS: CompressionSettings = {
  format: 'mp4',
  quality: 'balanced',
  resolution: '720',
}

export const QUALITY_OPTIONS: ReadonlyArray<{
  value: QualityPreset
  label: string
  description: string
}> = [
  {
    value: 'smaller',
    label: 'Smaller file',
    description: 'Best for sharing',
  },
  {
    value: 'balanced',
    label: 'Balanced',
    description: 'Great everyday quality',
  },
  {
    value: 'quality',
    label: 'Higher quality',
    description: 'Keeps more detail',
  },
]

export function validateVideoFile(file: File): string | null {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  const hasVideoMime = file.type.startsWith('video/')

  if (file.size === 0) return 'This file is empty.'
  if (!hasVideoMime && !VIDEO_EXTENSIONS.has(extension)) {
    return 'Choose a supported video file such as MP4, MOV, MKV, or WebM.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'This video is larger than the 2 GB browser limit.'
  }
  return null
}

export function getVideoMetadata(file: File): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const objectUrl = URL.createObjectURL(file)

    const cleanUp = () => {
      video.removeAttribute('src')
      video.load()
      URL.revokeObjectURL(objectUrl)
    }

    const timer = window.setTimeout(() => {
      cleanUp()
      reject(new Error('Reading the video took too long.'))
    }, 15_000)

    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      window.clearTimeout(timer)
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      }
      cleanUp()

      if (
        !Number.isFinite(metadata.duration) ||
        metadata.duration <= 0 ||
        metadata.width <= 0 ||
        metadata.height <= 0
      ) {
        reject(new Error('The video metadata could not be read.'))
        return
      }
      resolve(metadata)
    }
    video.onerror = () => {
      window.clearTimeout(timer)
      cleanUp()
      reject(new Error('This video cannot be read by your browser.'))
    }
    video.src = objectUrl
  })
}

function dimensionsFor(
  metadata: VideoMetadata,
  resolution: ResolutionPreset,
): { width: number; height: number } | null {
  if (resolution === 'source') return null

  const maxHeight = Number(resolution)
  if (metadata.height <= maxHeight) return null

  const height = maxHeight % 2 === 0 ? maxHeight : maxHeight - 1
  const scaledWidth = Math.round((metadata.width / metadata.height) * height)
  const width = scaledWidth % 2 === 0 ? scaledWidth : scaledWidth - 1
  return { width, height }
}

const qualityValues = {
  mp4: {
    smaller: { crf: 31, audioKbps: 96 },
    balanced: { crf: 26, audioKbps: 128 },
    quality: { crf: 22, audioKbps: 160 },
  },
  webm: {
    smaller: { crf: 42, audioKbps: 80 },
    balanced: { crf: 35, audioKbps: 112 },
    quality: { crf: 29, audioKbps: 144 },
  },
} as const

export function buildFFmpegArgs(
  job: CompressionJob,
  inputName: string,
  outputName: string,
): string[] {
  const { format, quality, resolution, targetSizeMB } = job.settings
  const values = qualityValues[format][quality]
  const dimensions = dimensionsFor(job.metadata, resolution)
  const args = ['-i', inputName, '-map', '0:v:0', '-map', '0:a?']

  if (dimensions) {
    args.push('-vf', `scale=${dimensions.width}:${dimensions.height}`)
  } else if (job.metadata.width % 2 !== 0 || job.metadata.height % 2 !== 0) {
    // yuv420 encoders reject odd sizes; downscale already snaps to even.
    args.push('-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2')
  }

  if (format === 'mp4') {
    args.push('-c:v', 'libx264', '-preset', 'veryfast')
  } else {
    // ffmpeg.wasm 0.12's libvpx-vp9/libopus abort the worker with a stack
    // overflow (tab crash). VP8 + Vorbis is the stable WebM path in that build.
    args.push('-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '4')
  }
  // libx264/VP8 will otherwise keep 4:4:4 or 10-bit, which browsers cannot play.
  args.push('-pix_fmt', 'yuv420p')

  if (targetSizeMB && targetSizeMB > 0) {
    const totalKbps = (targetSizeMB * 8192) / job.metadata.duration
    const videoKbps = Math.max(100, Math.floor(totalKbps - values.audioKbps))
    args.push(
      '-b:v',
      `${videoKbps}k`,
      '-maxrate',
      `${Math.floor(videoKbps * 1.2)}k`,
      '-bufsize',
      `${videoKbps * 2}k`,
    )
  } else {
    args.push('-crf', String(values.crf))
    if (format === 'webm') args.push('-b:v', '0')
  }

  args.push(
    '-c:a',
    format === 'mp4' ? 'aac' : 'libvorbis',
    '-b:a',
    `${values.audioKbps}k`,
  )
  if (format === 'mp4') args.push('-movflags', '+faststart')
  args.push('-y', outputName)
  return args
}

export function makeOutputName(
  originalName: string,
  format: OutputFormat,
): string {
  const base =
    originalName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'video'
  return `${base}-compressed.${format}`
}

export function inputExtension(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase()
  return extension && VIDEO_EXTENSIONS.has(extension) ? extension : 'mp4'
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  )
  const value = bytes / 1024 ** index
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`
}

export function formatDuration(seconds: number): string {
  const totalSeconds = Math.round(seconds)
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = totalSeconds % 60
  return `${minutes}:${remainder.toString().padStart(2, '0')}`
}
