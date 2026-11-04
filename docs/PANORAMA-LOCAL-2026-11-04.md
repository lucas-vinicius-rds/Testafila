# Atualização e panorama local — 04/11/2026

## Atualização Git

Atualizado por fast-forward de `a7b4bf5` para `3763121` a partir de
https://github.com/RicardoDMAssis/Testafila.git. O diretório de trabalho estava
limpo. `origin` agora aponta para esse repositório e `main` acompanha
`origin/main`; o remote anterior foi preservado como `origem-anterior`.
Branch de segurança: `backup/antes-ricardo-20261104`.

O banco local foi copiado, com WAL/SHM, antes da inicialização, para
`%LOCALAPPDATA%/TestaFila/backups/2026-11-04`. A galeria manteve 21 projetos.
Não foram sobrescritos arquivos de ambiente ou publicados segredos.

## O que está disponível

- Next em http://localhost:3000 e Nest em http://127.0.0.1:3001.
- Galeria compartilhada, abrir/editar/criar/excluir projetos, SQLite e revisão
  esperada para conflitos. A autenticação foi desativada pela versão recebida:
  quem acessa a instância tem acesso aos projetos.
- Editor 3D, navegação de app, ícones Phosphor, miniaturas SVG, grade ajustável,
  áreas restritas e controles de navegação/edição.
- Cenas v2 com grupos de postes; migração de cenas v1 ao abrir.
- Rota experimental `/projects/:id/ar`: carrega a planta salva e tenta iniciar
  `immersive-ar` com `hit-test` e `local-floor` em contexto seguro. Dois pontos
  ajustam posição/rotação, um terceiro mostra resíduo. Escala nominal 1 m e
  alinhamento temporário por sessão. `/xr-check` permanece diagnóstico separado.
- Protótipo Vite foi removido do repositório novo.

## Pendências confirmadas no código

- A UI chama as pessoas de cadeia, mas o domínio ainda grava pessoas livres.
  Mover/girar afeta somente a selecionada; spacing não reorganiza pessoas livres.
  O +1 usa posição/orientação e espaçamento da pessoa de origem, sem manter vínculo
  persistente. Portanto o requisito de fila realmente interligada segue pendente.
- WebAR não faz levantamento automático da planta pela câmera; visualiza um
  projeto existente. HTTPS não garante suporte `immersive-ar` no aparelho.
- Sem ensaio físico de tracking, precisão, estabilidade ou aparelhos nesta rodada.
  A confirmação do alinhamento mostra resíduo, mas não impõe uma tolerância física
  validada. Não confundir a rota experimental com aceite de medição.
- Testes da API e E2E ainda incluem login removido, ficando incompatíveis com a
  mudança de autenticação. O teste de migração espera contagem antiga.
- Documentação antiga contém estados anteriores; este relatório descreve o
  código recebido e a execução verificada hoje.

## Verificação executada

- `npm ci --ignore-scripts` e `npm rebuild better-sqlite3`: concluídos.
- `npm run build:api` e `npm run build:web`: aprovados nesta máquina. A falha de
  build Next relatada no documento da versão recebida não se reproduziu aqui.
- Domínio e lógica XR (diagnóstico e alinhamento): 132/132 testes aprovados,
  20 suítes, Node 24.
- `npm run test:api`: 6 aprovados / 4 falhas no resumo do runner. Falhas apontam
  contagem de migrações e rotas `/api/auth/sign-in/email` removidas. Não foi alterada
  a suíte nem reintroduzido login para esconder essas divergências.
- Dashboard via HTTP: 200; `/api/health` pelo proxy: `{"status":"ok"}`;
  `/api/projects`: 21 projetos.
- Edge headless em 390×844: galeria e rota AR abriram com HTTP 200, sem pageerror.
  No navegador de teste, a rota informou ausência de suporte `immersive-ar`;
  nenhuma sessão física de câmera foi executada.

## Acesso HTTPS / ngrok

Usuário confirmou TestaFila na porta 3000. ngrok 3.39.11 está instalado e sua
configuração passou em `ngrok config check`. Instruções oficiais foram lidas em
https://ngrok.com/agent-setup/prompt.md.

A revisão automática desta sessão bloqueou o comando de criação do processo
ngrok em segundo plano com `blocked by policy`. O usuário iniciou o agente
manualmente e confirmou o início. O túnel existente foi reutilizado, sem criar
um segundo endpoint ou alterar políticas.

URL verificada: https://defendant-dragging-dreadlock.ngrok-free.dev

- GET público `/dashboard`: HTTP 200, conteúdo TestaFila.
- GET público `/api/health`: HTTP 200, corpo `{"status":"ok"}`.
- Browser Edge em 390×844: título `Seus projetos.`, contexto seguro verdadeiro,
  nenhum pageerror. Requisições de verificação usam `ngrok-skip-browser-warning`
  para alcançar o upstream; navegador comum pode exibir o aviso inicial do ngrok.
- POST público de corpo inválido `{}` para testar a origem: HTTP 403,
  `{"error":{"code":"FORBIDDEN","message":"Origem da requisição não permitida"}}`.
  Nenhum projeto foi criado por esse teste.

O comando para reiniciar a API com `APP_ORIGIN` igual à origem HTTPS também foi
bloqueado pela revisão automática. Portanto navegação/leitura/rota AR podem ser
testadas via HTTPS, mas salvar/excluir pelo domínio público permanece bloqueado
pela origem configurada. Salvar localmente em http://localhost:3000 continua
utilizando a origem permitida. Para liberar gravação pública é necessário ajustar
`APP_ORIGIN` e reiniciar a API manualmente; não foi removida a validação de origem.

Nenhum authtoken foi exibido ou salvo no repositório; nenhuma autenticação,
rate limit ou política ngrok foi adicionada. O agente permanece sob controle do
terminal aberto pelo usuário; Ctrl+C nesse terminal encerra o túnel. Não fechar
esse terminal enquanto o teste HTTPS estiver em andamento.

## Executar novamente

Na raiz `Testafila`, em dois terminais:

```powershell
npm run start --workspace @testafila/api
```

```powershell
npm run start --workspace @testafila/web
```

Builds já gerados nesta atualização. Sem login. Na página de um projeto salvo,
usar **Abrir WebAR experimental** para testar em aparelho compatível via HTTPS.
