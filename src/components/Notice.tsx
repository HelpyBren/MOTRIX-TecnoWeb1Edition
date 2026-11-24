import type { NoticeState } from '../hooks'

export function Notice({ notice }: { notice: NoticeState }) {
  if (!notice) return null
  return (
    <div
      className={`notice notice--${notice.type}`}
      role={notice.type === 'error' ? 'alert' : 'status'}
    >
      {notice.text}
    </div>
  )
}
