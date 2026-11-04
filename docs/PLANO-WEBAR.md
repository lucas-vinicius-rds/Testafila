# Plano de implementação — integração WebAR

**Estado:** primeira integração experimental implementada em
`/projects/:id/ar`. O fluxo ainda depende de validação física em aparelhos e
não representa aceite de precisão, compatibilidade ou estabilidade.

## 1. Objetivo e limites

Integrar a `ProjectScene` persistida ao espaço físico durante uma sessão WebXR,
permitindo visualizar a planta métrica e seus objetos em escala nominal 1:1.
O plano mantém a geometria e os dados existentes, aplicando uma transformação
temporária de sessão. A origem persistida do projeto não é substituída pelo
alinhamento físico; cada nova sessão exige realinhamento.

Uma unidade do modelo equivale a um metro. O sistema não deve alterar a escala
da planta para compensar erro de tracking ou discrepância de medidas. A câmera
comum não é substituta de WebXR nem fonte confiável de medição.

## 2. Estado atual e pré-requisitos

O projeto já tem uma cena 3D em Three.js/R3F, contratos métricos em
`contracts/project.ts` e um spike isolado em `/xr-check`. O spike verifica
contexto seguro e suporte anunciado a `immersive-ar`, solicita `hit-test` e
`local-floor`, apresenta retículo e permite registrar duas marcas transitórias.
Ele não renderiza a cena do projeto, não calcula alinhamento com a planta, não
persiste poses XR e não comprova precisão física.

Antes da integração do editor:

1. Executar o protocolo de `docs/XR-PENDENCIAS.md` em aparelhos e navegadores
   que se pretende suportar, em origem HTTPS. `localhost` serve para diagnóstico,
   não valida implantação HTTPS.
2. Registrar suporte, permissões, comportamento do hit-test, tracking e
   encerramento; medir trechos de referência com trena e reportar resultados.
3. Revisar o filtro heurístico de superfície horizontal e definir tolerâncias
   operacionais a partir de evidência física. Não inferir suporte pelo user-agent.
4. Manter a WebAR explicitamente experimental até que esses pré-requisitos e
   os critérios abaixo tenham evidência em aparelhos reais.

## 3. Arquitetura da integração

### Etapa A — Adaptador XR isolado por sessão

- Reutilizar o ciclo de sessão do spike como base: iniciar por ação explícita,
  verificar contexto seguro e suporte, solicitar `immersive-ar` com `hit-test`
  e `local-floor` obrigatórios; `dom-overlay` permanece opcional.
- Administrar eventos de início, seleção, visibilidade, perda/retorno de pose e
  término. Ao terminar, cancelar hit-test, remover listeners e descartar recursos.
- Reutilizar o `WebGLRenderer` XR já adequado ou definir uma integração R3F
  compatível após verificar ciclo de vida e renderização. `ARButton` não é um
  requisito: o spike atual solicita a sessão diretamente, e qualquer utilitário
  Three.js deve ser avaliado contra esse ciclo antes de ser adotado.
- Não criar nem manter uma segunda câmera HTML como se fosse uma sessão AR.
  Exibir mensagem clara para contexto inseguro, API ausente, recurso não
  negociado ou inicialização falha.

### Etapa B — Alinhamento da planta com o espaço da sessão

- O retículo serve para selecionar correspondências entre pontos conhecidos da
  planta e pontos observados no espaço XR. Um único toque apenas posiciona uma
  origem arbitrária e não orienta nem confere a planta em relação ao ambiente.
- Solicitar pelo menos dois pares distintos para estimar yaw e translação; usar
  um terceiro par independente para conferir o alinhamento. Mostrar resíduos e
  diferenças dimensionais em metros e porcentagem antes de confirmar.
- Aplicar transformação rígida (yaw e translação), mantendo escala 1. Não
  compensar erro por escala artificial. Rejeitar ou deixar inconclusivo o
  alinhamento que não satisfizer tolerâncias definidas após validação física.
- Manter `SessionAlignment` somente em memória da sessão, conforme
  `contracts/project.ts`. Não salvar pose XR nem converter a origem persistente
  do projeto. Uma sessão nova começa sem alinhamento confirmado.

### Etapa C — Renderização da cena do projeto

