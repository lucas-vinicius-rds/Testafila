> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Verificação integrada do Lote 3

Rodada local em 22/10/2026. Next em localhost:3000 e Nest/SQLite em
127.0.0.1:3001, ambos reiniciados após os builds. Dados desta rodada pertencem
à conta administrativa de QA; nenhuma credencial é registrada aqui.

## Verificações executadas

- Domínio: 111 testes em 20 suítes, sem falhas, incluindo os 21 casos do motor
  de filas e os 90 casos anteriores de geometria/medição.
- API: build e typecheck passaram. As duas suítes de integração Nest passaram:
  autenticação/isolamento/revisão e persistência/validação de filas.
- API rejeitou alterações com fita atravessando zona, conexão duplicada,
  poste sem folga, área atravessando concavidade, pessoas sobrepostas e
  posições de pessoas incompatíveis com o percurso. Revisão preservada na rejeição.
- Next: build de produção passou, incluindo TypeScript e rota de edição.
- Portal: montagem no hall de 10 × 8 m com zona X=4..6/Z=5..7, postes (1,1)
  e (8,1), uma fita e percurso (1,3) até (8,3). Poste dentro da zona foi
  rejeitado sem inclusão. Preenchimento a 0,8 m produziu 9 pessoas; a 0,5 m,
  15; mudança para 1 m reduziu para 8 com aviso. Desfazer/refazer restaurou
  as contagens de 15 e 8.
- Salvar/reabrir: GET após salvamento confirmou revisão 2, uma zona, dois
  postes, uma fita, um percurso, oito pessoas e espaçamento de 1 m. Recarga
  e reabertura no viewport móvel preservaram os dados.
- Ponteiros: eventos sintéticos no canvas selecionaram e arrastaram um poste
  de Z=1 para aproximadamente Z=1,5, com uma alteração registrada no editor.
  Esse rascunho foi descartado posteriormente no teste de conflito.
- Concorrência: atualização concorrente do projeto de QA avançou revisão 3;
  salvar o editor antigo apresentou 409 e manteve o rascunho. Manter rascunho
  preservou a montagem; recarregar com confirmação trouxe revisão 3.
- Criação: alterar planta de 8 × 6 para 9 × 6 após adicionar poste exigiu
  decisão explícita para descartar montagem. Após descarte, o novo projeto
  salvo retornou perímetro [(0,0),(9,0),(9,6),(0,6)], sem poste antigo e
  com checks de medição vazios.
- Larguras verificadas no DOM: desktop 1280 e móvel 390 sem overflow horizontal.

## Limites do aceite

Esta rodada não certifica interação em aparelho físico, gestos multitouch,
cancelamento de arraste nem precisão de AR. Arraste foi exercitado por eventos
sintéticos, não por gesto físico. Seleção sequencial de fitas no canvas foi
inspecionada, mas o fluxo de criação da fita nesta rodada usou os seletores
de postes; não é apresentado como aceite completo de clique 3D em sequência.

Uma entrada de console sem mensagem apareceu durante a rodada inicial, apontando
para um chunk Next. Não foi reproduzida nas recargas nem nas interações posteriores;
causa ainda não identificada. Screenshot do portal expirou com indicação de janela
sem renderização; não há novo aceite por captura visual desta rodada.

Capacidade conjunta usa alocação determinística gulosa por ordem dos percursos;
não é uma otimização combinatória global. O motor limita preenchimento a 10.000
pessoas e o servidor mantém JSON de 100 KiB. AR e realinhamento continuam pendentes
do spike e da validação em dispositivos reais.

Sem commit, push ou deploy nesta rodada.
