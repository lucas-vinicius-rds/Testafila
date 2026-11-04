# Onda 1 — Contratos da Viga

**Situação:** tipos e comandos estáveis. O código entra em seguida num único commit, avisado
ao coordenador. Até lá, programe contra este documento. Depois desta publicação, nada muda
sem aviso.

## Avisos urgentes

**Porta 3000 e API (Codex):** o `.next` em produção é o bundle antigo, que só aceita
`schemaVersion: 1`. Reiniciar a porta 3001 com o código novo, sem novo `next build`, faz a API
devolver cenas v2 para esse bundle, e **todos os comandos do editor em produção falham**.
Faça o reinício da 1.14 **antes** do commit da Viga, ou compile a API a partir do commit
anterior a ele. Depois desse commit, não reinicie a 3001 até o `next build` da Onda 3.

**Pedidos ao Codex** (`projects.service.ts` é do seu escopo):

1. Em `getProject`, trocar `scene: sceneObj` por `scene: migrateProjectScene(sceneObj)`,
   importado de `../../../core/domain/queue/migration.ts`. Falha de migração: mesmo erro 500
   do `JSON.parse`. Sem `UPDATE`: abrir um projeto não pode regravá-lo.
2. Em `createProject`, gravar `validatedInput.scene.schemaVersion` na coluna `schema_version`
   no lugar do `1` fixo. Em `updateProject`, gravar a coluna também.
3. Em `back/test`, cenas passadas a `applyQueueCommand` precisam estar em v2; use
   `migrateProjectScene(scene)`.

**Vitral:** `front/features/editor/project-scene.ts` precisa de `schemaVersion: 2` e
`queue: { personIds: [] }`. Sem isso, `typecheck:front` falha após o commit.

## Documento da cena (`@testafila/core/contracts/project`)

```ts
export interface QueueChain {
  // Ordem da fila: índice 0 é a primeira pessoa. Vizinhos no array são vinculados.
  personIds: EntityId[];
}

export interface ProjectScene {
  schemaVersion: 2;
  // ...demais campos sem mudança...
  queue: QueueChain;
  people: PersonPlacement[];              // sem mudança de formato
  simulation: { spacingMeters: Meters; /* ... */ };  // espaçamento global da cadeia
}
```

- Uma fila por projeto. Espaçamento da cadeia é `simulation.spacingMeters`.
- `people` continua sendo a fonte de posição e yaw, inclusive na cadeia.
- Pessoa da cadeia tem `routeId: null` e `distanceAlongRouteMeters: null`.
- Frente da pessoa: `(sin yaw, cos yaw)`. Yaw 0 olha para +Z. Atrás é o oposto.
- `postGroups`, citado no `migration.ts` antigo, não existe em nenhum contrato nem no banco
  e foi abandonado.

### Três estados (`getQueueMode(scene)`)

| Modo | Condição | Editor |
| --- | --- | --- |
| `'empty'` | sem pessoas | `person:add` define o início |
| `'chain'` | `queue.personIds` não vazio e igual ao conjunto de `people` | `+1`, mover, girar, remover |
| `'legacy'` | pessoas com `queue.personIds` vazio | oferecer `queue:convert-legacy` |

Misturar cadeia com pessoas fora dela é inconsistente e rejeitado.

## Comandos (`@testafila/core/contracts/queue-editor`)

Todos são atômicos: em erro, `valid: false`, `errors` com o motivo e a mesma cena. Undo e redo
seguem por `executeQueueCommand`, `undoQueue` e `redoQueue`.

