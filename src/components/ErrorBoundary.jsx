import { Component } from "react";
import { T } from "../data/constants.js";

/**
 * ErrorBoundary — catches render errors in any child view.
 * Prevents a single crashing component from taking down the whole app.
 *
 * Usage:
 *   <ErrorBoundary name="CloudHealth">
 *     <CloudHealthView />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In production a real logger (Sentry, Datadog RUM, etc.) would go here
    console.error(`[ErrorBoundary][${this.props.name ?? "unknown"}]`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const name = this.props.name ?? "This view";
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 12, padding: 48,
        color: T.muted, textAlign: "center",
      }}>
        <div style={{ fontSize: 36 }}>⚠️</div>
        <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{name} crashed</div>
        <div style={{ fontSize: 12, color: T.muted, maxWidth: 420 }}>
          {this.state.error.message}
        </div>
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            marginTop: 8, padding: "6px 18px", fontSize: 12,
            background: T.accent, color: "#fff", border: "none",
            borderRadius: 6, cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    );
  }
}
