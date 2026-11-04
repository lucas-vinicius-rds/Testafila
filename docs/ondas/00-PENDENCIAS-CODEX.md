# Passagem completa de pendências — Codex

Registro da conversa e da conferência estática feita para a passagem ao Claude
Code em 04/11/2026. Base conferida: commit `3763121`. Este documento distingue
pedidos não atendidos, implementação parcial e implementação sem aceite físico.
Relatórios antigos e textos da interface não comprovam conclusão funcional.

## 1. Demandas pendentes ou parcialmente entregues

### 1.1 Medição do ambiente pela câmera

**Pedido do usuário:** “essa opção polígono por coordenadas não faz o menor
seguinte pro usuário comum, precisa ser só a do retângulo e na vdd essa
‘medição’ teria que ser pela camera.”

**Estado real:** a opção pública por coordenadas foi retirada e a criação manual
retangular existe. A criação ainda parte de largura/profundidade fornecidas pelo
usuário. `apps/web/components/xr-project/xr-project-client.tsx` visualiza uma
planta já salva, alinhada por pontos. `/xr-check` experimenta medidas transitórias.
Isso não constitui levantamento da planta pela câmera.

**O que falta:** capturar o perímetro pela câmera, converter as marcações para um
ambiente editável no contrato compartilhado e validar dimensões, fechamento,
tracking e precisão. Não substituir isso por uma câmera HTML com objetos
sobrepostos sem posicionamento métrico confiável.

### 1.2 Uso no iPhone e comportamento semelhante ao app Medida

**Pedidos do usuário:** “o iphone 11 n é compativel?”; “n temos como fazer de outra
forma? pq o iphone tem aquele app medida que meio que faz isso que queremos,
sera que n seria possivel?”

**Estado real:** a implementação atual solicita WebXR `immersive-ar` com
`hit-test` e `local-floor`. Não existe implementação alternativa iOS no projeto.
O usuário informou iPhone 11; posteriormente Claude Code informou que WebAR não
funcionou no iPhone e funcionou num Samsung, sem modelo nem protocolo de ensaio.

**O que falta:** viabilizar o objetivo no iPhone e decidir a abordagem técnica.
ARKit e AR Quick Look foram sugestões do Codex, não escolhas aprovadas pelo
usuário nem implementações iniciadas. Quick Look permitiria principalmente
visualizar uma fila exportada para USDZ no ambiente; não entrega sozinho medir
o ambiente e editar a fila como no fluxo pretendido. Uma parte iOS com ARKit
poderia reutilizar backend, dados e regras do TestaFila, mas exige desenvolvimento
próprio. Não apresentar troca para Chrome no iPhone como solução do fluxo atual.

### 1.3 Pessoas realmente interligadas e espaçamento global

