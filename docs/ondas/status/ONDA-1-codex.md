# Onda 1 — Codex / Frente B

Data: 04/11/2026. Branch: `ondas/camera-e-arquitetura`.
Situação: **itens 1, 2 e 3 concluídos**; serviços reais preservados.
Commits de código/testes: `e5eb54d` (itens 1/2) e `c90843b` (item 3).

## Atualização — item 3 após o commit Viga `85711e8`

Executado por ordem do coordenador, usando os contratos publicados:

- `projects.service.ts`: `getProject` passa JSON parseado por
  `migrateProjectScene`, dentro do mesmo try/catch. Falha de parse ou migração
  retorna o mesmo 500. **Nenhum UPDATE no caminho de leitura**.
- `createProject` grava `validatedInput.scene.schemaVersion` na coluna
  `schema_version`; `updateProject` também atualiza a coluna atomicamente com
  cena/revisão. Não há migração manual nem escrita no banco do usuário.
- Cenas passadas a `applyQueueCommand` no teste de fila são migradas para v2.
  A cobertura de percurso legado foi mantida usando entrada HTTP v1 transitória.
  A expectativa de versão inválida passou de 2 para 999, pois 2 agora é válida.
- Novo `back/test/project-versions.integration.test.mjs`, com banco temporário:
  cadeia v2 de três pessoas, mudança de espaçamento/rotação e reabertura exata
  após restart do **app de teste em porta efêmera**; persistência da coluna 2;
  membros ausentes/duplicados/inexistentes, pessoa órfã e spacing adulterado
  rejeitados com 400 sem mudar linha/revisão; conflito de revisão com 409.
- GET repetido de registro v1 com duas pessoas preserva posições, yaw, ordem e
  referências, devolve v2 com cadeia vazia e **não altera nenhum byte da linha
  SQLite**, inclusive scene JSON indentado, schema_version=1, revision=7,
  timestamps e preview. Conferido também `total_changes()` sem incremento.
- Só conversão explícita e PATCH avançam esse registro para revisão 8/coluna 2.
  POST v1 transitório é aceito/migrado; POST v2 novo com pessoas fora da cadeia
  é rejeitado. JSON persistido inválido e versão não suportada retornam o mesmo
  500, preservando as linhas.

Comandos após esses ajustes: `npm run typecheck:back`, `npm run build:back` e
`npm run test:back`: **todos exit 0; 16 testes aprovados, 0 falhas**.
`git diff --check` dos arquivos do escopo: sem erros (avisos LF/CRLF somente).

**Porta 3001 não foi reiniciada** nesta etapa: mantém PID 20276. Porta 3000
mantém PID 39332; ngrok mantém PIDs 24244/37260. Nenhuma escrita/leitura de cenas
nos 21 projetos reais foi necessária nesta etapa. A validação desses 21 na cópia
do banco é da Viga, usando `c90843b`; não foi alegada como executada pelo Codex.
O `dist` foi recompilado, mas o serviço em execução permanece no código anterior,
compatível com o bundle v1 da 3000, até ordem da Onda 3.

## Feito — item 1

- `back/src/common/app-origins.ts` publica `getAppOrigins(value?)`: lista exata
  separada por vírgulas, trim, descarte de entradas vazias e deduplicação.
  Sem variável definida, mantém `http://localhost:3000`. Configuração vazia não
  autoriza mutações. Não há wildcard, substring ou aceitação de origem ausente.
- CORS em `back/src/main.ts` e verificação de POST/PATCH/DELETE em
  `back/src/modules/projects/projects.controller.ts` usam a mesma função.
- `back/.env.example` documenta a lista. Em `back/.env`, apenas `APP_ORIGIN` foi
  atualizado para localhost:3000 e o domínio HTTPS indicado pela onda; demais
  variáveis preservadas. Arquivo real não foi exibido nem commitado.
- Autenticação não foi restaurada nem seu módulo alterado/removido.

### Reinício e serviços

O reinício autorizado ocorreu antes da nova proibição do coordenador: API antiga
PID 33816 substituída pelo PID **20276**, porta **3001**. Nenhum bloqueio de
política ocorreu nesta execução. Logs em
`%LOCALAPPDATA%/TestaFila/logs/back-onda1-codex.{out,err}.log`.

Porta **3000** permaneceu com PID **39332**; ngrok permaneceu com PIDs
**24244 e 37260**. Nenhum Next build, restart/reconfiguração de Next ou ação
no processo/configuração ngrok foi executado.

**Regra recebida depois do reinício: não reiniciar mais 3001 até ordem na Onda 3.**
O bundle da 3000 e a API atualmente em execução continuam no contrato anterior;
builds/testes futuros não autorizam reiniciar o serviço com contratos novos.

### Prova pública e preservação dos dados

URL: `https://defendant-dragging-dreadlock.ngrok-free.dev`.
Requisições HTTP pelo endpoint público, com Origin HTTPS e
`ngrok-skip-browser-warning: 1`, sem cookie/login:

