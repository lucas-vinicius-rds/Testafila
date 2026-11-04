# Onda 1 — Frente D (Retina)

**Data:** 04/11/2026. **Branch:** `ondas/camera-e-arquitetura`. **Commits:** `9af4366` (sessão),
`3ae4f80` (captura). Sem push e sem merge.

**Situação:** os 6 itens da frente estão feitos e verificados com XR simulado. Nada foi
exercitado em aparelho real. Há 1 bug antigo em `/ar` que precisa de decisão (achado 1).

## Feito

| Item | Resultado | Onde |
| --- | --- | --- |
| 1. Camada única de sessão | `/ar` e `/xr-check` usam o mesmo controlador | `features/ar/session/xr-session.ts` |
| 2. Detecção de capacidade | Função pura e hook, só por `isSessionSupported` | `session/ar-capability.ts`, `session/use-ar-capability.ts` |
| 3. Exigir `dom-overlay` | Sem negociação: encerra, explica e oferece **Digitar medidas** | `requireDomOverlay`, `floorplan-capture.tsx` |
| 4. Captura da planta | Marca cantos, mostra paredes em metros, desfaz e fecha | `features/ar/floorplan/` |
| 5. Transformação só em memória | Entregue em `onComplete`, fora do `Environment` | `FloorplanCaptureResult.sessionToProject` |
| 6. Bloqueio de marcação | Sem marcar com tracking perdido ou sessão oculta | `canMarkCorner` |

A interface local foi trocada pela função real de `@testafila/core/domain/measured-environment`
(commit `85711e8`). Nenhuma cópia ficou no front.

## Como a ordem da sessão foi preservada

A premissa de que `xr-project` é o único caminho testado no aparelho **não tem registro nos
documentos**. `00-PENDENCIAS-CODEX.md` diz só que o usuário "testou WebAR" no Samsung, sem rota,
e pede para não inferir o alcance do teste. Por isso as **duas** rotas foram tratadas como
intocáveis.

Antes de editar, um `navigator.xr` falso gravou no Edge headless todas as chamadas das duas
rotas, incluindo as do Three: início, perda de pose, sessão oculta, marcação, fim e segunda
sessão. Depois da extração, o log ficou **idêntico**, e o texto da interface também, em todas as
etapas.

As rotas têm a mesma ordem de início, mas **não encerram igual**. Unificar teria mudado a ordem,
então a camada tem duas variantes:

| | `project` (`/ar`, padrão, captura) | `check` (`/xr-check`) |
| --- | --- | --- |
| Encerrar | `cancel`, depois `session.end` | `session.end`, depois remove listeners e `cancel` |
| Listeners da sessão | Ficam | Removidos |
| Quadro com sessão oculta | Não desenha | Desenha |
| Câmera XR com matriz inválida | Não verifica | Conta como tracking perdido |

Mudanças pequenas e deliberadas, fora do caminho normal (o log não muda):

