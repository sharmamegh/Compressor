# Third-party notices

CompressIt includes and depends on open-source software. Each dependency remains subject to its own license.

Key runtime components:

- `@ffmpeg/core`, licensed under GPL 2.0 or later. The corresponding source is available from the [ffmpeg.wasm repository](https://github.com/ffmpegwasm/ffmpeg.wasm) and is pinned by `pnpm-lock.yaml`.
- FFmpeg and its included codecs, licensed under the terms reported by the packaged core build
- `@ffmpeg/ffmpeg` and `@ffmpeg/util`, licensed under MIT
- React and React DOM, licensed under MIT
- Vite and vite-plugin-pwa, licensed under MIT
- Workbox, licensed under Apache 2.0

The complete installed dependency tree and exact versions are recorded in `pnpm-lock.yaml`. Production maintainers must review dependency licenses before every public release and retain all notices and source obligations required by included codec builds.
