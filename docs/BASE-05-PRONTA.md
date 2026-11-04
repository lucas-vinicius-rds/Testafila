> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Status Onda 1: Base e Contratos Prontos (Cedro)

Data de congelamento: 2026-10-28
Responsável: Cedro (Domínio de filas, contratos base/queue e API)
Escopo: `contracts/project.ts`, `contracts/queue-editor.ts`, `src/domain/queue/**`, `apps/api/**`, `tests/domain/queue/**`

---

## 1. Contratos Congelados

### `contracts/project.ts`
- **PersonPlacement**:
  ```ts
  export interface PersonPlacement {
    id: EntityId;
    routeId: EntityId | null;
    distanceAlongRouteMeters: Meters | null;
    position: PointXZ;
    yawRadians: number;
  }
  ```
  - `routeId === null` e `distanceAlongRouteMeters === null` representam a colocação visual livre/conectada por +1.
  - Para percurso legado (`routeId: string`, `distanceAlongRouteMeters: number`), a posição e o yaw continuam sendo derivados do percurso e validados no servidor.
  - Estado assimétrico (`null` em apenas um dos campos) é rejeitado pelo schema Zod (`apps/api/src/projects/validation.ts`) e pela validação de domínio (`validateQueueScene`).

### `contracts/queue-editor.ts`
Comandos congelados da fila e do ambiente:
```ts
export type QueueCommand =
  | { type: 'environment:vertex-move'; id: EntityId; position: PointXZ }
  | { type: 'environment:confirm'; confirmedAt: string }
  | { type: 'area:add'; area: RestrictedArea }
  | { type: 'area:update'; area: RestrictedArea }
  | { type: 'area:remove'; id: EntityId }
  | { type: 'post:add'; post: Stanchion }
  | { type: 'post:move'; id: EntityId; position: PointXZ }
  | { type: 'post:remove'; id: EntityId }
  | { type: 'belt:add'; belt: Belt }
  | { type: 'belt:remove'; id: EntityId }
  | { type: 'route:set'; route: QueueRoute }
  | { type: 'route:remove'; id: EntityId }
  | { type: 'people:add'; routeId: EntityId; id: EntityId }
  | { type: 'people:fill'; routeId: EntityId; idPrefix: string }
  | { type: 'person:remove'; id: EntityId }
  | { type: 'person:add'; person: PersonPlacement }
  | { type: 'person:move'; id: EntityId; position: PointXZ }
  | { type: 'person:rotate'; id: EntityId; yawRadians: number }
  | { type: 'person:append'; sourceId: EntityId; id: EntityId }
  | { type: 'people:clear'; routeId?: EntityId }
  | { type: 'simulation:spacing'; spacingMeters: number };
```

---

## 2. Comportamento do Domínio e API

1. **Postes e Fitas**:
   - Um poste aceita múltiplas fitas conectadas a outros postes sem restrição de grau, desde que as fitas não sejam duplicadas (mesmo sentido ou inverso `A-B` / `B-A`), não cruzem paredes, áreas restritas nem atravessem o corpo de terceiros postes.
   - A remoção de um poste remove em cascata atômica todas as fitas conectadas a ele.

2. **Pessoas Livres e Encadeamento (+1)**:
   - `person:add`: posiciona a primeira pessoa no ponto fornecido com `yawRadians: 0` voltada para `+Z` e `routeId: null`, `distanceAlongRouteMeters: null`.
   - `person:append`: cria a próxima pessoa atrás da pessoa de referência usando `source.position - (sin(yaw), cos(yaw)) * spacingMeters`, copiando o `yawRadians` da origem. Em caso de colisão ou saída do perímetro, a operação é rejeitada atomicamente sem mutação do estado anterior.
   - `person:move` e `person:rotate`: ajustam posição ou ângulo de uma pessoa existente.
   - `person:remove`: remove a pessoa indicada mantendo as demais posições íntegras.

3. **Espaçamento e Compatibilidade**:
   - `simulation:spacing`: aceita valores `0.5`, `0.8` e `1.0` m. Redistribui pessoas de percurso legado até a capacidade geométrica. Pessoas livres permanecem na cena em suas posições e o novo espaçamento passa a reger os próximos appends.
   - Projetos antigos com percursos e pessoas legadas continuam sendo carregados e salvos sem perda silenciosa.

---

## 3. Verificações Executadas

- **Build e Typecheck da API**:
  - `npm run typecheck:api` aprovado (TypeScript 0 erros).
  - `npm run build:api` aprovado (`tsc` gerado sem erros).
- **Testes de Integração da API**:
  - `npm run test:api` aprovado (10/10 testes passando, cobrindo persistência Nest, migrações, Better Auth, validação de cena com pessoas livres, comandos de fila e reinicialização).
- **Testes de Domínio**:
  - 125/125 testes passando em 20 suítes (`tests/domain/*.test.ts` e `tests/domain/queue/queue.test.ts`), cobrindo:
    - Geometria e polígonos côncavos.
    - Footprint, folga e tangência.
    - Postes, conexões de fitas, remoção atômica e detecção de colisões.
    - Preenchimento e limites de pessoas (até 10.000 pessoas).
    - Comandos de pessoas livres, rotação, movimento e append (+1).
    - Ajustes de perímetro (`environment:vertex-move`) e confirmação (`environment:confirm`).
    - Desfazer e refazer (histórico limitado a 100 ações).
- **Formatação**:
  - `git diff --check` sem erros no escopo de Cedro.
