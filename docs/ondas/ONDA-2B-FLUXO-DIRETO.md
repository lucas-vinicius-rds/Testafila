# Onda 2B — Fluxo direto na câmera

**Dona:** Vitral. Pedido do usuário em 04/11/2026:

> vc entra, tem suas filas, ao criar uma fila, ja é pra entrar na camera, a pessoa medir o
> local no estilo app medida, e depois ir montando a fila posicionando na camera ou podendo
> montar no canvas em 3d. e depois poder visualizar

**Escopo:** `front/features/project-creation/**`, `front/features/ar/assembly/**`,
`front/features/ar/scene/**` e CSS. Não edite `front/features/ar/session/xr-session.ts`: o
Codex está corrigindo esse arquivo.

## Tarefas

1. **Sem tela no meio.** Remova "Como quer criar a planta?". Com suporte a AR, **Criar nova
   fila** abre direto a etapa da câmera. O navegador exige um toque para iniciar a sessão, então
   mostre um único botão grande, **Começar a medir**, e **Digitar medidas** como link discreto.
   Evite um segundo botão de início. Enquanto a detecção roda, não pisque a tela errada.
2. **Sem suporte (iPhone):** vá direto para **Digitar medidas**, com a frase atual avisando
   que a medição pela câmera não está disponível neste aparelho.
3. **Estilo app Medida.** Na etapa de cantos, enquanto mira o chão: linha viva do último canto
   até o retículo, com a medida em metros junto da linha e atualizando em tempo real. Cada
   parede marcada fica desenhada com sua medida. Fechar a planta mostra todas as medidas.
   Confira primeiro o que já existe em `assembly-scene.ts`. Altere só objetos e refs no
   `onFrame`, nunca estado do React. Sem escala corretiva.
4. **Escolha depois de medir.** Ao fechar a planta, mostre duas ações de mesmo peso:
   **Montar na câmera** e **Montar no 3D**. A primeira segue as etapas atuais. A segunda encerra
   a sessão e abre o editor com a planta medida.
5. Não mude a ordem das chamadas da sessão nem o comportamento de `/ar` e `/xr-check`.

## Pronto quando

Typecheck e `test:xr` aprovados, e fluxo verificado com XR simulado em 390×844 e 320×568: criar,
medir, cada uma das duas escolhas, salvar e reabrir, com banco temporário. Sem suporte a AR, o
fluxo por medidas funciona. Atualize `front/tests/e2e` se quebrar. Marcador:
`status/ONDA-2B-vitral.md`. Avise o coordenador em mensagem curta.
