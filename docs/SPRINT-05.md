> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Ondas 5 — fila conectada e aplicativo touch

Estado de disparo: terminais substituídos por Agys Gemini 3.8 Flash High com
--dangerously-skip-permissions. A primeira execução retornou “Individual quota
reached”, com reset indicado em aproximadamente 21 horas. Plano/briefings
entregues; não considerar as ondas implementadas nem execução ativa comprovada.

Pedido de 28/10. Substitui escolhas conflitantes do lote 4. Usuário acompanha
terminais e fará aceite; não pedir ask back, revisão do Codex ou autorização via
Maestri. Registrar conclusão/bloqueio no próprio terminal e documento de status.
Não fazer commit/push, apagar trabalho existente, reiniciar API em uso ou mexer XR.
Preservar logo/cores, auth, rascunho, undo/redo, isolamento e validação no servidor.

## Ordem e arquivos exclusivos

1. Cedro: contratos de projeto/comandos, domínio, API e respectivos testes.
   Publicar `docs/BASE-05-PRONTA.md` com contrato/comandos definitivos após compilar.
2. Prumo: `apps/web/scene/**`, `contracts/scene-viewer.ts`, `docs/3D-INTERACOES.md`.
   Preparar interação enquanto Cedro trabalha; integrar fila após BASE pronta.
   Publicar `docs/CENA-05-PRONTA.md` com props/eventos definitivos e limitações.
3. Trama: `apps/web/app/**`, `components/**`, `lib/**` (exceto xr-check), CSS,
   docs/FRONTEND.md. Pode preparar navegação/ícones agora, mas integrar editor só
   após BASE e CENA prontas. Único dono de manifests/lockfile nesta rodada, apenas
   para `@phosphor-icons/react`. Finalizar typechecks/builds API+web sequenciais e
   reiniciar somente o Next após build aprovado, publicando `docs/ENTREGA-05.md`.

Não modificar arquivos do colega. Contratos de cada dono são congelados no marker;
não publicar marker com APIs ainda em edição. Dependências via arquivos locais,
sem mensagens Maestri. Se precisar aguardar, verificar markers espaçadamente,
sem polling apertado. Bloqueio real: registrar claramente, não inventar integração.

## Onda 1 — Cedro: correção do modelo

- Um poste aceita várias fitas em lados distintos. Não limitar grau do poste;
  permitir encontro no endpoint compartilhado. Manter proibições de duplicata
  A-B/B-A, fita cruzando obstáculo/terceiro poste/parede e cruzamento indevido.
- Uma fila conectada por projeto: primeira pessoa define início/orientação;
  seguintes entram atrás por +1. Não criar pessoas soltas como no lote 4.
  Reaproveitar routes/people se suficiente; não inventar schema paralelo na UI.
- Espaçamento 0,5/0,8/1 m recompõe TODA a cadeia, não só a próxima pessoa.
  Rotação/movimento de pessoa reposiciona trecho seguinte mantendo ligação e
  distância entre vizinhos; prefixo preservado. Distinguir direção +Z do modelo.
  Remover pessoa fecha a cadeia; sem órfãos. Operações e validação atômicas,
  colisões/limites/undo-redo preservados; +1 falho não altera cena.
- Projetos antigos continuam abrindo sem perda silenciosa. Para pessoas livres
  antigas, oferecer conversão explícita e determinística antes de continuar fila;
  rejeitar novos salvamentos inconsistentes, sem destruir legado na leitura.
- Definir comandos de mover/girar/remover por tipo (post/area/person/belt quando
  geometricamente aplicável). Fita ligada deriva dos postes: não desconectar
  endpoints para fingir movimento/rotação; UI deve explicar essa restrição.
- Testes focados: poste com 3+ fitas; cadeia, mudar spacing, girar/mover no meio,
  remover, colisão/rejeição, persistir/reabrir, legado e conflito de revisão.

## Onda 2 — Prumo: interação espacial touch

