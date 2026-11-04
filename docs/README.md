# Documentação TestaFila

[Panorama local de 04/11/2026](PANORAMA-LOCAL-2026-11-04.md): atualização pelo fork
Ricardo, execução, resultado real dos testes, WebAR e verificação pública ngrok.

Próxima revisão solicitada: [ondas 5 — fila conectada e app touch](SPRINT-05.md).
Plano delegado; não representa implementação já concluída. O usuário fará aceite.

Revisão do editor em 28/10: [SPRINT-04.md](SPRINT-04.md),
[3D-INTERACOES.md](3D-INTERACOES.md) e [SKILLS-LOTE04.md](SKILLS-LOTE04.md).
O relatório de 27/10 abaixo descreve a entrega anterior; a interface atual usa
retângulo, ajuste de cantos no canvas e pessoas independentes de percursos.

Atualizada em 27/10/2026. **Comece pelo [relatório de passagem](PASSAGEM-COLEGA.md).**
Estado do produto: editor manual/3D funcional; MVP WebAR ainda incompleto.

## Para continuar o desenvolvimento

| Documento | Conteúdo |
| --- | --- |
| [PASSAGEM-COLEGA.md](PASSAGEM-COLEGA.md) | Entregas, verificações, riscos, pendências e próximos passos. |
| [EXECUCAO-LOCAL.md](EXECUCAO-LOCAL.md) | Instalação, ambiente, conta administrativa, comandos e solução de problemas. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Estrutura implementada e fluxo navegador/Next/Nest/SQLite. |
| [BACKEND.md](BACKEND.md) | API, autenticação, banco e limites. |
| [FRONTEND.md](FRONTEND.md) | Rotas, proxy, editor e estados de erro. |
| [DOMINIO.md](DOMINIO.md) | Geometria, comandos, capacidade e invariantes. |
| [XR-PENDENCIAS.md](XR-PENDENCIAS.md) | Spike experimental, validação física e AR ainda faltante. |
| [PLANO-WEBAR.md](PLANO-WEBAR.md) | Proposta futura para integrar WebAR ao editor, condicionada à validação física. |
| [REQUISITOS-ESTADO-ATUAL.md](REQUISITOS-ESTADO-ATUAL.md) | Matriz dos PDFs e alterações posteriores autorizadas. |
| [TESTE-MANUAL.md](TESTE-MANUAL.md) | Roteiro de aceite humano e registro de resultados. |
| [DELIVERY.md](DELIVERY.md) | Síntese do estado de entrega. |

## Evidências datadas

- [RELATORIO-MUDANCAS-2026-11-04.md](RELATORIO-MUDANCAS-2026-11-04.md): WebAR experimental, remoção do protótipo legado e verificações desta sessão.
- [QA-LOTE-04.md](QA-LOTE-04.md): build final, três viewports, fluxo visual completo e capturas de 28/10.

- [QA-LOTE-03.md](QA-LOTE-03.md): primeira rodada integrada de 22/10.
- [QA-FECHAMENTO-LOTE-03.md](QA-FECHAMENTO-LOTE-03.md): correções e retestes posteriores.
- [SPRINT-01.md](SPRINT-01.md), [SPRINT-02.md](SPRINT-02.md) e
  [SPRINT-03.md](SPRINT-03.md): tarefas/contratos de cada lote, com escopos históricos.
- [PRE-DEVELOPMENT.md](PRE-DEVELOPMENT.md) e [SKILLS.md](SKILLS.md): preparação e ferramentas.

## Referências e histórico

- [XRD original](referencias/XR_Design_Document_TestaFila.pdf).
- [Plano original](referencias/Plano_de_Projeto%20-%20TestaFila.pdf).
- [One-page concept original](referencias/One_Page_Concept_TestaFila_UnicaPagina.pdf).
- [Identidade slide-cintia](referencias/DESIGN-SLIDE-CINTIA.md).
- [Passagem anterior completa](historico/PASSAGEM-ANTERIOR-2026-10-22.md).
- [Planejamento arquitetural antigo](historico/ARQUITETURA-PLANEJADA-2026-10-22.md).
- [Coordenação antiga](historico/COORDENACAO-2026-10-22.md).
- [README original do protótipo](historico/README-PROTOTIPO-ORIGINAL.md).

As referências são preservadas; isso não significa que cada promessa delas já
foi implementada. Histórico não é o estado vigente. O README da raiz e o da API
servem como atalhos; AGENTS.md fica na raiz para descoberta pelos agentes.
Não registrar senhas, segredos de sessão ou cópias do banco nestes documentos.
