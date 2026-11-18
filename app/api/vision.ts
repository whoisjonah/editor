import { env, pipeline, RawImage, Sam2Model, Sam2Processor, type DepthEstimationPipeline, type ObjectDetectionPipeline, type Tensor } from '@huggingface/transformers'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'

env.cacheDir = path.join(tmpdir(), 'transformers')

export type Box = [number, number, number, number]

export type Prompt = { box: Box } | { point: [number, number] }

const SAM = 'onnx-community/sam2.1-hiera-base-plus-ONNX'

function once<T>(load: () => Promise<T>) {
  let pending: Promise<T> | null = null
  return () =>
    (pending ??= load().catch((error) => {
      pending = null
      throw error
    }))
}

export const loadScene = once(() =>
  Promise.all([
    pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', { dtype: 'q8' }) as Promise<DepthEstimationPipeline>,
    pipeline('object-detection', 'onnx-community/rtdetr_r18vd', { dtype: 'q8' }) as Promise<ObjectDetectionPipeline>,
  ]),
)

const loadSam = once(() => Promise.all([Sam2Model.from_pretrained(SAM, { dtype: 'fp16' }) as Promise<Sam2Model>, Sam2Processor.from_pretrained(SAM) as Promise<Sam2Processor>]))

let last: { key: string; image: RawImage; embeddings: Record<string, Tensor> } | null = null

async function embed(blob: Blob) {
  const key = createHash('sha1').update(Buffer.from(await blob.arrayBuffer())).digest('hex')
  if (last?.key === key) return last
  const [model, processor] = await loadSam()
  const image = await RawImage.fromBlob(blob)
  last = { key, image, embeddings: await model.get_image_embeddings(await processor(image)) }
  return last
}

export async function segment(blob: Blob, prompts: Prompt[]) {
  const [model, processor] = await loadSam()
  const { image, embeddings } = await embed(blob)
  const { width, height } = image
  const masks: string[] = []
  for (const prompt of prompts) {
    const inputs = await processor(
      image,
      'box' in prompt
        ? { input_boxes: [[[prompt.box[0] * width, prompt.box[1] * height, prompt.box[2] * width, prompt.box[3] * height]]] }
        : { input_points: [[[[prompt.point[0] * width, prompt.point[1] * height]]]], input_labels: [[[1]]] },
    )
    const { pred_masks, iou_scores } = await model({ ...embeddings, ...inputs })
    const [mask] = await processor.post_process_masks(pred_masks, inputs.original_sizes, inputs.reshaped_input_sizes, { binarize: false })
    const scores = iou_scores.data as Float32Array
    const size = width * height
    const candidates = Array.from(scores, (score, i) => ({ score, logits: (mask.data as Float32Array).subarray(i * size, (i + 1) * size) }))
    const confident = candidates.filter(({ score }) => score >= Math.max(...scores) - 0.02)
    const area = (logits: Float32Array) => logits.reduce((sum, v) => sum + (v > 0 ? 1 : 0), 0)
    const { logits } = confident.reduce((a, b) => (area(b.logits) > area(a.logits) ? b : a))
    const alpha = Uint8ClampedArray.from(logits, (v) => 255 / (1 + Math.exp(-v)))
    const png = await new RawImage(alpha, width, height, 1).toSharp().png().toBuffer()
    masks.push(`data:image/png;base64,${png.toString('base64')}`)
  }
  return masks
}
