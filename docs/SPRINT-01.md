> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Primeiro lote — fundação

Ambiente liberado posteriormente pelo usuário: rede e filesystem agora disponíveis.
Coordenador executou npm view e npm install com sucesso, gerando lock de workspaces;
auditoria npm reportou zero vulnerabilidades. Scripts de better-sqlite3 e esbuild
aprovados nominalmente após listagem. Typecheck e build de produção Next passaram.
Build Nest encontrou erros de inferência Better Auth/admin e shim de contratos;
Cedro recebeu as falhas para correção e validação integrada real. Os bloqueios npm
mencionados nas seções históricas abaixo deixaram de ser atuais.

Atualização de equipe: quota Agys esgotada, confirmada nos dois terminais. Por pedido
do usuário, Cedro e Prumo substituídos no mesmo nó por gpt-6-luna medium --yolo.
Os nomes/donos/caminhos permanecem; os modelos Flash abaixo são registro do início.
Houve edições parciais antes do limite: sucessores devem ler os arquivos antes de
retomar, sem presumir que o último relato corresponde exatamente ao estado em disco.

Autorizado pelo usuário: iniciar desenvolvimento, backend NestJS e SQLite por enquanto.
Frontend Next/React/TypeScript; referência visual ../../slide-cintia.

## Donos exclusivos

