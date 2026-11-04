"use client";

import { useState, type ReactNode } from "react";
import type { Belt, PersonPlacement, ProjectScene, RestrictedArea, Stanchion } from "@testafila/core/contracts/project";
import type { AreaWallDistances } from "@testafila/core/contracts/scene-viewer";
import { ArrowsClockwise, ArrowsCounterClockwise, ArrowsOutCardinal, Info, Plus, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { ItemThumbnail } from "./item-thumbnail";

const ROTATION_STEP = Math.PI / 12;

function formatMeters(value: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(value);
}

function Panel({ label, kind, title, subtitle, onClose, children }: { label: string; kind: "post" | "person" | "belt" | "area"; title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return (
    <section className="selected-item-panel" aria-label={label}>
      <div className="selected-item-title">
        <ItemThumbnail kind={kind} />
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="button-quiet close-inspector-btn" onClick={onClose} aria-label="Desmarcar seleção" title="Fechar">
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      </div>
      {children}
    </section>
  );
}

function Note({ children }: { children: ReactNode }) {
  return (
    <p className="belt-restriction-notice">
      <Info size={16} weight="duotone" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function MoveButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button className="button-secondary" type="button" onClick={onToggle} aria-pressed={active}>
      <ArrowsOutCardinal size={16} weight="bold" aria-hidden="true" />
      <span>{active ? "Toque no piso para mover" : "Mover"}</span>
    </button>
  );
}

function RotateButtons({ onRotate }: { onRotate: (radians: number) => void }) {
  return (
    <>
      <button className="button-secondary" type="button" onClick={() => onRotate(-ROTATION_STEP)}>
        <ArrowsCounterClockwise size={16} weight="bold" aria-hidden="true" />
        <span>Girar −15°</span>
      </button>
      <button className="button-secondary" type="button" onClick={() => onRotate(ROTATION_STEP)}>
        <ArrowsClockwise size={16} weight="bold" aria-hidden="true" />
        <span>Girar +15°</span>
      </button>
    </>
  );
}

function DeleteAction({ label, question, onConfirm }: { label: string; question: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <button className="queue-danger-button" type="button" onClick={() => setConfirming(true)}>
        <Trash size={16} weight="bold" aria-hidden="true" />
        <span>{label}</span>
      </button>
    );
  }
  return (
    <div className="destructive-confirm-group">
      <span>{question}</span>
      <button className="queue-danger-button confirm-del-btn" type="button" onClick={onConfirm}>Confirmar</button>
      <button className="button-quiet" type="button" onClick={() => setConfirming(false)}>Cancelar</button>
    </div>
  );
}

type Common = { onClose: () => void; onDelete: () => void };

export function PersonInspector({ person, scene, moveActive, onToggleMove, onRotate, onAppend, onClose, onDelete }: Common & {
  person: PersonPlacement;
  scene: ProjectScene;
  moveActive: boolean;
  onToggleMove: () => void;
  onRotate: (radians: number) => void;
  onAppend: () => void;
}) {
  const index = scene.queue.personIds.indexOf(person.id);
  const inChain = index >= 0;
  const spacing = formatMeters(scene.simulation.spacingMeters);
  const note = !inChain
    ? "Pessoa solta de um projeto antigo. Use Ligar fila para deixar todas interligadas."
    : index === 0
      ? "Mover leva a fila inteira. Girar vira a fila em torno desta pessoa."
      : `Fica sempre a ${spacing} m da pessoa da frente: ao mover, ela anda em volta dessa pessoa, e quem vem atrás acompanha.`;
  return (
    <Panel
      label="Pessoa selecionada"
      kind="person"
      title={inChain ? `${index + 1}ª pessoa da fila` : "Pessoa"}
      subtitle={`Virada para ${Math.round((person.yawRadians * 180) / Math.PI)}°`}
      onClose={onClose}
    >
      <Note>{note}</Note>
      <div className="selected-item-actions">
        <MoveButton active={moveActive} onToggle={onToggleMove} />
        <RotateButtons onRotate={onRotate} />
        {inChain && (
          <button className="button-primary add-person-chain-btn" type="button" onClick={onAppend} aria-label="Acrescentar uma pessoa no fim da fila">
            <Plus size={18} weight="bold" aria-hidden="true" />
            <span>+1 no fim da fila</span>
          </button>
        )}
        <DeleteAction label="Apagar" question={inChain ? "Remover? Quem vem atrás avança." : "Remover esta pessoa?"} onConfirm={onDelete} />
      </div>
    </Panel>
  );
}

export function PostInspector({ moveActive, onToggleMove, onConnect, onClose, onDelete }: Common & { post: Stanchion; moveActive: boolean; onToggleMove: () => void; onConnect: () => void }) {
  return (
    <Panel label="Poste selecionado" kind="post" title="Poste" subtitle="Aceita fitas de vários lados" onClose={onClose}>
      <Note>O poste é redondo, então girar não muda nada.</Note>
      <div className="selected-item-actions">
        <MoveButton active={moveActive} onToggle={onToggleMove} />
        <button className="button-secondary" type="button" onClick={onConnect}>
          <Plus size={16} weight="bold" aria-hidden="true" />
          <span>Ligar fita</span>
        </button>
        <DeleteAction label="Apagar poste" question="Remover poste e fitas ligadas?" onConfirm={onDelete} />
      </div>
    </Panel>
  );
}

export function BeltInspector({ onClose, onDelete }: Common & { belt: Belt }) {
  return (
    <Panel label="Fita selecionada" kind="belt" title="Fita entre postes" subtitle="Acompanha os dois postes" onClose={onClose}>
      <Note>Para mover ou girar a fita, mova os postes ligados a ela.</Note>
      <div className="selected-item-actions">
        <DeleteAction label="Apagar fita" question="Remover esta fita?" onConfirm={onDelete} />
      </div>
    </Panel>
  );
}

export function AreaInspector({ area, distances, moveActive, onToggleMove, onRotate, onClose, onDelete }: Common & {
  area: RestrictedArea;
  distances: AreaWallDistances | null;
  moveActive: boolean;
  onToggleMove: () => void;
  onRotate: (radians: number) => void;
}) {
  return (
    <Panel label="Área restrita selecionada" kind="area" title={area.name} subtitle="Obstáculo para fila e fitas" onClose={onClose}>
      {distances?.areaId === area.id ? (
        <div className="area-wall-metrics" aria-label="Distâncias até paredes externas">
          <h4>Distâncias até as paredes</h4>
          <div className="metrics-grid">
            <div><span>Norte</span><strong>{formatMeters(distances.north)} m</strong></div>
            <div><span>Sul</span><strong>{formatMeters(distances.south)} m</strong></div>
            <div><span>Leste</span><strong>{formatMeters(distances.east)} m</strong></div>
            <div><span>Oeste</span><strong>{formatMeters(distances.west)} m</strong></div>
          </div>
        </div>
      ) : (
        <Note>Distâncias até as paredes indisponíveis: só são medidas em planta retangular.</Note>
      )}
      <div className="selected-item-actions">
        <MoveButton active={moveActive} onToggle={onToggleMove} />
        <RotateButtons onRotate={onRotate} />
        <DeleteAction label="Apagar área" question="Remover esta área?" onConfirm={onDelete} />
      </div>
    </Panel>
  );
}

export function RouteInspector({ onClose, onDelete }: Common) {
  return (
    <section className="selected-item-panel" aria-label="Percurso selecionado">
      <div className="selected-item-title">
        <div>
          <h3>Percurso antigo</h3>
          <p>Vem de um projeto anterior e só pode ser apagado.</p>
        </div>
        <button type="button" className="button-quiet close-inspector-btn" onClick={onClose} aria-label="Desmarcar seleção" title="Fechar">
          <X size={16} weight="bold" aria-hidden="true" />
        </button>
      </div>
      <div className="selected-item-actions">
        <DeleteAction label="Apagar percurso" question="Remover este percurso?" onConfirm={onDelete} />
      </div>
    </section>
  );
}
