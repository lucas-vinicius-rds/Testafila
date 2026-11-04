# Backend TestaFila

Nest em `src`, contratos/domínio em `core`, SQLite local em `data` (ignorado pelo
Git). A galeria é compartilhada, sem login ativo. Não provisionar contas para
usar a aplicação atual.

Documentação: [backend](../docs/BACKEND.md), [execução local](../docs/EXECUCAO-LOCAL.md)
e [estado da integração](../docs/ondas/status/ONDA-3.md).

Na raiz: `npm run build:back`, `npm run test:back`, `npm run start:back`.
O processo usa `back/dist/src/main.js`; executar com cwd `back` preserva o
caminho padrão do banco. Não apague SQLite/WAL/SHM nem exponha `.env`.