| Operação | Resultado |
| --- | --- |
| GET `/api/health` | 200, `{"status":"ok"}` |
| POST `/api/projects` | 201, revisão 1 |
| PATCH do próprio projeto, nome e geometria | 200, revisão 2 |
| GET do próprio projeto | 200, cena editada conferida |
| DELETE do próprio projeto | 204 |
| GET após exclusão | 404 |

Único projeto criado/excluído: `9f65c176-86ed-4361-a5d2-980b138f35f8`, com nome
de QA gerado por UUID. Antes de excluir foram conferidos id e nome próprios.
Nenhum projeto do usuário foi alterado ou excluído.

Snapshot por leitura da API dos **21 projetos originais**, antes do reinício e
depois da exclusão: JSON completo ordenado por id **byte a byte idêntico**.
SHA-256: `d7acfbb9c609c95335fb9be53590cbb71b4ff9cd572277d15c504dc0d8515435`.
Contagem final: **21 projetos**.

Evidência local, fora do Git:
`%LOCALAPPDATA%/TestaFila/qa-onda1-codex/{before.json,result.json}`.
Backup local do ambiente anterior nessa pasta e cópia dos arquivos SQLite
presentes, após parar a API, em
`%LOCALAPPDATA%/TestaFila/backups/2026-11-04-onda1-codex/`.
Não houve edição direta de SQLite nem execução de migração manual no banco real.

## Feito — item 2

- Corrigida a expectativa das migrações para os dois nomes existentes:
  `001_initial_auth_and_projects` e `002_local_projects_owner`; idempotência
  continua coberta.
- Integrações Nest/projetos e fila rodam sem provisionar usuário, login ou cookies.
- Mantidas coberturas de validação geométrica e entradas malformadas, medição,
  JSON inválido, limite 413, revisão conflitante 409, persistência após restart,
  exclusão e integridade do documento após mutações rejeitadas.
- Adicionadas verificações de preflight CORS para as duas origens; origem não
  permitida não recebe ACAO. POST/PATCH/DELETE rejeitam origem ausente, `null`,
  host não permitido, domínio semelhante com sufixo atacante e duas origens
  concatenadas em um único header. As rejeições preservam revisão e projeto.
- Leitura e alteração pública sem login verificadas conforme o modo compartilhado.

### Coberturas retiradas, explicitamente

1. Provisionamento de duas contas via `createAuth(...allowProvisioning)` no teste
   Nest e provisionamento de conta no teste de fila.
2. Login bem-sucedido dessas contas via `/api/auth/sign-in/email`.
3. Emissão/extração de cookie Better Auth e uso desse cookie nas chamadas,
   inclusive após reiniciar o app de teste.
4. `/api/auth/get-session` identificando o email autenticado.
5. Rejeição do signup público em `/api/auth/sign-up/email`.
6. Isolamento entre proprietários: outro usuário receber 404 ao ler, atualizar
   ou excluir; preservação do projeto após tentativa de exclusão cruzada.

Essas expectativas não descrevem mais a aplicação, cujo AuthModule está inativo.
Foram substituídas por acesso compartilhado e proteção de origem, **não por uma
alegação de cobertura de autenticação**. O módulo auth e suas dependências não
foram apagados ou reativados. Uma reativação futura exige cobertura própria e
revisão da configuração de URL única do Better Auth.

## Comandos e resultados reais

Executados antes de qualquer adaptação aos novos contratos da Viga:

- `npm run typecheck:back`: exit 0.
- `npm run build:back`: exit 0.
- `npm run test:back`: exit 0, **10 testes aprovados, 0 falhas**.
  Bancos de integração em diretórios temporários; nenhum teste usa o banco real.
- `git diff --check -- <arquivos do escopo>`: sem erros; apenas avisos LF/CRLF.
- Script Node de CRUD pelo ngrok e comparação dos snapshots: exit 0,
  sequência 201/200/204/404 comprovada e 21 documentos preservados.
- Nenhuma chamada de login continua nos `.test.mjs` executados pelo backend.

Os testes antigos de pessoas livres/percursos ainda existem para preservar a
cobertura atual; não representam aceite da cadeia nova. A adaptação aos novos
contratos faz parte do item 3 e depende da liberação do coordenador.

## Pendente / contratos / dúvidas

- **Item 3 concluído**, conforme atualização acima e commit `c90843b`.
  Import de migração adicionado somente após o commit autorizado da Viga.
- Nenhum contrato de `back/core/**` ou `validation*` foi modificado pelo Codex.
- Nenhum manifesto/lockfile/front foi modificado ou incluído nos commits do Codex.
- Pendente no aparelho: câmera, tracking, touch físico e iPhone não foram testados
  nesta frente. A prova pública é HTTP, não certificação de runtime AR.
- Dúvidas novas para o usuário: nenhuma. Decisão sobre reativar login permanece
  pendente conforme README das ondas.
- Sem push ou merge na main.