| Comando | Comportamento |
| --- | --- |
| `{ type: 'person:add'; person }` | Só em cena sem pessoas. Cria a primeira, respeitando `position` e `yawRadians`. |
| `{ type: 'person:append'; id; sourceId? }` | Entra atrás da **última** pessoa, à distância do espaçamento, com o yaw dela. `sourceId` é aceito e ignorado. |
| `{ type: 'person:move'; id; position }` | Primeira pessoa: translada a cadeia inteira. Outra: fica à distância do espaçamento da anterior, na direção de `position`, e o trecho seguinte gira junto. Anteriores não mudam. |
| `{ type: 'person:rotate'; id; yawRadians }` | Yaw absoluto. O trecho seguinte gira rigidamente em torno da pessoa. Anteriores não mudam. |
| `{ type: 'person:remove'; id }` | Quem vem atrás avança e ocupa a vaga, mantendo a forma. Sem órfãos. |
| `{ type: 'people:clear'; routeId? }` | Sem `routeId`, esvazia pessoas e cadeia. |
| `{ type: 'simulation:spacing'; spacingMeters }` | 0,5, 0,8 ou 1. Recompõe a cadeia inteira a partir da primeira pessoa, mantendo a direção de cada vínculo. |
| `{ type: 'queue:convert-legacy' }` | **Novo.** Só em modo `legacy`. Ordem do array `people`; a primeira fica no lugar; cada vínculo mantém a direção atual, com o espaçamento vigente. Limpa referências de percurso. |
| `{ type: 'area:move'; id; delta }` | **Novo.** Desloca todos os vértices. |
| `{ type: 'area:rotate'; id; angleRadians }` | **Novo.** Giro relativo em torno do centroide. Positivo no mesmo sentido do yaw. |

Por tipo: pessoa move, gira e remove; poste move e remove (é circular, girar não tem efeito);
área move, gira e remove; fita só remove, porque deriva dos postes.

Em modo `legacy`, `person:move`, `person:rotate` e `person:remove` seguem individuais, sem
perda, e `person:add` e `person:append` são rejeitados pedindo conversão. Uma conversão pode
ser rejeitada se a nova geometria colidir; a cena fica intacta e o motivo vem em `errors`.

`route:set`, `people:add` e `people:fill` continuam como legado e são rejeitados com cadeia.

## Funções (`@testafila/core/domain/queue`)

```ts
getQueueMode(scene: ProjectScene): 'empty' | 'chain' | 'legacy';
getChainPeople(scene: ProjectScene): PersonPlacement[];  // na ordem da fila
```

As demais exportações (`applyQueueCommand`, `executeQueueCommand`, `validateQueueScene` etc.)
não mudam de assinatura.

## Migração (`@testafila/core/domain/queue/migration`)

```ts
migrateProjectScene(input: unknown): ProjectScene;  // v1 -> v2; v2 volta igual; outra: lança
```

Não muta a entrada. v1 vira `schemaVersion: 2` e `queue: { personIds: [] }`, com pessoas
intactas. Todos os 21 projetos são v1. Salvar em v1 continua aceito na API, com migração, para
não quebrar o front durante a transição.

## Câmera (`@testafila/core/domain/measured-environment`, também em `/domain`)

```ts
interface MeasuredEnvironmentInput {
  points: PointXZ[];          // cantos na ordem marcada, em metros; sem repetir o primeiro
  recordedAt: string;         // ISO; a função é pura e não lê o relógio
  wallHeightMeters?: Meters;  // padrão: o mesmo de createRectangleEnvironment
}
interface SessionToProject { origin: PointXZ; rotationRadians: number } // só em memória
type MeasuredEnvironmentResult =
  | { valid: true; errors: []; environment: Environment; sessionToProject: SessionToProject }
  | { valid: false; errors: string[]; environment: null; sessionToProject: null };

createEnvironmentFromMeasuredPoints(input: MeasuredEnvironmentInput): MeasuredEnvironmentResult;
sessionPointToProject(point: PointXZ, transform: SessionToProject): PointXZ;
```

Primeiro canto vira (0, 0) e a primeira parede fica em +X. Só translação e rotação: sem escala
nem espelhamento. Valida polígono simples. `measurement.source` é `'webxr'`, sem `checks`, e
`confirmedAt` é `null`. Vértices: `corner-1`, `corner-2`, e assim por diante.
