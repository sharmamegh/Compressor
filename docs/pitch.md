# CompressIt — Pitch & Technical Narrative

**For founders, angels, and technical VCs**

Live product: [compressit-one.vercel.app](https://compressit-one.vercel.app)

---

## 30-second pitch

**CompressIt makes videos smaller without ever uploading them.**

People need to shrink videos for WhatsApp limits, email attachments, course platforms, and social uploads. Today they either:

1. Upload private footage to a cloud compressor they do not trust, or
2. Install desktop software they do not understand.

CompressIt runs a full FFmpeg encode **inside the browser**, on the user’s device. No account. No upload server. No analytics. Privacy is not a policy page — it is the architecture.

---

## One-liner variants

| Audience | Line |
| --- | --- |
| Consumer | “Shrink your video privately — it never leaves your laptop.” |
| Founder / product | “Client-side video compression as a product, not a feature buried in an editor.” |
| Technical VC | “FFmpeg WASM + cross-origin isolation, shipped as a zero-backend PWA with a hard privacy guarantee.” |
| Privacy-focused investor | “The only compression UX where ‘we never see your file’ is cryptographically and architecturally true.” |

---

## The problem

Video is the default content format. File sizes are not.

- Platforms enforce hard upload caps (often 16–100 MB).
- Creators, students, journalists, clinicians, and founders routinely need “good enough, smaller” — not a full NLE.
- Cloud compressors require uploading the source. That is a non-starter for NDAs, patient footage, unreleased product demos, family videos, and anything under legal hold.
- Desktop FFmpeg is powerful and hostile. Most people will not open a terminal to hit a 25 MB limit.

**The gap:** a trustworthy, frictionless compressor that feels like a web app and behaves like local software.

---

## The solution

CompressIt is a privacy-first, installable web app that:

1. Lets the user pick a video from their device
2. Offers quality / resolution / format / approximate target-size controls
3. Encodes with FFmpeg WebAssembly in a worker
4. Hands back a local preview + download

**Product surface (today)**

- MP4 (H.264 + AAC) and WebM (VP9 + Opus)
- Three quality presets + four resolution caps (never upscales)
- Optional approximate target size for platform limits
- Progress, cancel, local preview, download
- Installable PWA with offline app shell
- Responsive, keyboard-accessible UI
- Strict CSP, no accounts, no telemetry, no cookies for tracking

---

## Why this wins the room

### 1. Privacy as a hard guarantee, not a promise

Most “we care about privacy” products still ingest files for processing. CompressIt has **no application backend**. Selected media never leaves the tab by design.

That is a rare claim you can prove in a demo:

- Open DevTools → Network → compress a video → show only same-origin static assets
- Point at COOP/COEP isolation headers and a CSP that blocks outbound exfiltration paths
- Close the tab → working files and object URLs are gone

For enterprise, legal, healthcare-adjacent, and creator workflows under NDA, this is the product.

### 2. Zero marginal cost of compute

Cloud video encoding is expensive (CPU minutes, egress, storage, abuse). CompressIt pushes work to the user’s device. Hosting is static files on Vercel. Gross margin on the core free product approaches 100% after CDN.

That flips the usual SaaS cost curve: **usage can grow without a linear GPU bill**.

### 3. Instant trust loop

No sign-up wall. Drag → compress → download. Time-to-value is seconds. That is how consumer utilities become habit — and how B2B teams evaluate without procurement.

### 4. Technical credibility

This is not a toy wrapper. The product ships production constraints that serious eng teams recognize: self-hosted WASM cores from the lockfile, cross-origin isolation, cancel/cleanup correctness, e2e (including optional real compression), security headers, and a documented failure model for browser memory limits.

---

## How the product works (user story)

Use this as the demo script.

| Step | What the user sees | What is actually happening |
| --- | --- | --- |
| 01 Choose | Drag/drop or file picker | File stays in browser memory as a `File` / Blob. Validation rejects empty, unsupported, or >2 GB files. |
| 02 Inspect | Duration, dimensions, size | Native `<video>` metadata read locally — no server probe. |
| 03 Tune | Quality, resolution, format, optional MB target | Settings map to a constrained FFmpeg argument list (CRF or bitrate, scale filter, codec pair). |
| 04 Compress | Progress + status copy | FFmpeg core loads from same origin into a worker; input is written to an in-memory virtual FS; encode runs locally. |
| 05 Save | Before/after sizes, preview, download | Output bytes become a Blob URL. Temp FFmpeg files deleted in `finally`. Session-only — reload clears state. |

**Talk track:** “Three steps. Zero uploads. The compression engine is FFmpeg — the same family of tools professionals use — running in WebAssembly on this machine.”

---

## Technical deep dive (for technical founders & VCs)

### Architecture in one diagram

```text
Browser tab (cross-origin isolated)
┌──────────────────────────────────────────────────────────┐
│  React UI (stage machine: idle → reading → ready → …)    │
│       │                                                  │
│       ▼                                                  │
│  compression.ts  — validate, metadata, settings → args   │
│       │                                                  │
│       ▼                                                  │
│  ffmpegClient.ts — load WASM core, worker, virtual FS    │
│       │                                                  │
│       ▼                                                  │
│  Local Blob URL → preview + download                     │
└──────────────────────────────────────────────────────────┘
         ▲
         │ static assets only (HTML/JS/WASM/CSS)
         │
   Vercel CDN  (no app server, no media API)
```

### Why WebAssembly FFmpeg matters

- **Proven codec stack:** H.264/AAC for compatibility; VP9/Opus when smaller WebM is preferred.
- **Deterministic pipeline:** Settings → constrained argv → worker `exec` → Blob. No opaque cloud black box.
- **Self-hosted cores:** Build copies exact `@ffmpeg/core` assets from the lockfile into `/ffmpeg` so the engine is same-origin and version-pinned — not loaded from a third-party CDN at runtime.

### Cross-origin isolation (the unglamorous moat)

Modern high-performance WASM (SharedArrayBuffer / threads) requires:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`

CompressIt enforces these in `vercel.json` along with a tight CSP (`connect-src 'self'`, `frame-ancestors 'none'`, no unnecessary permissions). That is infrastructure-level privacy: the browser itself limits where the app can talk.

### Encode strategy (product judgment)

| Choice | Rationale |
| --- | --- |
| Single-pass encode | Two-pass would roughly double wall time in-browser; UX latency matters more than perfect bitrate control. |
| Target size ≈ bitrate from duration − audio | Good enough for upload caps; marketed as approximate on purpose. |
| Never upscale | Resolution presets only downscale; even dimensions for encoder safety. |
| `veryfast` / realtime-ish WebM knobs | Browser CPU is scarce; presets bias toward finishing, not overnight encodes. |
| Cancel = terminate worker + new instance | Clean abort; no zombie encodes holding memory. |

### Trust boundaries & failure model

Be explicit — sophisticated investors respect this.

- **Trust boundary:** the user’s selected media file, processed in a worker.
- **Hard limits:** 2 GB cap; path names controlled by the app; sanitized download names; temp cleanup always.
- **Honest limits:** large files can OOM the tab; mobile is constrained; damaged/unsupported codecs can still fail inside FFmpeg.
- **No telemetry by design:** ops = Vercel deploy health + synthetic checks. Adding session replay or automatic media metadata reporting would require a privacy review — and would weaken the brand.

### Cost & ops model

| Layer | Reality |
| --- | --- |
| Compute | User’s CPU / RAM |
| Storage | Ephemeral, in-tab only |
| Bandwidth | Static assets (+ WASM cache headers) |
| Deploy | Vite → `dist` on Vercel |
| Abuse surface | No upload sink to fill with malware videos |

This is why a free tier can be real, not a loss-leader that bleeds GPU spend.

---

## Market & wedge

**Primary wedge:** privacy-sensitive compression for people who already hate uploading.

**Beachheads (narrative, not claims of traction):**

1. **Creators & freelancers** hitting platform limits before publish
2. **Founders & sales** compressing demo videos under NDA
3. **Education / journalism / field work** on untrusted networks
4. **Power users** who want FFmpeg outcomes without FFmpeg UX

**Category framing:** not “another online converter.” Position as **local media tooling in the browser** — adjacent to privacy browsers, on-device ML, and zero-knowledge workflows.

---

## Business model options (discuss, don’t over-commit)

The current product is free and intentionally telemetry-free. Credible paths:

1. **Pro desktop/PWA features** — batch queues, presets packs, quieter/faster encode modes, watch-folder (still local)
2. **Team / education licensing** — branded offline-capable builds, SSO-free “approved tool” for schools & newsrooms
3. **OEM / embed** — white-label local compressor inside LMS, EHR-adjacent portals, creator suites (API is the WASM client, not a media upload API)
4. **Paid “priority engine” builds** — larger core variants, AV1 when browser-ready, without ever taking custody of files

**What not to sell casually:** a cloud encode fallback. It destroys the brand thesis unless framed as an explicit, separate product with clear custody.

---

## Competitive landscape (how to answer “vs X?”)

| Alternative | Their weakness vs CompressIt |
| --- | --- |
| Cloud compressors (FreeConvert, etc.) | Upload = custody + trust + cost + delay |
| CapCut / Premiere / HandBrake | Heavy, account-y, or expert-only |
| CLI FFmpeg | Maximum power, near-zero mainstream UX |
| OS share-sheet compress | Opaque, limited control, inconsistent across platforms |

**Differentiation sentence:** “We are the trustworthy middle: HandBrake outcomes, consumer web UX, architectural privacy.”

---

## Traction proof you can show today

Do not invent metrics. Show **product proof**:

1. Live URL compresses a short MP4 end-to-end in the room
2. Network panel shows no media upload
3. Before/after size + elapsed time on device
4. Install as PWA / offline shell smoke
5. Engineering bar: typecheck, unit coverage, Playwright e2e, optional `REAL_COMPRESSION=1` WASM path, security headers

---

## Risks & honest answers

| Risk | Straight answer |
| --- | --- |
| “Browsers are too slow / memory-limited.” | True for huge files. We cap at 2 GB, warn at 500 MB, and optimize for the common case: short-to-medium clips people need to upload. Desktop remains the sweet spot; mobile is best-effort. |
| “Can’t you just use a server?” | We could — and then we become every other compressor. The wedge is that we refuse custody. |
| “WASM FFmpeg is niche.” | The dependency is real and battle-tested (`@ffmpeg/*`). We pin and self-host cores; isolation headers are first-class. |
| “Moat?” | Brand trust + UX taste + distribution + eventual embed/OEM. The code can be cloned; the **credible no-upload guarantee + polish** is harder to copy without shipping the same discipline. |
| “Monetization?” | Start free, expand with local-only Pro/team surfaces that never require uploading media. |

---

## Suggested meeting structure (15 minutes)

1. **0:00–1:00** — Problem: upload caps vs private footage  
2. **1:00–3:00** — Live demo on a real file; Network tab proof  
3. **3:00–7:00** — Architecture diagram + why zero-backend = margin + trust  
4. **7:00–11:00** — Beachhead users, business model options, competitive frame  
5. **11:00–15:00** — Ask (pilot users, design partners, or round context) + Q&A  

---

## Closing line

> CompressIt turns FFmpeg into a consumer product without turning users into an upload pipeline.  
> The file never leaves the device. The economics never leave the browser.  
> That is the pitch.

---

## Appendix — process cheat sheet (one slide)

```text
Pick file (local)
  → validate + read metadata in-browser
    → map UI settings → FFmpeg argv
      → write bytes into WASM virtual FS
        → encode in worker (H.264/AAC or VP9/Opus)
          → read output → Blob URL
            → preview / download
              → delete temp files; revoke URLs on reset/unmount
```

**Stack:** React 19 · Vite · TypeScript · `@ffmpeg/ffmpeg` + self-hosted core · vite-plugin-pwa · Vercel static + isolation headers · Vitest · Playwright
