import { fill, type FillJob } from './fill'

self.onmessage = (event: MessageEvent<FillJob & { id: number }>) => {
  const { id, ...job } = event.data
  const pixels = fill(job)
  self.postMessage({ id, pixels }, { transfer: [pixels.buffer] })
}
