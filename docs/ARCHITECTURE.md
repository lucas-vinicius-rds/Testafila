# Arquitetura atual

Fonte: branch `ondas/camera-e-arquitetura`, 04/11/2026. Estado dos processos e
publicação: [ONDA-3.md](ondas/status/ONDA-3.md).

```text
back/
  src/modules/{projects,health,auth}/  Nest; auth inativo
  src/infra/database/                SQLite e migrações de tabelas
  src/common/                        erros e origens permitidas
  core/contracts/                    ProjectScene e comandos
  core/domain/                       TypeScript puro e funções geométricas
  core/tests/                        testes de domínio
  test/                              integração Nest em bancos temporários
  data/                              SQLite/WAL/SHM, ignorados pelo Git
front/
  app/                               Next App Router e proxy /api
  features/{dashboard,settings,project-creation,editor,ar}/
  shared/                            HTTP, marca, navegação e preferências
  tests/e2e/                         navegador com API/banco descartáveis
```

## Fronteiras

- `back/core` não importa React, Three, Next, Nest, banco ou infraestrutura.
- O frontend importa contratos/domínio por `@testafila/core/contracts/...` e
  `@testafila/core/domain/...`, nunca por caminho para `back/core` ou `back/src`.
- `back/src` usa caminhos relativos para o core; o tsc compila os dois em
  `back/dist/{src,core}` e reescreve extensões para `.js`. O pacote core exporta
  TypeScript para o bundler frontend, não é o entrypoint da API de produção.
- Testes E2E podem iniciar uma API compilada descartável. Isso é infraestrutura
  de teste, não importação de servidor pela aplicação frontend.

## Dados e consistência

Navegador → Next 3000 → proxy `/api/**` → Nest 127.0.0.1:3001 → SQLite.
`API_BASE_URL` é exclusivamente server-side. Origem pública e local são
configuradas como lista exata em `APP_ORIGIN`, separada por vírgulas; CORS e
POST/PATCH/DELETE usam a mesma lista, sem wildcard.

AuthModule permanece fora de AppModule. Não há login ativo nem isolamento por
usuário nesta instância. Projetos são compartilhados. O módulo auth permanece
no código, aguardando decisão; não o considerar ativo por existir.

ProjectScene v2 é documento único para editor, API e AR. A cadeia usa
`queue.personIds`; posições/yaw ficam em `people`. Comando inválido mantém a
cena; histórico imutável até 100 ações. Servidor repete validação. Salvar exige
`expectedRevision`, devolve 409 no conflito e não sobrescreve rascunho.

GET migra v1 para v2 em memória e não regrava JSON, metadados ou revisão. Pessoas
legadas permanecem intactas até conversão explícita. A remoção do aceite v1 em
salvamentos é tarefa da integração Onda 3; leitura legada continua suportada.

## Câmera e renderização

Editor usa R3F client-only; labels não usam roots Html/Drei. Montagem AR usa
Three.js e o mesmo documento/comandos, com controlador de sessão compartilhado
em `front/features/ar/session`. Geometrias AR compartilhadas ficam em `ar/scene`.

`createEnvironmentFromMeasuredPoints` normaliza cantos métricos: primeiro na
origem, primeira parede em +X, sem escala/espelhamento. Transformação de sessão
fica em memória e não integra ProjectScene. Queda da sessão preserva trabalho;
recarregar/matar a página perde o que não foi salvo. Reiniciar exige realinhamento.

`immersive-ar`, `hit-test` e `local-floor` são necessários. A montagem exige
DOM Overlay efetivamente negociado: ele é pedido como recurso opcional para
preservar a ordem de negociação, mas sua ausência encerra o fluxo e oferece
medidas digitadas. Não há fallback métrico baseado em getUserMedia.
