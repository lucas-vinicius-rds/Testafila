# Onda 0 — Status

**Dono:** Viga. **Data:** 04/11/2026. **Situação:** concluída, com 3 achados abaixo.
**Branch:** `ondas/camera-e-arquitetura`. Commits: `ceeebc1` (docs), `7617624` (reorganização).
Sem push e sem merge na `main`.

## Resultado

- App no ar: Nest em 127.0.0.1:3001 (pid 33816) e Next em 0.0.0.0:3000 (pid 39332).
- 21 projetos preservados. O JSON completo dos 21, lido pela API antes e depois, é
  byte a byte igual (sha256 `c4680071…cb61`).
- ngrok não foi tocado: os mesmos processos (24244, 37260) e a mesma URL.

## Comparação com a linha de base

| Verificação | Antes | Depois |
| --- | --- | --- |
| Domínio + lógica XR | 132 aprovados | 125 (`test:core`) + 7 (`test:xr`) = 132 aprovados |
| API | 6 aprovados, 4 falhas | 6 aprovados, 4 falhas (`test:back`) |
| Nomes dos testes e resultado de cada um | — | `diff` sem diferenças, nos dois conjuntos |
| Typecheck API / web | exit 0 | exit 0 (`typecheck:back`, `typecheck:front`) |
| Typecheck core | não existia | **exit 2**, erro antigo: ver achado 1 |
| `GET /api/projects` | 21 | 21 (3001 e ngrok) |
| `build:back`, `build:front` | não rodados na linha de base | exit 0; mesmas rotas de antes |

As 4 falhas continuam com as causas antigas: contagem de migrações (2 em vez de 1) e
`/api/auth/sign-in/email` com 404.

Outras verificações executadas:

- `/api/health` direto, pelo proxy da 3000 e pelo ngrok: 200.
- `curl` em `/dashboard`, `/projects/new`, `/xr-check`, `/projects/:id`, `/edit` e `/ar`: 200.
- Smoke no Edge headless em 1280×900 e 390×844, nessas mesmas telas: nenhum `pageerror` e
  nenhuma escrita na API. Único erro de console: 404 de `/favicon.ico`, que não existe nem
  na `main`. Não houve interação com o editor além de abrir as telas.
- `migrate:back` em banco temporário: exit 0.
- `nest start --watch --entryFile src/main` na porta 3105 com banco temporário: health ok.
- `next dev` na porta 3100 com `NEXT_DIST_DIR=.next-dev`: 200, sem afetar a porta 3000.
- `playwright test --list` em `front/`: 3 testes encontrados. **O E2E não foi executado**;
  ele ainda depende de login (Onda 3).
- Fronteiras: 0 imports de React, Three, Nest, Next ou banco em `back/core`; 0 referências
  a `back/src` ou `back/core` por caminho em `front`.
- `package-lock.json`: 0 versões ou integridades alteradas em 537 entradas; só entraram
  `back/core` e `node_modules/@testafila/core`.

## Achados (não corrigidos, fora do escopo)

1. **`npm run typecheck:core` falha.** `back/core/domain/queue/migration.ts(15,5)`: type `2`
   não atribuível a `1`. Já existia na `main`, mas nenhum typecheck alcançava o arquivo,
   porque **ninguém importa `migrateProjectScene`**. O contrato ainda declara
   `schemaVersion: 1`. Logo, a "migração de cenas v1 ao abrir" citada no panorama não
   acontece no código. Resolver na Frente A da Onda 1, junto com a nova versão da cena.
2. **`npm run dev:back` falha nesta máquina.** `node --run` não encontra o `package.json`
   porque corrompe o "Á" de "Área de Trabalho". O script `dev` é o mesmo da `main`, e o erro
   se repete em `front/`. Não foi rodado na `main`. Alternativa em `back/`:
   `node --env-file-if-exists=.env ../node_modules/@nestjs/cli/bin/nest.js start --watch --entryFile src/main`.
3. **`front/shared/login-form.tsx` não tem importador.** Foi movido sem alteração, porque o
   destino do login é decisão pendente do usuário.

## Comandos novos

| Antes | Agora |
| --- | --- |
| `dev:web`, `dev:api` | `dev:front`, `dev:back` |
| `build:web`, `build:api` | `build:front`, `build:back` |
| `npm run start --workspace @testafila/web` / `api` | `start:front`, `start:back` |
| `typecheck:web`, `typecheck:api` | `typecheck:front`, `typecheck:back`, `typecheck:core` (novo) |
| `node --test tests/domain/...` | `test:core` |
| `node --test apps/web/components/xr-*/...` | `test:xr` |
| `test:api` | `test:back` (rode `build:back` antes; os testes importam de `dist`) |
| `test:editor` | `test:e2e` |
| `migrate:api` | `migrate:back` |
| `user:create` | `user:create` |

`test:back` usa banco temporário ou em memória. **`migrate:back` sem `DATABASE_PATH` atua
no banco real.**

## Caminhos antigos e novos