- Renderizar os dados de `ProjectScene` existentes (ambiente/perímetro, áreas,
  postes, fitas, percursos e pessoas) através da mesma fonte de dados usada pelo
  editor. Não criar cópia de geometria ou um schema paralelo para AR.
- Aplicar o alinhamento como grupo raiz ou transformação equivalente, sem
  reescrever coordenadas dos elementos. Preservar distinção entre postes,
  fitas, pessoas e percurso.
- Antes da confirmação do alinhamento, mostrar apenas instruções, retículo e
  prévias necessárias. Depois, exibir a cena com controle explícito para
  reposicionar/reiniciar o alinhamento e para encerrar a sessão.
- Se o tracking for perdido ou a sessão ficar oculta, suspender ações de
  alinhamento e indicar o estado. Não afirmar estabilidade ou permanência física
  além do que o runtime e os testes no aparelho demonstrarem.

### Etapa D — Controles e estados

- Usar DOM Overlay quando suportado para ações de confirmar/reiniciar
  alinhamento, girar yaw em incrementos compreensíveis e sair. Informar quando
  overlay não estiver disponível e oferecer controles XR compatíveis com o
  dispositivo, se implementados.
- Rotação manual após o alinhamento deve atualizar o alinhamento transitório da
  sessão, sem alterar `ProjectScene` persistida.
- Reposicionar reinicia a coleta de correspondências e a conferência; não deve
  apenas mover o retículo e deixar a cena com uma transformação incoerente.
- Encerramento limpa recursos e estado transitório; ao voltar ao editor, dados,
  seleção e rascunho seguem as regras já existentes do aplicativo.

## 4. HTTPS, compatibilidade e dependências

WebXR requer contexto seguro. A implantação e o desenvolvimento remoto precisam
fornecer HTTPS; a configuração concreta depende do ambiente e não está garantida
pelo spike. A interface deve consultar a capacidade em runtime e tratar falhas
de negociação. Chrome no Android pode ser uma hipótese de ensaio, não uma
promessa de compatibilidade universal; suporte real depende de navegador,
dispositivo, sistema, permissões e recursos XR disponíveis.

Não adicionar `ARButton` ou outras dependências sem necessidade demonstrada.
O projeto já inclui Three.js e R3F; a decisão deve respeitar o renderer existente,
SSR/client-only do Next e o ciclo de sessão testado no spike.

## 5. Critérios de aceite e evidências

O aceite deve ser medido nos aparelhos-alvo, com modelo, sistema, navegador,
versão, origem HTTPS e condições de ensaio registrados:

- Contexto seguro e diagnóstico corretos para suporte presente/ausente e
  recurso XR recusado.
- Hit-test e retículo observados no piso e em superfícies verticais; registrar
  falsos positivos, ausência de plano e perda de tracking. O retículo não é
  descrito como detecção infalível de chão.
- Alinhamento com dois pontos distintos e conferência por terceiro ponto,
  registrando resíduos em metros e erro dimensional percentual contra medidas
  de referência. Tolerâncias são aprovadas com base em ensaios, não presumidas.
- Cena carregada com escala nominal 1:1 e transformação rígida de sessão; sem
  deformação ou escala corretiva. Relatar limitações e discrepâncias observadas.
- Movimento da câmera, ocultação/retorno, perda de tracking, reinício do
  alinhamento, nova sessão e encerramento verificados nos aparelhos registrados.
- Overlay/controles operam sem encerrar acidentalmente a sessão, quando
  `dom-overlay` for negociado.

Build, typecheck, testes unitários e viewport headless verificam código e lógica,
mas não comprovam câmera, hit-test, precisão ou estabilidade no espaço físico.
Não declarar aceite físico a partir dessas verificações.

## 6. Fora do escopo desta proposta

- Afirmar precisão garantida, suporte universal, conformidade normativa ou uso
  como levantamento confiável do ambiente.
- Persistir alinhamento ou coordenadas XR automaticamente no projeto.
- Substituir a planta manual e as medidas confirmadas por captura automática sem
  validação independente.
- Declarar aceite físico sem os registros de aparelhos e ensaios previstos.

Referências de estado: [XR-PENDENCIAS.md](XR-PENDENCIAS.md),
[ARCHITECTURE.md](ARCHITECTURE.md), [3D-INTERACOES.md](3D-INTERACOES.md) e
[`contracts/project.ts`](../contracts/project.ts).
