import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile } from '@ffmpeg/util'

import {
  buildFFmpegArgs,
  inputExtension,
  makeOutputName,
  type CompressionJob,
} from '../../features/compression/compression'

export interface CompressionResult {
  blob: Blob
  fileName: string
}

type ProgressHandler = (progress: number) => void
type StatusHandler = (status: string) => void

export class FFmpegClient {
  private ffmpeg = new FFmpeg()
  private loaded = false
  private loading: Promise<void> | null = null
  private generation = 0
  private inFlightGeneration: number | null = null

  private assetUrl(path: string): string {
    return new URL(path, window.location.origin).href
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation
  }

  private assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) {
      throw new Error('Compression cancelled.')
    }
  }

  private replaceEngine(): void {
    if (this.loaded || this.loading) {
      this.ffmpeg.terminate()
    }
    this.ffmpeg = new FFmpeg()
    this.loaded = false
    this.loading = null
  }

  private async loadCore(
    status: StatusHandler,
    generation: number,
  ): Promise<void> {
    if (this.loaded) return
    if (this.loading) {
      await this.loading
      this.assertCurrent(generation)
      return
    }

    const engine = this.ffmpeg
    const pending = (async () => {
      status('Loading the private compression engine')
      await engine.load({
        coreURL: this.assetUrl('/ffmpeg/single/ffmpeg-core.js'),
        wasmURL: this.assetUrl('/ffmpeg/single/ffmpeg-core.wasm'),
      })
      if (engine !== this.ffmpeg || !this.isCurrent(generation)) {
        throw new Error('Compression cancelled.')
      }
      this.loaded = true
    })()

    this.loading = pending
    try {
      await pending
    } finally {
      if (this.loading === pending) this.loading = null
    }
    this.assertCurrent(generation)
  }

  async compress(
    job: CompressionJob,
    onProgress: ProgressHandler,
    onStatus: StatusHandler,
  ): Promise<CompressionResult> {
    if (this.inFlightGeneration !== null) {
      this.replaceEngine()
    }
    const generation = ++this.generation
    this.inFlightGeneration = generation

    try {
      try {
        await this.loadCore(onStatus, generation)
      } catch (cause) {
        if (!this.isCurrent(generation)) {
          throw new Error('Compression cancelled.', { cause })
        }
        if (
          cause instanceof Error &&
          cause.message === 'Compression cancelled.'
        ) {
          throw cause
        }
        console.error('The FFmpeg browser engine failed to load.', cause)
        throw new Error(
          'The compression engine could not start in this browser.',
          {
            cause,
          },
        )
      }

      const inputName = `input.${inputExtension(job.file)}`
      const fileName = makeOutputName(job.file.name, job.settings.format)
      const outputName = `output.${job.settings.format}`
      const engine = this.ffmpeg
      const recentLogs: string[] = []
      const progressHandler = ({ progress }: { progress: number }) => {
        if (Number.isFinite(progress)) {
          onProgress(Math.max(0, Math.min(1, progress)))
        }
      }
      const logHandler = ({ message }: { message: string }) => {
        recentLogs.push(message)
        if (recentLogs.length > 20) recentLogs.shift()
      }

      engine.on('progress', progressHandler)
      engine.on('log', logHandler)
      try {
        onStatus('Preparing your video')
        await engine.writeFile(inputName, await fetchFile(job.file))
        this.assertCurrent(generation)

        onStatus('Compressing locally on this device')
        const exitCode = await engine.exec(
          buildFFmpegArgs(job, inputName, outputName),
        )
        this.assertCurrent(generation)
        if (exitCode !== 0) {
          console.error(
            'FFmpeg exited without an output.',
            recentLogs.join('\n'),
          )
          throw new Error(
            'The compression engine could not process this video.',
          )
        }

        onStatus('Finishing your download')
        const output = await engine.readFile(outputName)
        this.assertCurrent(generation)
        if (typeof output === 'string') {
          throw new Error('The compression engine returned an invalid file.')
        }

        const bytes = new Uint8Array(output)
        if (bytes.byteLength === 0) {
          throw new Error('The compression engine created an empty file.')
        }
        const blob = new Blob([bytes], {
          type: job.settings.format === 'mp4' ? 'video/mp4' : 'video/webm',
        })
        onProgress(1)
        return {
          blob,
          fileName,
        }
      } catch (cause) {
        if (!this.isCurrent(generation)) {
          throw new Error('Compression cancelled.', { cause })
        }
        if (cause instanceof Error) throw cause
        console.error(
          'FFmpeg stopped unexpectedly.',
          cause,
          recentLogs.join('\n'),
        )
        throw new Error('The compression engine stopped unexpectedly.', {
          cause,
        })
      } finally {
        engine.off('progress', progressHandler)
        engine.off('log', logHandler)
        await Promise.allSettled([
          engine.deleteFile(inputName),
          engine.deleteFile(outputName),
        ])
      }
    } finally {
      if (this.inFlightGeneration === generation) {
        this.inFlightGeneration = null
      }
    }
  }

  cancel(): void {
    this.generation += 1
    this.inFlightGeneration = null
    this.replaceEngine()
  }
}

export type FFmpegClientInstance = Pick<FFmpegClient, 'compress' | 'cancel'>
export const ffmpegClient = new FFmpegClient()
