# Relatório de mudanças — 10 de novembro de 2026

Este relatório registra as alterações feitas nesta sessão, na branch
`ondas/camera-e-arquitetura`. A primeira etapa (estabilizador) foi comitada
pelo usuário em `6ddef11`. A segunda etapa (âncoras, orientação e detecção de
planos) está apenas no worktree. Não houve push, merge nem alteração em
`back/`, `back/core`, contrato de cena v2 ou SQLite.

## Motivo

O usuário relatou que a detecção do chão/ambiente e a criação de postes pelo
WebAR estavam instáveis. A leitura do código mostrou quatro causas prováveis:

- A retícula usava o primeiro resultado horizontal do hit-test de cada quadro,
  sem filtro. O ponto oscila alguns centímetros e o toque gravava o quadro bruto.
- Qualquer superfície horizontal era aceita (mesa, degrau, banco), então a
  altura do ponto e a retícula podiam saltar entre superfícies.
- Bastava um único quadro com hit para liberar a marcação.
- Não há âncoras (`XRAnchor`): os pontos ficam em coordenadas de `local-floor`
  e não acompanham correções do mapa feitas pelo aparelho.

As três primeiras correções vieram na primeira etapa; âncoras, orientação ao
usuário e detecção de planos, na segunda.

## Estabilizador de hit-test

Criado `front/features/ar/session/hit-stabilizer.ts`, módulo puro (sem React,
Three ou WebXR), configurável por `DEFAULT_HIT_STABILIZER`:

- **Piso fixado.** Após 15 hits seguidos com até 4 cm de variação de altura, a
  altura do piso é fixada pela mediana. Hits a mais de 10 cm dela são
  rejeitados. A altura acompanha lentamente (2% por quadro) a deriva dos hits
  aceitos.
- **Raio da câmera.** Com o piso fixado, se o hit-test falha ou acerta fora do
  piso, o ponto passa a ser a interseção do raio frontal da câmera com o plano
  do piso, limitada a 8 m de distância horizontal. Raios para cima ou paralelos
  ao piso não produzem ponto.
- **Suavização.** Média exponencial por quadro (fator 0,35). Um salto maior
  que 30 cm reinicia a suavização e a janela de estabilidade.
- **Estabilidade.** O ponto só é considerado estável com o piso fixado e depois
  de permanecer cerca de 400 ms dentro de um raio de 2,5 cm. O ponto entregue
  para marcação é a média dessa janela.

Nenhuma escala corretiva é aplicada: o filtro só escolhe e suaviza pontos já
medidos em metros no espaço da sessão.

## Integração na sessão e na montagem

- `xr-session.ts` aceita a opção `stabilizer`. Com ela, a retícula e `onFrame`
  seguem o ponto suavizado; `tracking` só chega a `surface` e `currentHit()` só
  devolve ponto quando ele está estável. Perda de pose ou sessão oculta
  descartam a janela e mantêm o piso; início e fim de sessão esquecem o piso.
- O raio da câmera é calculado da pose do visualizador (eixo −Z) no espaço do
  piso. O laço de animação passa a repassar o tempo do quadro.
- `ar-assembly.tsx` (montagem direta: cantos, áreas restritas, postes, fitas e
  pessoas) passa a criar a sessão com o estabilizador.
- Sem a opção, o comportamento é o anterior. As rotas `/projects/:id/ar` e
  `/xr-check` não usam o estabilizador e não mudaram.

Efeito esperado para quem usa: o botão de colocar fica desabilitado até a mira
firmar (cerca de meio segundo) e, no início da sessão, até o piso ser
aprendido. O indicador visual dessa espera veio na segunda etapa.

## Segunda etapa: âncoras, orientação e detecção de planos

Tudo é opcional na negociação da sessão: `anchors` e `plane-detection` entram
em `optionalFeatures`, só na montagem. Sem o recurso, o comportamento é o da
primeira etapa. `requiredFeatures` não mudou.

**Âncoras (`anchor-drift.ts` e `xr-session.ts`).**

