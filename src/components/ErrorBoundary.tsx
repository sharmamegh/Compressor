import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('CompressIt encountered an unexpected error.', error, info)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="fatal-error">
          <div className="fatal-error__card">
            <span className="eyebrow">Something went wrong</span>
            <h1>CompressIt needs a fresh start.</h1>
            <p>
              Your video stayed on this device. Reload the page to try again.
            </p>
            <button
              className="button button--primary"
              onClick={() => window.location.reload()}
              type="button"
            >
              Reload CompressIt
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
