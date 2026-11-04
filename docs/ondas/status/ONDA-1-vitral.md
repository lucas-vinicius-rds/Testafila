# Onda 1 — Status da Vitral (Frente C)

**Data:** 04/11/2026. **Branch:** `ondas/camera-e-arquitetura`. Sem push.

## Feito

| Item | Resultado |
| --- | --- |
| 1. Viewport | `viewport` exportado em `app/layout.tsx` com `viewport-fit=cover`; meta conferida no HTML. |
| 2. Safari | Campos com 16 px em tela até 760 px ou toque, safe areas no topo e nas laterais, `touch-action` no canvas, sem rolagem elástica no editor (`:has`). |
| 3. Tela inicial | `appleWebApp`, `app/manifest.ts`, `app/icon.svg` e `app/apple-icon.png` (180 px, gerado da logo). Sem service worker. O 404 de favicon deve sumir; não foi medido à parte. |
| 4. Prévias | Lê `data.scene`. 21 de 21 projetos da cópia do banco com SVG. Recarrega quando `updatedAt` muda. Erro mostra "Prévia indisponível". |
| 5. Navegação | Estado ativo correto em Minhas filas e Configurações. Configurações agora vem só da URL. Criar nova fila não tem o menu na tela, então o ativo ali não foi exercitado no navegador. |
| 6. Configurações | `shared/editor-preferences.ts` (localStorage, só interface). Grade e modo chegam ao editor. Padrão do modo passou a ser Editar. |
| 7. Distâncias | `features/editor/area-distances.ts`: só em planta retangular alinhada aos eixos; senão, aviso de indisponível. 4 testes. |
| 8. Botão +1 | `append-person-button.tsx`: 80×48 px de tela em qualquer zoom, acima do resto da cena, separado do arraste, com tolerância de toque e bloqueio de 350 ms contra disparo duplo. |
| 9. Fitas | Ver abaixo. |
| 10. AR | "Ver em AR" e "Editar fila" no topo da revisão (y = 205 px no mobile). |
| 11. Divisão | Saíram `item-thumbnail.tsx`, `area-distances.ts`, `append-person-button.tsx`. `queue-editor.tsx` e `scene-viewer.tsx` seguem com cerca de 900 linhas: só dividi o que precisei mexer. |

Fora da lista, necessários para o fluxo mobile:

- O menu principal estava oculto no mobile; virou barra inferior.
- Nome longo de projeto empurrava as ações do card e alargava a página (545 px em tela de 390, 119 px de sobra em 1280). Corrigido.
- O canvas não ocupava a altura livre no mobile. Corrigido em `.scene-frame-container`.
- `.sr-only` não existia, e "Grade" aparecia solto na barra. Corrigido depois da última rodada de QA; só CSS, não reverificado na tela.
- Alvos de 32 a 38 px subiram para 44 px. `Item: post` virou nome em português. Rótulos `+Z`/`-X` saíram.
- `handlers` da cena tinha dependências faltando: o modo Navegar e o passo da grade podiam ficar antigos. Corrigido.
- Com a ferramenta Fita ativa, tocar em poste não o arrasta, e o inspetor do poste dá lugar à confirmação da fita.

### Item 9

Só verifiquei a seleção por toque de poste já conectado, como pedido. Com `85711e8`, um poste central
foi selecionado e ligado a três outros, em 390, 320 (toque emulado) e 1280 (mouse): 9 de 9 "Fita conectada".

Testei uma hipótese própria, de que a área de toque da fita cobria o poste. Com a área antiga
restaurada, o teste passou igual em 390, então **a hipótese não se confirmou** e a mudança foi revertida.
Não há comparação do toque antes do commit da Viga.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm run typecheck:front` | 0 erros (antes do ajuste final de `.sr-only`, que é só CSS) |
| `node --test front/features/editor/area-distances.test.ts` | 4 aprovados |
| `npm run test:xr` | 37 aprovados |
| QA Playwright no Edge headless, 390×844, 320×568, 1280×900 | sem `pageerror`, sem erro de console, sem sobra horizontal, nenhuma escrita na API |

QA feito com `next dev` em 3100 (`.next-dev`) e API própria em 3105, compilada do código atual, sobre
cópia temporária dos três arquivos SQLite. O banco real não foi aberto pela aplicação. Script fora do
repositório. Salvar e reabrir **não** foram exercitados. A API usada ainda devolve cena salva em v1
(`getProject` sem migração, pedido da Viga ao Codex).

Não exercitados no navegador: aviso de distância indisponível (só teste unitário), +1 com zoom alterado,
duplo toque rápido no +1, arraste do +1, abrir pela tela inicial.

## Pendente no aparelho

Tudo do iPhone físico: safe areas reais, ausência de zoom ao focar campo, rolagem elástica, ícone e abertura
pela tela inicial, toque real em poste com fita, +1 com dedo, menu inferior com barra do Safari. Landscape
acima de 760 px usa o layout de desktop e não foi avaliado.

## Contratos publicados

- `front/shared/editor-preferences.ts`: `readEditorPreferences`, `saveEditorPreferences`.
- `front/features/editor/area-distances.ts`: `calculateAreaDistances`, `isAxisAlignedRectangle`.
- `front/features/editor/item-thumbnail.tsx`: `ItemThumbnail`.

## Para as próximas ondas

- Abrir a bandeja no mobile muda a altura do canvas e recalcula a câmera: a vista pode voltar ao
  enquadramento inicial. Observado pelo código, não medido. Pede bandeja sobreposta ou manter a câmera.
- "Ver em AR" aparece em qualquer aparelho. Usar a detecção da Retina para o iPhone.
- O editor ainda não oferece `queue:convert-legacy`, `area:move` e `area:rotate`. Projetos legados terão
  `+1` rejeitado até existir essa ação.
- `front/next-env.d.ts` e `front/tsconfig.json` seguem alterados por `next dev` e não foram comitados.

## Dúvidas

Nenhuma nova para o usuário.
