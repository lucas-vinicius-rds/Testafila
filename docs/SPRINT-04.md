> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Lote 4: editor visual centrado no canvas

Pedido integral do usuário em 28/10/2026: corrigir o ambiente 3D antes de câmera.
Substitui o fluxo com coordenadas e tabelas por interação direta e layout mobile.

## Papéis e propriedade

- Cedro: domínio `src/domain/queue/**`, `tests/domain/queue/**` e docs/DOMINIO.md.
  Perfil de referência Agency Backend Architect: invariantes, atomicidade e testes.
- Trama: apps/web/app/**, components/** e lib/**, EXCETO components/xr-check/** e
  app/xr-check/**. Perfil Frontend Developer + UX Architect, skills mobile e antiwebslop.
  Dono do fluxo/painéis/CSS/identidade, não cena nem contratos.
- Prumo: apps/web/scene/** e docs/3D-INTERACOES.md. Perfil XR Interface Architect
  adaptado ao 3D, skills R3F/mobile/antiwebslop. Dono dos gestos/raycast/modelos/câmera.
- Coordenador: contratos, API, dependências, docs gerais, integração/build/QA.

Sem edição concorrente do mesmo arquivo. Sem novas deps ou builds Next pelos agentes.
Não mexer no spike XR nem no protótipo. Sem commit/push nesta implementação pelos agentes.
Usar Maestri list e ask back Codex. Modelos existentes Luna Medium --yolo preservados.

## Interação

Uma tela de trabalho: canvas principal. Painel de itens à direita no desktop;
bandeja inferior compacta no celular com safe-area, canvas visível e ações de 44 px.
Pessoa/poste selecionados por toque e por arraste da paleta; clique no piso coloca.
Paleta com miniatura do modelo, não só um texto. Item selecionado: mover, girar pessoa,
remover, spacing e +1 atrás. Não exigir percurso desenhado para criar pessoas.

Pessoa livre mantém `routeId:null` e `distanceAlongRouteMeters:null` em schema v1;
pessoas antigas de percurso continuam válidas. Nova pessoa livre começa yaw=0 (+Z).
`person:append` cria atrás da origem em `position - (sin(yaw),cos(yaw))*spacing`.
`person:move/rotate` converte apenas a pessoa escolhida para livre (null/null),
preservando os demais. Validação de raio/folga/parede/zonas/postes/fitas e pessoas
vale para ambos. Append inválido é rejeitado atomicamente. Nenhuma rota fantasma.
`simulation:spacing` redistribui percursos antigos, mas não teleporta pessoas livres;
o novo valor é usado para o próximo +1. UI deve explicar isso em linguagem simples.

Poste fino/reto: nova base inicial 0,08 m, altura 0,95 m; visual e footprint coerentes.
Fita: tocar A depois B mostra conexão pendente e ação curta Conectar/Cancelar.
Área: escolher ferramenta, arrastar no piso para preencher retângulo; confirmação
Usar área/Desenhar outra/Cancelar antes do comando. Não salvar preview inválido.

Planta inicial só retângulo por largura/profundidade manual nesta fase, claramente
sem câmera. Altura de parede fica interna para compatibilidade, não é um campo do usuário.
Remover editor numérico de vértices e polígono por coordenadas do fluxo comum.
Modo Ajustar ambiente mostra alças de canto arrastáveis no piso. Comando
environment:vertex-move usa domínio existente, limpa confirmedAt e rejeita se a nova
geometria invalida a cena. environment:confirm usa timestamp ISO fornecido pela UI.

Câmera: botões explícitos de giro horizontal, inclinação vertical, zoom, pan nos
dois eixos e reset; preservar orbit/gestos complementares e vistas top/perspective.
Sem paredes altas ocultando a fila (showWalls false por padrão na UI).

## Contratos congelados

SceneViewerProps em contracts/scene-viewer.ts: tool, cameraAction com id único,
onRegisterFloorProjector, placementPreview, draftArea, draftBelt, onAreaDraw,
onMovePerimeterVertex e onAppendPerson. Tudo opcional para preservar rotas salvas.
FloorProjector usa clientX/clientY e devolve ponto no piso dentro do canvas/ambiente,
ou null; a UI usa para drag da paleta com Pointer Events (também mobile).

## Identidade e skills

Logo real de slide-cintia: SVG viewBox 0 0 27 28,
path M3 25V3h21v10H12v12 sem fill, stroke currentColor width4; circle 24,25 raio3.
Herdar verde #214b40. Componente comum em login/dashboard/criação/projeto/editor.
Design marfim/verde preservado; sem inventar marca, slogans, banners ou números decorativos.
mobile-app-ui-design e antiwebslop instaladas em C:/Users/joaot/.agents/skills.
Agency instalado em C:/Users/joaot/.agents/agency-agents. Ler perfis, sem herdar stacks
estranhas (Laravel etc.), telemetria, promessas ou regras conflitantes com o usuário.

## Aceite

Criar retângulo → ajustar canto por drag → colocar poste/pessoa sem coordenadas →
arrastar/mover/girar pessoa → +1 atrás com spacing → conectar A/B → desenhar área e
confirmar/cancelar → undo/redo → salvar/reabrir, incluindo cenas antigas.
API aceita pessoas livres e rejeita pares routeId/distância inconsistentes.
Build/typechecks/testes compartilhados; QA desktop e 390/320 px, sem overflow;
canvas não escondido pela bandeja/inspector. Evidências reais, limites físicos explícitos.
