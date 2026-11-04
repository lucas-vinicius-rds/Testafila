# Frontend Next.js

Código em `front/app`, `front/features` e `front/shared`, na branch das ondas.
O bundle publicado pode estar anterior à fonte; consulte `ondas/status/ONDA-3.md`.

## Rotas e dados

`/` leva à galeria `/dashboard`, sem login. `/projects/new` cria projeto;
`/projects/:id` revisa, `/edit` edita e `/ar` visualiza em AR uma cena salva.
`/xr-check` é diagnóstico. O link Ver em AR só aparece com capacidade anunciada.

A UI usa `/api/**` de mesma origem. O proxy Next consulta `API_BASE_URL` no
servidor (padrão http://127.0.0.1:3001, sem /api final), preserva status/corpo e
Origin, filtra cabeçalhos de conexão/encaminhamento, não usa cache e aplica
limite de tempo de 10 s; falha de upstream retorna 502 neutro.
Projetos são compartilhados. Miniaturas SVG derivam de `data.scene` retornado
pela API; não existe dependência de previewKey para uma URL de imagem.

## Fluxo direto da Onda 2B

Pedido mais recente: Criar nova fila entra direto na câmera quando houver
suporte, com um único toque em Começar a medir para iniciar sessão. Sem suporte,
abre medidas digitadas com a mensagem de indisponibilidade. A etapa intermediária
Como quer criar a planta? foi removida pela Onda 2B; seu aceite está no
marcador correspondente.

Depois de medir, escolher Montar na câmera ou Montar no 3D. No primeiro caminho,
marcar áreas opcionais, postes, fitas e pessoas; Concluir encerra sessão e leva
ProjectScene v2 ao editor. No segundo, revisar a planta medida no editor. A cena
não salva fica em memória React, sem localStorage. Pose/transformação não saem
do componente AR. Fonte manual/webxr aparece no resumo/revisão.

Medidas digitadas criam retângulo; cantos são ajustados por arraste. Altura de
parede permanece interna. Confirmar planta é necessário antes de nomear/salvar.
Fila usa ordem persistida, +1 no fim, spacing 0,5/0,8/1 m; legado exige Ligar fila.
Mover pessoa intermediária segue arco ao redor da anterior e leva as seguintes.

## Interação e erros

Navegar separa câmera de seleção/arraste. Inspector oferece ações por tipo;
poste circular não gira, fita deriva dos postes, área move/gira/remove. Áreas
mantêm desenhar/confirmar/redesenhar/cancelar e grade ajustável. Distâncias até
paredes só são mostradas quando a geometria suportada é realmente retangular.
Bandeja mobile rola internamente; +1 tem alvo de tela e proteção de toque duplo.
Histórico flutuante é vertical. Logo/paleta seguem a referência existente.

400/413/rede mantêm rascunho. 409 oferece manter rascunho ou descartar/carregar
versão do servidor com confirmação. Não há reautenticação no fluxo atual.
Recarregar/fechar a página pode perder trabalho não salvo; sair é avisado.
Preferências locais de grade/navegação não substituem persistência do projeto.

Testes em `front/tests/e2e` usam API/SQLite descartáveis e redirecionam todas as
chamadas /api do navegador. Emulação e XR simulado não certificam toque/câmera
físicos. Ver `TESTE-MANUAL.md` e marcadores para evidência e falhas reais.
