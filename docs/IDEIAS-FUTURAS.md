# Ideias para o futuro do TestaFila

Escrito em 16/11/2026. São propostas, não compromissos: nada aqui foi
aprovado, estimado em detalhe ou implementado. O estado real do que existe
está em [REQUISITOS-ESTADO-ATUAL.md](REQUISITOS-ESTADO-ATUAL.md).

As ideias estão em dois grupos. O primeiro vem do conceito original do
projeto (One-Page Concept, Plano de Projeto e XR Design Document, em
`docs/referencias`) e ainda não aparece no aplicativo. O segundo são ideias
novas, além do que foi planejado.

## Em uma frase

O conceito original promete responder, no local e pelo celular: **quantos
metros tem a fila, quantas pessoas cabem e se ela bloqueia alguma passagem**.
O aplicativo hoje desenha o ambiente, as áreas, os postes, as fitas e a fila,
mas ainda não mostra essas três respostas de forma direta. Esse é o caminho
mais curto para o produto cumprir o que se propôs.

## Parte 1 — O que o conceito original pede e ainda falta

A coluna "Hoje" vem de uma busca no código em 16/11, não de uma auditoria
completa.

| Ideia | O que o conceito pede | Hoje |
| --- | --- | --- |
| Metragem da fila | Extensão total em metros, sempre visível | O domínio calcula comprimento de percurso (`QueueStats`), mas a tela mostra só o número de pessoas |
| Capacidade de pessoas | Estimativa automática a partir da metragem, com 0,6 m por pessoa | O domínio calcula capacidade para os percursos antigos; não há estimativa na tela para a fila interligada. O espaçamento atual oferece 0,5, 0,8 e 1 m, sem 0,6 m |
| Alerta de bloqueio | Fita verde quando o traçado é seguro e vermelha quando cruza área restrita, com o aviso "Bloqueio detectado" | A colisão é validada e a ação inválida é recusada; não há o estado visual verde/vermelho |
| Painel de métricas na câmera | Metragem, capacidade e alertas sobre a imagem da câmera | A montagem pela câmera mostra a medida da parede atual e um resumo de contagens |
| Margem de erro | Mostrar a capacidade como estimada, com margem de ±10% | Não aparece |
| Ajuste manual do piso | Permitir ajustar o plano na tela se o sensor falhar | Existe "Medir o chão de novo" (16/11), que reaprende a altura; não há ajuste manual |

### 1.1 Metragem e capacidade sempre visíveis

Mostrar, no editor 3D e na montagem pela câmera, o comprimento total do
traçado e quantas pessoas cabem nele. A capacidade deve mudar com o
espaçamento escolhido e não depender de adicionar pessoas uma a uma.

- Decisão em aberto: o conceito fixa 0,6 m por pessoa; o aplicativo trabalha
  com 0,5, 0,8 e 1 m. É preciso escolher entre acrescentar 0,6 m, trocar um
  dos valores ou manter os atuais e registrar a mudança.
- Vale apresentar o número como "capacidade estimada", com a margem de erro,
  enquanto a precisão não for comprovada com trena.

### 1.2 Alerta de bloqueio em tempo real

Hoje o aplicativo impede a ação que causaria colisão. O conceito pede outra
coisa: deixar o usuário ver o conflito e ajustar. A fita ficaria vermelha no
trecho que cruza uma área restrita, com um aviso no painel, e voltaria a
verde ao ser corrigida.

- Decisão em aberto: recusar a ação, como hoje, ou permitir e alertar. As
  duas formas podem conviver: alertar durante o arraste e recusar ao soltar.
- O critério do conceito é resposta em menos de 200 ms. Isso ainda não foi
  medido em aparelho.

### 1.3 Painel de métricas na montagem pela câmera

Uma linha fixa na faixa de cima com metragem, capacidade e estado (seguro ou
bloqueado), atualizada a cada ponto marcado. É o "HUD" do conceito, no
padrão visual que a montagem já usa.