| Antes | Agora |
| --- | --- |
| `apps/api/src/{auth,health,projects}` | `back/src/modules/{auth,health,projects}` |
| `apps/api/src/database` | `back/src/infra/database` |
| `apps/api/src/{common,cli,main.ts,app.module.ts}` | `back/src/...` (mesmos nomes) |
| `apps/api/src/contracts/project.ts` | removido: só reexportava e não tinha importador |
| `apps/api/test` | `back/test` |
| `apps/api/data`, `apps/api/.env` | `back/data`, `back/.env` |
| `apps/api/dist/apps/api/src/main.js` | `back/dist/src/main.js` |
| `contracts/*` | `back/core/contracts/*` |
| `src/domain/*` | `back/core/domain/*` |
| `tests/domain/*` | `back/core/tests/*` |
| `tests/e2e`, `playwright.config.ts` | `front/tests/e2e`, `front/playwright.config.ts` |
| `apps/web/app` | `front/app` |
| `components/dashboard.tsx`, `lib/scene-thumbnail.ts` | `front/features/dashboard/` |
| `components/project-creation-flow.tsx` | `front/features/project-creation/` |
| `components/{queue-editor,saved-project-editor,saved-project-view,scene-preview,undo-redo-bar}.tsx` | `front/features/editor/` |
| `scene/scene-viewer.tsx`, `lib/{project-scene,queue-errors}.ts` | `front/features/editor/` |
| `components/xr-check/*`, `components/xr-project/*` | `front/features/ar/xr-check/`, `front/features/ar/xr-project/` |
| `components/settings-panel.tsx` | `front/features/settings/` |
| `components/{app-nav,brand-logo,login-form}.tsx`, `lib/{http,contracts}.ts` | `front/shared/` |

## Árvore final

```text
back/
  src/{modules/{auth,health,projects},infra/database,common,cli,main.ts,app.module.ts}
  core/{contracts,domain,domain/queue,tests,tests/queue}
  test/   data/   .env   dist/{src,core}
front/
  app/   features/{dashboard,project-creation,editor,ar,settings}
  shared/   tests/e2e/
```

## Contratos publicados

Workspaces: `front`, `back`, `back/core`. Imports do `front`, sem extensão:

```ts
import type { ProjectScene } from '@testafila/core/contracts/project';
import { applyQueueCommand } from '@testafila/core/domain/queue';
import { validateSimplePolygon } from '@testafila/core/domain/polygon';
import { getEnvironmentArea } from '@testafila/core/domain'; // domain/index.ts
```

Dentro de `back/core`, os imports são relativos e com `.ts`. Nenhum contrato mudou.

## Decisões e ajustes na árvore

- **`back/src` importa o core por caminho relativo** (`../../../core/domain/...ts`), não
  por `@testafila/core`. Motivo: o `tsc` não reescreve nomes de pacote, e o `exports` do
  core aponta para `.ts`. Pelo pacote, a API passaria a executar TypeScript cru em produção,
  o que muda como ela roda. Pelo caminho relativo, o core é compilado para `back/dist/core`,
  como antes. A regra das ondas sobre o `front` continua atendida.
- `tests/e2e` e `playwright.config.ts` ficaram fora do typecheck do `front`, como já estavam.
  `@playwright/test` continua no `package.json` da raiz.
- **Acréscimo pequeno além de mover:** `distDir: process.env.NEXT_DIST_DIR || '.next'` em
  `front/next.config.ts`, sem efeito no padrão. Sem isso, a regra de `next dev` com diretório
  separado não era cumprível. Criados também `back/core/package.json` e `tsconfig.json`.
- `.gitignore` ganhou `back/data/` e `.next-*/`.

## Para as próximas ondas

- **Ver a interface:** em `front/`, `$env:NEXT_DIST_DIR='.next-dev'; npx next dev --port 3100`.
  Dois agentes em paralelo precisam de diretórios e portas diferentes.
- O `tsconfig.json` do front já inclui `.next-dev`. Outro nome faz o Next reescrever o arquivo.
- `next dev` e `next build` reescrevem `front/next-env.d.ts`. Não comite essa alteração.
- Rodar `next dev` nunca usa a 3000, mas a API de apoio é a real: escritas pelo proxy vão
  para o banco do usuário. Para testar escrita, use API própria com `DATABASE_PATH` temporário.
- Gravação pelo ngrok continua bloqueada por `APP_ORIGIN`, como antes (Onda 1, Frente B).

## Serviços e recuperação

- Os dois serviços rodam desacoplados, via `Start-Process`, sem terminal visível. Não voltam
  sozinhos depois de reiniciar a máquina; use `npm run start:back` e `npm run start:front`.
- Logs: `%LOCALAPPDATA%/TestaFila/logs/{back,front}.{out,err}.log`.
- Backup: `%LOCALAPPDATA%/TestaFila/backups/2026-11-04-onda0/` com `data/` (SQLite, WAL e SHM,
  hashes iguais aos originais), `api.env`, `dist/` e `next/`. Uma cópia abriu com
  `integrity_check = ok` e 21 projetos.
- **O WAL guarda parte dos dados** (968 KB contra 81 KB do arquivo principal). Copie ou mova
  sempre os três arquivos juntos.
- Pasta `test-results/` antiga, ignorada pelo Git, continua na raiz. Não foi alterada.

## Pendente no aparelho

Nada novo. Câmera, tracking e iPhone não foram exercitados nesta onda.

## Dúvidas para o usuário

Nenhuma nova. A decisão sobre login segue pendente, como no README das ondas.
