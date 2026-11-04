> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Lote 3 — editor de filas

Usuário autorizou continuar após aceite integrado Lote2. Modelos efetivos:
três Luna Medium --yolo, pois Agys ainda sem quota.

## Donos exclusivos

- Cedro: src/domain/queue/** e tests/domain/queue/**; comandos, validação, amostragem,
  pessoas, estatísticas e histórico. Reutilizar domínio aprovado sem alterar seus
  arquivos nem src/domain/index.ts. Exportar de src/domain/queue/index.ts.
- Trama: apps/web/app/**, apps/web/components/**, apps/web/lib/**; UI e salvar/abrir.
- Prumo: apps/web/scene/**; seleção, destaque e arraste sobre o mesmo documento.
- Codex: contracts/**, manifests/lockfile, apps/api/**, documentação e integração.

Contratos congelados: project.ts, queue-editor.ts e scene-viewer.ts em contracts/.
Sem instalar pacotes, editar contratos, commit/push/deploy pelos agentes. Não rodar
builds Next concorrentes nem sobrescrever production servido; coordenador faz build.
Cada entrega termina com maestri ask Codex e arquivos/verificações/limites reais.

## Contratos de domínio

API de funções especificada em contracts/queue-editor.ts. Frontend e API reutilizam
validateQueueScene; servidor valida shape/limites antes de chamar o domínio.
Todos operam um único ProjectScene. IDs vêm do comando; people:fill gera sufixos
determinísticos a partir de idPrefix exclusivo. Sem crypto/time dentro do domínio.

Áreas: retângulos/polígonos simples contidos no ambiente côncavo; podem tocar a parede.
Contato com zona é conflito para poste/fita/percurso/pessoa considerando footprint.
Edição de zona que invalida qualquer elemento é rejeitada atomicamente.

Postes: adicionar/selecionar/mover/remover; base inicial0.16m, altura0.95m.
Fitas: ligação explícita entre IDs distintos, sem duplicar inversa; altura0.86m.
Remover poste elimina fitas dependentes na mesma ação. Fita não é percurso.

Percurso: polilinha própria com >=2 pontos distintos, sem arestas nulas/auto-interseção.
Toda extensão e footprint corporal devem caber no ambiente e evitar zonas/postes/fitas.
Não bastam extremos/midpoint. UI permite desenhar pontos no piso ou por coordenadas
e confirmar. Alterações de barreiras não podem invalidar percurso silenciosamente.

Pessoas: primeiro centro em distância0; próximos pela distância acumulada ao longo
de todo percurso; incluir extremos válidos e evitar duplicação/colisão em quinas.
Espaçamento entre centros0.5/0.8/1.0m; validar raio+folga entre todas pessoas.
people:add insere após última pessoa. people:fill substitui o grupo do percurso por
distribuição máxima válida determinística. Nunca pular bloqueio para continuar adiante.
Mudar espaçamento redistribui contagem existente limitada à capacidade; UI informa
redução de contagem. position/yaw são caches conferidos contra percurso, não fonte livre.

Histórico imutável antes/depois, máximo100ações; inválido retorna mesma referência.
Remover dependências/preencher/redistribuir são ações únicas reversíveis. Undo/redo
restaura documento completo sem mexer na revision do banco até salvar.

## Interface

Três ferramentas principais: Poste, Fita, Pessoas. Áreas restritas têm etapa/painel
próprio antes de montar fila, com opção continuar sem áreas. Percurso fica em Pessoas.
Seleção, mover por coordenadas, remover e undo/redo acessíveis mesmo sem arraste.
Alvos>=44px, mensagens PT-BR, tokens slide-cintia, top/perspective e contagem/capacidade.

Criação: após revisão da planta, oferecer áreas/continuar e montar fila antes de nomear
e POST inicial. ProjectScene único em memória. Projeto salvo: CTA e rota
/projects/[id]/edit, GET documento atual, editar e PATCH com expectedRevision real.
Conflito409 não sobrescreve silenciosamente; 401/413/rede preservam rascunho.
ScenePreview encaminha props adicionais do contrato. onMoveEntity entrega delta XZ
ao soltar: UI soma delta ao poste ou aos vértices da zona, aplica comando atômico.
Nenhuma AR/câmera com alinhamento sem spike físico validado.

## Aceite

Testes significativos de concavidade, inclusividade, footprint, quinas, distribuição,
caches, atomicidade, integridade e histórico. Typecheck; coordenador faz builds e QA
real no portal: área bloqueada, postes/fitas, percurso, pessoas, espaçamento, undo/redo,
salvar/reabrir mesma cena. API usa domínio para impedir cena adulterada e mantém
owner/revision/CSRF. JSON100KiB preservado, erro413 sem perder rascunho.
