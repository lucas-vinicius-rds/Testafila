# Relatório de mudanças — 16 de novembro de 2026

Este relatório registra as alterações feitas nesta sessão, na branch
`ondas/camera-e-arquitetura`. Ele é atualizado ao longo do dia: cada mudança
nova entra em "Mudanças seguintes", no fim. Não houve merge nem alteração em
`back/`, `back/core`, contrato de cena v2 ou SQLite. A pedido do usuário, a
branch foi enviada a `origin/ondas/camera-e-arquitetura`.

## Resumo

| Mudança | Estado |
| --- | --- |
| Serviços locais e túnel ngrok no ar | Em execução, modo de desenvolvimento |
| Next.js 16.4.2 → 16.4.6 (correção de segurança) | Comitado em `052279e` |
| Layout da tela "Ver em AR" (`/projects/:id/ar`) no celular | Comitado em `99a0fdf` |
| Estabilidade da montagem pela câmera: piso, obstáculos, âncoras, remapear o chão e diagnóstico | Comitado em `16749da` |
| Relatório do dia e documento de ideias futuras | Comitados junto com este relatório |

## Serviços locais e ngrok

A pedido do usuário, o projeto foi iniciado com um link público. Nada escutava
em 3000, 3001 ou 4040 antes.

- Ngrok: `ngrok http 3000`, sem fixar URL. O túnel abriu em
  `https://agreeing-herring-sway.ngrok-free.dev`, o domínio da conta desta
  máquina. A configuração do ngrok não foi alterada e o token não foi exibido.
- NestJS em 3001, em modo de desenvolvimento. `APP_ORIGIN` foi passado só por
  variável de ambiente do processo, com `http://localhost:3000` e o domínio do
  ngrok, para que a gravação pelo link seja aceita. Nenhum `.env` foi criado
  ou alterado.
- Next.js em 3000, em modo de desenvolvimento.
- Conferido local e pelo link: `/dashboard` 200, `/projects/new` 200,
  `/api/health` `{"status":"ok"}` e a lista de projetos.
- O banco desta máquina (`back/data/testafila.sqlite`) tem 3 projetos, e não
  os 21 citados nos documentos das ondas. Os 21 e o backup da Onda 3 ficaram
  na máquina Windows.
- Nenhum dado foi criado, editado ou apagado. A gravação pelo link não foi
  testada, para não tocar nos projetos do usuário.

Os três processos pertencem a esta sessão e terminam com ela.

## Atualização do Next.js

**Motivo.** O `next dev` da versão 16.4.2 avisava de uma vulnerabilidade
conhecida e, na primeira tentativa, encerrou para mostrar o aviso. O
`npm audit` apontava o GHSA-mfr8-8qww-v76h, de severidade moderada: vazamento
de informação entre root params quando uma função `use cache` é chamada por
`unstable_cache()`. Afeta as versões 16.3.0 a 16.4.4.

**O que foi feito.**

- `npm install next@16.4.6 --save-exact --workspace @testafila/front`. É a
  versão `latest` do registro, dentro da mesma série 16.4.
- Arquivos alterados: `front/package.json` e `package-lock.json`.
- Só o front foi reiniciado. A API e o ngrok não foram tocados.
- Commit `052279e`, `chore(front): atualiza Next.js para 16.4.6`.

**Verificações.**

- `npm audit`: 0 vulnerabilidades após a instalação.
- `npm run typecheck:front`: aprovado.
- `npm run test:xr`: 97 aprovados, 0 falhas.
- `next build` com `NEXT_DIST_DIR` separado: aprovado. A pasta foi removida e
  a entrada que o Next acrescentou em `front/tsconfig.json` foi desfeita.
- O front subiu em 16.4.6 sem o aviso de vulnerabilidade.

## Layout da tela "Ver em AR" no celular

**Motivo.** O usuário relatou que a visualização em AR no celular estava com o
layout quebrado, sobrepondo a câmera de forma estranha e sem responsividade.
A leitura do código mostrou a causa: o painel de controles da página é também
a raiz do DOM Overlay. Durante a sessão, o navegador o exibe em tela cheia e
transparente, e o painel inteiro (disponibilidade, lista vertical de cantos,
botões, avisos) ficava sobre a imagem da câmera, sem fundo e sem limite de
altura.

