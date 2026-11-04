# Onda 1 — Frente A (Viga)

**Situação:** itens 1 a 11 concluídos no domínio. Commit principal: `85711e8`.
Contratos: [ONDA-1-viga-contratos.md](ONDA-1-viga-contratos.md); nenhum tipo mudou depois da
publicação.

**Ressalva do item 11:** a leitura migrada depende de `getProject`, em `projects.service.ts`.
A alteração é do Codex e estava **sem commit** quando a testei. Ela foi compilada do working
tree dele. A porta 3001 segue em v1 até o `next build` da Onda 3, como combinado; o caminho
novo nunca rodou em produção.

## Feito, por item

| Item | Resultado |
| --- | --- |
| 1 | Cena v2 com `queue.personIds`: ordem e vínculo; espaçamento em `simulation.spacingMeters`. |
| 2 | `person:add` define início e orientação; `+1` sempre atrás da última. |
| 3 | `simulation:spacing` recompõe a cadeia inteira, preservando curvas. |
| 4 | Mover e girar levam o trecho seguinte; anteriores não mudam. |
| 5 | Remover fecha a cadeia no início, no meio e no fim. |
| 6 | Toda operação inválida devolve a mesma cena; undo e redo cobertos. |
| 7 | Legado abre intacto; `queue:convert-legacy` é explícito e determinístico. |
| 8 | `area:move` e `area:rotate`. Fita segue derivada dos postes. |
| 9 | `createEnvironmentFromMeasuredPoints` e `sessionPointToProject`. |
| 10 | Teste com 4 fitas num poste. **O domínio era a causa de 1.4** (abaixo). |
| 11 | `migrateProjectScene` reescrita; `typecheck:core` aprovado. |

**Causa de 1.4:** `beltClear` reprovava qualquer fita a menos da folga de outra, e duas fitas
no mesmo poste têm distância zero. Portanto a segunda fita de um poste sempre falhava. Agora o
encontro no poste comum é permitido, e a ponta livre ainda não pode encostar na outra fita.
Sem o conserto, numa cópia do `core`, 2 testes falham, entre eles o das 4 fitas; com ele, passam.
Duplicata A-B/B-A, terceiro poste e cruzamento seguem rejeitados. A seleção por toque de poste
já conectado, parte da 1.4, não é domínio e não foi verificada aqui.

## Comandos e resultados

| Comando | Resultado |
| --- | --- |
| `npm run test:core` | 169 aprovados, 0 falhas (eram 125) |
| `npm run typecheck:core` | exit 0 (era exit 2) |
| `npm run typecheck:back`, `typecheck:front` | exit 0, com o working tree dos outros agentes |
| `back/test` contra compilação própria | 10 aprovados, 0 falhas, incluindo testes em edição pelo Codex |
| `npm run test:xr` | 37 aprovados na última rodada |

Na rodada anterior, `test:xr` deu 36 aprovados e 1 falha. Não capturei qual teste foi; a pasta
estava em edição pela Retina e a rodada seguinte passou inteira. Causa não determinada.

**Migração em cópia do banco, somente leitura:**

- 21 de 21 abriram; os dados são iguais aos originais, exceto versão e `queue`.
- 21 válidos antes e 21 depois: nenhuma regressão.
- Todos estavam em v1: 17 legados (86 pessoas) e 4 sem pessoas.
- Conteúdo das linhas igual antes e depois da leitura.
- `queue:convert-legacy`: **16 de 17 convertem**. O projeto `54135db9` (17 pessoas) é rejeitado
  por conflito de geometria e fica intacto. Ver `DUVIDAS-USUARIO.md`.

**API real, compilada à parte, porta 3120, em cópia do banco, 9 de 9:** salvar e reabrir
cadeia; atualizar com revisão nova; revisão antiga dá 409; cadeia inconsistente dá 400 sem
gravar; projeto novo v2 com pessoa fora da fila dá 400; v1 enviada entra migrada; abrir os 21
não regrava; leitura migrada 21 de 21; legado salvo sem conversão nem perda. O banco real não
foi usado. A compilação e os testes à parte foram apagados depois.

## Testes antigos alterados

Três testes em `queue.test.ts` descreviam o comportamento substituído:

- `adds a free person...`: agora respeita o yaw informado e cria a cadeia.
- `appends a free person...`: passa a usar cadeia.
- `rejects an append that collides...`: passaria pelo motivo errado (exige conversão), então
  ganhou cadeia e confere que o erro é o conflito.

`createScene` passou para v2. Os demais testes não mudaram.

## Decisões de modelo

- **Mover pessoa do meio:** ela fica a uma distância do espaçamento da anterior, na direção
  apontada. É um arco em torno da anterior, não um arraste livre. Sem isso, o espaçamento entre
  as duas mudaria. O trecho seguinte gira junto, inclusive a orientação.
- **Remover:** quem vem atrás avança e ocupa a vaga, mesmo ao remover a primeira pessoa. O
  início da fila fica no lugar. Se o avanço colidir, a remoção é rejeitada.
- **Vínculo não pode atravessar obstáculo**, mesmo com as duas pessoas livres.
- **Legado:** mover, girar e remover seguem individuais, para não prender dados antigos.
- **Salvar v1 continua aceito** na API, para a transição. **Remover na Onda 3**, depois do novo
  bundle: é a única brecha para criar projeto novo com pessoas soltas.
- `postGroups` abandonado: não existia em contrato, banco ou validação.

## Pendente

**Fora do meu escopo**

- Codex: comitar `getProject`, `schema_version` e os testes, em edição agora.
- Vitral: usar `getQueueMode`, oferecer conversão, usar `area:rotate`, tratar o arco no arraste.
  O `sourceId` de `person:append` é ignorado, e `queue-editor.tsx` ainda o envia.
- Onda 3: `next build` e reinício juntos. Antes disso, reiniciar a 3001 quebra o editor.

**Pendente no aparelho:** arrastar a pessoa em arco, conectar fitas por toque e a captura pela
câmera com a função do item 9. Nada disso foi testado em aparelho.

## Dúvidas

Registrada em [DUVIDAS-USUARIO.md](DUVIDAS-USUARIO.md).