- Com a opção `anchors`, a sessão cria uma âncora (`XRHitTestResult.createAnchor`)
  no primeiro ponto estável e depois a cada ponto estável a 2 m ou mais das
  âncoras existentes, até 6.
- A cada quadro, a posição atual das âncoras rastreadas é comparada com a
  posição em que cada uma foi vista pela primeira vez. Um ajuste rígido por
  mínimos quadrados dá a deriva do mapa: translação e altura com uma âncora;
  rotação também quando as âncoras estão espalhadas (1 m ou mais). A rotação
  vem da distância entre âncoras, nunca da orientação de uma âncora isolada.
  Não há escala.
- Os pontos entregues à montagem (`currentHit`, `onFrame`) são convertidos para
  o referencial estável; o estado da montagem e o alinhamento não mudaram. A
  cena passa a ter um grupo `worldRoot`, pai das camadas do projeto, que a
  sessão move com a deriva. A retícula fica fora dele.
- Se o aparelho recusa a âncora, a sessão para de pedir e segue sem correção.
  As âncoras são apagadas ao fim da sessão.

**Orientação (`floor-guidance.ts`, `ar-assembly.tsx`, `assembly-scene.ts`).**

- Enquanto o piso não é aprendido: “Aponte para o chão e mova o celular
  devagar para os lados, até o círculo firmar.”
- Após 8 s sem aprender o piso: aviso para procurar um lugar mais claro e um
  piso com textura. É uma heurística de tempo; luz e textura não são medidas.
- Com o piso conhecido e 1,5 s sem ponto: “Aponte o celular para o chão.”
- Avisos de tracking perdido ou câmera pausada continuam com prioridade. As
  mensagens não aparecem ao acrescentar pessoas à fila, que não usa a mira.
- A retícula fica translúcida enquanto a mira firma e ganha opacidade com o
  progresso; firme, fica opaca e mostra um ponto central.

**Detecção de planos (`xr-session.ts`, `hit-stabilizer.ts`).**

- Com a opção `planes`, a cada 15 quadros a sessão lê `frame.detectedPlanes` e
  toma a altura do plano horizontal mais baixo com área de 1,5 m² ou mais.
- O estabilizador usa essa altura como referência: hits mais de 10 cm acima
  não são aprendidos como piso, e um piso já fixado mais de 10 cm acima (mesa,
  balcão) desce para ela. Isso trata o risco de aprender o piso numa mesa.
- Os planos não são desenhados.

**Não implementado: `depth-sensing`.** No Chrome para Android a profundidade
não alimenta o hit-test; serviria para oclusão, que exige um shader próprio e
não pode ser validada sem aparelho. Pedir o recurso só acrescentaria custo por
quadro e um caminho de renderização diferente no Three. Ficou fora de propósito.

## Serviços locais e ngrok

A pedido do usuário, front e back foram iniciados em modo de desenvolvimento
(nada escutava em 3000 ou 3001 antes):

- NestJS em 3001: `/api/projects` e `/api/health` responderam HTTP 200.
- Next.js em 3000: `/` respondeu 307 para `/dashboard`, que respondeu 200.
- O back usou a configuração normal do projeto; nenhum dado foi criado,
  editado ou apagado por esta sessão.

Ngrok, também a pedido do usuário:

- Duas tentativas com `--url=https://defendant-dragging-dreadlock.ngrok-free.dev`
  falharam com `This domain is reserved for another account`, antes e depois de
  o usuário trocar de rede. O domínio documentado nas ondas não pertence à
  conta ngrok configurada nesta máquina.
- `ngrok http 3000`, sem fixar URL, abriu o túnel no domínio da conta atual:
  `https://agreeing-herring-sway.ngrok-free.dev`. Por ele, `/dashboard`
  respondeu 200 e `/api/health` respondeu `{"status":"ok"}`.
- A configuração do ngrok não foi alterada e o token não foi exibido. A URL antiga
  continua citada em `docs/ondas/` e em `docs/PANORAMA-LOCAL-2026-11-04.md`;
  esses documentos não foram atualizados.

## Verificações e limites

