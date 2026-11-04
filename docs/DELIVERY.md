# Entrega e estado atual — 04/11/2026

Fonte atual: branch `ondas/camera-e-arquitetura`. Consulte o marcador
[Onda 3](ondas/status/ONDA-3.md) antes de assumir que este código já está publicado.
O bundle e a API antigos só podem ser substituídos juntos, após validação completa.

## Implementado no código

- Next em front, Nest em back/src, SQLite e domínio puro em back/core.
- Galeria compartilhada sem login, persistência real, revisão otimista e conflitos.
- Cena v2 com cadeia de pessoas, espaçamento, direção, +1 e conversão explícita
  de legados. Abrir v1 migra em memória sem regravar sua linha.
- Editor 3D: planta retangular, cantos por arraste, área restrita, postes/fitas,
  grade, seleção, histórico, controles de câmera, prévias e layout mobile.
- Criação direta: câmera quando suportada; medidas digitadas quando indisponível.
  Após medir, escolha entre montagem na câmera e no 3D, salvando o mesmo contrato.
- Sessão XR comum, hit-test, medidas de paredes, montagem transitória,
  visualização/realinhamento de projeto salvo. A guarda de frame ausente não
  altera a ordem de inicialização que funcionou no Samsung.

## Aceite ainda necessário

XR permanece experimental. O usuário testou um Samsung (modelo não informado) e
relatou funcionamento; iPhone 11 não suportou WebAR. Não houve aceite físico da
Onda 2B. Precisão de 5% em 20 m, latência, uso prolongado e SUS com cinco usuários
não foram comprovados. Ver [teste manual](TESTE-MANUAL.md) e
[pendências XR](XR-PENDENCIAS.md).

A montagem AR não salva não sobrevive a recarga/fechamento da aba. A tolerância de
realinhamento depende de testes reais. Legados com colisões podem exigir ajuste
antes de conversão. Capacidade conjunta de percursos legados é gulosa, não ótima.
A decisão de autenticação futura permanece pendente; não confundir galeria pública
com isolamento por usuário. Nenhum requisito é aprovado apenas por documentação.
