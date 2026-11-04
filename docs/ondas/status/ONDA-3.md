# Onda 3 — fechamento Codex (04/11/2026)

**NÃO PUBLICADA: política da sessão rejeitou o comando de reinício antes da execução.**
Não contornei. Portas antigas intactas: 3000 PID 39332, 3001 PID 20276. Ngrok intocado.
Branch: `ondas/camera-e-arquitetura`; sem push/merge. Ordem final autorizava publicar
apesar da falha E2E se espaçamento funcionasse; ele funcionou, mas houve bloqueio de política.

## Código e documentação

- `3dacf6a`: guarda de frame ausente + regressão red/green; ordem da sessão preservada.
- `289ee34`: plano 2B; Vitral `da7871e`: fluxo direto. Ajuste dela no E2E preservado.
- `7c13a8c`: POST/PATCH exigem v2; leitura v1 continua sem UPDATE. Testes em SQLite temporário.
- `f94b19f`: E2E sem login, API/banco descartáveis, legado, manual e montagem AR simulada.
- Documentação atualizada para back/front/core, fluxo direto, cadeia v2, galeria
  compartilhada e ausência de login. Históricos sinalizados, incluindo achados 3 da Retina.
  `TESTE-MANUAL.md` traz Samsung/iPhone e as duas escolhas após medir.

## Comandos / resultados sobre o código final

| Verificação | Resultado |
| --- | --- |
| test:core | 169/169 |
| test:xr | 74/74 |
| build:back / test:back | build passou; 20/20 |
| typecheck:core / back / front | todos passaram |
| teste adicional area-distances | 4/4 |
| build:front | passou, NEXT_DIST_DIR=.next-release-onda3; .next servido preservado |
| E2E completo 1280×900, 390×844, 320×568 | 8/9; 1 falha abaixo |
| imports: core 14 arquivos / front 52, 218 imports | zero violações React/Three/Nest/banco no core ou back/src no front |

Falha E2E restante: em **390×844**, roteiro manual não encontrou **Usar área**
após arrastar para desenhar área. Sem investigação adicional, conforme ordem urgente.
Desktop e 320×568 passaram o fluxo completo, incluindo mudança para espaçamento
1 m, gravação e conferência das distâncias entre pessoas. Legado e AR simulada
passaram nos três tamanhos. Não é aprovação de touch ou câmera físicos.
Falhas anteriores do harness (singular, debounce 350 ms e label exato do select)
foram corrigidas no teste; uma fixture antiga do teste de criação também foi adaptada a v2.

## Preparação e runtime preservado

Backup fora do Git: `%LOCALAPPDATA%/TestaFila/backups/2026-11-04-onda3/data/`
contém SQLite, WAL e SHM; cópia separada validou `integrity_check=ok`, 21 projetos.
Rollback da API anterior e5eb54d foi compilado em `rollback/back/dist`; .env copiado
localmente, não exibido nem comitado. `.next` antigo continua disponível.

A tentativa de Stop-Process/Start-Process conjunta foi **rejeitada pela política**.
Não houve reinício, nem necessidade de restauração. Para a troca manual autorizada,
usar API atual `back/dist/src/main.js`, cwd `back`, com `.env`; Next cwd `front`
com **NEXT_DIST_DIR=.next-release-onda3**, API_BASE_URL=http://127.0.0.1:3001.
Rollback: API em `rollback/back/dist/src/main.js`, cwd `rollback/back`, DATABASE_PATH
absoluto apontando ao banco original; Next com NEXT_DIST_DIR ausente usa `.next` antigo.
Não misturar bundle antigo com API v2. Executar a troca das duas portas juntas.

Runtime antigo confirmado após o bloqueio: health=ok, 21 projetos; dashboard público
HTTP 200. CRUD público no ngrok: POST 201, reabertura 200, exclusão **só do teste** 204;
lista final idêntica à inicial, 21 projetos. Isso prova o runtime anterior, não a release nova.
URL continua https://defendant-dragging-dreadlock.ngrok-free.dev .

## Pendente

Coordenador efetuar publicação manual e confirmar API v2 + front novo juntos;
abrir projeto antigo/novo no editor na release publicada. Repetir QA de área em 390.
Teste físico Onda 2B: etiquetas, tracking, gestos, trena 5%/20 m, latência, uso
prolongado e SUS com cinco usuários **não comprovados**. Usuário relatou Samsung
funcionando, modelo/OS/browser desconhecidos; iPhone 11 sem WebAR. iOS segue web,
sem nativo. Tolerância de realinhamento e autenticação futura permanecem decisões abertas.
