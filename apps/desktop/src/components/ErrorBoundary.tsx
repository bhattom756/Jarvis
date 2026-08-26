import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Desktop ErrorBoundary]", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, background: "#111827", color: "#f3f4f6", fontFamily: "sans-serif", height: "100vh" }}>
          <h2 style={{ color: "#ef4444", marginBottom: 12 }}>Desktop Application Error</h2>
          <p style={{ marginBottom: 16 }}>An unexpected error occurred in the desktop interface.</p>
          <pre style={{ background: "#1f2937", padding: 16, borderRadius: 8, overflowX: "auto", fontSize: 13 }}>
            {this.state.error?.message ?? "Unknown error"}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 20,
              padding: "10px 20px",
              background: "#3b82f6",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
