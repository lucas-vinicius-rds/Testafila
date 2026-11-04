# Onda 2B — Status da Vitral

**Data:** 04/11/2026. Sem push.

## Feito

1. **Sem tela no meio:** a tela de escolha saiu. Com suporte, Criar nova fila abre a câmera, com **Começar a medir** e **Digitar medidas** discreto. Durante a detecção aparece só "Preparando…". Cancelar volta à galeria.
2. **Sem suporte:** vai direto para as medidas, com a frase de indisponível.
3. **Estilo Medida:** `assembly/measure-labels.ts` põe a medida junto da linha viva, de cada parede marcada e de todas as paredes depois de fechar. Medidas de áreas em desenho também aparecem. A linha viva já existia. Sem escala; `onFrame` só altera objetos.
4. **Escolha:** ao fechar a planta, **Montar na câmera** e **Montar no 3D**, com o mesmo peso. O toque no chão fica bloqueado nessa tela. Montar no 3D encerra a sessão e abre o editor.
5. `xr-session.ts`, `/ar` e `/xr-check` não foram tocados.

## Comandos e resultados

`typecheck:front` 0 erros; `test:xr`: ℹ pass 74 ℹ fail 0 . QA no Edge headless com `fake-xr.js`, API própria e cópia temporária do banco, em 390×844 e 320×568, sem `pageerror`:

| Fluxo | Resultado nas duas telas |
| --- | --- |
| Galeria, Criar nova fila, medir | sem tela no meio; "Parede atual: 6,00 m" |
| Montar na câmera, salvar, reabrir | sessão encerrada, v2, `webxr`, 4 paredes, 1 poste, 2 na cadeia |
| Montar no 3D, pessoa no canvas, salvar, reabrir | sessão encerrada, v2, `webxr`, 4 paredes, 1 na cadeia |
| Sem AR, medidas, salvar | frase exibida, "Medidas digitadas" |

**Não verificado:** a aparência das medidas sobre o chão. O simulador desenha em 64×64 px, então o código rodou sem erro, mas ninguém viu as etiquetas. O teste só confirma o texto da medida no painel.

`front/tests/e2e/visual-editor.spec.ts` estava com alterações não comitadas de outro agente. Ajustei nele só o que a tela removida quebrava, **não rodei e não comitei**. Quem é dono do arquivo precisa comitar junto.

## Pendente no aparelho

Tudo no Samsung: etiquetas legíveis e no tamanho certo, medida viva, escolha, trena. A etapa da câmera sempre aciona o aviso de recarregar, mesmo sem trabalho.
