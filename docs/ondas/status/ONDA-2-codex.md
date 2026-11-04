# Onda 2 — Codex / Frente C: contrato da câmera na API

Data: 04/11/2026. Branch: `ondas/camera-e-arquitetura`.
Situação: **concluída no escopo de testes de contrato**.
Commit do teste: `26205cd`.

## Documentos commitados antes de começar

Conforme ordem, commit `79668a8` de `docs/ondas/ONDA-2-CAMERA.md` e
`docs/ondas/ONDA-3-FECHAMENTO.md`, que estavam modificados.
`docs/ondas/status/DUVIDAS-USUARIO.md` já estava versionado e sem alteração
pendente; foi preservado. Nenhum arquivo de outro agente foi incluído.

## Feito

Criado somente `back/test/measured-scene.integration.test.mjs`, sem alterações
no backend de produção, core ou frontend.

1. A função real `createEnvironmentFromMeasuredPoints` do core recebe cantos
   controlados em coordenadas de sessão, transladados e girados. O teste verifica
   origem no primeiro canto, primeira parede de 12 m em +X e profundidade 8 m,
   sem correção de escala.
2. A cena v2 usa o ambiente retornado pela função, fonte `webxr`, data da
   captura, checks vazios e `confirmedAt: null`. Pelo domínio são acrescentados
   área restrita, dois postes, fita e duas pessoas da cadeia.
3. Nest real com SQLite temporário aceita POST (201), preserva a cena e grava
   `schema_version = 2`. Uma segunda captura ajusta o ambiente; PATCH (200)
   avança a revisão para 2. Após reiniciar **apenas o app de teste em porta
   efêmera**, GET (200) reabre a cena completa exatamente igual à salva.
4. Conferidos: `measurement.source = 'webxr'`, data, `queue.personIds`, checks
   vazios sem `observedErrorPercent` zero inventado, e nenhuma confirmação
   automática de geometria. O JSON SQLite contém somente ProjectScene, sem
   `sessionToProject` ou pose XR.
5. API rejeita com 400/BAD_REQUEST, tanto POST quanto PATCH: ambiente nulo,
   menos de três cantos, auto-interseção, data inválida, canto duplicado,
   coordenada nula e tentativa de incluir transformação de sessão no ambiente.
   Cada rejeição preserva a linha inteira (JSON, revisão e metadados) e não
   cria novo projeto.
6. A própria fábrica rejeita captura com poucos pontos, primeiros pontos
   coincidentes, auto-interseção, NaN, ponto nulo e data inválida. Retorna erros
   e nenhum ambiente/transformação utilizável.

## Comandos e resultados

- `npm run build:back`: **exit 0**. Não reinicia serviço.
- Primeira execução de `npm run test:back`: exit 1 porque o teste tentou importar
  `dist/core/domain/measured-environment.js`, que não é emitido: a função da
  captura não faz parte do grafo de dependências do Nest. Corrigido o import no
  teste para a fonte real do core, suportada pelo Node 24, sem alterar tsconfig
  ou aumentar o escopo do backend.
- Execução final de `npm run test:back`: **exit 0, 20 aprovados / 0 falhas**.
  Nenhuma cobertura anterior foi retirada. Os três cenários novos passaram.
- `git diff --check` do teste: sem erros; aviso LF/CRLF somente.

Os testes usam `mkdtemp`, `DATABASE_PATH` explícito para SQLite temporário,
restauram variáveis de ambiente e fecham/removem somente seu diretório temporário.
Nenhum projeto ou arquivo de banco do usuário foi lido/escrito nesta frente.

## Serviços preservados

- API real 3001: PID **20276**, sem reinício.
- Next 3000: PID **39332**, sem build ou reinício.
- ngrok: PIDs **24244 / 37260**, sem ação no processo/configuração.
- O `dist` do backend foi compilado, mas o processo 3001 continua no código
  anterior em memória. Permanece proibido reiniciá-lo até ordem na Onda 3.
- Nenhum manifesto/lockfile, `.env`, front ou core foi alterado.
- Sem push ou merge na main.

## Pendente no aparelho

Os pontos são fixtures métricas controladas, não medidas obtidas de uma câmera
física. A prova cobre o contrato entre a fábrica do core e a API/SQLite; não
certifica suporte WebXR, tracking, retículo, precisão física, gestos ou fluxo
React de Retina/Vitral. Samsung e iPhone permanecem com aceite físico conforme
o roteiro da onda. Não há alegação de ensaio de 20 m ou tolerância aprovada.

## Contratos e dúvidas

Nenhum contrato novo publicado ou alterado; consumidos ProjectScene v2,
`createEnvironmentFromMeasuredPoints` e `applyQueueCommand` já publicados pela Viga.
Dúvidas novas para o usuário: nenhuma.
