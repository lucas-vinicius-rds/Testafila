# Onda 2 — Status da Vitral (Frente B)

**Data:** 04/11/2026. **Branch:** `ondas/camera-e-arquitetura`. Sem push.
**Situação:** itens 1 a 11 feitos, com uma pendência no item 3: falta ligar o componente real.

## Feito

| Item | Resultado |
| --- | --- |
| 1 e 2. Entrada | Etapa inicial com Medir com a câmera e Digitar medidas, usando `useArCapability` da Retina. Só `supported` deixa a câmera principal; sem suporte, botão desativado com a frase pedida. |
| 3. Integração | Etapa `camera` em `project-creation-flow`, com os três callbacks. `onComplete` abre o editor com a cena recebida. Ver pendência abaixo. |
| 4. Origem | `measurementSourceLabel` em `project-scene.ts`, usado no resumo e na revisão. |
| 5. Inspector | `selection-inspector.tsx`: mover, girar e apagar por tipo, com `area:move` e `area:rotate`. Poste e fita explicam por que não giram. Mover funciona em qualquer ferramenta. |
| 6. Cadeia | Sem pessoas soltas: vazio mostra Início da fila, cadeia mostra +1 pessoa, legado mostra Ligar fila (`queue:convert-legacy`). Textos de "cadeia" saíram da tela. |
| 7. Miniatura | `post-thumbnail.ts` renderiza o poste uma vez, em um contexto WebGL liberado em seguida, com cache. SVG fica de reserva. |
| 8. Bandeja | **Confirmado:** com zoom, abrir a bandeja voltava ao enquadramento inicial. Agora só a mudança de altura não reenquadra; a vista é mantida. |
| 9. Ver em AR | Só com `supported`. |
| 10. Lacunas da Onda 1 | Ver resultados abaixo. |
| 11. `sourceId` e arco | `person:append` sem `sourceId`. O +1 da cena só aparece na última pessoa. Ao arrastar pessoa do meio, a prévia segue o círculo do espaçamento, com guia no piso; arrastar a primeira mostra a fila inteira. Inspector explica a regra. |

`queue-editor.tsx` caiu de 969 para cerca de 770 linhas.

**Mudança além da lista:** como a cena da câmera chega com `confirmedAt: null`, o editor troca o botão
principal por **Confirmar planta** até ela ser confirmada. Antes, esse botão ficava em um painel recolhido.
Vale também para qualquer projeto sem confirmação. Em cena da câmera, "Voltar às medidas" não aparece.

## Pendência do item 3

`front/features/ar/assembly/ar-assembly.tsx` ainda não existe, e importá-lo quebraria typecheck e compilação
de todos. O import fica isolado em `features/project-creation/ar-assembly-slot.tsx`, que por ora mostra
"A montagem pela câmera ainda não está pronta" com saída para medidas. O comentário do arquivo traz a linha
de troca. **Quando a Retina comitar, falta trocar esse corpo e testar com o componente real.**

A assinatura atende o fluxo. O cabeçalho esconde Cancelar nessa etapa, para não desmontar o componente.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck:front` | 0 erros |
| `node --test front/features/editor/area-distances.test.ts` | 4 aprovados |
| `npm run test:xr` | 40 aprovados |

QA no Edge headless, `next dev` em 3100 com `.next-dev`, API própria em 3105 compilada do código atual,
sobre cópia temporária do SQLite. Sem `pageerror`.

| Verificação | Viewports | Resultado |
| --- | --- | --- |
| Entrada e Ver em AR com `navigator.xr` simulado e sem ele | 390, 320, 1280 | conforme itens 1, 2 e 9 |
| Salvar e reabrir cena v2 com cadeia | 390, 320, 1280 | v2, 3 de 3 pessoas na cadeia, reabre com +1 pessoa |
| +1 com zoom | 390, 320, 1280 | acertado com zoom alterado |
| Duplo toque rápido no +1 | 390, 320, 1280 | acrescentou 1 |
| Arraste sobre o +1 | 390, 320, 1280 | 0 acréscimos |
| `.sr-only` | 390, 320, 1280 | 1 px; miniatura do poste renderizada |
| Bandeja com zoom | 390 | zoom mantido depois da correção |
| Converter legado, salvar e reler | 1280 | 5 de 5 na cadeia, revisão 2 |
| Aviso de distância em planta em L | 1280 | aviso exibido |
| Mover (toque e arraste) e girar área, salvar | 1280 | vértices movidos e girados na API |
| Pessoa do meio arrastada, salvar | 1280 | distâncias 0,800 e 0,800 m |
| Câmera simulada até salvar | 390 | `webxr` gravado, "Medida com a câmera" no resumo e na revisão |

O teste de câmera usou um componente falso temporário, com planta de
`createEnvironmentFromMeasuredPoints`, removido depois. **Não prova o `ArAssembly` real.** Também houve
falhas iniciais nesse teste por cena falsa incompleta, sem relação com o código entregue.

Limite conhecido: com Mover ativo, tocar dentro da própria área só a mantém selecionada; é preciso tocar
fora dela ou arrastar. Área grande em sala pequena pode ter pouco piso livre para o toque.

## Pendente no aparelho

Câmera, sessão real, gestos, +1 com dedo, bandeja e miniatura no iPhone e no Samsung. Toque foi emulado.

## Contratos publicados

- `measurementSourceLabel(environment)` em `front/features/editor/project-scene.ts`.
- `ArAssemblySlot` em `front/features/project-creation/ar-assembly-slot.tsx`, provisório.

## Dúvidas

Nenhuma para o usuário.
