import { copyFile, mkdir, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const publicRoot = new URL('../public/ffmpeg/', import.meta.url)

async function copyCore(packageName, target, files) {
  const packageEntry = require.resolve(packageName)
  const packageRoot = dirname(dirname(dirname(packageEntry)))
  const sourceDirectory = join(packageRoot, 'dist', 'esm')
  const targetDirectory = new URL(`${target}/`, publicRoot)

  await mkdir(targetDirectory, { recursive: true })
  await Promise.all(
    files.map((file) =>
      copyFile(join(sourceDirectory, file), new URL(file, targetDirectory)),
    ),
  )
}

await rm(publicRoot, { recursive: true, force: true })
await copyCore('@ffmpeg/core', 'single', ['ffmpeg-core.js', 'ffmpeg-core.wasm'])

console.log('FFmpeg browser assets are ready.')
