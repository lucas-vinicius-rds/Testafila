"use client";

import { useState } from "react";
import {
  GearSix,
  GridFour,
  NavigationArrow,
  X,
} from "@phosphor-icons/react/dist/ssr";

export type GridStep = 0.10 | 0.25 | 0.50 | 1 | null;
export type NavigationMode = "navigate" | "edit";

type Props = {
  gridStep: GridStep;
  navigationMode: NavigationMode;
  onGridStepChange: (step: GridStep) => void;
  onNavigationModeChange: (mode: NavigationMode) => void;
  onClose: () => void;
};

const gridOptions: { value: GridStep; label: string }[] = [
  { value: 0.10, label: "0,10 m" },
  { value: 0.25, label: "0,25 m" },
  { value: 0.50, label: "0,50 m" },
  { value: 1, label: "1 m" },
  { value: null, label: "Desligado" },
];

/**
 * Painel de configurações funcionais: grade e modo de navegação.
 * Sem tela decorativa, conta simulada ou reescrita de backend.
 */
export function SettingsPanel({ gridStep, navigationMode, onGridStepChange, onNavigationModeChange, onClose }: Props) {
  return (
    <section className="settings-panel" aria-label="Configurações do editor">
      <div className="settings-header">
        <h2>
          <GearSix size={20} weight="duotone" aria-hidden="true" />
          Configurações
        </h2>
        <button type="button" className="button-quiet settings-close" onClick={onClose} aria-label="Fechar configurações">
          <X size={18} weight="bold" aria-hidden="true" />
        </button>
      </div>

      <fieldset className="settings-group">
        <legend>
          <GridFour size={18} weight="duotone" aria-hidden="true" />
          Grade de referência
        </legend>
        <div className="settings-options" role="radiogroup" aria-label="Passo da grade">
          {gridOptions.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={gridStep === opt.value}
              className={`settings-option${gridStep === opt.value ? " active" : ""}`}
              onClick={() => onGridStepChange(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="settings-hint">O passo da grade é aplicado na visualização. Não altera geometrias já salvas.</p>
      </fieldset>

      <fieldset className="settings-group">
        <legend>
          <NavigationArrow size={18} weight="duotone" aria-hidden="true" />
          Modo de interação
        </legend>
        <div className="settings-options" role="radiogroup" aria-label="Modo de navegação">
          <button
            type="button"
            role="radio"
            aria-checked={navigationMode === "navigate"}
            className={`settings-option${navigationMode === "navigate" ? " active" : ""}`}
            onClick={() => onNavigationModeChange("navigate")}
          >
            Navegar
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={navigationMode === "edit"}
            className={`settings-option${navigationMode === "edit" ? " active" : ""}`}
            onClick={() => onNavigationModeChange("edit")}
          >
            Editar
          </button>
        </div>
        <p className="settings-hint">Navegar permite mover a câmera livremente. Editar ativa a seleção e posicionamento de objetos.</p>
      </fieldset>
    </section>
  );
}
