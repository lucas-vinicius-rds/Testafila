# API TestaFila

NestJS + SQLite. Autenticação está desativada nesta revisão; os projetos são compartilhados por todos os acessos à instância. Execute os comandos na raiz do monorepo com npm workspaces; o diretório de trabalho do script é `apps/api`.

## Configuração

`APP_ORIGIN` é a origem pública do Next, que encaminha `/api/**` ao Nest. `BETTER_AUTH_SECRET` e `BETTER_AUTH_URL` não são usados enquanto a autenticação estiver desativada.

`DATABASE_PATH` opcional aponta para o arquivo SQLite. Sem ela, o caminho é `apps/api/data/testafila.sqlite`, quando os scripts são executados pelo workspace npm. O diretório e banco são criados localmente e não entram no Git.

## Comandos

```sh
npm run migrate:api
npm run build:api
npm run typecheck:api
npm run test:api
npm run start --workspace @testafila/api
```

O parser JSON padrão do Nest/Express limita o corpo HTTP a 100 KiB; cenas acima desse limite recebem HTTP 413 antes da validação Zod. A validação semântica também limita a quantidade de entidades e coordenadas métricas.

## Testes e configuração completa

Siga [EXECUCAO-LOCAL.md](EXECUCAO-LOCAL.md) para iniciar os processos.
Os testes oficiais importam o compilado; execute build:api antes de test:api.
O comando atual inclui migrações e validação, além das duas integrações Nest.
