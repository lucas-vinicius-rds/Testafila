"use client";

import dynamic from "next/dynamic";
import { Component, useState, type ReactNode } from "react";
import type { SceneViewerProps } from "@testafila/core/contracts/scene-viewer";

const SceneViewer = dynamic<SceneViewerProps>(() => import("./scene-viewer"), {
  ssr: false,
  loading: () => <div className="scene-loading" role="status">Preparando a visualização 3D…</div>,
});

type BoundaryProps = {
  children: ReactNode;
  onRetry: () => void;
};

class SceneViewerBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="scene-unavailable" role="status">
          <p>A visualização 3D está indisponível. Seus dados permanecem preservados.</p>
          <button className="button-secondary" type="button" onClick={this.props.onRetry}>Tentar abrir a visualização</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ScenePreview(props: SceneViewerProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <div className="scene-frame">
      <SceneViewerBoundary key={attempt} onRetry={() => setAttempt((current) => current + 1)}>
        <SceneViewer {...props} className="scene-canvas" />
      </SceneViewerBoundary>
    </div>
  );
}
