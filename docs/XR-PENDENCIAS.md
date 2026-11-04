# Spike WebXR — protocolo e pendências

Status: `/xr-check` continua como diagnóstico isolado. A rota experimental
`/projects/:id/ar` já renderiza a `ProjectScene` salva após alinhamento manual
por sessão: dois vértices ajustam yaw/translação e um terceiro mostra resíduo.
Nenhuma pose ou alinhamento é persistido, a escala permanece 1 e a validação
física em aparelhos reais continua obrigatória.

## O que a rota verifica

- Contexto seguro (`window.isSecureContext`) e anúncio de
  `navigator.xr.isSessionSupported('immersive-ar')`.
- Solicitação de sessão somente pelo botão do usuário, com `hit-test` e `local-floor`
  como features obrigatórias. Se o aparelho não negociar qualquer uma delas, a sessão
  falha com mensagem explícita. Não há fallback de câmera comum nem retículo simulado.
- Hit-test originado no espaço `viewer`, transformado para o `local-floor` usado pelo
  `THREE.WebGLRenderer.xr`. O Three renderer entrega a câmera XR estereoscópica ao
  renderizar a sessão.
- O retículo e a ação de marcar só ficam disponíveis quando há pose do viewer, câmera
  XR ativa e hit em superfície cujo eixo normal está a até 20° da vertical. Esse filtro
  é heurístico e precisa ser confrontado com os aparelhos-alvo.
- Duas marcas produzem uma distância euclidiana em metros nas coordenadas locais da
  sessão. Toque/ação `select` e o botão de sobreposição podem marcar; a sessão usa
  `dom-overlay` apenas como feature opcional.
- Saída da sessão cancela o hit-test, remove listeners, esvazia marcas e libera os
  recursos Three.js. A visibilidade suspende a marcação e oculta o retículo; pose
  ausente também oculta o retículo e bloqueia novas marcas.

Os pontos são transitórios e não são convertidos para a origem do projeto. A medida é
apenas uma leitura experimental do sistema XR, sem tolerância validada. Não use como
levantamento de ambiente ou como promessa de erro.

## Protocolo físico obrigatório

Execute em HTTPS (localhost serve apenas para diagnóstico local) nos aparelhos e
navegadores que se pretende suportar. Faça a sessão sob iluminação e condições normais
de uso e anote também falhas de permissão, superfície, tracking e encerramento.

1. Registre modelo do aparelho, versão do sistema, navegador/versão, origem HTTPS e
   estado de `isSessionSupported`.
2. Inicie a sessão pelo botão, aceite a permissão, confirme o retículo em piso e em
   uma superfície vertical. Ele deve aparecer no piso e não na parede.
3. Marque dois pontos no piso separados por **20,00 m medidos com trena**. Evite
   interromper a sessão entre as marcas. Registre a distância XR e calcule
   `abs(XR - 20,00) / 20,00 × 100%`.
4. Repita pelo menos três vezes, encerrando e abrindo uma sessão nova entre repetições.
   Anote se marcas e retículo param durante perda de tracking/background e se o fim da
   sessão limpa o estado.
5. Critério inicial deste spike: erro observado de no máximo **5% em 20 m**, sem tratar
   esse resultado como garantia para outros locais, distâncias ou usuários. Um único
   aparelho aprovado não valida todos os alvos.

## Registro de aparelhos

Nenhum ensaio físico foi executado por esta implementação. Preencha com observações,
sem inferir resultado a partir de emulação ou `isSessionSupported`.

| Aparelho / SO | Navegador / versão | HTTPS e suporte | Tentativas (20 m) | Erro por tentativa | Tracking / encerramento | Resultado |
| --- | --- | --- | --- | --- | --- | --- |
| Pendente | Pendente | Pendente | Pendente | Pendente | Pendente | Não testado |

## Testes locais disponíveis

`node --experimental-strip-types --test apps/web/components/xr-check/xr-check-logic.test.ts`

Os mocks cobrem pose horizontal válida, plano vertical, pose ausente/inválida e cálculo
de distância 3-4-12. Eles verificam regras puras; não simulam câmera, sessão WebXR,
hit-test do navegador, tracking físico ou renderer XR. O typecheck da aplicação também
não substitui teste em aparelho.

## Próxima etapa: validação do alinhamento integrado

A rota `/projects/:id/ar` implementa o adaptador isolado por sessão: relaciona
dois vértices da planta com pontos hit-test para estimar translação e yaw, usa um
terceiro para mostrar resíduo e não altera escala. A cada sessão, o alinhamento
recomeça e nenhuma transformação ou coordenada XR é persistida.

Depois de preencher a matriz física, revisar o filtro de horizontalidade e definir
tolerâncias baseadas nos resultados, testar o fluxo em aparelhos-alvo: seleção dos
pontos, perda de tracking, background, fim de sessão e rotação/reinício da cena.
Até essa validação, a rota integrada e o spike são experimentais.