- Separar navegar pelo ambiente de editar objetos: modo Navegar permite orbit
  livre limitado antes de atravessar piso, pan e zoom/pinch; Editar evita câmera
  roubando arraste. Botões claros para deslocar vista nos eixos e recentrar.
  Mover câmera não muda coordenadas/dados da fila. Perspectiva deve permitir ver
  pessoas de outros lados; planta não pode ficar presa a um giro único.
- Pointer Events reais: captura, cancel/lostcapture, drag threshold e nenhum
  clique residual. Seleção por toque aciona inspector UI do elemento; nunca
  exigir hover, botão direito ou teclado.
- +1 grande/legível: alvo de pelo menos 44 CSS px quando viável e alternativa DOM
  touch de 48 px no inspector, sem capturar drag da pessoa ou cobrir vizinhos.
- Grid ajustável de 0,10 / 0,25 / 0,50 / 1 m e desligado, padrão 0,25 m. Mesmo passo
  visual e snap de desenho/arraste da área; não alterar geometrias já salvas só
  por mudar passo. Previews/confirmar/cancelar da área preservados.
- Área selecionada mostra quatro distâncias externas até paredes em planta
  retangular, uma por direção, em metros. Usar geometria real, nunca pixels;
  fora de geometria suportada mostrar indisponível, não inventar medida.
- Não reintroduzir Html/Drei roots nem recursos externos/loops contínuos.
  Props de grade/navegação e callbacks de seleção/transformação ficam documentados
  no marker CENA para Trama. Check estrito do arquivo; sem build concorrente.

## Onda 3 — Trama: estrutura de aplicativo

- Ler skills mobile-app-ui-design e antiwebslop em ~/.agents/skills e perfis
  instalados em ~/.agents/agency-agents. Manter verde/marfim e logo original.
- App shell mobile: navegação curta com Configurações, Criar nova fila, Minhas
  filas; estado ativo, voltar e ações previsíveis. Configurações funcionais de
  grade/navegação, sem tela decorativa, conta simulada ou reescrever backend.
- Todo toque num elemento abre ações Mover/Girar/Apagar, com confirmação quando
  destrutivo. Respeitar comandos Cedro; ações impossíveis em fita explicadas,
  nunca oferecer botão que não faz nada. Desselecionar/fechar inspector fácil.
- Primeira pessoa coloca início; remover ferramenta de várias pessoas livres.
  Demais só +1 com cadeia/spacing efetivo. Avisar conversão de legado conforme
  BASE. +1 DOM 48 px com texto visível, repetível e seleção da pessoa acrescentada.
- Ícones Phosphor duotone/bold arredondados, incluindo Área restrita, navegação,
  movimentação e histórico. Fonte oficial: https://github.com/phosphor-icons/react
  Usar imports pontuais/SSR adequados; não CDN nem pacote gigante de todas as SVGs.
- Desfazer/refazer em pequena barra VERTICAL flutuante com ícones e aria-labels;
  não consumir bloco vertical da bandeja. Respeitar safe areas e alvos >=44 px.
- “Pronta para salvar” vira indicador textual discreto, sem borda/fundo/aspecto
  de botão. Salvar é ação distinta. CTA Abrir/Editar fila óbvio em cada card.
- Prévias reais nas filas: miniatura derivada da cena salva (SVG métrico ou cena
  leve) sem depender de previewKey inexistente. Pode GET lazy por projeto visível;
  não lançar um Canvas WebGL para cada card nem vazar dados de outro proprietário.
- Canvas prioritário; inspector recolhível com scroll interno. Menu/câmera/CTA
  não podem ocultar canvas em 320×568/390×844. Navegar touch sem conflito com
  colocar/selecionar. Expor grid e distâncias fornecidos por Prumo.

## Fechamento sem coordenador

Cada dono executa apenas verificações necessárias do seu escopo e registra
resultado real. Trama integra quando os markers estiverem prontos, executa
builds sem concorrência, deixa projeto executável e documenta comandos, limites
e roteiro curto para usuário testar. Não declarar teste físico feito nem build
aprovado sem executar. Não solicitar retorno ao Codex; usuário acompanha.