**Pedido do usuário:** “os espaçamentos n tao funcionando(vc n deveria poder
colocar varias pessoas independentes, a fila meio que fica toda interligada - n
pode mais permitir esse negocio livre, girou a pessoa no eixo certinho, e coloca
atras, fica tudo ligado, justamente por conta do espaçamento.”

**Pedido anterior relacionado:** “a pessoa ele deve ao vc colocar a primeira, a
pessoa posicionando a pessoa, e podendo rotaciona-la também, a gente coloca um
botão nas costas dela tipo? +1? e vai adicionando atrás, e se vc tiver com a pessoa
selecionada, ele parece pra vc selecionar o espacamento.”

**Estado real:** não atendido no domínio. Em `src/domain/queue/index.ts`,
`person:add` e `person:append` criam pessoas com referências de percurso nulas;
`person:move` e `person:rotate` alteram somente a selecionada.
`simulation:spacing` preserva as pessoas livres. O +1 usa a posição, o yaw e o
espaçamento da pessoa de origem para calcular uma nova posição, mas não grava
um vínculo de cadeia. A UI em `apps/web/components/queue-editor.tsx` chama isso de
“cadeia” e restringe parte do fluxo de inclusão, o que não resolve o modelo.

**O que falta:** representar vínculo/ordem da fila; propagar espaçamento para a
fila toda; definir e implementar propagação de movimento/rotação no trecho
seguinte, preservando os vínculos; definir remoção e recomposição da cadeia;
tratar conversão explícita de projetos antigos sem perda silenciosa. Atualizar
contratos, domínio, validação/API, undo/redo e testes significativos. Não tomar
o nome “cadeia” da interface ou o marker BASE-05 como prova de implementação.

### 1.4 Várias fitas no mesmo poste, por lados distintos

**Pedido do usuário:** “não to conseguindo conectar vários postes com a fita
juntos(um que tem fita n ta deixando, sendo que ele precisa poder colocar de
vários lados”.

**Pedido anterior relacionado:** “a conexão de fitas deveria ser mais fácil,
tipo clicar 2 vezes a aparecer meio que entre eles(conectar?)”.

**Estado real:** existem `belt:add`, seleção de dois postes, prévia e confirmação.
O domínio rejeita duplicatas e colisões. Na leitura estática não foi identificado
um limite explícito do grau de conexões por poste. Isso não comprova a resolução
do caso concreto relatado. Arquivos centrais: `src/domain/queue/index.ts` e
`apps/web/components/queue-editor.tsx`.

**O que falta:** reproduzir um poste ligado a três ou mais postes em lados
distintos, incluindo seleção touch de poste já conectado. Identificar se o
bloqueio vem de seleção/raycast, estado da ferramenta ou geometria. Corrigir a
causa sem liberar duplicatas A-B/B-A, cruzamento indevido ou passagem pelo corpo
de terceiros postes/obstáculos. Registrar evidência do fluxo real.

### 1.5 Mobile e gestos touch como experiência principal

**Pedidos do usuário:** “ele claramente n ta desenhado pro mobile, precisa ter
mais integração e pensamento pra tela mobile”; “o sistema ainda n parece muito
pensado pro mobile e principalmente pro toque touch”.

**Estado real:** existem bandeja recolhível, alvos ampliados, Pointer Events,
captura/cancelamento e modos Navegar/Editar em
`apps/web/components/queue-editor.tsx`, `apps/web/scene/scene-viewer.tsx` e
`apps/web/app/styles.css`. O QA completo anterior do Codex era do lote 4, com
Edge headless nos tamanhos 1280×900, 390×844 e 320×568. Em novembro foram feitas
verificações básicas de páginas em viewport mobile, não aceite físico completo
da interface atual. O relato novo de Samsung funcionando refere-se a WebAR,
sem detalhes que certifiquem os gestos do editor.

**O que falta:** aceite físico da versão atual: seleção, arraste, pinch, orbit,
troca de ferramentas, cancelamento pelo sistema, perda de captura, clique
residual, rolagem interna, orientação, safe areas, teclado e uso prolongado.
Garantir que câmera e seleção/colocação não disputem o mesmo gesto. Não assumir
que testes de mouse ou touch emulado equivalem ao dedo no aparelho.

### 1.6 Navegar pelo ambiente e ver pessoas de vários ângulos

**Pedido do usuário:** “eu preciso ter a opção de poder mexer tabem no espaço o
ambiente(eu so posso girar a fila no proprio eixo, que pra ver as pessoas e tudo
mais fica ruim e limitado)”.

**Pedido anterior relacionado:** “a rotacação do ambiente ta muito ruim, precisa
ter um botão pra vc girar horizontalmente, verticalmente, aproximar e todas as
movimentações espaciais. - sei que em perspectiva melhora essa rotação mas quero
que seja mais simples.”

**Estado real:** existem comandos explícitos de câmera, pan, zoom, rotação,
recentralização e modos de interação. `ViewControls`, em
`apps/web/scene/scene-viewer.tsx`, mantém `enableRotate={view !== 'top'}`.

**O que falta:** validar no aparelho e com o usuário se navegar no espaço agora
atende ao pedido sem disputar gestos com objetos. Não confundir giro de uma
pessoa/fila com giro/deslocamento da câmera. O Codex interpretou o pedido como
navegação da vista espacial, não como alterar as coordenadas persistidas de
todo o ambiente; se houver dúvida, essa diferença precisa ficar explícita.

### 1.7 Botão +1 maior, legível e tocável

**Pedido do usuário:** “o botão de mais um(+1) ta muito pequeno”.

**Estado real:** existe uma alternativa DOM no inspector, com intenção de alvo
touch maior. Na cena, `PersonObject` em `apps/web/scene/scene-viewer.tsx` ainda
usa círculo de raio 0,2 m e sprite de escala 0,34×0,17 m. O tamanho aparente do
controle depende do enquadramento/zoom. Ampliar alvos invisíveis do corpo não é
o mesmo que ampliar o botão +1.

**O que falta:** tornar o +1 da cena legível e tocável em tamanho de tela,
preservando separação de vizinhos e evitando arraste da pessoa ou commit duplo.
Validar no aparelho e manter a alternativa DOM acessível.

### 1.8 Mover, girar ou apagar ao selecionar qualquer elemento

**Pedido do usuário:** “clicando em cima de qualquer elemento ele deveria dar a
opção de movimentar, girar ou apagar.”

**Estado real:** em `apps/web/components/queue-editor.tsx`, pessoa tem as três
ações; poste tem mover, apagar e conectar; fita explica a dependência dos postes
e permite apagar; área tem seleção, métricas e apagar, além de arraste na cena.
Não há transformação completa uniforme para todos os tipos.

**O que falta:** completar a experiência consistente por tipo, especialmente
transformação/rotação de área. Rotação de poste circular pode não ter efeito
visível; fita precisa transformar pelos endpoints. Explicar exceções com clareza,
sem oferecer botões fictícios nem romper referências. Garantir seleção e
fechamento do inspector por toque.

### 1.9 Modelo do poste na paleta e posicionamento por arraste

**Pedido do usuário:** “adicionar poste deveria ter o modelinho 3d ali do poste,
vc pegaria, arrastaria pra onde iria querer colocar, e coloca(o tamaho dele pela
base também ta conflitando demais, ele deveria ser um negocio mais reto.”

**Estado real:** modelo 3D na cena e arraste existem. A base usada pela UI foi
reduzida para 0,08 m e a altura é 0,95 m. A paleta usa SVG (`ItemThumbnail` em
`apps/web/components/queue-editor.tsx`), não miniatura 3D real.

**O que falta:** se o pedido for literal de modelo 3D na paleta, essa parte ficou
parcial. Validar visualmente proporções, footprint e facilidade de arraste touch.
Não afirmar que uma ilustração SVG equivale à miniatura 3D solicitada.

### 1.10 Grade da área restrita e passo configurável

**Pedido do usuário:** “pra area restrita, ela tabem mostrar um grid pra
prosicionar certinho(e a pessoa pode selecionar o tamanho do grid - sugere uns
padrão)”.

**Estado real:** existem grade e opções 0,10/0,25/0,50/1 m/desligado no editor e
na cena. Porém as Configurações da galeria guardam outro estado, separado do
estado do editor. Arquivos: `apps/web/components/dashboard.tsx`,
`apps/web/components/settings-panel.tsx`, `apps/web/components/queue-editor.tsx`
e `apps/web/scene/scene-viewer.tsx`.

**O que falta:** fazer preferências do app chegarem efetivamente ao editor e
validar que grade visual e snap de desenho/movimento sejam coerentes. Mudar o
passo não deve deformar silenciosamente geometria já salva.

### 1.11 Distâncias externas da área até cada parede

**Pedido do usuário:** “deixar também as distancias externas da area restrita(uma
por parede) pra ver se ta correto”.

**Estado real:** `calculateAreaDistances`, em
`apps/web/scene/scene-viewer.tsx`, calcula quatro diferenças entre bounds. Os
números aparecem no inspector de `queue-editor.tsx`. A verificação aceita
perímetros ortogonais, incluindo possíveis formas côncavas, e não garante que
o bound corresponda à parede relevante naquela direção.

**O que falta:** não apresentar distância ao bounding box como distância à
parede real. Restringir corretamente ao caso retangular suportado ou calcular
interseções com as paredes. Não há cotagem externa completa desenhada na cena.
Fora da geometria suportada, informar indisponibilidade em vez de inventar valor.

### 1.12 Prévias reais das filas

**Pedido do usuário:** “as prévias das filas não tao funcionando”.

**Estado real:** bug confirmado por leitura. `ProjectThumbnail`, em
`apps/web/components/dashboard.tsx`, procura `data.project.scene`.
`ProjectsService.getProject()`, em `apps/api/src/projects/projects.service.ts`,
devolve o projeto diretamente, com `data.scene`. O gerador SVG existe em
`apps/web/lib/scene-thumbnail.ts`, mas esse caminho de consumo não o alimenta
corretamente e termina no fallback.

**O que falta:** corrigir o formato consumido e testar miniaturas reais,
atualização após salvar, carregamento e erro. Não depender de `previewKey` sem
URL definida nem criar um contexto WebGL para cada card.

### 1.13 Estrutura de aplicativo, menu e configurações

**Pedido do usuário:** “eu acho que o menu precisaria ser mais limpo, tendo:
configurações, criar nova fila, visualizar minhas filas, como um menu de app
monbile de fato(ele ta parecendo demais ainda um site, ele tem que ter estrutura
de app)”.

**Pedido anterior relacionado:** “a tela de edição da fila deveria ser
basicamente como no the sims(um painel direito lateral com todos os itens que vc
vai arrastando.”

**Estado real:** `apps/web/components/app-nav.tsx` existe com os três destinos.
Há paleta/painel e bandeja mobile. Entretanto as configurações da galeria não
alimentam o editor. O estado ativo usa `usePathname()`: Configurações depende
de query string, ausente no pathname; “Minhas filas” também corresponde a
`/projects/new`, podendo ficar ativo junto de “Criar nova fila”.

**O que falta:** conectar preferências, corrigir estados ativos e testar a
estrutura de app no uso real, incluindo voltar, ferramentas, seleção e espaço
de canvas. Não considerar a mera presença de três links como aceite do pedido.

### 1.14 Aplicação pública via ngrok funcionando de ponta a ponta

**Pedido do usuário:** “Get my local app online with ngrok and verify it actually
works”; “Find my app and its local port, and confirm both with me before you
start the tunnel”; “Start the smallest ngrok endpoint (…) keep it running in the
background (…) request the public URL and show me the response”.

**Estado real:** usuário confirmou TestaFila na porta 3000 e iniciou o agente
manualmente depois que a criação do processo foi bloqueada pela revisão
automática. O túnel existente foi reutilizado. Galeria e health públicos
responderam HTTP 200; health retornou `{"status":"ok"}`. URL verificada:
`https://defendant-dragging-dreadlock.ngrok-free.dev`.

Gravação pública retornou HTTP 403 por `checkOrigin` em
`apps/api/src/projects/projects.controller.ts`. A API ainda permitia a origem
local. O comando do Codex para reiniciar a API com `APP_ORIGIN` igual ao domínio
HTTPS também foi bloqueado pela revisão automática.

**O que falta:** ajustar a origem permitida e reiniciar a API pelo fluxo
autorizado, preservando validação. Testar criar, editar e excluir pelo domínio
público; acesso de leitura e câmera não comprovam gravação. O túnel só permanece
disponível enquanto o processo ngrok iniciado pelo usuário continuar ativo.

### 1.15 Documentação completa, passagem e versionamento final

**Pedidos do usuário:** “escreve um relatorio, ja tem pasta docs? se n tiver cria
ela e colcoa tudo de documentação la”; “coloca nas docs o que foi feito e o que
ainda falta, pra eu passar pra um colega”; “pode commitar no repositorio
diretamente na main”; depois “pode pushar”.

**Estado real:** entregas anteriores foram commitadas/publicadas. Na conferência
da passagem, `docs/README.md` estava modificado e
`docs/PANORAMA-LOCAL-2026-11-04.md` não rastreado. Há documentos antigos
contraditórios sobre login, protótipo Vite, AR integrada e cadeia de pessoas.

**O que falta:** consolidar o estado real, incorporar o relato físico novo,
versionar a passagem atual e seguir o fluxo vigente do novo chefe. Não há código
novo meu de ARKit/Quick Look aguardando publicação. Não confundir autorização
histórica de commit/push com afirmação de que os arquivos atuais já foram enviados.

### 1.16 Conformidade com os PDFs e comprovação física

**Pedido do usuário:** “o sistema ta funcionando com a camera? ele ta seguindo
os requisitos daqueles pdfs da raiz?”

**Estado real:** há implementação parcial do objetivo WebAR. Critérios de
precisão, desempenho e usabilidade estão documentados, mas não comprovados pela
execução de builds ou pelos testes geométricos. O relato novo de funcionamento
no Samsung não contém protocolo de precisão/tracking.

**O que falta:** reconciliar mudanças autorizadas com os PDFs e registrar
evidência para os critérios aplicáveis: comparação física com trena (5% em 20 m
no protocolo documentado), latência de colisão nos aparelhos, estabilidade,
tracking, uso prolongado e SUS com cinco usuários. Esses são critérios extraídos
dos documentos, não novas frases literais do usuário nesta conversa. Não marcar
o MVP inteiro como concluído só porque a sessão de câmera abre.

## 2. Bugs e lacunas adicionais conhecidos

### 2.1 Configurações da galeria sem efeito no editor

`dashboard.tsx` guarda `gridStep/navigationMode` em estado local e
`queue-editor.tsx` cria seus próprios estados. O painel promete efeito que não
chega ao editor. Relacionado às demandas de app mobile e grade configurável.

### 2.2 Estado ativo incorreto da navegação

`app-nav.tsx` usa pathname para procurar “settings”, mas Configurações navega
para `/dashboard?settings=1`. O matcher de Minhas filas inclui qualquer
`/projects/`, inclusive criação, produzindo estado ativo ambíguo.

### 2.3 Testes desatualizados após remoção de autenticação

Última execução do Codex: `npm run test:api` teve 6 aprovados e 4 falhas no
resumo do runner. Testes ainda chamam `/api/auth/sign-in/email`, removida da
aplicação; o teste de migração espera contagem antiga.
`tests/e2e/visual-editor.spec.ts` também exige credenciais e login removido.
Não foi reintroduzida autenticação para mascarar a divergência, nem alterada a
suíte para aparentar aprovação. Arquivos incluem
`apps/api/test/migrations.test.mjs`, `nest.integration.test.mjs` e
`queue.integration.test.mjs`.

### 2.4 Alinhamento XR sem limiar de aprovação

Em `apps/web/components/xr-project/xr-project-client.tsx`, `confirmAlignment`
aceita três correspondências, mas não bloqueia confirmação por erro/resíduo
acima de tolerância física validada. `xr-project-logic.ts` calcula métricas; o
cálculo não equivale à aplicação de um critério de aceite.

### 2.5 AR de visualização, não editor/captura completa

A rota `/projects/:id/ar` posiciona cena salva, permite ajustes transitórios e
não captura automaticamente o ambiente nem oferece montagem completa da fila
na câmera. Não confundir `/xr-check`, `/projects/:id/ar` e o editor 3D.

### 2.6 Fluxo XR sem DOM Overlay não certificado

`dom-overlay` é opcional na solicitação de sessão. Falta comprovar que o fluxo
completo de coleta/seleção/confirmar/sair continue utilizável quando ele não
estiver disponível. Não há evidência de teste físico desse caso pelo Codex.

### 2.7 Descobribilidade do acesso WebAR

O usuário não encontrou a opção. O Codex confirmou no navegador público que
o link está em `apps/web/components/saved-project-view.tsx`, no fim da revisão
do projeto, junto de “Editar fila”. Caminho: galeria → Abrir → rolar até
“Abrir WebAR experimental”. Ele não está dentro do editor. O link existia e
ficou visível após rolar em viewport 390×844, sem pageerror; isso não resolve
necessariamente a dificuldade de descoberta relatada.

### 2.8 Distâncias de área baseadas em bounds

O cálculo de quatro distâncias aceita bordas ortogonais, o que não prova um
retângulo. Numa planta côncava, os extremos do bounding box podem não ser as
paredes relevantes. Não usar esses números como medida universal até corrigir
ou delimitar explicitamente o suporte.

### 2.9 Previews ignoram o formato real da API

O consumidor usa `data.project.scene`, mas a API devolve `SavedProject` diretamente.
O gerador SVG existente não comprova preview funcional. Ver demanda 1.12.

### 2.10 Documentos e mensagens mais otimistas que o código

`docs/BASE-05-PRONTA.md`, textos de “cadeia” da interface e registros de entrega
não comprovam vínculo persistente de pessoas. Documentos antigos ainda citam
login, ausência de AR integrada e preservação do protótipo, divergindo do fork
atual. `docs/TESTE-MANUAL.md` contém passos da interface anterior.

### 2.11 Capacidade e desempenho: limites, não novos pedidos literais

O motor mantém alocação conjunta determinística gulosa por ordem de percurso,
não otimização combinatória global. Há teto operacional de 10.000 pessoas.
Testes de domínio nesse teto não certificam FPS, latência ou memória em celular.
Esses limites devem continuar explícitos e não ser apresentados como bugs já
reproduzidos em aparelho ou como pedido novo do usuário de otimização global.

### 2.12 Bugs históricos corrigidos, sujeitos a regressão

O erro React/DOM `removeChild` relacionado às roots separadas de Drei Html foi
tratado substituindo Html por sprites. Também foram tratados cancelamento de
arraste, pointerup tardio, clique residual e drift por damping. O Codex não tem
novo relato que comprove esses bugs ainda abertos no commit atual. Não reabrir
como falhas confirmadas sem reprodução; incluí-los na regressão touch física.

## 3. Itens já presentes a não reabrir como ausentes

Esta lista não substitui aceite visual ou físico, mas evita refazer trabalho
existente sob a alegação de que não foi implementado.

- **“precisa ser só a do retângulo”**: fluxo público por coordenadas foi removido;
  criação manual retangular permanece. A parte de medição pela câmera continua
  pendente separadamente.
- **“o que a altura medida das paredes teria de efeito (…) n acho que precisa”**:
  altura foi ocultada do fluxo público/revisão; dado permanece interno. Não
  reintroduzir campo obrigatório nem remover contrato sem avaliar legado.
- **“ajustar vertices (…) arrasta e solta em um canvas”**: alças/arraste dos
  cantos existem. Falta aceite físico atual, não implementação do zero.
- **“área restrita (…) drag (…) pergunta (…) certo (…) outra (…) cancelar”**:
  desenho, prévia, confirmar, redesenhar e cancelar existem. O usuário disse
  **“gostei do funcionamento da area restrita”**. Preservar esse comportamento.
- **“ela é a unica que ta sem svg - coloca pra ela também”**: área já possui
  SVG em `ItemThumbnail` de `queue-editor.tsx`.
- **“a logo (…) não foi herdada (…) fila verde”**: logo original restaurada em
  `apps/web/components/brand-logo.tsx`, com geometria SVG da referência.
- **“procura uma biblioteca de svgs mais cartunescos”**: Phosphor foi escolhido
  e está instalado, com ícones duotone/bold. Não confundir isso com miniatura
  3D literal na paleta.
- **“deixar o botão de acessar a fila mais obvio”**: cards têm CTAs Abrir e
  Editar. Falta eventual aceite de clareza, não ausência de links.
- **“pronta pra salvar (…) parece um botão mas n faz nada”**: usa indicador
  textual de status, com classes `status-indicator-valid/invalid`; a ação Salvar
  é separada. Regras CSS antigas `.queue-valid` não provam que o indicador atual
  continue usando aparência de botão.
- **“desfazer e refazer (…) deixa eles verticais e com ícones”**: componente
  `apps/web/components/undo-redo-bar.tsx` implementado como barra vertical com
  ícones. Verificar posicionamento no aparelho, sem refazer como ausente.
- **“faz o back em nest e o banco sqlite por enquanto”**: Nest e SQLite presentes.
- **“atualiza baseado [no fork do Ricardo] (…) roda ele”**: atualização por
  fast-forward realizada para `3763121`, origin corrigido e serviços iniciados.
- **Skills/perfis pedidos**: mobile-app-ui-design, antiwebslop e catálogo
  agency-agents instalados e caminhos/revisões documentados em
  `docs/SKILLS-LOTE04.md`. Os packs anteriores também foram instalados. Não
  alegar aplicação de todo módulo Owl-Listener só porque foi instalado.
- **Ngrok HTTPS de leitura**: endereço público foi efetivamente requisitado e
  respondeu; o bloqueio restante de gravação é específico de origem da API.
- **Builds nesta máquina em 04/11**: API e Next aprovados. A falha de build
  `Could not parse output from TypeScript's --showConfig` citada no relatório
  recebido não se reproduziu nessa atualização. Não marcá-la como bloqueio
  atual sem nova reprodução.

## 4. Decisões e preferências vigentes do usuário

1. **Backend Nest e SQLite por enquanto.** Não trocar stack/banco sem motivo
   ligado ao pedido atual.
2. **Fonte mais recente é o fork RicardoDMAssis/Testafila.** O usuário pediu
   atualizar com ele. `origin` foi corrigido; o remote anterior foi preservado.
3. **Canvas e toque são centrais.** Usuário comum não deve depender de coordenadas,
   jargão técnico, hover, botão direito ou teclado para montar a fila.
4. **Fila realmente interligada prevalece sobre pessoas livres.** O pedido mais
   recente substitui a escolha anterior usada no lote 4. Não manter pessoas
   independentes só porque o contrato antigo permitia.
5. **Manter a interação de área aprovada.** O usuário a elogiou; melhorar ícone,
   grade e medidas sem destruir o fluxo de desenho/confirmar/cancelar.
6. **Logo e identidade existentes devem ser herdadas.** Não inventar nova marca
   ou substituir a paleta por padrões genéricos de skill.
7. **3D antes da câmera era a ordem da etapa anterior.** Depois o usuário pediu
   e testou WebAR. Não usar a ordem antiga como proibição permanente de trabalho
   em câmera/iPhone.
8. **Agys com `--dangerously-skip-permissions`; Luna com `--yolo`.** Usar modelos
   realmente disponíveis/verificados. Houve autorização anterior para Luna
   quando Agys estava sem quota; a última onda foi solicitada para Agys.
9. **Última delegação:** briefings sucintos, escopos fechados, sem dar abertura
   para mudanças arbitrárias. Usuário disse que não precisava de conferência do
   coordenador nem de solicitações de retorno pelo Maestri; ele acompanharia os
   terminais e testaria. Não impor ask back ou gate do Codex contra essa ordem.
10. **Ngrok:** confirmar app e porta antes de expor; foi confirmado TestaFila
    3000. Nunca colocar authtoken no chat/Git. Não adicionar autenticação, rate
    limiting ou outra política sem pedir antes. Aproveitar túnel existente e
    deixá-lo ativo durante o teste.
11. **Documentação em docs e passagem clara.** Registrar o que funciona, o que
    falta e os limites reais dos testes. O usuário autorizou historicamente
    commit direto na main e depois push; entregas anteriores usaram essa
    autorização. O novo chefe deve seguir o fluxo vigente e não declarar
    publicação que não ocorreu.
12. **Autenticação foi removida pelo fork recebido.** Não tenho nesta conversa
    uma ordem direta do usuário para restaurá-la. O pedido de atualizar com o
    fork não deve ser confundido com um pedido novo de reintroduzir login.
    Também não esconder que todos os projetos ficaram compartilhados.
13. **Uma unidade espacial equivale a um metro.** Câmera/renderizador não devem
    inventar escala ou precisão. Projeto persistido e alinhamento de sessão
    são conceitos distintos; não gravar pose XR como origem do projeto sem
    decisão explícita e validação.

## 5. Estado dos aparelhos e alcance das evidências

### Informação recebida na passagem mais recente

Claude Code informou: **o usuário testou WebAR, não funcionou no iPhone e
funcionou no Samsung**. O iPhone informado anteriormente pelo próprio usuário é
**iPhone 11**.

**O Codex não sabe o modelo do Samsung**, sistema, navegador, versões, condições
de iluminação, se houve alinhamento completo, se apenas abriu a câmera, se
objetos ficaram estáveis, nem os resultados de precisão. Não inferir Chrome,
ARCore instalado, ensaio de 20 m ou aceite integral a partir de “funcionou”.

### Testes executados pelo Codex

- Nenhum aparelho físico foi testado pelo Codex.
- Testes de navegador usaram Edge headless/SwiftShader, inclusive viewport mobile.
- Na versão atual, galeria e página AR abriram sem pageerror; o navegador de
  teste informou ausência de suporte a `immersive-ar`.
- O botão WebAR foi confirmado na revisão de um projeto salvo pelo endereço
  público, após rolar a página. Não é prova de sessão física de câmera.
- Domínio e lógica XR: 132/132 testes aprovados, 20 suítes, Node 24.
- API: 6 aprovados/4 falhas no resumo do runner, pelas divergências descritas.
- API e frontend compilaram; health e galeria responderam local e publicamente.
- O POST público usado para verificar origem tinha corpo inválido `{}` e
  retornou 403; não criou projeto.

## 6. Trabalho em andamento e cautelas de passagem

Não há implementação ativa do Codex aguardando continuação. Nenhuma adaptação
ARKit, Quick Look, App Clip ou alternativa iOS foi iniciada pelo Codex.

O último `git status` conferido antes de gravar este documento mostrava somente
`docs/README.md` modificado e `docs/PANORAMA-LOCAL-2026-11-04.md` não rastreado.
Não reverter esses arquivos supondo serem alterações desconhecidas; são a
passagem atual. Este documento foi solicitado depois dessa conferência.

O backup Git `backup/antes-ricardo-20261104` preserva a revisão local anterior;
os arquivos SQLite/WAL/SHM foram copiados antes de iniciar a versão nova para
`%LOCALAPPDATA%/TestaFila/backups/2026-11-04`. Dados locais e segredos não devem
ser publicados. Nenhum authtoken foi lido ou exibido pelo Codex.

As restrições “sem commit/push” e escopos particulares nos sprints eram
instruções de execução aos agentes daquela onda, não novos pedidos literais do
usuário que revoguem automaticamente toda autorização histórica. O novo chefe
deve reconciliar as instruções vigentes em vez de tratar todo texto antigo
como contrato atual. Da mesma forma, critérios de PDFs e sugestões do Codex
não devem ser atribuídos ao usuário como decisões técnicas já tomadas.
