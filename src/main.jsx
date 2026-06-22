import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { clearState } from "./storage.js";
import "open-dyslexic/open-dyslexic-regular.css";
import "./styles.css";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-error">
          <h1>Peer could not start</h1>
          <p>{this.state.error.message}</p>
          <button onClick={() => {
            clearState().finally(() => window.location.reload());
          }}>
            Reset local app state
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