**Durante a sessão** (`xr-project-client.tsx`, `xr-project.module.css`):

- A sobreposição passa a ter duas faixas opacas, no mesmo padrão da montagem
  pela câmera: uma no topo, com etapa, orientação e "Encerrar"; outra embaixo,
  com as ações. O meio fica livre para a câmera e o círculo.
- A lista de cantos virou uma fileira que rola de lado.
- Uma ação principal por vez: "Registrar ponto N", depois "Confirmar
  visualização", depois os giros de 5°.
- A faixa de baixo ocupa no máximo 56% da altura e rola por dentro.
- Com o celular deitado (altura de até 520 px), a faixa de baixo vira uma
  coluna lateral, para não cobrir o chão.
- As faixas respeitam as áreas seguras do aparelho (entalhe e barra de gestos).
- Botões com 48 px de altura e texto de 16 px.

**Antes da sessão**, em telas de até 720 px: o botão "Iniciar WebAR" vem antes
da área de prévia, que ficou menor, e as margens respeitam as áreas seguras.

**Mudanças de comportamento.**

- "Reiniciar alinhamento" fica desabilitado enquanto não há ponto registrado.
- Os avisos de disponibilidade e de HTTPS aparecem só antes da sessão.
- Os textos de orientação foram reescritos. As medidas de conferência (erro
  entre os dois pontos e resíduo com o terceiro) continuam as mesmas, com o
  aviso de que nenhuma tolerância física foi validada.
- A lógica de alinhamento, o tratamento de toque (`beforexrselect`) e a sessão
  XR não mudaram.

**Verificações e limites.**

- Capturas com a sessão XR falsa do projeto (`features/ar/testing/fake-xr.js`)
  em 390×844, 320×568 e 844×390, nas etapas de registro, conferência e planta
  alinhada: sem rolagem horizontal e sem sobreposição entre as faixas.
- `tsc --noEmit` no front: aprovado. `npm run test:xr`: 97 aprovados.
- A tela cheia sobre a câmera foi imitada por CSS nas capturas. Isso não prova
  o comportamento real do DOM Overlay, do toque nem das áreas seguras.
  Pendente no aparelho.
- A montagem pela câmera ("Criar nova fila") e `/xr-check` não foram alteradas.

## Não executado nesta sessão

- Teste em aparelho.
- Testes E2E (Playwright) além do roteiro da montagem simulada, e testes do back.
- ESLint, que segue sem configuração no formato do ESLint 9.
- Publicação em modo de produção das portas 3000 e 3001.

## Pendências

- Conferir no Samsung a tela "Ver em AR": faixas, rolagem dos cantos, celular
  deitado e toque nos botões sem marcar ponto.
- Conferir no Samsung a montagem pela câmera, pelo roteiro da seção
  "Estabilidade da montagem pela câmera", com `?debug=1`.
- As pendências anteriores continuam: comprovação física (precisão, latência,
  uso prolongado, SUS), falha do E2E em 390×844, decisão sobre a URL do ngrok
  na documentação e as dúvidas de `docs/ondas/status/DUVIDAS-USUARIO.md`.

## Arquivos

- `052279e`: `front/package.json` e `package-lock.json`.
- `99a0fdf`: `xr-project-client.tsx` e `xr-project.module.css`, em
  `front/features/ar/xr-project/`.
- `16749da`: em `front/features/ar/session/`, `hit-stabilizer.ts`,
  `anchor-drift.ts`, `floor-guidance.ts`, `xr-session.ts`, o novo
  `hit-classify.ts` e os respectivos `.test.ts`; em
  `front/features/ar/assembly/`, `ar-assembly.tsx`, `ar-assembly.module.css`
  e `assembly-scene.ts`; e `front/tests/e2e/visual-editor.spec.ts`.
- Commit de documentação: `docs/RELATORIO-MUDANCAS-2026-11-16.md` e
  `docs/IDEIAS-FUTURAS.md`.

