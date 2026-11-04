# Onda 0 — Reorganização em back e front

**Dono:** Viga, sozinho. Ninguém mais edita código nesta onda.
**Regra central:** só mover e reconectar. Nenhum comportamento muda.

## Estrutura alvo

```text
Testafila/
  back/                     workspace @testafila/back (Nest)
    src/
      modules/projects/     controller, service, module, validation
      modules/health/
      modules/auth/         movido sem alterar comportamento
      infra/database/       conexão e migrações
      common/               filtros, guards, tipos
      cli/
      main.ts, app.module.ts
    core/                   workspace @testafila/core: TypeScript puro
      contracts/            project, queue-editor, scene-viewer
      domain/               geometria e fila
      tests/                testes do domínio
    test/                   testes da API
    data/                   SQLite (ignorado pelo Git)
  front/                    workspace @testafila/front (Next)
    app/                    somente rotas e layouts finos
    features/
      dashboard/            galeria e miniaturas
      project-creation/     fluxo de criação
      editor/               editor da fila e cena 3D
      ar/                   sessão WebXR, /xr-check e /projects/:id/ar
      settings/
    shared/                 cliente HTTP, UI comum, logo, navegação
    tests/e2e/
  docs/
  AGENTS.md, DESIGN.md, README.md, package.json, package-lock.json
```

Pontos fixos:
- O usuário pediu duas pastas, então o código compartilhado fica em `back/core`, como
  pacote próprio. O servidor é a autoridade das regras, e o front reutiliza o mesmo
  código para validar na hora, sem duplicar.
- `core` não importa React, Three, Nest nem banco.
- `front` importa só `@testafila/core`, nunca `back/src`.
- Remova duplicatas como `apps/api/src/contracts/project.ts` se forem só reexportação.
  Se não forem, registre a diferença antes de decidir.
- Ajuste a árvore se a ferramenta exigir, mantendo essas regras, e justifique no marcador.

## Passos

1. **Linha de base, antes de mover.** Rode e guarde os resultados: testes do domínio e da
   lógica XR, `test:api`, typechecks e `GET /api/projects` (contagem). Esperado:
   132 aprovados no domínio, 6 aprovados e 4 falhas na API, 21 projetos.
2. **Branch.** Crie `ondas/camera-e-arquitetura` a partir da `main` e faça o primeiro
   commit com a documentação pendente (`docs/README.md`, `docs/PANORAMA-LOCAL-2026-11-04.md`,
   `docs/ondas/**`, e `AGENTS.md` se modificado).
3. **Parar serviços.** Confirme pela linha de comando que os processos das portas 3000 e
   3001 são deste projeto e encerre só esses dois. Não toque no ngrok. Se a política
   bloquear, pare a onda e avise o coordenador.
4. **Backup.** Copie `apps/api/data/*` (com WAL e SHM) para
   `%LOCALAPPDATA%/TestaFila/backups/2026-11-04-onda0/` e confira os tamanhos antes de
   seguir. Copie também `apps/api/.env`.
5. **Mover.** Use `git mv` para preservar histórico. Mova `data/` e `.env` à mão, pois são
   ignorados. Remova pastas vazias de `apps/`, `contracts/`, `src/` e `tests/`.
6. **Reconectar.** Atualize workspaces, scripts raiz (`dev:web` passa a `dev:front`, e assim
   por diante; mantenha nomes claros), tsconfigs, `next.config.ts`
   (`turbopack.root`, `transpilePackages`), Playwright, caminho padrão do banco, imports e
   `.gitignore`. Atualize `package-lock.json` sem subir versões.
7. **Provar.** Rode de novo tudo do passo 1, mais `build` da API e do front. O resultado
   deve ser igual à linha de base: mesmas 4 falhas na API, nenhuma nova.
8. **Religar.** Suba a API na 3001 e o Next na 3000. Confirme `/api/health`,
   `/api/projects` com 21 projetos e o endereço público do ngrok.
9. **Registrar.** Commit e `docs/ondas/status/ONDA-0.md`, com a árvore final, os novos
   comandos e os caminhos antigo e novo, que as próximas ondas vão usar.

## Se der errado

Serviços não voltam ou o banco não abre: restaure do backup, deixe as portas 3000 e 3001
funcionando, registre o erro e avise o coordenador. O usuário não pode voltar e encontrar
o app fora do ar.

## Fora do escopo

Quebrar arquivos grandes, corrigir bugs, atualizar docs antigas, consertar os 4 testes.
