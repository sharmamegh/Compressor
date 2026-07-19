# CompressIt

CompressIt is a privacy-first video compressor that runs entirely in the browser. Videos are processed on the user's device with FFmpeg WebAssembly. There is no upload server, account, analytics, or tracking cookie.

Production: [compressit-one.vercel.app](https://compressit-one.vercel.app)

## Product capabilities

- MP4 and WebM output
- Three quality presets and four resolution choices
- Optional approximate target size
- Local preview, progress, cancellation, and download
- Multi-thread compression with a compatibility fallback
- Installable PWA with an offline app shell
- Responsive, keyboard-accessible interface

## Requirements

- Node.js 22 or newer
- pnpm 11.15.0 through Corepack
- A current Chromium, Firefox, or Safari release

## Local development

```sh
corepack enable
pnpm install
pnpm dev
```

The development server copies the installed FFmpeg browser assets into `public/ffmpeg` before it starts. These generated files are intentionally ignored by Git.

## Quality commands

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
REAL_COMPRESSION=1 pnpm exec playwright test e2e/real-compression.spec.ts
```

`pnpm check` runs formatting, linting, type checks, coverage, and a production build. The optional real compression test generates a tiny video in Chromium and processes it with the deployed WebAssembly engine.

## Architecture

1. The browser reads video metadata through the native video element.
2. Compression settings are converted into a constrained FFmpeg argument list.
3. The selected file is copied into FFmpeg's temporary in-memory file system.
4. FFmpeg processes the file inside web workers.
5. The output becomes a local object URL for preview and download.
6. Temporary FFmpeg files and object URLs are removed when no longer needed.

The app uses the single-thread FFmpeg core because it reliably handles common H.264 inputs across supported browsers. Multi-thread mode remains disabled until upstream WebAssembly worker crashes are resolved and covered by the H.264 regression test.

See [docs/architecture.md](docs/architecture.md) for component boundaries and [docs/operations.md](docs/operations.md) for deployment and troubleshooting.

## Privacy and security

CompressIt has no backend. User videos are never sent over the network by application code. A strict Content Security Policy limits network access to the same origin, and browser capabilities that the product does not need are disabled.

The app still processes untrusted media through FFmpeg. File size is capped at 2 GB, generated paths are controlled by the app, output names are sanitized, and temporary files are deleted after each run. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Browser and resource limits

Browser compression is CPU and memory intensive. A file may occupy several times its on-disk size while being decoded and encoded. Large files can fail when a browser, tab, or device runs out of memory. Mobile devices are particularly constrained. Keep the tab open during compression.

Target-size output is approximate because CompressIt uses a single-pass encode to keep browser processing time reasonable. Unsupported codecs or damaged files can still be rejected by FFmpeg even when the container extension is accepted.

## Deployment

The project is configured for Vercel in `vercel.json`. The production host must preserve these headers:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`

Build with `pnpm build` and publish `dist`. Preview deployments should be smoke-tested before promotion.

## Source license

This repository is currently unlicensed and marked `UNLICENSED`. No permission to copy, modify, or redistribute the source is granted. Third-party software retains its own license terms, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
