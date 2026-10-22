import type { ComponentType, ReactNode } from 'react'

type PanelProps = {
  title: ReactNode
  icon?: ComponentType<{ size?: number; stroke?: number; className?: string }>
  actions?: ReactNode
  className?: string
  bodyClassName?: string
  children?: ReactNode
}

export function Panel({ title, icon: Icon, actions, className = '', bodyClassName = 'px-3 pb-3', children }: PanelProps) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-2xl border border-app-line bg-app-panel shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${className}`}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-app-line/70 px-4 text-[13px] font-medium text-app-text">
        {Icon && <Icon size={15} stroke={1.75} className="text-app-dim" />}
        <span className="truncate">{title}</span>
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      <div className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto pt-3 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-app-line/70 bg-white/[0.02] ${className}`}>{children}</div>
}

export function Heading({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mt-5 mb-2 flex items-center gap-2">
      <h3 className="text-xs font-medium text-app-dim">{children}</h3>
      {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
    </div>
  )
}
