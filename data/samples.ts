import { readdir } from 'node:fs/promises'
import path from 'node:path'

export type Sample = { url: string; name: string }

const IMAGE = /\.(png|jpe?g|webp)$/i

export async function listSamples(): Promise<Sample[]> {
  try {
    const files = await readdir(path.join(process.cwd(), 'public', 'samples'))
    return files
      .filter((f) => IMAGE.test(f))
      .map((f) => ({ url: `/samples/${encodeURIComponent(f)}`, name: f.replace(IMAGE, '') }))
      .sort((a, b) => a.name.localeCompare(b.name))
  } catch {
    return []
  }
}
