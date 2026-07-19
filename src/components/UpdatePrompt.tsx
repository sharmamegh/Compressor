import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <aside className="update-toast" aria-label="App update available">
      <div>
        <strong>A better CompressIt is ready.</strong>
        <p>Refresh when you are not compressing a video.</p>
      </div>
      <div className="update-toast__actions">
        <button
          className="button button--small button--primary"
          onClick={() => void updateServiceWorker(true)}
          type="button"
        >
          Refresh
        </button>
        <button
          className="button button--small button--quiet"
          onClick={() => setNeedRefresh(false)}
          type="button"
        >
          Later
        </button>
      </div>
    </aside>
  )
}
