# TestaFila

Atualização 04/11/2026: docs/ondas/README.md prevalece sobre tudo abaixo. Claude Code
coordena e não implementa; a equipe é Viga, Retina, Vitral e Codex. As instruções
abaixo são histórico, exceto as regras de domínio dos dois últimos parágrafos.

Pedido anterior 28/10: docs/SPRINT-05.md prevalecia. Agys Flash High com
--dangerously-skip-permissions. Sem ask back Maestri e sem gate de revisão do
coordenador; usuário fará aceite. Escopos/markers no sprint: Cedro base/contratos
e API, Prumo cena/contrato de cena, Trama UI e fechamento integrado. Não assumir
que o modelo de pessoas livres do lote 4 continua sendo o comportamento desejado.

Atualização 28/10/2026: escopos vigentes em docs/SPRINT-04.md. A revisão atual
prioriza editor 3D e mobile antes da câmera. Cedro mantém domínio/testes de filas;
Trama UI/CSS/lib (exceto xr-check); Prumo scene e docs/3D-INTERACOES.md.
Coordenador integra API, contratos, manifests e QA Playwright. Skills solicitadas
e personas instaladas estão em docs/SKILLS-LOTE04.md. Não declarar aceite em
aparelho físico a partir de viewport headless; XR continua experimental.

O usuário pediu coordenação com fases e agentes especializados. Antes de alterar código,
leia docs/ARCHITECTURE.md, docs/DELIVERY.md e docs/referencias/DESIGN-SLIDE-CINTIA.md.
A especificação de MVP do usuário de 22/10/2026 prevalece sobre o protótipo e os PDFs.

Use o Maestri para equipe quando conectado: list antes de delegar/recrutar, confirmar
presets, reutilizar agentes e pedir ask back. Luna Medium para escopos médios;
Agys/Flash 3.8 High para tarefas difíceis; Flash 3.8 Low para simples, conforme usuário.
Nunca declarar uso de preset/modelo que não foi verificado. Sem MAESTRI_PIPE, relatar
limitação e preparar tarefas; não inventar conexão ou agentes.

Preferência explícita do usuário para recrutamento: Agys sempre com
--dangerously-skip-permissions; Luna/Codex com --yolo. Manter modelo/esforço solicitado
e usar --replace ao atualizar um terminal existente, preservando conexões. Isso não
autoriza contornar bloqueios de rede, sandbox ou ações negadas ao coordenador.

Atualização do usuário após esgotar quota Agys: delegar as pendências dos Agys para
outros Luna Medium. Cedro e Prumo passam a gpt-6-luna medium com --yolo, mantendo
papéis e caminhos exclusivos. Essa autorização substitui a distribuição anterior
por dificuldade enquanto durar esta etapa.

Atualização seguinte: usuário informou retorno da quota e mandou retomar a equipe.
Lote 2 volta à distribuição original: Cedro e Prumo em Agys Flash 3.8 High,
Trama em Luna Medium. Escopos atuais estão em docs/SPRINT-02.md e prevalecem
sobre os caminhos do lote anterior; trocar modelos via --replace mantendo os nós.

Verificação ao iniciar lote 2: Agys ainda respondeu Individual quota reached.
Aplicada autorização anterior de usar outros Luna: os três terminais trabalham
com gpt-6-luna medium --yolo neste lote. Não afirmar recuperação da quota Agys.

Só o coordenador modifica manifest, lockfile e contratos comuns. Cada implementador
recebe escopo exclusivo de arquivos. Não mudar contratos durante tarefas concorrentes.

Escopos atuais no lote3: docs/SPRINT-03.md. Cedro assume src/domain/queue/** e
tests/domain/queue/**; coordenador assume apps/api/**. Trama faz UI, Prumo scene.
Antes de dar uma tarefa por concluída, registrar testes e limites reais da verificação.

Passagem em 27/10/2026: documentação canônica em docs/README.md e
docs/PASSAGEM-COLEGA.md. Textos em docs/historico e sprints são registros datados,
não o estado atual. Usuário autorizou commit direto na main; sem pedido de push.
Nesta revisão Cedro mantém domínio de filas e docs/DOMINIO.md; Trama UI e
docs/FRONTEND.md; Prumo tem app/xr-check/**, components/xr-check/** dentro de
apps/web e docs/XR-PENDENCIAS.md para um spike isolado. Coordenador integra,
documenta, valida e faz commit. Spike experimental não é AR integrada ao editor.

Frontend segue slide-cintia: tokens, linguagem editorial e mobile-first. Usar skills
de design pedidas quando disponíveis, lendo o SKILL.md relevante. Não gerar identidade
nova. 3D segue as três skills solicitadas quando instaladas; geometria é independente
de renderização. Não afirmar instalação de skills sem verificar os arquivos globais.

Uma unidade espacial = 1 metro. Câmera comum não é medição/AR confiável. Origem do
projeto é persistente; alinhamento XR pertence só à sessão. Nova sessão exige realinhar.
Persistência real por proprietário; nenhum login simulado ou localStorage substituindo
banco. Postes/fitas/pessoas/percurso são entidades distintas; 3D e AR compartilham dados.
