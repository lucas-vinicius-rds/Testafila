"use client";

import { useMemo } from "react";
import {
  buildQueueTemplate,
  defaultQueueTemplate,
  QUEUE_TEMPLATE_LIMITS,
  QUEUE_TEMPLATES,
  type QueueTemplateKind,
  type QueueTemplateParams,
} from "@testafila/core/domain/queue/templates";
import { ArrowClockwise, ArrowCounterClockwise, Check } from "@phosphor-icons/react/dist/ssr";

type Props = {
  params: QueueTemplateParams;
  /** Só aparece quando a planta ainda não tem fila. */
  canFill: boolean;
  fill: boolean;
  error: string;
  peopleCount: number;
  onChange: (params: QueueTemplateParams) => void;
  onFillChange: (fill: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

let thumbId = 0;
const thumbIds = (prefix: string) => `${prefix}-thumb-${thumbId++}`;

/** Desenha o modelo com o próprio gerador: a miniatura é o que vai para a planta. */
function TemplateThumbnail({ kind }: { kind: QueueTemplateKind }) {
  const lines = useMemo(() => {
    const layout = buildQueueTemplate(defaultQueueTemplate(kind, { x: 0, z: 0 }), thumbIds);
    const byId = new Map(layout.posts.map((post) => [post.id, post.position]));
    const segments = layout.belts.map((belt) => [byId.get(belt.fromPostId)!, byId.get(belt.toPostId)!]);
    const xs = layout.posts.map((p) => p.position.x); const zs = layout.posts.map((p) => p.position.z);
    const minX = Math.min(...xs); const minZ = Math.min(...zs);
    const span = Math.max(Math.max(...xs) - minX, Math.max(...zs) - minZ, 1);
    const scale = 40 / span;
    const offsetX = (48 - (Math.max(...xs) - minX) * scale) / 2; const offsetZ = (48 - (Math.max(...zs) - minZ) * scale) / 2;
    const map = (p: { x: number; z: number }) => ({ x: offsetX + (p.x - minX) * scale, y: offsetZ + (p.z - minZ) * scale });
    return { segments: segments.map(([a, b]) => [map(a), map(b)]), head: map(layout.head.position) };
  }, [kind]);
  return (
    <svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true" className="template-thumb">
      {lines.segments.map(([a, b], index) => <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />)}
      <circle cx={lines.head.x} cy={lines.head.y} r={2.6} />
    </svg>
  );
}

function NumberField({ label, value, limits, step, onChange }: { label: string; value: number; limits: { min: number; max: number }; step: number; onChange: (value: number) => void }) {
  return (
    <label className="template-field">
      <span>{label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={limits.min}
        max={limits.max}
        step={step}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value.replace(",", "."));
          if (Number.isFinite(next)) onChange(Math.min(limits.max, Math.max(limits.min, next)));
        }}
      />
    </label>
  );
}

export function QueueTemplatePanel({ params, canFill, fill, error, peopleCount, onChange, onFillChange, onConfirm, onCancel }: Props) {
  const set = (patch: Partial<QueueTemplateParams>) => onChange({ ...params, ...patch });
  return (
    <div className="template-panel" role="group" aria-label="Modelo de fila">
      <div className="template-kinds" role="radiogroup" aria-label="Tipo de fila">
        {QUEUE_TEMPLATES.map((template) => (
          <button
            key={template.kind}
            type="button"
            role="radio"
            aria-checked={params.kind === template.kind}
            className={params.kind === template.kind ? "template-kind active" : "template-kind"}
            onClick={() => onChange({ ...defaultQueueTemplate(template.kind, params.center), rotationRadians: params.rotationRadians, corridorWidthMeters: params.corridorWidthMeters })}
            title={template.description}
          >
            <TemplateThumbnail kind={template.kind} />
            <span>{template.label}</span>
          </button>
        ))}
      </div>

      <div className="template-fields">
        <NumberField label={params.kind === "l" ? "1ª perna (m)" : "Raia (m)"} value={params.laneLengthMeters} limits={QUEUE_TEMPLATE_LIMITS.laneLengthMeters} step={0.5} onChange={(laneLengthMeters) => set({ laneLengthMeters })} />
        {params.kind === "l" && <NumberField label="2ª perna (m)" value={params.secondLegMeters} limits={QUEUE_TEMPLATE_LIMITS.secondLegMeters} step={0.5} onChange={(secondLegMeters) => set({ secondLegMeters })} />}
        <NumberField label="Corredor (m)" value={params.corridorWidthMeters} limits={QUEUE_TEMPLATE_LIMITS.corridorWidthMeters} step={0.1} onChange={(corridorWidthMeters) => set({ corridorWidthMeters })} />
        {params.kind === "zigzag" && <NumberField label="Raias" value={params.lanes} limits={QUEUE_TEMPLATE_LIMITS.lanes} step={1} onChange={(lanes) => set({ lanes: Math.round(lanes) })} />}
      </div>

      <div className="template-rotate">
        <span>Toque no piso para mudar o lugar.</span>
        <button type="button" className="button-secondary" aria-label="Girar 90 graus para a esquerda" onClick={() => set({ rotationRadians: params.rotationRadians - Math.PI / 2 })}>
          <ArrowCounterClockwise size={16} aria-hidden="true" /> 90°
        </button>
        <button type="button" className="button-secondary" aria-label="Girar 90 graus para a direita" onClick={() => set({ rotationRadians: params.rotationRadians + Math.PI / 2 })}>
          <ArrowClockwise size={16} aria-hidden="true" /> 90°
        </button>
      </div>

      {canFill && (
        <label className="template-fill">
          <input type="checkbox" checked={fill} onChange={(event) => onFillChange(event.target.checked)} />
          Colocar pessoas na fila{fill && peopleCount > 0 ? ` (${peopleCount})` : ""}
        </label>
      )}

      {error && <p className="queue-error" role="alert">{error}</p>}

      <div className="template-actions">
        <button className="button-primary" type="button" onClick={onConfirm} disabled={Boolean(error)}>
          <Check size={16} weight="bold" aria-hidden="true" />
          <span>Usar modelo</span>
        </button>
        <button className="button-quiet" type="button" onClick={onCancel}>Cancelar</button>
      </div>
      <p className="tool-hint">Depois de usar, ajuste postes e fitas como qualquer outro item.</p>
    </div>
  );
}