- `cancel` do hit-test em `/ar` ganhou `try/catch`, como já havia em `/xr-check`.
- `/ar` passou a abandonar o início se a sessão acabar no meio, como `/xr-check` já fazia.
- `/xr-check` passou a usar os textos de `/ar` em dois erros raros de início.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck:front` | exit 0 |
| `npm run test:xr`, 30 rodadas seguidas | 30 × 37/37, exit 0 (ver abaixo) |
| Trace das rotas contra a linha de base (Edge headless, 3110) | `/ar` 66 eventos e `/xr-check` 72: logs e textos idênticos |
| Captura com XR simulado (Edge headless, bundle esbuild fora do repositório) | 15 cenários aprovados |

**Falha transitória em `test:xr`:** não reproduzida. Foram 15 rodadas antes da versão final e 15
nela; em cada grupo, 10 normais e 5 com 12 processos ocupando os 12 núcleos. Todas deram 37/37.
Não há temporizador nem estado compartilhado entre os testes da pasta.

Causa provável, **não comprovada**: meu teste de `dom-overlay` nasceu com uma expectativa errada
(faltava `loop:off`) e falhou de forma determinística até eu corrigi-lo, minutos depois. Uma
rodada da Viga nessa janela daria 1 falha em 37, e a seguinte, 37/37. Se aparecer de novo, guarde
o nome do teste.

**Diferença do trace:** um `404` de console some da lista em `/ar`. É o `/favicon.ico`, já
registrado na Onda 0 (a rota responde 404), e só aparece na primeira carga.

**Cenários da captura:** toque duplo recusado; parede atual em metros; marcação por `select`;
bloqueio com pose perdida e com sessão oculta; desfazer; planta 4×3 sem mudar escala; nada em
`localStorage` ou `sessionStorage`; planta cruzada não fecha; sem `dom-overlay`; sem suporte; fim
inesperado e nova sessão; cancelar; alvos de 48 px e centro da tela livre em 390×844 e 320×568.

Esses cenários acharam 2 problemas no meu componente, já corrigidos: aviso de cantos perdidos
sumia sob StrictMode, e o painel cobria o retículo no centro da tela.

Os scripts do trace e da captura ficaram no scratchpad da sessão, **não no repositório**. Não há
regressão automática de ordem no navegador; em `test:xr`, `xr-session.test.ts` fixa a ordem da
camada, mas com fakes.

## Achados

1. **Bug em `/ar`: a planta é desenhada espelhada no giro (não corrigido).**
   `alignFromCorrespondences` calcula o yaw num sentido, e `applyTransform` aplica esse valor em
   `rotation.y`, que gira no sentido oposto. Medido com Three: o ponto (2,0) deveria cair em
   (4,5) e cai em (4,1), enquanto a tela informa resíduo 0. Só acerta com yaw 0 ou 180°. Não
   corrigi porque a frente manda não mudar o que as rotas fazem. A correção provável é uma linha,
   `root.rotation.set(0, -transform.yawRadians, 0)` em `xr-project-client.tsx`, mas falta validar
   no aparelho. A captura não tem o bug: `projectRootPose` é coberta por teste com Three real.
2. **Erro de console antigo, uma vez por sessão.** `Cannot read properties of undefined (reading
   'getViewerPose')`. `setAnimationLoop` do Three também inicia o laço do `window`, que chama a
   função sem `frame`; ela lança e esse laço para. Aparece nas duas rotas e na captura. Mantido
   para não mudar o comportamento; o laço XR não é afetado no simulado. Uma guarda `if (!frame)`
   resolveria, mas manteria esse laço rodando.
3. **`docs/XR-PENDENCIAS.md` e `docs/PLANO-WEBAR.md` têm caminhos antigos** e o plano ainda diz
   que `dom-overlay` é opcional. Fora do meu escopo. Sugiro atualizar na Onda 3.

## Pendente no aparelho

Nada abaixo foi provado. Headless e XR simulado não exercitam câmera nem tracking.

- As duas rotas no Samsung depois da extração, a começar por **`/ar`**. Vale anotar modelo,
  navegador e até onde o teste vai.
- `session.domOverlayState` preenchido de fato ao negociar `dom-overlay`.
- Layout da captura com a imagem da câmera ao fundo, sobre o overlay em tela cheia. O simulado
  reproduz o overlay com CSS.
- Toque na área aberta gerando `select` e toque nos botões sem marcar canto. O `beforexrselect`
  **não foi exercitado**: o XR falso não o dispara.
- Precisão real das paredes (protocolo de 5% em 20 m), perda de tracking e retorno.
- Retículo em pisos reais: o filtro de 20° continua heurístico.

## Contratos publicados

**Detecção** (para a tela de entrada):

```ts
import { useArCapability } from '.../features/ar/session/use-ar-capability.ts';
const { status } = useArCapability();
// 'checking' | 'supported' | 'unsupported' | 'no-webxr' | 'insecure' | 'error'
```

**Captura** (Onda 2):

```tsx
import { FloorplanCapture, type FloorplanCaptureResult } from '.../features/ar/floorplan/floorplan-capture.tsx';
<FloorplanCapture onComplete={(result) => {}} onUseTypedMeasures={() => {}} onCancel={() => {}} />
// result: { environment: Environment; sessionToProject: SessionToProject }
```

- O componente não tem rota nem está no fluxo: a integração é da Onda 2. Importe só no cliente.
- Só `environment` pode ir para o projeto. `sessionToProject` vale para a sessão que acabou de
  terminar e nunca é salvo.
- Pontos de sessão para projeto: `sessionPointToProject`. Para desenhar o projeto sobre o chão,
  use `projectRootPose(transform, floorY)`, nunca `SessionTransform` de `xr-project-logic.ts`
  (achado 1).
- `createXrSessionController` aceita `requireDomOverlay`, `onFrame` e `variant`. Em `onFrame`, só
  altere objetos e refs, nunca estado do React.
- Decisão local: cantos a menos de 10 cm de outro são recusados, como toque duplo. É proteção de
  interface, não tolerância de medida.
- Se a sessão cair, os cantos se perdem e o usuário é avisado. A retomada por realinhamento é da
  Onda 2.

## Serviços e arquivos

- `next dev` na 3110 com `.next-dev-retina`: encerrado. As portas 3000 e 3001 não foram tocadas.
- Só leitura na API pelo proxy: o trace falharia em qualquer escrita, e não houve nenhuma.
- As linhas que meu `next dev` pôs em `front/tsconfig.json` foram removidas. Não comitei esse
  arquivo nem `front/next-env.d.ts`.
- Nenhuma dependência nova. `package.json` e lockfile não mudaram.

## Dúvidas

Registradas em `DUVIDAS-USUARIO.md`: corrigir o giro de `/ar` e qual rota foi testada no Samsung.
