# Entrega e estado atual

Atualizado em 29/10/2026. Autenticação desativada nesta revisão; todos os projetos estão compartilhados pela instância. Leitura principal: [passagem para o colega](PASSAGEM-COLEGA.md).
O histórico de decisões e bloqueios de 22/10 está em
[historico/COORDENACAO-2026-10-22.md](historico/COORDENACAO-2026-10-22.md).

## Entregue

- Fundação Next/TypeScript + Nest/SQLite.
- Projetos compartilhados na instância, salvar/abrir/apagar e conflitos de revisão.
- Planta manual retangular em metros e ajuste de cantos por arraste, com confirmação.
- Paleta junto ao canvas; áreas por desenho/confirmar; postes/fitas e pessoas livres,
  rotação, +1 atrás, espaçamento e histórico. Percursos antigos continuam compatíveis.
- Barra de câmera, logo original e bandeja mobile; ver [SPRINT-04.md](SPRINT-04.md).
- Seleção/arraste, cancelamento e retomada de sessão sem perder o último rascunho.
- Proxy, limite de tamanho e validação geométrica comum ao cliente e servidor.
- Documentação centralizada, PDFs de referência e relatórios de QA datados.

## Não entregue como produto

- Captura/levantamento completo do ambiente pela câmera e edição da planta sobre o chão real.
- Precisão física garantida, aceite mobile físico, HTTPS/deploy final e testes SUS.
- Certificação normativa de acessibilidade/segurança ou capacidade otimizada global.

A rota experimental `/projects/:id/ar` permite alinhar uma cena salva por dois
pontos e conferir um terceiro, sem salvar poses nem alterar a origem do projeto.
O spike `/xr-check` continua preparando o diagnóstico de suporte e hit-test.
Nenhum dos dois substitui validação física em aparelho. Detalhes em
[XR-PENDENCIAS.md](XR-PENDENCIAS.md).

## Evidências e critérios

- [QA de integração do Lote 3](QA-LOTE-03.md)
- [Correções e retestes do fechamento](QA-FECHAMENTO-LOTE-03.md)
- [Relatório desta passagem e verificações finais](PASSAGEM-COLEGA.md)
- [Matriz contra os PDFs e mudanças autorizadas](REQUISITOS-ESTADO-ATUAL.md)

Os SPRINT-01/02/03 e PRE-DEVELOPMENT registram a evolução histórica. Falhas de
instalação, quotas e ausência de ferramentas neles não representam o estado atual.
Marcar uma tarefa como concluída exige evidência correspondente ao ambiente:
teste unitário não comprova precisão de câmera nem compatibilidade de aparelhos.
