# TestaFila

Aplicação de planejamento de filas: Next.js em `front/`, NestJS em `back/` e
contratos/geometria em `back/core/`. SQLite mantém os projetos. Login está
inativo e a galeria é compartilhada por quem acessa a instância.

A branch `ondas/camera-e-arquitetura` implementa cena v2 com pessoas interligadas,
editor 3D e montagem experimental pela câmera em aparelhos com `immersive-ar`.
No iPhone 11, o fluxo previsto é web com medidas digitadas e editor 3D.
Não há app iOS nativo, Capacitor, ARKit ou App Clip.

Consulte [documentação](docs/README.md), [execução local](docs/EXECUCAO-LOCAL.md)
e [estado da integração](docs/ondas/status/ONDA-3.md). O código da branch e os
serviços publicados podem estar em versões diferentes durante a integração;
publicação/reinício dependem da ordem do coordenador.

```powershell
npm ci
npm run dev:back
npm run dev:front
```

Veja a alternativa de execução local para o problema de `node --run` com o
caminho Windows acentuado. Não sobrescreva `.env`, não apague `back/data/` e não
reconstrua o `.next` que estiver sendo servido. Não há mais aplicação Vite.

Uma unidade equivale a um metro. Câmera/AR são experimentais: precisão, tracking,
gestos e desempenho no aparelho precisam do [aceite humano](docs/TESTE-MANUAL.md).
