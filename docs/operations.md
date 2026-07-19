# Operations

## Build contract

Production builds require Node.js 22 or newer and the pnpm version declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium
pnpm test:e2e
```

The build output is `dist`. The prebuild hook copies the FFmpeg browser assets from the installed package into the public asset tree.

## Deployment

Vercel auto-detects Vite and publishes `dist`. `vercel.json` applies cross-origin isolation and the product security policy.

After every deployment:

1. Confirm the page returns HTTP 200.
2. Confirm COOP is `same-origin` and COEP is `require-corp`.
3. Confirm `window.crossOriginIsolated` is `true`.
4. Select an invalid file and confirm the error is recoverable.
5. Process a short MP4 or WebM and download the result.
6. Confirm the browser reports no uncaught errors or blocked same-origin assets.
7. Reload once, then test the offline app shell in the browser network panel.

## Monitoring

The product has no server runtime and intentionally sends no telemetry. Operational monitoring is limited to Vercel deployment health and synthetic availability checks. Browser defects should be reported with a browser version, device, input container and codecs, and reproducible non-sensitive media.

Do not add session replay, uploaded error attachments, or automatic video metadata reporting without a privacy review and explicit product approval.

## Rollback

If a production smoke test fails, promote the previous known-good Vercel deployment. Do not attempt to repair a failed build in place.

## Troubleshooting

### Multi-thread mode does not start

Check response headers and `window.crossOriginIsolated`. Service workers and embedding contexts can also interfere with isolation. CompressIt should fall back to the single-thread core.

### FFmpeg assets return 404

Run `pnpm prepare:ffmpeg` and confirm the installed package layout still contains `ffmpeg-core.js` and `ffmpeg-core.wasm`.

### A large file crashes the tab

This is usually browser memory exhaustion. Reopen CompressIt, select a shorter or smaller source, close other memory-intensive tabs, or use a desktop FFmpeg installation.

### Output is larger than input

The source may already be efficiently compressed, or the selected quality may be higher than the source. Try a smaller quality preset, a lower resolution, or a target size.

### The PWA does not update

Finish or cancel active compression, accept the update prompt, and reload. If needed, remove the installed app and clear the site's storage.
