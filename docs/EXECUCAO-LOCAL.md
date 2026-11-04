# Execução local e testes

Requer Node 24+, npm e acesso ao registro. Comandos partem da raiz Testafila,
onde há workspaces `back`, `front`, `back/core`. Não usar caminhos apps/api ou
apps/web de relatórios antigos. Não há Vite nem login ativo.

## Instalação e ambiente

```powershell
npm ci
```

Só em instalação nova, copie `back/.env.example` para `back/.env`; nunca
sobrescreva ambiente existente. `API_BASE_URL` do Next fica em `front/.env.local`,
somente servidor. Padrão http://127.0.0.1:3001, sem /api final.

`APP_ORIGIN` da API é lista de origens exatas separadas por vírgula, incluindo
localhost e o domínio público quando necessário. `HOST`/`PORT` padrão:
127.0.0.1/3001. `DATABASE_PATH` padrão relativo ao cwd back: data/testafila.sqlite.
Não publicar valores de .env, authtoken ou SQLite. Better Auth permanece inativo.

## Desenvolvimento

Em dois terminais: `npm run dev:back` e `npm run dev:front`. Acesso em
http://localhost:3000, sem senha. Nesta máquina, `node --run` pode falhar por
causa de Área de Trabalho no caminho. Alternativa, a partir de back:

```powershell
node --env-file-if-exists=.env ../node_modules/@nestjs/cli/bin/nest.js start --watch --entryFile src/main
```

Não use banco real para QA de escrita. Defina DATABASE_PATH para diretório
temporário e porta própria. Para ver front sem afetar 3000, a partir de front:

```powershell
$env:NEXT_DIST_DIR='.next-dev-codex'
node ../node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3120
```

Use diretório e porta exclusivos por agente. Next gera next-env.d.ts e adiciona
tipos de rotas ao tsconfig; não comitar mudanças automáticas desses arquivos.
Nunca gerar build sobre o .next servido por outro processo.

## Verificar

```powershell
npm run test:core
npm run test:xr
npm run typecheck:core
npm run typecheck:back
npm run typecheck:front
npm run build:back
npm run test:back
```

Testes backend importam compilado. Testes XR simulado não provam câmera física.
Para E2E com o front de desenvolvimento já iniciado:

```powershell
$env:TEST_BASE_URL='http://127.0.0.1:3120'
npm run test:e2e
```

O fixture E2E inicia Nest em porta efêmera com banco temporário, injeta um legado
próprio e redireciona as chamadas API do navegador. Não exige TEST_EMAIL/senha.
Usa Edge instalado no Windows, ou PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH; em outro
ambiente pode ser necessário `npx playwright install chromium`. Capturas/traces
ficam em front/test-results, ignorados pelo Git.

## Produção e recuperação

Com autorização de publicação, parar ambos os serviços, copiar SQLite/WAL/SHM e
ambientes/artefatos anteriores, compilar `npm run build:back` e
`npm run build:front`, então iniciar `npm run start:back` e `npm run start:front`.
Entrypoints: back/dist/src/main.js e Next no diretório front. Fonte e API v2 não
podem ser publicadas separadamente contra o bundle v1 anterior. Em falha de
reinício, restaurar o release anterior conforme o marcador da integração.

Não executar migrate:back contra banco real sem backup/ordem. Migrações em testes
usam banco temporário. Os 21 projetos existentes não são dados descartáveis.

## Celular e HTTPS

localhost no celular é o próprio aparelho. Testar pela URL HTTPS do ngrok ativo;
não encerrar/reconfigurar o terminal do usuário. A origem pública precisa estar
em APP_ORIGIN para gravar. Não adicionar políticas ngrok sem autorização.
HTTPS não fornece immersive-ar a um aparelho sem suporte. Samsung: registrar
modelo/SO/navegador e resultado real. iPhone 11: medidas digitadas e editor 3D.
Roteiros em TESTE-MANUAL.md; testes físicos ainda precisam de evidência.
