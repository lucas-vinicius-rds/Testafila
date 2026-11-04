> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Relatório de mudanças — 4 de novembro de 2026

Este relatório registra as alterações feitas nesta sessão. O worktree já
continha mudanças independentes em API, interface e documentação; elas não são
atribuídas a este relatório.

## Integração WebAR experimental

- Criada a rota `/projects/:id/ar`, acessível na página de revisão do projeto.
- A rota carrega a `ProjectScene` salva pela API e renderiza perímetro, áreas,
  postes, fitas, percursos e pessoas em uma cena Three.js cliente.
- A sessão exige contexto seguro e suporte WebXR; solicita `immersive-ar` com
  `hit-test` e `local-floor`. O `dom-overlay` é opcional.
- O usuário associa dois vértices do perímetro a pontos físicos detectados para
  calcular yaw e translação. Um terceiro ponto mostra o resíduo de conferência.
- A transformação é rígida, mantém escala 1 unidade = 1 metro e só existe na
  sessão. Girar, reiniciar alinhamento ou encerrar a sessão não altera a planta
  persistida. Cada sessão nova requer alinhamento novo.
- Adicionada lógica pura de transformação e três testes: ajuste de yaw/translação,
  resíduo sem correção de escala e rejeição de pares inválidos.
- Adicionado link “Abrir WebAR experimental” à visualização do projeto.

## Remoção do protótipo Vite

- Removidos `index.html`, `vite.config.js`, `src/main.js`, `src/geometry.js`,
  `src/arObjects.js` e `src/style.css`, que compunham o protótipo antigo.
- Preservado `src/domain/**`, ainda usado pelo projeto atual.
- Removidos os comandos Vite da raiz e as dependências diretas `vite`,
  `@vitejs/plugin-basic-ssl` e `three` do manifesto raiz. Three.js segue como
  dependência do frontend em `apps/web`.
- Atualizado `package-lock.json` offline e revisados os comandos/documentação
  de início e arquitetura.

## Serviços locais

Frontend e API foram iniciados em modo de desenvolvimento:

- Next.js: `http://localhost:3000`.
- NestJS: `http://127.0.0.1:3001`; `/api/health` respondeu `{"status":"ok"}`.
- A página inicial do frontend respondeu HTTP 307, compatível com o
  redirecionamento da aplicação.

## Verificações e limites

- `npm run typecheck:web`: aprovado.
- Testes de alinhamento XR: 3 aprovados.
- `git diff --check`: aprovado.
- `npm run build:web`: compilação terminou, mas o comando falhou na verificação
  seguinte do Next 16.4.2 com `Could not parse output from TypeScript's
  --showConfig`. Executar `tsc --showConfig` diretamente produziu JSON válido;
  a falha do build permanece sem causa confirmada.
- Não houve teste em aparelho XR. Hit-test, tracking, tolerâncias, precisão,
  estabilidade física e HTTPS de produção continuam sem aceite.

## Arquivos principais

- Código WebAR: `apps/web/app/projects/[id]/ar/` e
  `apps/web/components/xr-project/`.
- Plano e estado XR: `docs/PLANO-WEBAR.md`, `docs/XR-PENDENCIAS.md` e
  `docs/ARCHITECTURE.md`.
- Remoção do legado e comandos atuais: `package.json`, `package-lock.json`,
  `README.md` e `docs/EXECUCAO-LOCAL.md`.
