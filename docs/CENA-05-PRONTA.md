> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# CENA-05-PRONTA — Cena 3D e Interação Espacial Touch (Onda 2)

**Autor:** Prumo  
**Data:** 28/10/2026  
**Status:** Concluído e verificado (typecheck aprovado em `apps/web`)

---

## 1. Contratos Estabilizados (`contracts/scene-viewer.ts`)

A interface `SceneViewerProps` e tipos associados foram consolidados e estão prontos para consumo por **Trama** (Onda 3):

```typescript
export type CanvasTool = 'select' | 'post' | 'person' | 'belt' | 'area' | 'perimeter';
export type InteractionMode = 'navigate' | 'edit';
export type GridStepMeters = 0.1 | 0.25 | 0.5 | 1 | null;
export type CameraActionType =
  | 'rotate-left'
  | 'rotate-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down'
  | 'center-bounds'
  | 'center-selection'
  | 'reset';
export type FloorProjector = (clientX: number, clientY: number) => PointXZ | null;

export interface AreaWallDistances {
  areaId: string;
  north: number; // +Z
  south: number; // -Z
  east: number;  // +X
  west: number;  // -X
}

export interface SceneViewerProps {
  scene: ProjectScene;
  view?: 'perspective' | 'top';
  className?: string;
  interactionMode?: InteractionMode;
  gridStep?: GridStepMeters;
  onFloorPoint?: (point: PointXZ) => void;
  selection?: EditorSelection | null;
  onSelectEntity?: (selection: EditorSelection | null) => void;
  /** Delta XZ em metros desde o início do arraste; aplicado somente ao soltar. */
  onMoveEntity?: (selection: EditorSelection, delta: PointXZ) => void;
  tool?: CanvasTool;
  cameraAction?: { id: number; type: CameraActionType };
  onRegisterFloorProjector?: (projector: FloorProjector | null) => void;
  placementPreview?: { kind: 'post' | 'person'; point: PointXZ } | null;
  draftArea?: PointXZ[] | null;
  draftBelt?: { fromPostId: string; toPostId: string } | null;
  onAreaDraw?: (start: PointXZ, end: PointXZ) => void;
  onMovePerimeterVertex?: (id: string, position: PointXZ) => void;
  onAppendPerson?: (id: string) => void;
  onAreaDistancesChange?: (distances: AreaWallDistances | null) => void;
  showWalls?: boolean;
}
```

---

## 2. Entregas e Implementações em `apps/web/scene/scene-viewer.tsx`

1. **Separação Navegar vs Editar (`interactionMode`)**:
   - No modo `'navigate'`, arrastes sobre objetos não roubam a câmera; toques acionam seleção, mas o OrbitControls retém pan/orbit/zoom sem travar no primeiro toque.
   - No modo `'edit'`, o arraste de elementos e alças captura o ponteiro (`setPointerCapture`) e suspende o OrbitControls de forma atômica.
2. **Grade Métrica Ajustável (`gridStep`)**:
   - Suporta `0.10m`, `0.25m` (padrão), `0.50m`, `1.0m` e `null` (desligado).
   - O mesmo passo visual da malha é aplicado ao snap de clique no piso, ao desenho de retângulos (`onAreaDraw`) e ao deslocamento transitório durante arraste.
3. **Quatro Distâncias Externas da Área até Paredes**:
   - Quando uma área está selecionada, o componente projeta quatro guias tracejadas com cotas numéricas métricas (Norte, Sul, Leste e Oeste) até as paredes do perímetro retangular.
   - As distâncias também são notificadas à UI via `onAreaDistancesChange(distances)`. Se o perímetro não for ortogonal suportado, exibe apenas a seleção sem inventar medidas.
4. **Controles de Câmera e Recentralização**:
   - Adicionadas ações `'center-bounds'` (recentraliza no centro da planta) e `'center-selection'` (desloca suavemente para a entidade selecionada).
5. **Alvo de Toque e Botão +1**:
   - Sprites de hit testing mantêm alvos touch confortáveis (>= 44 CSS px) em post e person.
   - Botão flutuante `+1` na pessoa selecionada posicionado exatamente na distância de espaçamento métrico (`spacingMeters`), pronto para expansão em cadeia com `onAppendPerson(id)`.
6. **Descarte e Performance Limpa**:
   - Sem bibliotecas Html/Drei pesadas.
   - Texturas de rótulo e geometrias de rascunho são descartadas explicitamente no ciclo de vida (`dispose`).

---

## 3. Verificações Locais Realizadas

- `apps/web/tsconfig.json`: `npx tsc --noEmit --project tsconfig.json` executado com **0 erros**.
- Nenhuma dependência externa ou manifest alterado.
- Documentação sincronizada em `docs/3D-INTERACOES.md`.
