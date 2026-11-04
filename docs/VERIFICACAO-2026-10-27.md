> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Verificações de passagem — 27/10/2026

Executadas na raiz do repositório pelo coordenador, após estabilização das
entregas de Cedro, Trama e Prumo. Ambiente: Windows/PowerShell, Node 24 e npm 12.

| Comando/verificação | Resultado |
| --- | --- |
| `npm run build:api` | Passou, com domínio revisado. |
| `npm run typecheck:api` | Passou. |
| `npm run test:api` | 10 testes aprovados, zero falhas; inclui migração, validação e integrações Nest. |
| `npm run build:web` | Passou; páginas e tipos gerados, incluindo `/xr-check`. |
| `npm run typecheck:web` | Passou após build. |
| Node test: domínio + lógica pura do spike | 120 aprovados, zero falhas: 116 domínio + quatro do spike. |
| `git diff --check` | Sem erro de whitespace. |
| Health Nest e health pelo proxy Next | Ambos retornaram `{ "status": "ok" }`. |

## Spike no navegador do portal

No portal Maestri, viewport 390 × 836, contexto localhost seguro, a rota
`/xr-check` carregou e informou que o aparelho/navegador não anunciou suporte
`immersive-ar`. O botão de iniciar ficou desabilitado, a sessão permaneceu
não iniciada e não havia marca fictícia. Não foi usado `getUserMedia` como
substituto de AR. A largura do documento não excedeu o viewport.

Console capturado nessa navegação sem entradas. Esse resultado só valida o
estado de indisponibilidade nesse navegador; não valida uma sessão XR real,
retículo, plano, tracking ou medições físicas. A matriz de aparelhos do protocolo
XR permanece sem resultados. Não houve nova certificação visual/hardware da UI.

## Controles da entrega

- Documentação canônica reunida em `docs`, com referências e histórico datados.
- README da raiz e da API são pontos de entrada, sem duplicar a documentação inteira.
- Senhas, segredo real, SQLite, node_modules e build não fazem parte da entrega Git.
- O protótipo Vite do colega continua preservado; comandos genéricos dev/build
  continuam vinculados a ele e isso está explicado no guia local.
- Commit autorizado diretamente na branch local `main`. Push/deploy não foram
  solicitados; não presumir que o commit já foi publicado no GitHub.
