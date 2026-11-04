# Onda 2 — Fila inteira pela câmera

Resolve 1.1, 2.5 e completa 1.8 e 1.9. Depende da Onda 1 inteira.

## Fluxo esperado

1. **Criar nova fila** mostra duas opções: **Medir com a câmera** e **Digitar medidas**.
2. **Cantos:** o usuário marca os cantos do ambiente no chão e fecha a planta.
3. **Áreas restritas (opcional):** marca os cantos de cada área no chão.
4. **Postes:** toca para colocar cada poste no ponto do retículo.
5. **Fitas:** escolhe dois postes para conectar. Um poste aceita várias fitas.
6. **Pessoas:** coloca a primeira, ajusta a orientação, usa `+1` e escolhe o espaçamento.
7. **Concluir** encerra a sessão e abre o editor 3D com tudo o que foi montado.
8. No editor, o usuário revisa, ajusta, dá nome e salva, com o fluxo que já existe.

Tudo acontece na mesma tela do React. A cena fica em memória e passa direto para o editor,
sem localStorage e sem salvar pose XR.

## Frente A — Retina: montagem em AR

**Escopo exclusivo:** `front/features/ar/**`.

1. Implementar os passos 2 a 7 como componente único, com entrada e saída de `ProjectScene`.
2. Toda inserção usa os comandos de `@testafila/core`. Comando rejeitado mostra o motivo na
   hora, em vermelho, e não altera a cena. Isso cobre o feedback de colisão dos PDFs.
3. Renderizar a cena sobre o chão real a cada alteração, sem reconstruir tudo por comando.
   Liberar geometrias e materiais ao remover.
4. Controles em DOM overlay: desfazer, refazer, etapa atual, medidas e sair. Alvos de pelo
   menos 48 px, usáveis com uma mão, seguindo `DESIGN.md`. Texto simples, sem jargão: nada
   de "hit-test", "tracking" ou "XR" para o usuário.
5. Perda de tracking: suspender inserção e avisar. Sair sem querer ou perder a sessão: nada
   montado se perde. Oferecer **Continuar** com realinhamento por dois pontos ou
   **Revisar no editor**.
6. Confirmar antes de sair quando houver trabalho não concluído.
7. Corrigir o giro invertido de `/ar` (achado 1 de `status/ONDA-1-retina.md`), com teste usando
   Three real que falhe antes e passe depois: o ponto (2,0) precisa cair em (4,5). A tela não
   pode informar resíduo 0 com a planta no lugar errado. Commit separado, fácil de reverter.
8. Hoje, se a sessão cair, os cantos se perdem. Isso contraria o item 5: guarde o trabalho
   fora da sessão para sobreviver à queda, incluindo os cantos da planta.

## Frente B — Vitral: entrada do fluxo e editor

**Escopo exclusivo:** `front/app/**`, `front/features/{dashboard,settings,editor,project-creation}/**`,
`front/shared/**`, CSS.

1. Tela inicial do fluxo com as duas opções. Câmera é a principal quando houver suporte.
2. Sem suporte, como no iPhone: a opção aparece desativada, com a frase "A medição pela
   câmera não está disponível neste aparelho", e **Digitar medidas** vira a ação principal.
   Sem falsa promessa e sem erro técnico.
3. Integrar o componente de Retina em `project-creation-flow` e receber a cena no editor.
   Mostrar no resumo se a planta veio da câmera ou de medidas digitadas.
4. Revisar a origem da medição gravada para não dizer "planta manual" em projeto da câmera.
5. Inspector uniforme: mover, girar e apagar por tipo, usando os comandos de Viga, incluindo
   girar área. Exceções explicadas, sem botão sem efeito (1.8).
6. Pessoas no editor passam a usar a cadeia real. Remover ferramenta de pessoas soltas e
   oferecer a conversão de projetos antigos. Ajustar textos (1.3, 2.10).
7. Miniatura 3D do poste na paleta, com o modelo real: gerar a imagem uma vez, com um único
   contexto WebGL, e reutilizar (1.9).
8. Abrir a bandeja no mobile não pode reenquadrar a câmera. Primeiro confirme se isso ocorre.
9. "Ver em AR" só aparece com suporte a `immersive-ar`, usando a detecção da Retina.
10. Exercitar de verdade o que ficou de fora na Onda 1: salvar e reabrir com cena v2 e cadeia,
    em API própria com banco temporário; `+1` com zoom alterado, duplo toque rápido e arraste;
    aviso de distância indisponível; `.sr-only` na tela.
11. `person:append` ignora `sourceId`: pare de enviá-lo em `queue-editor.tsx`. Arrastar pessoa
    do meio segue em arco: a interface precisa deixar isso previsível.

## Frente C — Codex: testes do contrato da câmera

**Escopo exclusivo:** `back/test/**`.

Provar que uma cena criada pela câmera é aceita pela API, salva e reabre, e que um
ambiente malformado é rejeitado.

## Combinado entre Retina e Vitral

Retina publica em `status/ONDA-2-retina-interface.md` a assinatura do componente antes de
terminar. Vitral integra a partir dela. Se a assinatura mudar, avise o coordenador.

## Pronto quando

- O fluxo roda de ponta a ponta com sessão simulada em teste, e o resultado abre no editor.
- Sem suporte a AR, o app cria fila por medidas e tudo funciona.
- Typechecks e testes aprovados.
- Tudo que depende de câmera, tracking, precisão e gestos fica como pendente no aparelho.
