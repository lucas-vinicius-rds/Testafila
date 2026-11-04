# TestaFila

Editor manual e simulador 3D para planejar filas em metros, com projetos
persistidos em SQLite. Aplicação atual: Next.js + NestJS.

O editor inclui uma rota WebAR experimental por projeto (`/projects/:id/ar`).
O alinhamento é temporário por sessão; validação física e compatibilidade em
aparelhos reais continuam pendentes.

## Comece aqui

- [Documentação e índice](docs/README.md)
- [Relatório para o colega](docs/PASSAGEM-COLEGA.md)
- [Instalar, configurar, criar login e executar](docs/EXECUCAO-LOCAL.md)
- [O que falta e diferença em relação aos PDFs](docs/REQUISITOS-ESTADO-ATUAL.md)

Não há conta ou senha fixa no código. Cada instalação cria uma conta pelo CLI.

## Comandos

Na raiz deste repositório, depois de seguir a configuração de ambiente:

```powershell
npm ci
npm run migrate:api
npm run dev:api
```

Em outro terminal:

```powershell
npm run dev:web
```

Acesse `http://localhost:3000`. Use `dev:web`, `dev:api`, `build:web` e
`build:api` para executar e compilar as aplicações.

Documentação detalhada está em `docs`; `AGENTS.md` permanece na raiz como
instrução operacional dos agentes. Não versionar `.env`, SQLite ou credenciais.
