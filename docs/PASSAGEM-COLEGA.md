> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Relatório de desenvolvimento e passagem

## Atualização de 28/10 — editor 3D

O lote 4 substitui a entrada por coordenadas por retângulo com largura/profundidade
e ajuste dos cantos por arraste. Altura das paredes fica interna. A montagem abre
direto no canvas com paleta de postes, fitas e pessoas; áreas restritas são opcionais
e desenhadas por arraste com confirmação. Pessoas podem existir sem percurso,
ser movidas/giradas e acrescentadas atrás da seleção com espaçamento explícito.
O backend aceita e persiste esse contrato, mantendo compatibilidade com percursos
antigos. A logo original foi restaurada e o mobile ganhou bandeja recolhível e
barra de câmera. Ver [SPRINT-04.md](SPRINT-04.md) e [FRONTEND.md](FRONTEND.md).

A validação integrada do lote 4 está em [QA-LOTE-04.md](QA-LOTE-04.md): build final,
integração Nest e três viewports aprovados, com capturas e limites. Os resultados
de 27/10 abaixo descrevem a interface anterior. Câmera/AR de produto continuam
pendentes: dimensões ainda são fornecidas manualmente em metros. As skills e
personas solicitadas estão documentadas em [SKILLS-LOTE04.md](SKILLS-LOTE04.md).

**Data:** 27/10/2026. **Projeto:** TestaFila / Checa Fila.
**Branch de entrega:** `main`. **Base anterior:** `70745cc`.

## Leia primeiro

O repositório contém uma aplicação Next/Nest com editor manual/3D e persistência
real. **Não contém o MVP WebAR completo dos PDFs.** A captura do ambiente e o
editor de projetos sobre o chão real ainda precisam de implementação/integração.
Nesta revisão foi acrescentado um spike isolado `/xr-check` para preparar a
validação de sessão AR/hit-test. Não o confunda com AR entregue no produto.

Não é necessário ter a pasta de trabalho de outro desenvolvedor: as referências
necessárias foram copiadas para `docs/referencias`. Dados, segredos e usuários de
QA locais não estão no Git. Comece em [EXECUCAO-LOCAL.md](EXECUCAO-LOCAL.md) para
instalar e criar sua própria conta.

## O que foi entregue

| Frente | Implementação atual |
| --- | --- |
| Fundação | npm workspaces, Next App Router/React/TypeScript em `apps/web`; Nest em `apps/api`; contratos e domínio compartilhados. |
| Acesso | Better Auth, sessão em cookie, logout, ausência de signup público e CLI administrativo sem senha por argv. |
| Projetos | Lista por proprietário, criação, leitura, atualização atômica no SQLite e conflito por revisão esperada. |
| Planta | Retângulo por medidas ou polígono por coordenadas métricas; adicionar/mover/remover vértices; revisar/confirmar geometria e altura. |
| Motor | Polígonos simples/côncavos, interseções, footprints/folga, IDs globais, integridade referencial e validação imutável. |
| Editor | Áreas restritas, postes, conexões explícitas de fitas, percursos independentes, pessoas, preenchimento, spacing e undo/redo de até 100 ações. |
| Cena | R3F no cliente, piso XZ, paredes, grade de 1 m, cotas, top/perspective, orbit/zoom, seleção e arraste de postes/áreas. |
| Robustez | Proxy sem cache; tratamento de 401/409/413/rede; retomada usa o último rascunho; cancelamento de drag e clique residual; etiquetas sem roots Html/Drei. |
| Spike XR | Rota experimental de contexto seguro, suporte immersive-ar, sessão com hit-test/local-floor, retículo e duas marcas transitórias com distância em metros. |

Uma unidade do modelo equivale a um metro. A fonte manual continua explícita.
Checks de medição vazios não geram erro observado zero nem aprovação de tolerância.

## Como o sistema se organiza

- `contracts/project.ts`: documento versionado único consumido pelo servidor e UI.
- `contracts/queue-editor.ts`: comandos, seleção, histórico e estatísticas.
- `contracts/scene-viewer.ts`: props de cena e eventos de seleção/movimento.
- `src/domain`: funções geométricas puras; `src/domain/queue` implementa o editor.
- `apps/web`: frontend, proxy de mesma origem e spike separado.
- `apps/api`: autenticação, validação de shape/semântica, transações e SQLite.
- `src/main.js`, `src/geometry.js`, `src/arObjects.js`, `src/style.css`, `index.html`
  e Vite: protótipo original preservado. Não foram substituídos silenciosamente.

Navegador → Next:3000 → `/api/**` → Nest:3001 → SQLite.
O servidor obtém ownerId da sessão; cliente não escolhe proprietário.
Salvar usa `expectedRevision`; 409 não sobrescreve a versão do servidor.
O limite do corpo JSON é 100 KiB. Geometria inválida também é rejeitada no Nest.

## Revisão realizada em 27/10

- Cedro revisou domínio/filas, somou folga às paredes para rotas/pessoas e
  acrescentou grade espacial para colisões no preenchimento/validação. Teste no
  teto defensivo de 10.000 pessoas passou. A revisão preserva a regra aprovada:
  percurso de 7 m a 0,8 m contém nove pessoas, sem encurtar o último intervalo.
- Trama acrescentou tratamento específico de 413 na criação, preservando a
  planta/formulário, e escreveu a documentação do frontend.
- Prumo preparou o spike `/xr-check` e o protocolo físico. Testes puros com
  poses fictícias não foram apresentados como teste da câmera ou do aparelho.
- Coordenação consolidou documentação, referências e histórico, corrigiu o README
  que descrevia funcionalidades não integradas e revisou os testes oficiais da API.
