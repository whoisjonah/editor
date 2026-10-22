import { listSamples } from '@/data/samples'
import { EditorShell } from '@/ui/EditorShell'

export default async function Home() {
  return <EditorShell samples={await listSamples()} />
}
