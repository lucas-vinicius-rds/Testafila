"use client";

import type { ProjectScene } from "@testafila/core/contracts/project";

/** Cópia da assinatura em docs/ondas/status/ONDA-2-retina-interface.md. */
export type ArAssemblyProps = Readonly<{
  initialScene?: ProjectScene | null;
  onComplete: (scene: ProjectScene) => void;
  onUseTypedMeasures: () => void;
  onCancel: () => void;
}>;

/**
 * Único ponto de import da montagem em AR. Enquanto `ar/assembly/ar-assembly.tsx` não existe,
 * importá-lo quebraria o build de todos. Quando existir, trocar este corpo por:
 * dynamic(() => import("../ar/assembly/ar-assembly").then((m) => m.ArAssembly), { ssr: false })
 */
export function ArAssemblySlot({ onUseTypedMeasures, onCancel }: ArAssemblyProps) {
  return (
    <div className="creation-entry-options">
      <p className="creation-entry-note" role="status">A montagem pela câmera ainda não está pronta.</p>
      <button className="button-primary" type="button" onClick={onUseTypedMeasures}>Digitar medidas</button>
      <button className="button-quiet" type="button" onClick={onCancel}>Voltar</button>
    </div>
  );
}
