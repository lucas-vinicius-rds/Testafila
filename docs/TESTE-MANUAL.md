# Teste manual — fluxo direto (Onda 2B)

Atualizado em 04/11/2026. Roteiro de aceite, não registro de aprovação.
Use a URL HTTPS do ngrok informada pelo coordenador. A galeria abre sem login;
os projetos desta instância são compartilhados. Não apague projetos de outras pessoas.
Confirme antes se a versão da Onda 3 já foi publicada: código comitado não é versão no ar.

## Samsung com AR disponível

1. Anote modelo exato, Android, navegador e versão. Abra a galeria e toque em
   **Criar nova fila**. Deve entrar diretamente na medição, sem tela de escolha.
   Deve haver **Começar a medir** e a alternativa discreta **Digitar medidas**.
2. Toque em **Começar a medir**, autorize a sessão e procure o chão. Marque os
   cantos, andando com cuidado. Confira a linha viva e as medidas de cada parede.
   As etiquetas devem ser legíveis, sem crescer ou desaparecer indevidamente.
3. Feche a planta. Confira as duas opções **Montar na câmera** e **Montar no 3D**.
   Faça uma fila nova por cada opção. Na opção 3D, a sessão deve encerrar e o
   ambiente medido deve chegar ao editor, sem precisar digitar suas dimensões.
4. Na câmera: desenhe/confirme uma área restrita ou avance sem área; coloque
   postes, conecte fitas e posicione o início da fila. Acrescente pessoas com +1,
   altere o espaçamento e a direção. Conclua, confira/ confirme a planta no editor,
   dê um nome de teste, salve e reabra. Confira pessoas, postes, fitas e medidas.
5. Na montagem, interrompa a sessão e retome com realinhamento. O rascunho deve
   continuar na mesma página. Recarregar/fechar a aba pode perdê-lo: não há
   recuperação persistente de montagem AR não salva.
6. Abra um projeto salvo em AR, faça o realinhamento e compare com o chão real.
   Verifique rotação e orientação sem mudar a escala métrica do projeto.

### Conferência física

Compare paredes e diagonais com trena, incluindo uma distância de 20 m quando
houver espaço seguro. Anote valor real, valor indicado e erro percentual
`abs(indicado - real) / real * 100`. Repita em ambientes/iluminações diferentes.
**5% em 20 m ainda não foi comprovado.** Anote perda de tracking, deriva,
legibilidade, latência, aquecimento e duração. A tolerância de realinhamento ainda
precisa ser definida com medidas reais; não trate limiar de código como aprovação.

## iPhone 11 e navegador sem suporte

1. Abra a mesma URL HTTPS. **Criar nova fila** deve abrir diretamente as medidas,
   com “A medição pela câmera não está disponível neste aparelho”. Não deve
   prometer medição AR nem exigir instalar um aplicativo nativo.
2. Digite largura 10 m e profundidade 8 m. Abra o canvas. Não há entrada de
   coordenadas de polígono nem altura de paredes exigida no fluxo comum.
3. Em Editar, posicione a primeira pessoa, use +1 e altere o espaçamento. As pessoas
   devem permanecer ligadas. Mova/gire a fila; selecione itens e use suas ações.
4. Coloque vários postes e conecte um mesmo poste por lados diferentes. Desenhe
   área restrita, confira grade e distâncias externas; confirme/cancele e desfaça/refaça.
5. Alterne Planta/Perspectiva e use os botões de câmera. Teste toque, arraste,
   cancelamento de gesto e clique seguinte. Não pode surgir objeto residual.
   Confira em tela estreita se canvas, paleta e salvar continuam acessíveis.
6. Nomeie, salve, reabra e edite. Confira contagens, espaçamento e geometria.
   Abra um projeto antigo: só a conversão explícita deve ligar pessoas legadas;
   apenas abrir não pode regravar o projeto. Alguns legados precisam de ajustes
   de colisão antes da conversão. Não descarte pessoas silenciosamente.

## Registro dos resultados

| Aparelho / sistema / navegador | URL e versão | Fluxo e passos | Resultado / erro / captura |
| --- | --- | --- | --- |
| A preencher | A preencher | A preencher | Não executado nesta rodada |

O usuário relatou WebAR funcionando em um Samsung e indisponível no iPhone 11.
Modelo/versões do Samsung e extensão desse teste não foram informados; isso não
aprova a Onda 2B. Headless usa XR simulado e não prova câmera ou gestos físicos.
Permanecem não comprovados: precisão 5%/20 m, latência em aparelho, uso prolongado
 e avaliação SUS com cinco usuários.
