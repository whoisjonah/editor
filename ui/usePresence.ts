import { useEffect, useState } from 'react'

const EXIT_MS = 170

export function usePresence(open: boolean, ms = EXIT_MS) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  if (open && !mounted) setMounted(true)
  if (open && closing) setClosing(false)
  if (!open && mounted && !closing) setClosing(true)

  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => {
      setMounted(false)
      setClosing(false)
    }, ms)
    return () => clearTimeout(timer)
  }, [closing, ms])

  return { mounted, closing }
}
