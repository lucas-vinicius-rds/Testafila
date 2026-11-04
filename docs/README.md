# Documentação TestaFila

Atualização de arquitetura e contratos em 04/11/2026, na branch
`ondas/camera-e-arquitetura`. Comece pelas [regras das ondas](ondas/README.md)
e pelo [estado da Onda 3](ondas/status/ONDA-3.md). Este último separa código,
evidência e publicação; não confunda fonte atual com bundle antigo em execução.

| Documento atual | Assunto |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | back/front/core e dependências |
| [EXECUCAO-LOCAL.md](EXECUCAO-LOCAL.md) | instalar, executar, testar e preservar dados |
| [BACKEND.md](BACKEND.md) | API compartilhada, origens e persistência |
| [FRONTEND.md](FRONTEND.md) | rotas, fluxo, editor e proxy |
| [DOMINIO.md](DOMINIO.md) | cena v2, cadeia, legado e geometria |
| [PLANO-WEBAR.md](PLANO-WEBAR.md) | fluxo AR atual e limites |
| [XR-PENDENCIAS.md](XR-PENDENCIAS.md) | compatibilidade e validação física pendente |
| [TESTE-MANUAL.md](TESTE-MANUAL.md) | roteiros Samsung e iPhone 11 |
| [DELIVERY.md](DELIVERY.md) | estado da entrega |
| [REQUISITOS-ESTADO-ATUAL.md](REQUISITOS-ESTADO-ATUAL.md) | PDFs e decisões posteriores |

## Evidências e planejamento

[Onda 0](ondas/status/ONDA-0.md), [Onda 1 Codex](ondas/status/ONDA-1-codex.md),
[Onda 2 Codex](ondas/status/ONDA-2-codex.md), [Onda 2 Retina](ondas/status/ONDA-2-retina.md)
e [Onda 2 Vitral](ondas/status/ONDA-2-vitral.md) registram verificações datadas.
O ajuste direto do fluxo está em [Onda 2B](ondas/ONDA-2B-FLUXO-DIRETO.md).
Nenhum marcador de teste simulado comprova funcionamento físico de câmera.

`SPRINT-*`, `QA-*`, relatórios/passagens datados e `historico/` descrevem momentos
anteriores. Neles, referências a `apps/web`, `apps/api`, login, Vite ou pessoas
livres não representam a arquitetura atual. Não executar comandos antigos sem
consultar EXECUCAO-LOCAL. PDFs e identidade estão em `referencias/`.

Não versionar `.env`, SQLite/WAL/SHM, authtokens ou cópias de dados do usuário.
