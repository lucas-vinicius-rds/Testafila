# Domínio e contratos

Fonte atual: `back/core/contracts` e `back/core/domain`, sem React, Three, Nest
ou banco. Front usa `@testafila/core`; backend compila o mesmo domínio para JS.
Uma unidade é um metro, Y para cima e piso XZ.

## Cena v2 e legado

ProjectScene v2 contém ambiente, áreas, postes, fitas, percursos legados, pessoas,
`queue: {personIds: [...]}` e simulação. `people` guarda posição/yaw; a ordem em
`queue.personIds` liga os vizinhos. Pessoa ligada usa routeId/distância nulos.

`getQueueMode` distingue empty, chain e legacy. V1 migra em memória para v2 com
fila vazia e pessoas intactas. GET não regrava. `queue:convert-legacy` é explícito,
determinístico pela ordem do array people e pode falhar por colisão. Um projeto
real não converte sem ajustes: ver `ondas/status/DUVIDAS-USUARIO.md`; não apagar
ou deslocar pessoas silenciosamente para forçar conversão.

## Comandos

- `person:add` só começa uma fila vazia; `person:append` entra atrás da última.
- `simulation:spacing` recompõe a cadeia inteira com 0,5/0,8/1 m.
- Mover a primeira translada a fila; mover outra preserva distância da anterior
  e reposiciona o trecho seguinte. Girar aplica yaw absoluto e gira a cauda.
- Remover fecha a vaga. Invalidade mantém a instância da cena original.
- Área move/gira em torno do centroide/remove; poste move/remove, sem giro útil.
- Fita deriva dos endpoints; um poste aceita várias fitas. Não permitir
  duplicata A-B/B-A, passagem por terceiro poste ou obstáculos.
- Percursos e preenchimento antigos continuam para legado, não misturados à cadeia.

Comandos são imutáveis e atômicos; histórico tem até 100 entradas, desfazer/refazer
restaura documento completo. Revisão de banco só muda ao salvar.

## Geometria, medidas e câmera

Polígonos simples com fechamento implícito, interseções inclusivas, finitude,
footprint, contenção e folga são compartilhados com o servidor. Tangência pode
ser colisão conforme a regra do footprint; não contornar validação na UI.
Checks de medição vazios não significam erro zero nem tolerância aprovada.

`createEnvironmentFromMeasuredPoints({points,recordedAt,wallHeightMeters?})`
recebe cantos métricos na ordem. Primeiro vira origem e primeira parede fica em
+X, por rotação/translação sem escala ou espelhamento. Retorna environment com
source webxr/checks vazios/confirmedAt null e sessionToProject separado.
`sessionPointToProject` usa essa transformação só na sessão; nunca a persistir.

Epsilon geométrico 1e-7 não é precisão de sensor. Teto operacional de 10.000 pessoas
não é certificação de desempenho. Capacidade conjunta de percursos usa alocação
gulosa determinística, não otimização global. Testes: `npm run test:core`.
