import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

window.addEventListener("error", (event) => {
  console.error("[Desktop Global Error]", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("[Desktop Unhandled Rejection]", event.reason);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