- Codex: manifests, lockfiles, configuração de dependências, contracts/**,
  documentação de arquitetura/entrega e integração. Só o coordenador instala pacotes.
- Cedro (Flash High): apps/api/**, exceto package.json e lockfiles. Nest, SQLite,
  sessão real, login/logout, projetos por proprietário e testes de integração.
- Trama (Luna Medium): apps/web/**, exceto package.json e lockfiles. Fundação Next,
  tokens, login, dashboard conectado e estados de carregamento/erro/vazio.
- Prumo (Flash High): src/domain/** e tests/domain/**. Domínio métrico puro,
  validação de perímetros, interseções incluindo bordas, comprimento e testes.

Não alterar o protótipo src/main.js, src/geometry.js, src/arObjects.js, src/style.css
ou index.html neste lote. Não iniciar AR de produção antes da validação em aparelho.
Não alterar arquivos de outro dono. Pedidos de dependência/contrato vão ao Codex.

## Contrato HTTP inicial

Nest em 127.0.0.1:3001; Next em 3000; browser usa proxy Next /api/** para Nest /api/**.
Frontend em apps/web/app/** e apps/web/components/**; helpers em apps/web/lib/**.
Coordenador fornece package.json, tsconfig, next-env.d.ts e next.config.ts.
API_BASE_URL só no servidor Next, padrão http://127.0.0.1:3001 sem /api final.
previewKey ainda não tem contrato de URL; mostrar ausência de prévia nesta fase.
Mesma origem no navegador; cookies e Set-Cookie devem ser preservados pelo proxy.
Não registrar cookie, senha ou segredos em logs. Sessão HttpOnly, SameSite=Lax,
Secure em produção; validar origem em mutações. Segredos só servidor.

- GET /api/health: { status: 'ok' }.
- POST /api/auth/sign-in/email: { email, password }; sucesso { user: { id, name, email } }.
- GET /api/auth/get-session: { user: { id, name, email } } ou null se anônimo.
- POST /api/auth/sign-out: encerra sessão; sucesso { success: true }.
- GET /api/projects: { projects: Array<{ id, name, createdAt, updatedAt, revision,
  previewKey: string | null }> }.
- GET /api/projects/:id: SavedProject conforme contracts/project.ts.
- POST /api/projects: SaveProjectInput com expectedRevision null; SavedProject, HTTP 201.
- PATCH /api/projects/:id: SaveProjectInput com expectedRevision inteiro; SavedProject.
- Erros do aplicativo: { error: { code, message } }; 400 inválido, 401 sem sessão,
  404 inexistente/outra conta, 409 conflito. Front trata também erro padrão da auth.

ownerId vem exclusivamente da sessão. Cena validada antes de gravar. Atualização
de revisão atômica. Conta inicial via comando administrativo, sem senha fixa ou signup
público. Backend comunica dependências e integração da biblioteca de auth ao coordenador
antes de fixar imports; preferência Better Auth com suporte Nest/SQLite documentado.

## Aceite do lote

Instalação e versões verificadas pelo coordenador; build/typecheck dos apps; testes
de geometria e integração de login, isolamento, persistência e conflitos. Fluxo de
login/dashboard só será declarado funcional após execução real. Mapeamento, editor,
AR e demais fases continuam pendentes. Reportar limitações de rede/ambiente sem contornar.

Toda entrega termina com ask back para Codex, arquivos alterados, verificações e pendências.

## Dependências e limite de execução

Manifests iniciais em workspaces npm apps/web e apps/api. Better Auth e better-sqlite3
aprovados; sem ORM nesta fundação. Next/React consultados no registro npm oficial:
https://registry.npmjs.org/next/latest e https://registry.npmjs.org/react/latest.
TypeScript 5.9 evita antecipar migração para compilador 7 antes de testar decorators.
Ranges do backend são provisórios até resolver peers e fixar lockfile pela instalação.
Consulta npm no terminal do coordenador bloqueada (ENOTCACHED, only-if-cached).
Não há lockfile atualizado nem build/typecheck validado. Não usar agentes para escapar
desse bloqueio. Não tratar manifests preparados como aplicação instalada/executável.

## Revisão da primeira entrega frontend

Trama entregou login, dashboard, helpers e proxy. Revisão estática do coordenador
encontrou referência `cause` sem parâmetro no catch de verificação de sessão, ausência
de ação/indicação do mapeamento pendente e pontos a completar no proxy (Connection,
x-forwarded-*, timeout e erro de leitura de corpo). Correções solicitadas à mesma dona.
F1a/F1c permanece em revisão; typecheck, build e login/cookies integrados não executados.

Revisão posterior: coordenador releu os arquivos corrigidos e confirmou catch(cause),
ação de criação desabilitada com explicação, runtime Node, filtro dinâmico Connection
e x-forwarded-*, timeout 10s e leitura da resposta protegida. Revisão estática liberada
para integração; nenhuma alteração adicional solicitada à Trama neste momento.
Aceite funcional ainda pendente de dependências, typecheck, build e testes com Nest.

## Revisão F2a

Coordenador reproduziu 82/82 testes (19 suites) com Node 24 usando
`node --experimental-strip-types --test --experimental-test-isolation=none tests/domain/*.test.ts`.
Modo padrão tentou criar subprocessos e falhou por EPERM; execução no mesmo processo
funcionou. Não confundir falha de infraestrutura com falha das asserções.

Casos adicionais reproduzidos exigem correção antes do aceite:
- Tolerância aprova checks vazios e distância medida negativa (-10 gera erro -200%).
- Edição inválida retorna ambiente alterado; confirmação anterior permanece após edição.
- Validação de Environment com vértice null lança TypeError em vez de invalidar.
- Retângulo cria evidência de erro zero a partir das mesmas dimensões da construção,
  sem conferência independente. Evidência inicial deve permanecer sem checks.

Prumo recebeu os casos e pedido de testes regressivos; F2a segue em revisão.

Segunda revisão: tolerância vazia/negativa e política não finita agora reprovam;
suíte voltou a passar na execução do coordenador. Factory retangular ainda cria
checks tautológicos e erro zero; correção reiterada com teste específico antes do aceite.

## Revisão F1b

Coordenador reproduziu 29 testes passando via node:test em processo único. Cobrem
SQLite nativo, auth própria e dispatcher HTTP alternativo, não bootstrap/injeção Nest
nem Better Auth. Entrega devolvida ao Cedro; F1b não aceita.

Correções solicitadas: Better Auth real; remover fallback de servidor; testes Nest;
validação Origin nas mutações; build com emissão e imports de contratos corrigidos;
providers com DI funcional; DATABASE_PATH e lifecycle SQLite; senha CLI fora de argv;
validação estrita da cena alinhada ao domínio. Manter isolamento e revisão transacional.
Ausência de dependências deve ser relatada, sem trocar a arquitetura aprovada.

Terceira revisão F2a: 87/87 testes reproduzidos; factory sem checks, atomicidade e
reconfirmação corrigidos. Regressão independente ainda encontrou validação de medição
aprovando vértices NaN/Infinity e retornando erro derivado não finito. Prumo recebeu
ajuste final delimitado a measurement.ts e testes, incluindo IDs duplicados e cálculo
que não pode converter NaN em erro zero. Aceite aguarda esse ajuste.

Aceite F2a do domínio: sucessor Luna corrigiu measurement.ts e seus testes.
Coordenador reproduziu 90/90 testes, 19 suites, e regressões independentes para
NaN, Infinity, -Infinity e IDs duplicados: validator invalida sem derivado não finito,
helper lança erro explícito. git diff --check passou. Exports liberados para Cedro.
Aceite restrito ao domínio implementado; build/typecheck, paredes/grid e interface
de mapeamento continuam pendentes, assim como validação física de precisão.
