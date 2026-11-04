# Onda 2 — Interface da montagem em AR (Retina)

**Situação:** assinatura estável e componente pronto no commit `9f87820`. Mudança aqui passa por
aviso ao coordenador.

## Componente

```tsx
import { ArAssembly } from '../ar/assembly/ar-assembly.tsx';

export type ArAssemblyProps = Readonly<{
  /** Omitido ou null: começa marcando os cantos. Com planta: realinha e segue nas áreas. */
  initialScene?: ProjectScene | null;
  /** Concluir ou Revisar no editor. A sessão já terminou quando isto é chamado. */
  onComplete: (scene: ProjectScene) => void;
  /** A câmera não serve neste aparelho, ou o usuário preferiu digitar. */
  onUseTypedMeasures: () => void;
  /** O usuário saiu. Se havia trabalho, ele já confirmou que quer descartar. */
  onCancel: () => void;
}>;
```

## O que a Vitral precisa respeitar

1. **Mantenha o componente montado até um dos três callbacks.** O trabalho fica em memória no
   próprio componente, sem `localStorage`, como manda o plano. Desmontar antes perde o trabalho.
2. **`onComplete` entrega uma `ProjectScene` válida, ainda não salva.** Vai direto para o editor,
   que pede o nome e salva como hoje. `schemaVersion: 2`, `measurement.source: 'webxr'`,
   `confirmedAt: null`, fila em `queue.personIds`.
3. **Nada de sessão sai do componente.** Sem pose nem transformação. Quem quiser saber a origem
   da planta lê `scene.environment.measurement.source`.
4. **Renderize só em cliente, depois de um clique.** O próprio componente tem o botão que inicia a
   sessão. Não tente iniciá-la por fora, porque o navegador exige o toque do usuário.
5. **Dê a ele a área da tela.** O componente ocupa o contêiner; durante a sessão, o navegador
   coloca os controles em tela cheia.

## Detecção de capacidade

Troque o provisório `features/project-creation/ar-capability.ts` por:

```ts
import { useArCapability } from '../ar/session/use-ar-capability.ts';
const { status } = useArCapability();
// 'checking' | 'supported' | 'unsupported' | 'no-webxr' | 'insecure' | 'error'
```

Só `'supported'` mostra a câmera como principal. Enquanto `'checking'`, não decida.

## Mudança em relação à Onda 1

`FloorplanCapture` deixa de existir: `ArAssembly` cobre a planta e o resto do fluxo. Ninguém a
importava.

## Testar sem aparelho

`front/features/ar/testing/fake-xr.js` simula a sessão. Injete com `page.addInitScript` e controle
por `window.__xr`: `hit` (ponto do chão ou null), `pose` (false = referência perdida), `session.end()`
(queda) e `session.dispatchEvent(new Event('select'))` (toque). Antes dele, `window.__xrConfig` aceita
`{ supported: false }` e `{ domOverlay: false }`. Prova a lógica, não câmera nem gestos.
