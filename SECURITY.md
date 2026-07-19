# Security policy

## Supported version

Only the latest production deployment and the current `main` branch are supported with security fixes.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting feature for this repository and include:

- The affected page or source area
- Steps to reproduce
- Expected and observed behavior
- Browser and operating system versions
- Any proof of concept that does not contain private user media

You should receive an acknowledgement within three business days. A remediation timeline will follow after the report is reproduced and assessed.

## Security model

CompressIt is a static browser application with no application backend. It does not intentionally transmit selected media, account data, or usage telemetry.

The main trust boundary is the media file selected by the user. It is passed to FFmpeg WebAssembly in a web worker. The app restricts file size, controls temporary paths and command arguments, sanitizes download names, applies a strict Content Security Policy, and cleans up temporary files.

Browser resource exhaustion remains possible with sufficiently complex media. Users should close the tab if a file consumes unexpected resources. Sensitive videos should only be processed on trusted devices and browsers.