- Foram removidos testes abandonados de autenticação caseira/HttpDispatcher e um
  runner antigo que importava caminhos inexistentes. A cobertura relevante de
  autenticação/projetos fica nas integrações Nest. Testes de migração/validação
  foram atualizados para importar o build real e incluídos em `test:api`.

## Verificações e seu alcance

| Verificação | Resultado desta revisão |
| --- | --- |
| Domínio + lógica pura do spike | 120 testes aprovados: 116 do domínio em 20 suítes e quatro de poses/distância XR. |
| API compilada | Build e typecheck aprovados. |
| API Node/Nest | 10 testes aprovados no comando oficial: dois cenários amplos Nest e casos de migração/validação. |
| Frontend | Build de produção e typecheck passaram após integração final, incluindo `/xr-check`. |
| QA navegador | Rodadas históricas reais estão em QA-LOTE-03 e QA-FECHAMENTO-LOTE-03; não equivalem a um novo teste físico em 27/10. |
| XR físico | Não executado; matriz de aparelhos permanece vazia. |

Os testes Nest abrangem login/cookie/sessão, signup bloqueado, CSRF, proprietário
isolado, persistência após reinício, revisão divergente, JSON inválido/413 e
geometria adulterada. As contagens não representam dezenas de cenários E2E nem
certificam compatibilidade universal. O spike só tem testes locais de lógica pura.

O QA de 22/10 confirmou salvar/reabrir a cena, distribuição de pessoas, histórico,
retomada após 401, 409 com preservação de rascunho, timeout real próximo de 10 s,
cancelamento/perda de captura e correção do erro ReactDOM `removeChild`. Há uma
limitação registrada de screenshot do portal; aceite visual humano segue necessário.

## O que falta, sem esconder dependências

| Prioridade | Trabalho restante | Dependência/aceite |
| --- | --- | --- |
| P0 | Executar `/xr-check` em HTTPS nos aparelhos-alvo. | Aparelho compatível, permissão, hit-test/local-floor e registro de tracking/erro real. |
| P0 | Integrar captura XR de piso/perímetro e origem ao fluxo de planta. | Resultado do spike; poses válidas; bloqueio na perda de tracking e revisão da medição. |
| P0 | Renderizar/editar a mesma ProjectScene sobre o ambiente real. | Adaptador XR, transformação rígida da sessão e controles seguros de inserção. |
| P0 | Realinhar projeto salvo em nova sessão. | Dois pontos correspondentes + terceiro independente de conferência; resíduo e tolerância medidos, sem escala artificial. |
| P0 | Validar precisão física e comportamento mobile. | Trena de 20 m, meta observada de até 5%, deriva/background/end, aparelhos e condições documentados. |
| P1 | QA visual/gestos/performance prolongada. | Top/perspective, cotas por sprite, touch/multitouch, latência e estabilidade em aparelhos. |
| P1 | Feedback XR de colisão/HUD contextual. | Integração XR; não confundir rejeição de comando no 3D com esse feedback completo. |
| P1 | Produção/HTTPS/backup/contas. | Hospedagem Nest com disco SQLite persistente, segredos, origem pública correta, backups e teste de restauração. |
| P1 | Miniaturas de galeria. | previewKey existe no contrato, mas não há pipeline de imagem/URL implementado. |
| P1 | Atualizar XRD/plano e executar SUS com cinco usuários. | Registrar mudanças de escopo e evidências acadêmicas reais. |

Não há base para prometer suporte universal Android/iOS, erro físico garantido,
conformidade ABNT ou segurança de evacuação. A capacidade conjunta é alocação
determinística gulosa por ordem dos percursos, não otimização global.

## Diferenças em relação aos PDFs

Os PDFs priorizam câmera/hit-test e usam 0,6 m/pessoa, conexões automáticas,
HUD escuro e execução client-side sem banco externo. O usuário posteriormente
ampliou o fluxo: planta manual alternativa, medidas/parede, projeto persistido,
conexões explícitas, pessoas/percurso separados e spacing 0,5/0,8/1 m; pediu ainda
Nest/SQLite e identidade slide-cintia. Seguiu-se a instrução posterior onde houve
divergência. Isso precisa constar nos documentos acadêmicos, não ser omitido.

Veja [a matriz detalhada](REQUISITOS-ESTADO-ATUAL.md) e os PDFs intactos em
`docs/referencias`. A versão histórica do README do protótipo contém promessas
não verificadas; não deve ser usada como descrição da aplicação atual.

## Como retomar sem perder tempo

1. Instalar/configurar/criar conta pelo [guia local](EXECUCAO-LOCAL.md).
2. Rodar o [roteiro manual](TESTE-MANUAL.md) para conhecer o editor entregue.
3. Ler ARCHITECTURE, FRONTEND, BACKEND, DOMINIO e os contratos antes de editar.
4. Preencher a matriz do [spike XR](XR-PENDENCIAS.md), depois priorizar captura,
   adaptador XR e realinhamento. Não começar por simular câmera com pixels/escala arbitrária.
5. Cada mudança de geometria precisa continuar validada no frontend e servidor.
   Execute `build:api` antes dos testes Nest e evite builds Next concorrentes.

Não há credenciais de desenvolvimento nesta passagem. O colega deve provisionar
sua conta; bancos `.sqlite` e arquivos `.env` são locais e ignorados. O usuário
autorizou commit direto em `main`, sem solicitar publicação remota/deploy.

## Registro de verificação final

Os resultados finais do build e do fallback do spike são registrados em
[VERIFICACAO-2026-10-27.md](VERIFICACAO-2026-10-27.md). O hash da entrega pode ser
obtido com `git log -1 --oneline` após o commit; não se usa hash de QA antigo como
referência desta passagem.
