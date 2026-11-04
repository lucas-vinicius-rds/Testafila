# Onda 2 — Frente A (Retina)

**Data:** 04/11/2026. **Branch:** `ondas/camera-e-arquitetura`. Sem push e sem merge.
**Commits:** `17af2b4` (giro de `/ar`, separado), `2bb3152` (interface), `9f87820` (montagem).

**Situação:** os 8 itens estão feitos e verificados com sessão simulada. Nada rodou em aparelho.
**Falta 1 passo da Vitral:** trocar o corpo de `ar-assembly-slot.tsx`. Sem isso o app ainda não usa
o componente, e o critério "o resultado abre no editor" **não foi testado**: a verificação vai até
o `onComplete`.

## Feito

| Item | Resultado | Onde |
| --- | --- | --- |
| 1. Componente único | `ArAssembly`, entrada e saída em `ProjectScene`; substitui `FloorplanCapture` | `features/ar/assembly/ar-assembly.tsx` |
| 2. Comandos do core | Toda inserção passa por `executeQueueCommand`; rejeição aparece em vermelho e a cena fica igual | `assembly-state.ts` |
| 3. Cena sobre o chão | Só muda o que mudou; pessoas e postes se movem sem reconstruir; o que sai é liberado | `features/ar/scene/scene-layers.ts` |
| 4. Controles | Desfazer, refazer, etapa, medidas e sair; alvos de 48 px, sem jargão | `ar-assembly.tsx` |
| 5. Perda e queda | Inserção suspensa com aviso; depois de cair, **Continuar** ou **Revisar no editor** | `assembly-state.ts` |
| 6. Confirmar saída | Pergunta se houver trabalho; sem trabalho, sai direto | `ar-assembly.tsx` |
| 7. Giro de `/ar` | Corrigido em commit separado | `xr-project-logic.ts` |
| 8. Queda não perde trabalho | Cantos e cena ficam nas coordenadas do projeto, fora da sessão | `assembly-state.ts` |

### Item 7

Testes com Three real, medidos **antes** da correção: (2,0) caiu em (4,1), e a planta ficava a
10,49 m do ponto na tela com resíduo informado de 0,60 m. **Depois:** (2,0) cai em (4,5), e o
resíduo informado é a distância vista na tela.

Inverter o sinal também inverteria os botões "Girar ±5°". `withManualRotation` mantém o sentido
que eles tinham na tela, com teste.

### Item 8: como a queda é tratada

O problema era guardar cantos em coordenadas da sessão, que não valem em outra. Agora tudo é
convertido ao marcar. Da sessão só restam a transformação e os pontos de realinhamento, e só eles
somem na queda.

- **Continuar:** marca de novo os cantos 1 e 2. Com um único canto, só ele. A diferença entre a
  planta e o chão aparece em metros e nunca vira escala.
- **Revisar no editor:** entrega a cena; se a planta estava aberta com 3 ou mais cantos, fecha antes.
- **Falha ao retomar:** o trabalho fica; a tela explica e mantém as opções.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck:front` | 0 erros |
| `npm run test:xr`, 8 rodadas seguidas | 8 × 73/73, exit 0 |
| Trace de `/ar` e `/xr-check` contra a linha de base da Onda 1 (Edge headless, 3110) | 66 e 72 eventos: logs e textos idênticos depois do giro e da extração dos objetos 3D |
| Montagem com XR simulado (Edge headless, bundle esbuild fora do repositório) | 21 verificações aprovadas |

A única diferença do trace é o 404 de `/favicon.ico` na primeira carga, como na Onda 1. O erro
`getViewerPose` sem `frame` continua, como decidido, inclusive na montagem.

**Verificações da montagem:** fluxo inteiro até Concluir, com cena válida em v2 e nada em storage;
desfazer e refazer; rejeição com motivo; duas fitas no mesmo poste; sem inserção com a câmera
perdida; queda nos cantos e queda com cena; realinhamento em sessão deslocada e girada 180°; falha
ao retomar; saída com e sem trabalho; toque ignorado com o aviso aberto; sem `dom-overlay`; sem
suporte; cena de entrada; alvos de 48 px e centro livre para mirar em 390×844 e 320×568.

O simulador está em `front/features/ar/testing/fake-xr.js`. O script das verificações ficou no
scratchpad da sessão, **não no repositório**, porque depende de um esbuild transitivo.

## Limites

- **Recarregar a página perde o trabalho.** O plano proíbe `localStorage`. Se o Android matar a
  aba em segundo plano, o efeito é o mesmo. Sobrevive à queda da sessão, não à da página.
- **A planta fechada não reabre na câmera.** Desfazer para no fechamento; ajustes vão no editor.
- **O realinhamento usa os cantos 1 e 2.** Com primeira parede curta, um erro pequeno no toque
  vira erro grande de giro no fundo da sala. Não há tolerância validada: a diferença é mostrada,
  não bloqueia, e **Refazer o alinhamento** fica no menu Sair.
- **A primeira pessoa nasce com yaw 0** e é girada em passos de 15°.
- Uma área sem fechar não entra na revisão. A tela avisa antes.

## Pendente no aparelho

Nada abaixo foi provado. Headless e XR simulado não exercitam câmera, tracking nem gestos.

- O fluxo inteiro no Samsung, com trena, e `/ar` para confirmar a correção do giro.
- Queda real: sair do app, bloquear a tela, negar permissão. O simulado só dispara `end`.
- Se um realinhamento real por dois toques é preciso o bastante para a planta "encaixar".
- `beforexrselect`: tocar nos controles sem marcar e tocar na área aberta marcando. O simulador
  **não dispara** esse evento.
- Leitura e uso com uma mão sobre a imagem da câmera, sob sol e em ambiente escuro.
- Desempenho com muitas pessoas: não foi medido.
- Mira de poste na etapa de fitas (raio de 0,5 m): decisão local, sem ensaio.

## Contratos publicados

`docs/ondas/status/ONDA-2-retina-interface.md`, sem mudança de assinatura. Novos módulos internos:
`features/ar/assembly/`, `features/ar/scene/` e `features/ar/testing/`. `/ar` agora usa
`scene/project-objects.ts`, a mesma geometria da montagem.

## Fora do meu escopo

- **Vitral:** trocar o corpo de `ar-assembly-slot.tsx` e testar com o componente real. Para simular
  a sessão no navegador, injete `fake-xr.js` com `addInitScript` e use `window.__xr`.
- **Docs (Onda 3):** `XR-PENDENCIAS.md` e `PLANO-WEBAR.md` seguem com caminhos antigos e não citam
  a montagem.

## Serviços

`next dev` na 3110 encerrado. Portas 3000 e 3001 não tocadas. A API só recebeu leitura. Sem
dependência nova. As linhas de `.next-dev-retina` foram tiradas de `front/tsconfig.json`.

## Dúvidas

A do giro foi decidida pelo coordenador. Segue aberta em `DUVIDAS-USUARIO.md`: qual rota funcionou
no Samsung e até onde o teste foi.
