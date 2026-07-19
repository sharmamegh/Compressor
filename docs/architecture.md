# Architecture

## Runtime boundaries

CompressIt is delivered as static files. No application server participates in compression.

```text
File picker
  -> validation and metadata
  -> typed compression settings
  -> FFmpeg argument builder
  -> FFmpeg web worker and in-memory file system
  -> local Blob URL
  -> preview and download
```

## Source areas

- `src/App.tsx` owns the user flow and transient browser state.
- `src/features/compression/compression.ts` contains validation, settings, calculations, command construction, naming, and formatting.
- `src/lib/ffmpeg/ffmpegClient.ts` owns engine loading, worker events, virtual files, cancellation, and cleanup.
- `scripts/copy-ffmpeg-core.mjs` self-hosts exact engine assets from the lockfile.
- `vite.config.ts` configures the PWA and local cross-origin isolation.
- `vercel.json` enforces production isolation and browser security headers.

## State model

The interface advances through `idle`, `reading`, `ready`, `compressing`, and `done`. Errors return the user to the nearest recoverable state. Cancellation terminates the current FFmpeg worker, clears the virtual files, and allows a new engine instance to be loaded.

All selected files, object URLs, output blobs, and FFmpeg files are session-only. Reloading or closing the page discards them.

## Compression choices

MP4 output uses H.264 video and AAC audio for broad compatibility. WebM output uses VP9 video and Opus audio. Quality presets map to format-specific CRF and audio bitrate values.

Target-size mode calculates an approximate video bitrate from duration, requested bytes, and audio bitrate. It intentionally uses one pass because a two-pass browser encode would roughly double processing time.

Resolution never upscales the source. Calculated output dimensions are even to satisfy common video encoder requirements.

## Failure boundaries

- File selection rejects empty, unsupported, and files larger than 2 GB.
- Browser metadata failures produce a recoverable user message.
- FFmpeg exit failures do not expose internal paths or command details.
- Temporary input and output files are deleted in a `finally` block.
- The top-level error boundary handles unexpected rendering failures.
- CSP restricts outbound requests, scripts, workers, media, and framing.
