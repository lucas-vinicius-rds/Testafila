# Backend Nest e SQLite

Código atual em `back/src`; domínio/contratos em `back/core`. Login está inativo,
projetos são compartilhados. AuthModule não está carregado: não restaurar login
nem apagar o módulo sem decisão do usuário.

## HTTP

| Método e rota | Comportamento |
| --- | --- |
| GET `/api/health` | 200, `{"status":"ok"}` |
| GET `/api/projects` | `{projects:[...]}` com resumos |
| GET `/api/projects/:id` | SavedProject direto; `scene` fica na raiz, não em `project.scene` |
| POST `/api/projects` | criação, revisão 1, expectedRevision null |
| PATCH `/api/projects/:id` | revisão esperada obrigatória, incremento atômico |
| DELETE `/api/projects/:id` | 204; ausente retorna 404 |

Erros: `{error:{code,message}}`. Cena/payload inválido: 400; origem inválida:
403; revisão divergente: 409; JSON acima de 100 KiB: 413. Erro de leitura do
JSON/migração persistida: 500. Não enviar detalhes de armazenamento ao usuário.

## Origem

`APP_ORIGIN` aceita origens exatas separadas por vírgula, com espaços externos
removidos e entradas deduplicadas. Exemplo: localhost:3000 e a origem ngrok de
uso atual. Não autorizar subdomínios semelhantes, wildcard, `null`, ausência de
Origin ou duas origens concatenadas num único header. A mesma lista alimenta
CORS e a verificação de mutações. O proxy mantém o Origin do navegador.

## Persistência e legado

Banco padrão: `back/data/testafila.sqlite`, relativo ao cwd de execução `back`.
`DATABASE_PATH` permite caminho explícito. WAL/SHM podem conter dados não presentes
no arquivo principal: nunca apagar/recriar banco; preservar o conjunto nos backups.

`getProject` chama `migrateProjectScene` em memória. GET não executa UPDATE.
Cena v1 abre como v2 com `queue.personIds=[]`, mantendo pessoas/geometria. Converter
pessoas é comando explícito; salvar convertido atualiza coluna `schema_version`,
JSON e revisão em transação. Pessoas livres novas em v2 não são permitidas.
POST/PATCH exigem schemaVersion 2; a aceitação transitória de v1 foi retirada no
código da Onda 3. Acompanhe seu status para saber se essa versão está publicada.

## Executar e testar

Na raiz: `npm run build:back`, `npm run start:back`, `npm run typecheck:back`,
`npm run test:back`. Entrypoint: `back/dist/src/main.js`. Os testes importam
compilado: build antes de testar. Criam bancos temporários, sem usar dados reais.
A suíte cobre origens, CRUD sem login, erros, revisão, legado sem regravação,
cadeia v2, geometria e cena oriunda de pontos medidos.

Não reiniciar a API nova contra bundle antigo do frontend: ele só entende v1.
Publicação conjunta e restauração ficam sob ordem do coordenador.
