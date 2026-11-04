> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Lote 2 — mapeamento manual, modelo 3D e reabertura

Aceite integrado do coordenador concluído em 22/10/2026: build Next de produção
passou após as correções de cena/UI. Portal TestaFila QA no canvas percorreu login
real via proxy Next/Nest, criar planta, revisar, confirmar, salvar no SQLite, galeria,
abrir e reload preservando dados. Retângulo 10x8m: 80m², 36m de perímetro, paredes
2.8m. Planta côncava em L de 6 vértices: 27m², 24m de perímetro; salva e reaberta.
Viewports 390x844 e 1280x900 conferidos, sem overflow horizontal. Cena top/perspective
renderizou em WebGL no portal. Correções visuais: paredes translúcidas, sombras
removidas, enquadramento por aspecto, centro memoizado e preflight WebGL removido.
Console sem novos erros nas transições verificadas após o rebuild. Nome limitado a
100 caracteres e alvo de abrir >=44px. git diff --check passou.

Serviços locais iniciados pelo coordenador: Next http://localhost:3000 e Nest
http://127.0.0.1:3001. .env e SQLite locais estão ignorados pelo Git; conta/dados de
verificação local provisionados para esta execução. Portal permanece disponível.

Aceite cobre o fluxo manual deste lote. Não comprova medição física, AR em aparelho,
timeout real do upstream, FPS mobile ou ferramentas completas de fila. Próximos
módulos: áreas restritas editáveis e comandos reversíveis, postes/fitas, percurso e
pessoas; spike XR e realinhamento seguem pendentes.

Modelos efetivos após verificação: Agys continuou retornando quota esgotada; Cedro e
Prumo voltaram a gpt-6-luna medium --yolo por autorização prévia do usuário. Trama
também permanece Luna Medium. Papéis/caminhos abaixo se mantêm; Flash High representa
a preferência inicial, não o modelo efetivamente usado neste lote.

Usuário mandou retomar a equipe após retorno da quota. Base verificada pelo coordenador:
Next build/typecheck passou; Nest build/typecheck passou e integração de auth/projetos
passou; domínio com 90 testes aprovados. Dependências instaladas e rede disponível.

## Objetivo executável

API entregue e revisão do coordenador: build:api, typecheck:api e test:api passaram
novamente. Teste Nest abrange cenas manuais/invalidas, origem, limites de payload,
isolamento de leitura/escrita, conflito e reabertura persistente. Backend liberado
para integração deste lote. Coordenador ajustou scripts para carregar apps/api/.env
automaticamente em dev/start/migrate/user:create e corrigiu entryFile do modo watch.
CLI de migração/provisionamento usa JavaScript compilado, pois strip-types do Node
não executa decorators Nest. Hooks premigrate/preuser:create compilam a API antes.
Comando migrate:api validado pelo coordenador em SQLite :memory: com sucesso.
Limite: teste direto do Nest ainda não comprova interação Next/browser/WebGL.

Login -> criar fila -> informar dimensões medidas com trena ou coordenadas métricas
dos vértices -> revisar ambiente 3D com piso, paredes, grid e medidas -> confirmar
-> nomear e salvar planta no SQLite -> encontrar no dashboard -> abrir em 3D.

Esta entrega prepara o editor de filas. Não declarar o MVP completo: ainda faltarão
ferramentas completas de postes/fitas/pessoas e AR validada em aparelho.

## Donos exclusivos

