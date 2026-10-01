import { Component } from 'react'

// Keeps one broken piece from taking the whole screen down (spec-v5 §17.4).
// `fallback` is what to show instead; `onError(error)` lets the caller record it.
export default class ErrorBoundary extends Component {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.error('[ErrorBoundary]', error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
