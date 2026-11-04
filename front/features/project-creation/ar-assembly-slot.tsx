"use client";

import dynamic from "next/dynamic";

/** WebXR só existe no navegador: a montagem nunca entra no HTML do servidor. */
export const ArAssemblySlot = dynamic(
  () => import("../ar/assembly/ar-assembly").then((module) => module.ArAssembly),
  { ssr: false, loading: () => <div className="flow-loading" role="status">Preparando a câmera…</div> },
);
