"use client";

import {
  ArrowCounterClockwise,
  ArrowClockwise,
} from "@phosphor-icons/react/dist/ssr";

type Props = {
  canUndo: boolean;
  canRedo: boolean;
  changeCount: number;
  onUndo: () => void;
  onRedo: () => void;
};

/**
 * Barra vertical flutuante de desfazer/refazer com ícones Phosphor e aria-labels.
 * Não consome espaço vertical da bandeja. Respeita safe areas e alvos >= 44 px.
 */
export function UndoRedoBar({ canUndo, canRedo, changeCount, onUndo, onRedo }: Props) {
  return (
    <div className="undo-redo-bar" role="toolbar" aria-label="Desfazer e refazer">
      <button
        type="button"
        className="undo-redo-btn"
        onClick={onUndo}
        disabled={!canUndo}
        aria-label="Desfazer última alteração"
        title="Desfazer"
      >
        <ArrowCounterClockwise size={20} weight="bold" aria-hidden="true" />
      </button>
      <span className="undo-redo-count" aria-label={`${changeCount} alterações no histórico`}>
        {changeCount}
      </span>
      <button
        type="button"
        className="undo-redo-btn"
        onClick={onRedo}
        disabled={!canRedo}
        aria-label="Refazer alteração"
        title="Refazer"
      >
        <ArrowClockwise size={20} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
