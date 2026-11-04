> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Fechamento do QA local do editor

Rodada adicional em 22/10/2026; complementa QA-LOTE-03.md e substitui suas
pendências específicas que receberam evidência abaixo. Credenciais de QA não
fazem parte deste arquivo nem do repositório.

## Correções e resultados

- Sessão expirada: a edição guardava snapshot antigo ao receber 401. Agora
  guarda intenção e usa a cena mais recente ao entrar novamente. Teste real:
  sign-out, salvar com 401, acrescentar poste (4,4), autenticar pela interface;
  GET posterior confirmou esse poste e os anteriores no banco.
- Criação após 401: o nome foi alterado enquanto o formulário de reentrada estava
  aberto. Após login, o projeto foi criado com o nome mais recente e planta 6 × 5 m.
- Corpo acima de 100 KiB: encontrado retorno 500 sob o filtro da produção.
  Corrigido para 413/PAYLOAD_TOO_LARGE. Filtro registrado em AppModule para que
  testes e produção usem o mesmo caminho. JSON malformado também retorna 400.
  A interface manteve o rascunho no 413 real do Nest, conferido via proxy Next.
- Falhas de rede: rejeição de fetch injetada e API realmente parada mantiveram
  entidades/histórico na tela, sem navegação destrutiva.
- Timeout: upstream local deliberadamente sem resposta produziu 502 após
  aproximadamente 10.295 ms. Rascunho preservado; API normal restaurada depois.
- Fitas por cliques: portal clicou nos postes (1,1) e (7,1) no canvas. Primeiro
  e segundo seletores foram preenchidos, e a conexão explícita foi criada.
- Arraste: ferramenta nativa de drag do portal moveu poste, com um comando no
  histórico. Inércia de OrbitControls foi desativada para não retomar drift anterior.
- Cancelamento: R3F instalado não entrega pointercancel/lostpointercapture aos
  objetos como os handlers JSX esperavam. Agora há listeners DOM de captura.
  Um clique residual que criava poste após cancelar também foi bloqueado.
- Reteste: durante drag nativo com pointer ativo, pointercancel foi injetado no
  primeiro movimento. Posições e histórico permaneceram intactos; nenhum poste
  extra. Drag seguinte funcionou. Em outro drag, a captura real foi liberada no
  primeiro movimento: posições e histórico preservados; drag seguinte e clique
  legítimo no piso funcionaram. Erros de janela permaneceram vazios nessa rodada.
- Erro genérico de chunk: reproduzido em navegação editor/cancelar. Instrumentação
  temporária revelou NotFoundError/removeChild numa root DOM interna de Html/Drei,
  cujo nó já estava destacado. Etiquetas de medidas/áreas foram substituídas por
  sprites com CanvasTexture local, sem fontes externas ou roots DOM adicionais.
  Quatro ciclos savedview → editor → cancelar após rebuild não registraram erros
  de janela/rejeições nem erro de console. Instrumentação de diagnóstico não foi
  adicionada ao produto.
- Texto de validação: interface traduz erros geométricos para instruções PT-BR
  sem IDs técnicos; detalhes originais ficam no console de desenvolvimento.
- Alvos de toque: controles menores que 44 px corrigidos. DOM em viewport 390
  confirmou nenhum alvo visível abaixo de 44 px e nenhuma rolagem horizontal.
  Viewport 320 também não produziu rolagem horizontal do documento.

## Verificação e limites

Build Next final com TypeScript passou. Build API e as duas suítes Nest passaram
após corrigir o filtro, incluindo regressões de 413 e JSON malformado.
O domínio não mudou nesta rodada; seus 111 testes haviam passado na integração.

Screenshot do Maestri continua expirando com indicação de janela sem renderização;
o navegador de Computer Use também não disponibilizou superfície alternativa.
Não apresentar inspeção DOM como aceite visual. Legibilidade final dos sprites,
uso prolongado, gesto físico/multitouch e desempenho precisam de teste humano
no navegador/aparelho. Cancelamento foi injetado durante ponteiro ativo do portal,
não causado por interrupção física do sistema operacional.

Não há câmera/AR integrada na aplicação Next. Ainda falta implementação XR,
além da validação física. Ver REQUISITOS-ESTADO-ATUAL.md.

Serviços locais de QA ficaram ativos em localhost:3000 (Next) e 127.0.0.1:3001
(Nest). Nenhum commit, push ou deploy nesta rodada.