## Mudanças seguintes

### Estabilidade da montagem pela câmera

**Motivo.** O usuário relatou que os pontos de área e os postes ficam
instáveis, que muitas vezes acompanham o celular em vez de ficar onde foram
postos, e que a detecção de chão confunde chão com paredes e armários. A
leitura do código apontou quatro causas prováveis, nenhuma confirmada em
aparelho:

- Ao acertar uma superfície que não era chão, o código descartava o acerto e
  projetava o raio da câmera no plano do piso, até 8 m. A mira aparecia no
  chão atrás da parede ou do armário. Um acerto horizontal mais distante
  também era preferido a uma parede mais próxima.
- O piso era fixado com 15 quadros seguidos, cerca de um quarto de segundo.
  Um tampo de móvel visto nesse instante virava chão.
- Tudo era desenhado na altura do primeiro ponto marcado. Com a altura errada,
  os pontos ficam num plano flutuante e deslizam ao mover o celular.
- A correção por âncoras era aplicada a cada quadro, sem filtro, e calculava
  giro com apenas duas âncoras a 1 m.

O pacote foi aprovado pelo usuário, sem as opções maiores (profundidade e
polígono dos planos). Vale só para a montagem pela câmera; `/projects/:id/ar`
e `/xr-check` não usam o estabilizador e não mudaram.

**Obstáculo bloqueia a mira** (`hit-classify.ts`, `hit-stabilizer.ts`).

- Só a superfície mais próxima conta. Se ela não é horizontal, é obstáculo e
  a mira some. Um acerto horizontal a até 15 cm de um acerto inclinado é
  tratado como o mesmo lugar.
- Um acerto horizontal mais de 10 cm acima do piso (tampo, prateleira)
  também bloqueia, em vez de cair no raio da câmera.
- O raio da câmera só cobre falhas curtas: vale por até 1 s depois do último
  acerto medido no piso. Antes valia sempre. Em piso sem textura, a mira pode
  sumir mais vezes; em troca, não marca pontos atrás de paredes lisas.
- A fonte de hit-test passa a pedir também pontos de textura
  (`entityTypes: plane, point`), para que um móvel sem plano detectado ainda
  bloqueie. Se o navegador recusa, a sessão usa a fonte padrão.
- Nova orientação: “Há uma parede ou um objeto na mira. Aponte para o chão
  livre.”, após 0,4 s de bloqueio.

**Aprendizado do piso** (`hit-stabilizer.ts`).

- O piso só é fixado com acertos coerentes (4 cm) por pelo menos 1 s,
  espalhados por pelo menos 0,5 m, e pelo menos 0,6 m abaixo da câmera.
  Mira parada não ensina o piso: é preciso varrer o chão, como a orientação
  na tela já pede.
- O piso é a superfície estável mais baixa: uma superfície abaixo do piso
  fixado, que passe pelas mesmas exigências, toma o lugar dele. Enquanto ela é
  verificada, a mira aparece mas não marca.
- A referência da detecção de planos continua como antes.

**Altura do desenho** (`xr-session.ts`, `assembly-scene.ts`).

- A sessão informa a altura do piso à cena a cada quadro, e o que já foi
  marcado é desenhado nela. Antes ficava na altura do primeiro ponto.
- Só a altura muda. As posições no plano, a escala e os dados do projeto não
  são tocados; a cena salva não guarda altura de piso.

**Âncoras mais conservadoras** (`anchor-drift.ts`, `xr-session.ts`).

- Giro só com três ou mais âncoras e pelo menos 2 m entre elas. Antes, duas
  âncoras a 1 m.
- A correção passa por um filtro: ignora variações de até 2 cm e 0,5°,
  aplica 15% do restante por quadro e retém um salto maior que 30 cm até ele
  persistir por 30 quadros.
- Âncora só é criada sobre acerto medido, nunca sobre ponto do raio da câmera.

**Medir o chão de novo** (`ar-assembly.tsx`, `xr-session.ts`).

- Botão “Medir o chão de novo” na faixa de cima, visível quando o piso está
  fixado. Esquece a altura e aprende de novo, sem reiniciar a sessão, o
  alinhamento ou as âncoras.