## Parte 2 — Ideias novas

### Dimensionamento

- **Preencher automaticamente.** Um botão que completa a fila ao longo do
  corredor formado pelas fitas, até o limite do espaço.
- **Resumo do projeto.** Metragem, capacidade, número de postes, metros de
  fita e área ocupada, na tela do projeto e nos cartões da galeria.
- **Comparar cenários.** Duplicar um projeto e ver dois arranjos lado a
  lado, com a capacidade de cada um.
- **Tempo de espera estimado.** A partir da capacidade e de um ritmo de
  atendimento informado pelo usuário (pessoas por minuto).

### Montagem e edição

- **Modelos de traçado.** Fila reta, em zigue-zague ("caracol", citado no
  segundo cenário do conceito) e em "L", gerados a partir da largura do
  corredor e do número de voltas.
- **Lista de material.** Quantos postes e quantas fitas de cada comprimento
  são necessários para montar no local.
- **Entrada e ponto de atendimento.** Marcar onde a fila começa e onde
  termina, para o traçado fazer sentido na planta.
- **Largura de passagem.** Avisar quando um corredor fica estreito demais,
  por exemplo para cadeira de rodas, e quando a fila deixa pouca folga até
  uma saída.
- **Tipos de área.** Diferenciar rota de fuga, corredor de circulação e
  obstáculo fixo, com regras e cores próprias.

### Uso no local

- **Guia de montagem em AR.** Na tela "Ver em AR", destacar um poste por
  vez, na ordem de instalação, com a distância até o anterior.
- **Conferência depois de montar.** Marcar em AR os postes já instalados e
  ver a diferença em relação ao projeto.
- **Rascunho guardado.** Não perder a montagem pela câmera ao fechar ou
  recarregar a página.
- **Estabilização em "Ver em AR".** Levar para essa tela o filtro de piso, o
  bloqueio por obstáculo e a correção por âncoras que a montagem já tem.
- **Sensor de profundidade.** Confirmar que o ponto mirado está mesmo no
  chão, se o bloqueio atual não bastar. Depende do aparelho.

### Compartilhar e registrar

- **Exportar a planta.** PDF ou imagem com medidas, legenda, capacidade e
  lista de material.
- **Link de visualização.** Abrir um projeto só para leitura.
- **Histórico de versões.** Voltar a um estado salvo anterior.
- **Projetos por pessoa.** Hoje a galeria é compartilhada e sem login.
  Depende da decisão sobre autenticação, que segue em aberto.

## Ordem sugerida

1. **Metragem e capacidade na tela (1.1).** É o centro do conceito, o cálculo
   de comprimento já existe no domínio e o esforço é pequeno.
2. **Alerta de bloqueio verde/vermelho (1.2).** É o diferencial citado no
   conceito e a validação geométrica já existe.
3. **Painel de métricas na câmera (1.3).** Depende dos dois anteriores.
4. **Modelos de traçado e preenchimento automático.** São as ideias novas que
   mais reduzem trabalho manual.
5. **Exportar a planta com lista de material.** Dá um resultado para levar da
   ferramenta.
6. O restante, conforme o uso mostrar necessidade.

Os três primeiros itens fazem parte do escopo do MVP descrito no Plano de
Projeto, cuja entrega final está marcada para 17/12/2026.

## O que estas ideias não resolvem

Nenhuma delas substitui a comprovação física que o plano exige e que segue
pendente: erro de até 5% em 20 m com trena, desempenho e estabilidade em
aparelho, e o questionário SUS com cinco usuários. Uma capacidade calculada
sobre uma medida não comprovada continua sendo uma estimativa.

## Fora de questão, por decisão vigente

- Aplicativo nativo, ARKit, Capacitor ou App Clip para iPhone: o iPhone
  segue pela web, com medidas digitadas e editor 3D.
- Medir por pixels ou usar a câmera comum como prova de escala.
- Pessoas soltas, fora da fila interligada.
- Escala corretiva: uma unidade é sempre um metro.