- Codex: manifests/lockfiles, contracts/**, configuração e integração/aceite.
- Trama (Luna Medium): apps/web/app/**, apps/web/components/**, apps/web/lib/**.
  Fluxo guiado, rotas, estado do documento, salvar/abrir e ligação do dashboard.
  Não editar apps/web/scene/**, domínio, backend ou contratos.
- Prumo (Flash High): apps/web/scene/**. Visualizador R3F de ProjectScene.
  Não editar app/components/lib, domínio, backend, manifests ou contratos.
- Cedro (Flash High): apps/api/**, exceto manifests/lockfiles. Validação de cenas,
  migrações/configuração de execução e integração dos projetos mapeados.
  Não editar frontend/domínio/contratos. Qualquer mudança de endpoint passa por Codex.

Todos leem AGENTS.md e a referência ../slide-cintia/DESIGN.md conforme seu papel.
API já existente conserva os endpoints e respostas do SPRINT-01.md.
Sem commit/push/deploy neste lote. Cada entrega inclui verificações reais e ask back
para Codex. Modelos devem ser conferidos nos terminais após reinício; quota indisponível
deve ser relatada ao coordenador, sem substituição silenciosa.

## Contratos congelados para o lote

Documento em contracts/project.ts. Uma unidade = 1 metro; piso XZ, Y para cima.
Nova planta inicia com arrays vazios de áreas/postes/fitas/percurso/pessoas e simulation:
spacingMeters 0.8, personHeightMeters 1.7, personRadiusMeters 0.22, clearanceMeters 0.05.
São parâmetros geométricos iniciais editáveis nas fases seguintes, não validação física.
Planta manual tem measurement.source manual, checks vazios e sem observedErrorPercent.
Só confirmar ambiente válido; qualquer edição posterior limpa confirmedAt.

Componente apps/web/scene/scene-viewer.tsx exporta default SceneViewer e props de
contracts/scene-viewer.ts. Importá-lo em componente cliente via next/dynamic ssr:false,
com estado de carregamento e fallback claro se WebGL indisponível. Não renderizar
objetos Three no servidor. Aceita cena existente e view top/perspective.
onFloorPoint entrega coordenada em metros por raycast na planta virtual; não medição
de câmera. UI pode usar tabela de vértices para corrigir planta, sem depender desse callback.

Rotas: /projects/new cria planta; /projects/[id] abre projeto salvo (3D).
Dashboard Criar nova fila passa a navegar para /projects/new e Abrir para projeto real.
Cliente sem sessão retorna ao login. Guard servidor/API continua obrigatório.
Ao salvar: POST /api/projects expectedRevision null; edição de salvo usa PATCH com
revision atual, trata 409 sem sobrescrever silenciosamente. Não inventar previewKey URL.
Não inserir conteúdo do projeto/credenciais em querystring ou logs.

## Aceite por responsável

Trama: retângulo e polígono métricos editáveis; validação; revisão/confirmar; nomear
e salvar de verdade; galeria abre projeto recuperado; erro/401/409 claros, sem dados fake.
Manter documento único em memória. Usar funções de src/domain existentes por imports
relativos; não replicar matemática de geometria. CSS e fluxo seguem slide-cintia.

Prumo: Canvas responsivo, render sob demanda e DPR limitado; piso triangulado côncavo,
paredes proporcionais, grid de 1m, dimensões e OrbitControls/zoom/top. Cena enquadrada
em planta pequena/grande e longe da origem. Renderizar áreas e objetos do contrato
se presentes, permitindo futura integração do editor. Sem assets externos obrigatórios.
Reusar/dispor recursos e permitir fallback sem WebGL. Ler skills globais
r3f-best-practices, react-three-fiber-game e web-3d-asset-pipeline antes de implementar.

Cedro: aceitar/reabrir cena manual válida gerada por este lote; validar nulls, duplicatas,
limites, confirmedAt, geometrias e medição derivada de acordo com domínio; limites
de tamanho do payload; erros 400 sem crashes e owner/revision protegidos. Usar domínio
aprovado sem editar seus arquivos. Verificar configuração Better Auth para o proxy
em mesma origem e scripts migrate/user:create agora disponíveis. Documentar .env.example
e comandos dentro de apps/api, sem segredos reais versionados.

## Dependências

Coordenador instala @react-three/fiber 9.8.2 e @react-three/drei 10.7.9 (peers
consultados no npm oficial, compatíveis com React 19.3.1). Three 0.170.0 permanece
compatível com o protótipo e entra explicitamente no workspace web. Só coordenador
altera tsconfig e dependências. Responsáveis podem executar build/typecheck/testes
após avisarem que seus arquivos estão estáveis, sem rodar builds Next concorrentes.