- Não quebra o posicionamento: o que já foi marcado mantém a posição no plano
  e passa a ser desenhado na nova altura quando ela é aprendida. Enquanto o
  piso é reaprendido, não dá para marcar pontos novos; “+1 pessoa” continua
  funcionando.
- Limite: um ponto marcado enquanto a altura estava errada pode ter ficado no
  lugar errado do plano. Remapear o chão não o corrige; é preciso desfazer e
  marcar de novo.

**Diagnóstico** (`?debug=1`).

- Abrindo `/projects/new?debug=1`, a faixa de cima mostra, quatro vezes por
  segundo: altura do piso, altura da câmera sobre ele, origem do ponto
  (`hit`, `ray`, `blocked`, `none`), número de acertos, altura do plano
  detectado, número de âncoras, correção aplicada, recursos concedidos e se
  os pontos de textura foram aceitos.

**Verificações.**

- `npm run test:xr`: 120 aprovados, 0 falhas. Os testes do estabilizador
  foram reescritos para as regras novas (17), com testes novos da
  classificação de acertos (5), do filtro de âncoras e do giro (6), da
  orientação de bloqueio (1) e da sessão (4: parede na frente, medir o chão
  de novo, pontos de textura com alternativa, diagnóstico).
- `tsc --noEmit` no front: aprovado.
- E2E “montagem AR real com sessão simulada”, nos três tamanhos de tela:
  3 aprovados. O roteiro ganhou a varredura do chão antes do primeiro canto.
  Rodou contra API e banco temporários; o banco real seguiu com 3 projetos.
- Capturas em 390×844 e 320×568 com a sessão falsa: botão e diagnóstico sem
  rolagem horizontal; após “Medir o chão de novo”, o botão some e “Marcar
  canto” fica desabilitado até o piso voltar.

**Limites.**

- Nada disso foi testado em aparelho. Os testes usam acertos sintéticos e a
  sessão falsa; não provam tracking, estabilidade física nem toque.
- Todos os limiares são estimativas sem calibração: 1 s, 0,5 m, 0,6 m,
  4 cm, 10 cm, 15 cm, 1 s de raio, 2 cm, 0,5°, 15%, 30 cm, 30 quadros.
- Não se sabe se o Chrome do Samsung aceita pontos de textura, nem a
  qualidade deles. Um ponto de textura solto no ar bloquearia a mira sem
  motivo; o diagnóstico mostra isso como `blocked`.
- Risco conhecido: um plano falso abaixo do chão real (reflexo em piso
  brilhante, vão de escada) pode puxar o piso para baixo. “Medir o chão de
  novo” é a saída.
- Quem segura o celular a menos de 0,6 m do chão não consegue ensinar o piso.

**Roteiro sugerido para o Samsung**, em `/projects/new?debug=1`:

1. Começar apontando para o chão e mover para os lados: o piso deve firmar em
   cerca de 1 s. Anotar a altura da câmera mostrada.
2. Começar apontando para uma mesa ou armário: o piso não deve firmar ali, ou
   deve descer ao varrer o chão real.
3. Apontar para parede e para a frente de um armário: a mira deve sumir e
   aparecer o aviso de obstáculo.
4. Marcar cantos e postes, andar pelo ambiente e voltar: os pontos devem
   ficar no lugar. Anotar a correção e o número de âncoras.
5. Tocar em “Medir o chão de novo” e varrer o chão: o desenho deve continuar
   no mesmo lugar do plano.
6. Anotar a linha de recursos e se “pontos de textura” aparece como sim.

### Documento de ideias futuras

A pedido do usuário, foi criado `docs/IDEIAS-FUTURAS.md`. Ele separa o que o
conceito original pede e ainda não aparece no aplicativo (metragem e
capacidade na tela, alerta de bloqueio verde/vermelho, painel de métricas na
câmera) das ideias novas, e sugere uma ordem. São propostas; nada foi
implementado. A coluna "Hoje" do documento vem de uma busca no código, não de
uma auditoria completa.