- `npm run test:xr` (front): 97 aprovados, 0 falhas. Da primeira etapa: 8
  testes do estabilizador (ruído sintético, espera mínima, rejeição de tampo de
  mesa, queda do hit-test, interrupção, reinício, limites do raio) e 1 de
  integração na sessão. Da segunda: 5 do ajuste de deriva, 3 da orientação, 2
  da referência de plano e 4 de integração (recursos opcionais pedidos, deriva
  com âncora simulada, aparelho que recusa âncoras, avisos de piso).
- Com o servidor de desenvolvimento no ar, `/projects/new` respondeu 200 após
  as mudanças, sem erro de compilação no log.
- `tsc --noEmit` no front: aprovado.
- ESLint não rodou: o comando não encontrou configuração no formato do ESLint 9.
- `npm run build`, testes e2e (Playwright) e testes do back não foram
  executados nesta sessão.
- Não houve teste em aparelho. Os testes usam hits sintéticos e a sessão falsa;
  não provam tracking, estabilidade física, toque nem compatibilidade. Os
  valores do estabilizador (15 amostras, 4 cm, 10 cm, 30 cm, 2,5 cm, 400 ms)
  são estimativas iniciais, sem calibração no Samsung.
- Risco conhecido: se o piso for aprendido numa superfície errada (por exemplo,
  a sessão começa apontada para uma mesa larga), os hits do chão real são
  rejeitados. A referência de plano corrige isso só onde `plane-detection` é
  concedido e o chão real já foi detectado como plano; sem isso, é preciso
  reiniciar a sessão.
- Risco novo: um plano horizontal grande detectado abaixo do chão real (vão de
  escada, detecção errada) puxaria o piso para baixo.
- Âncoras e planos não têm implementação na sessão falsa nem aceite físico. Não
  se sabe se o Samsung concede `anchors` e `plane-detection`, nem se a correção
  melhora ou piora a posição percebida. Os limites (2 m entre âncoras, 6
  âncoras, 1 m para rotação, 1,5 m², 8 s, 1,5 s) são estimativas.
- Após a segunda etapa, a URL pública do ngrok não pôde ser conferida desta
  máquina (`Connection reset by peer`), embora o agente registre o túnel ativo.

## Roteiro sugerido para o Samsung

1. Abrir a montagem pela câmera e observar se a retícula treme menos.
2. Apontar para uma mesa: a retícula deve permanecer no chão.
3. Colocar postes a distâncias conhecidas e conferir com trena.
4. Avaliar se a espera de cerca de 400 ms atrapalha o uso.
5. Marcar cantos e postes, andar pelo ambiente e voltar: o desenho deve
   continuar sobre os mesmos pontos do chão.
6. Começar a sessão apontando para uma mesa e depois para o chão: a retícula
   deve passar a seguir o chão.
7. Conferir as mensagens de orientação no início e ao apontar para a parede.

## Pendências

- Teste físico no Samsung de tudo acima.
- Testes e2e (Playwright) com a sessão falsa: não foram executados porque
  gravam projetos pelo serviço em execução, que usa os dados do usuário.
- Oclusão por profundidade, se vier a ser desejada.
- Decidir qual URL de ngrok vale e atualizar a documentação.

## Arquivos principais

Primeira etapa (comitada em `6ddef11`):

- Novos: `front/features/ar/session/hit-stabilizer.ts` e
  `front/features/ar/session/hit-stabilizer.test.ts`.
- Alterados: `front/features/ar/session/xr-session.ts`,
  `front/features/ar/session/xr-session.test.ts` e
  `front/features/ar/assembly/ar-assembly.tsx`.

Segunda etapa (worktree):

- Novos: `front/features/ar/session/anchor-drift.ts`, `floor-guidance.ts` e
  os respectivos `.test.ts`.
- Alterados: `xr-session.ts`, `xr-session.test.ts`, `hit-stabilizer.ts` e
  `hit-stabilizer.test.ts` em `front/features/ar/session/`;
  `ar-assembly.tsx` e `assembly-scene.ts` em `front/features/ar/assembly/`.
