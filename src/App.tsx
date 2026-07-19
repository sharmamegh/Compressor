import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'

import { UpdatePrompt } from './components/UpdatePrompt'
import {
  DEFAULT_SETTINGS,
  LARGE_FILE_WARNING_SIZE,
  QUALITY_OPTIONS,
  formatBytes,
  formatDuration,
  getVideoMetadata,
  validateVideoFile,
  type CompressionSettings,
  type VideoMetadata,
} from './features/compression/compression'
import type {
  CompressionResult,
  FFmpegClientInstance,
} from './lib/ffmpeg/ffmpegClient'

type Stage = 'idle' | 'reading' | 'ready' | 'compressing' | 'done'

interface CompletedResult extends CompressionResult {
  url: string
  elapsedSeconds: number
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" />
      <rect
        className="logo-mark__tile"
        x="9"
        y="9"
        width="14"
        height="14"
        rx="3"
      />
      <path className="logo-mark__play" d="m14 12.5 7 3.5-7 3.5v-7Z" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 10V8a5 5 0 0 1 10 0v2" />
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M12 14v3" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const selectionIdRef = useRef(0)
  const compressionIdRef = useRef(0)
  const compressingRef = useRef(false)
  const ffmpegClientRef = useRef<FFmpegClientInstance | null>(null)
  const [stage, setStage] = useState<Stage>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null)
  const [settings, setSettings] =
    useState<CompressionSettings>(DEFAULT_SETTINGS)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [result, setResult] = useState<CompletedResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  useEffect(
    () => () => {
      if (sourceUrl) URL.revokeObjectURL(sourceUrl)
    },
    [sourceUrl],
  )

  useEffect(
    () => () => {
      if (result) URL.revokeObjectURL(result.url)
    },
    [result],
  )

  useEffect(
    () => () => {
      compressionIdRef.current += 1
      if (compressingRef.current) ffmpegClientRef.current?.cancel()
    },
    [],
  )

  const chooseFile = async (nextFile: File) => {
    const validationError = validateVideoFile(nextFile)
    if (validationError) {
      setError(validationError)
      return
    }

    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    setError(null)
    setStage('reading')
    setFile(nextFile)
    setSourceUrl(URL.createObjectURL(nextFile))
    const selectionId = ++selectionIdRef.current

    try {
      const nextMetadata = await getVideoMetadata(nextFile)
      if (selectionId !== selectionIdRef.current) return
      setMetadata(nextMetadata)
      setStage('ready')
    } catch (caught) {
      if (selectionId !== selectionIdRef.current) return
      setFile(null)
      setSourceUrl(null)
      setMetadata(null)
      setStage('idle')
      setError(
        caught instanceof Error
          ? caught.message
          : 'This video could not be opened.',
      )
    }
  }

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0]
    if (nextFile) void chooseFile(nextFile)
    event.target.value = ''
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setIsDragging(false)
    const nextFile = event.dataTransfer.files[0]
    if (nextFile) void chooseFile(nextFile)
  }

  const startCompression = async () => {
    if (!file || !metadata) return
    if (
      settings.targetSizeMB !== undefined &&
      (settings.targetSizeMB < 1 ||
        settings.targetSizeMB >= file.size / 1024 / 1024)
    ) {
      setError(
        'Target size must be at least 1 MB and smaller than the original.',
      )
      return
    }

    setError(null)
    setProgress(0)
    setStage('compressing')
    setStatus('Starting')
    compressingRef.current = true
    const compressionId = ++compressionIdRef.current
    const startedAt = performance.now()

    try {
      const { ffmpegClient } = await import('./lib/ffmpeg/ffmpegClient')
      if (compressionId !== compressionIdRef.current) {
        throw new Error('Compression cancelled.')
      }
      ffmpegClientRef.current = ffmpegClient
      const compressed = await ffmpegClient.compress(
        { file, metadata, settings },
        setProgress,
        setStatus,
      )
      const url = URL.createObjectURL(compressed.blob)
      setResult({
        ...compressed,
        url,
        elapsedSeconds: (performance.now() - startedAt) / 1000,
      })
      setStage('done')
    } catch (caught) {
      setStage('ready')
      const message =
        caught instanceof Error ? caught.message : 'Compression did not finish.'
      if (message !== 'Compression cancelled.') setError(message)
    } finally {
      compressingRef.current = false
    }
  }

  const cancelCompression = () => {
    compressionIdRef.current += 1
    compressingRef.current = false
    ffmpegClientRef.current?.cancel()
    setStage('ready')
    setProgress(0)
    setStatus('')
  }

  const reset = () => {
    selectionIdRef.current += 1
    compressionIdRef.current += 1
    if (result) URL.revokeObjectURL(result.url)
    setResult(null)
    setFile(null)
    setSourceUrl(null)
    setMetadata(null)
    setError(null)
    setProgress(0)
    setStatus('')
    setSettings(DEFAULT_SETTINGS)
    setStage('idle')
    fileInputRef.current?.focus()
  }

  const reduction =
    file && result ? Math.round((1 - result.blob.size / file.size) * 100) : null

  return (
    <div className="app">
      <a className="skip-link" href="#compressor">
        Skip to compressor
      </a>

      <header className="site-header">
        <a className="brand" href="/" aria-label="CompressIt home">
          <span className="logo-mark">
            <LogoMark />
          </span>
          CompressIt
        </a>
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#privacy">
            <LockIcon />
            Private by design
          </a>
        </nav>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero__copy">
            <span className="eyebrow">
              <span className="status-dot" />
              No uploads. No waiting rooms.
            </span>
            <h1 id="hero-title">
              Smaller videos.
              <br />
              <em>Still yours.</em>
            </h1>
            <p>
              Compress videos right in your browser. Fast, private, and free.
              Your files never leave this device.
            </p>
          </div>

          <div id="compressor" className="compressor-shell">
            {error && (
              <div className="alert alert--error" role="alert">
                <strong>We could not continue.</strong>
                <span>{error}</span>
                <button
                  type="button"
                  aria-label="Dismiss error"
                  onClick={() => setError(null)}
                >
                  ×
                </button>
              </div>
            )}

            {(stage === 'idle' || stage === 'reading') && (
              <label
                className={`dropzone ${isDragging ? 'dropzone--active' : ''}`}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*,.mkv"
                  onChange={handleInput}
                  disabled={stage === 'reading'}
                />
                <span className="dropzone__icon">
                  <UploadIcon />
                </span>
                <strong>
                  {stage === 'reading'
                    ? 'Reading your video'
                    : 'Drop a video here'}
                </strong>
                <span>
                  {stage === 'reading'
                    ? 'This only takes a moment.'
                    : 'or click to choose a file'}
                </span>
                <small>MP4, MOV, MKV, WebM, AVI · Up to 2 GB</small>
              </label>
            )}

            {file && metadata && stage !== 'idle' && stage !== 'reading' && (
              <div className="workspace">
                <div className="file-summary">
                  <div className="file-summary__preview">
                    {sourceUrl && (
                      <video
                        src={sourceUrl}
                        muted
                        playsInline
                        preload="metadata"
                      />
                    )}
                    <span>{file.name.split('.').pop()?.toUpperCase()}</span>
                  </div>
                  <div className="file-summary__details">
                    <span className="eyebrow">Your video</span>
                    <strong title={file.name}>{file.name}</strong>
                    <p>
                      {formatBytes(file.size)} ·{' '}
                      {formatDuration(metadata.duration)} · {metadata.width} ×{' '}
                      {metadata.height}
                    </p>
                  </div>
                  {stage !== 'compressing' && (
                    <button
                      className="icon-button"
                      type="button"
                      onClick={reset}
                      aria-label="Remove video"
                    >
                      ×
                    </button>
                  )}
                </div>

                {stage === 'ready' && (
                  <div className="settings">
                    {file.size > LARGE_FILE_WARNING_SIZE && (
                      <div className="alert alert--warning" role="status">
                        <strong>Large video</strong>
                        <span>
                          Keep this tab open. Large files need substantial
                          memory and may be slower on mobile devices.
                        </span>
                      </div>
                    )}

                    <fieldset>
                      <legend>Choose a result</legend>
                      <div className="quality-grid">
                        {QUALITY_OPTIONS.map((option) => (
                          <label
                            className={`quality-option ${
                              settings.quality === option.value
                                ? 'quality-option--selected'
                                : ''
                            }`}
                            key={option.value}
                          >
                            <input
                              type="radio"
                              name="quality"
                              value={option.value}
                              checked={settings.quality === option.value}
                              onChange={() =>
                                setSettings((current) => ({
                                  ...current,
                                  quality: option.value,
                                }))
                              }
                            />
                            <span className="quality-option__check">
                              <CheckIcon />
                            </span>
                            <strong>{option.label}</strong>
                            <small>{option.description}</small>
                          </label>
                        ))}
                      </div>
                    </fieldset>

                    <div className="settings-row">
                      <label>
                        <span>Resolution</span>
                        <select
                          value={settings.resolution}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              resolution: event.target
                                .value as CompressionSettings['resolution'],
                            }))
                          }
                        >
                          <option value="source">Keep original</option>
                          <option value="1080">Up to 1080p</option>
                          <option value="720">Up to 720p</option>
                          <option value="480">Up to 480p</option>
                        </select>
                      </label>
                      <label>
                        <span>Format</span>
                        <select
                          value={settings.format}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              format: event.target
                                .value as CompressionSettings['format'],
                            }))
                          }
                        >
                          <option value="mp4">MP4 · Most compatible</option>
                          <option value="webm">WebM · Often smaller</option>
                        </select>
                      </label>
                    </div>

                    <div className="target-size">
                      <label className="toggle">
                        <input
                          type="checkbox"
                          checked={settings.targetSizeMB !== undefined}
                          onChange={(event) =>
                            setSettings((current) => ({
                              ...current,
                              targetSizeMB: event.target.checked
                                ? Math.max(
                                    1,
                                    Math.floor(file.size / 1024 / 1024 / 2),
                                  )
                                : undefined,
                            }))
                          }
                        />
                        <span className="toggle__track" />
                        <span>
                          <strong>Aim for a specific size</strong>
                          <small>
                            Useful for upload limits. Results are approximate.
                          </small>
                        </span>
                      </label>
                      {settings.targetSizeMB !== undefined && (
                        <label className="size-input">
                          <span className="sr-only">
                            Target size in megabytes
                          </span>
                          <input
                            type="number"
                            min="1"
                            max={Math.max(
                              1,
                              Math.floor(file.size / 1024 / 1024) - 1,
                            )}
                            value={settings.targetSizeMB}
                            onChange={(event) =>
                              setSettings((current) => ({
                                ...current,
                                targetSizeMB: Number(event.target.value),
                              }))
                            }
                          />
                          <span>MB</span>
                        </label>
                      )}
                    </div>

                    <button
                      className="button button--primary button--compress"
                      type="button"
                      onClick={() => void startCompression()}
                    >
                      Compress video
                      <span>→</span>
                    </button>
                    <p className="local-note">
                      <LockIcon />
                      Processed locally. Nothing is uploaded.
                    </p>
                  </div>
                )}

                {stage === 'compressing' && (
                  <div className="processing" aria-live="polite">
                    <div className="processing__ring" aria-hidden="true">
                      <span>{Math.round(progress * 100)}%</span>
                    </div>
                    <span className="eyebrow">Working on it</span>
                    <h2>{status}</h2>
                    <p>
                      Keep this tab open. Your video is being processed entirely
                      on this device.
                    </p>
                    <div
                      className="progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(progress * 100)}
                      aria-label="Compression progress"
                    >
                      <span
                        style={{ width: `${Math.max(2, progress * 100)}%` }}
                      />
                    </div>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={cancelCompression}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {stage === 'done' && result && (
                  <div className="result" aria-live="polite">
                    <div className="result__badge">
                      <CheckIcon />
                    </div>
                    <span className="eyebrow">Ready to download</span>
                    <h2>
                      {reduction !== null && reduction >= 0
                        ? `${reduction}% smaller`
                        : 'Your video is ready'}
                    </h2>
                    <p>
                      Finished in {formatDuration(result.elapsedSeconds)} on
                      this device.
                    </p>

                    <div className="size-comparison">
                      <div>
                        <span>Before</span>
                        <strong>{formatBytes(file.size)}</strong>
                      </div>
                      <span aria-hidden="true">→</span>
                      <div>
                        <span>After</span>
                        <strong>{formatBytes(result.blob.size)}</strong>
                      </div>
                    </div>

                    <video
                      className="result__video"
                      src={result.url}
                      controls
                      playsInline
                    />
                    <a
                      className="button button--primary button--compress"
                      href={result.url}
                      download={result.fileName}
                    >
                      Download video
                      <span>↓</span>
                    </a>
                    <button
                      className="button button--quiet"
                      type="button"
                      onClick={reset}
                    >
                      Compress another video
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="trust-row" aria-label="Product benefits">
            <span>
              <LockIcon /> Stays on your device
            </span>
            <span>No sign-up</span>
            <span>Free to use</span>
          </div>
        </section>

        <section id="how-it-works" className="how-it-works">
          <span className="eyebrow">Simple by design</span>
          <h2>Three steps. Zero uploads.</h2>
          <div className="steps">
            <article>
              <span>01</span>
              <h3>Choose a video</h3>
              <p>
                Select a video from this device. It opens locally in your
                browser.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>Pick your balance</h3>
              <p>
                Choose the quality, resolution, format, or an approximate size.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>Save the result</h3>
              <p>Preview and download your smaller video when it is ready.</p>
            </article>
          </div>
        </section>

        <section id="privacy" className="privacy-section">
          <div className="privacy-section__icon">
            <LockIcon />
          </div>
          <div>
            <span className="eyebrow">Privacy is the architecture</span>
            <h2>Your video never leaves your browser.</h2>
          </div>
          <p>
            CompressIt has no upload server, account system, analytics, or
            tracking cookies. The compression engine runs on this device, then
            removes its temporary working files when it finishes.
          </p>
        </section>
      </main>

      <footer>
        <a className="brand" href="/">
          <span className="logo-mark">
            <LogoMark />
          </span>
          CompressIt
        </a>
        <p>Private video compression, made simple.</p>
        <div className="footer__links">
          <a href="#privacy">Privacy</a>
          <a href="/third-party-notices.txt">Third-party notices</a>
        </div>
      </footer>

      <UpdatePrompt />
    </div>
  )
}

export default App
