import { useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'

type IconName = 'grid' | 'plus' | 'upload' | 'download' | 'check' | 'arrow' | 'settings' | 'sheet' | 'key' | 'chart' | 'copy' | 'trash' | 'close' | 'shield'
const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="6" height="6" rx="2" /><rect x="15" y="3" width="6" height="6" rx="2" /><rect x="3" y="15" width="6" height="6" rx="2" /><rect x="15" y="15" width="6" height="6" rx="2" fill="currentColor" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  download: <path d="M12 3v13m-5-5 5 5 5-5M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />,
  check: <path d="m5 12 4 4L19 6" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  settings: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="8" cy="6" r="2" fill="currentColor" /><circle cx="16" cy="12" r="2" fill="currentColor" /><circle cx="10" cy="18" r="2" fill="currentColor" /></>,
  sheet: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  key: <><circle cx="8" cy="9" r="5" /><path d="m12 13 8 8m-4-4 3-3m-6 0 3-3" /></>,
  chart: <path d="M4 3v18h17M8 16v-5m5 5V6m5 10V9" />,
  copy: <><rect x="8" y="8" width="12" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
}

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  const id = useId()
  useEffect(() => {
    const dialog = ref.current!
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      previous?.focus()
    }
  }, [])
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={id} onCancel={(event) => { event.preventDefault(); onClose() }}>
    <div className="modal-heading"><h2 id={id}>{title}</h2><button className="icon-button" type="button" aria-label="閉じる" onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>
}

export function ErrorNotice({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  return <div className="notice error-notice" role="alert"><div><strong>内容を確認してください</strong><p className="multiline">{message}</p></div>{onDismiss && <button className="icon-button" aria-label="エラーを閉じる" onClick={onDismiss}><Icon name="close" /></button>}</div>
}
