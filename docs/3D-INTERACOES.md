> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Interações da cena 3D (Onda 2 — Sprint 05)

A cena recebe somente o documento `ProjectScene` e props transitórias congeladas em `contracts/scene-viewer.ts`. Ferramenta ativa, modo de interação (`navigate` vs `edit`), grade métrica, câmera, seleção, prévias e callbacks ficam fora do documento persistido. O piso usa XZ em metros, com Y para cima (+Y).

## Modos de Interação: Navegar vs Editar

Para evitar que a câmera capture gestos acidentais durante a manipulação ou que arrastes de objetos capturem o pan/zoom do usuário em telas touch, os modos são explicitamente distinguidos:
- **`navigate`**: Câmera livre via OrbitControls (orbit com limite de inclinação para não atravessar o piso, pan com 2 dedos / arraste e zoom / pinch). O toque sobre entidades selecionáveis apenas seleciona, sem capturar ponteiro para arraste.
- **`edit`** (padrão): Prioriza a manipulação direta e ferramentas de desenho (área, perímetro, movimentação de postes e pessoas). Quando uma entidade selecionável ou alça é clicada/arrastada, a captura do ponteiro suspende imediatamente o OrbitControls.

## Controles de Câmera

`cameraAction` é despachada via objeto `{ id: number; type: CameraActionType }` e executada uma única vez por `id`, invalidando o frame sob demanda (`frameloop="demand"`):
- `rotate-left` / `rotate-right`: Giro horizontal em torno do centro/alvo.
- `tilt-up` / `tilt-down`: Inclinação vertical limitada antes de atravessar o piso.
- `zoom-in` / `zoom-out`: Aproximação e afastamento graduais.
- `pan-left` / `pan-right` / `pan-up` / `pan-down`: Deslocamento lateral e vertical no plano de visão.
- `center-bounds` / `reset`: Reenquadra a planta inteira com base nos limites métricos da cena.
- `center-selection`: Desloca suavemente o alvo da câmera para o centro da entidade selecionada (área, poste ou pessoa).

No modo `top` (planta superior), OrbitControls desativa a rotação por gestos na tela, mantendo pan e zoom, mas comandos explícitos de `rotate-left`/`rotate-right` ajustam o vetor `up` da câmera permitindo orientar a planta sem travar em giro único.

## Grade Métrica e Snap

- A cena aceita a prop `gridStep` com os valores: `0.1` (10 cm), `0.25` (25 cm, padrão), `0.5` (50 cm), `1` (1 m) ou `null` (grade desligada).
- O passo visual na malha do piso (`Floor`) e o snap geométrico de clique no piso, arraste de entidades e desenho de retângulos usam rigorosamente o mesmo valor métrico.
- Geometrias já persistidas não são alteradas passivamente ao trocar o passo da grade.

## Distâncias Externas da Área Selecionada

- Quando uma área restrita (`RestrictedArea`) é selecionada, a cena calcula e projeta quatro linhas-guia com rótulos de distância métrica real (em metros) até as paredes do perímetro ortogonal:
  - Norte (+Z)
  - Sul (-Z)
  - Leste (+X)
  - Oeste (-X)
- Caso o perímetro não seja ortogonal/retangular, a cena omite as medidas ou fornece `null` pelo callback `onAreaDistancesChange(distances)`, garantindo que nenhuma medida arbitrária seja inventada.

## Alvo de Toque e Botão +1

- Postes e pessoas contêm alvos invisíveis de hit testing (`ScreenPickTarget`) que acompanham a escala da câmera em tempo de execução para garantir um diâmetro de toque mínimo de 44 px CSS, com particionamento espacial em grade de 1 m para evitar que objetos adjacentes sobreponham seus alvos.
- Ao selecionar uma pessoa na cadeia, um botão sprite com glifo `+1` surge posicionado atrás dela no espaçamento métrico definido em `scene.simulation.spacingMeters`. O botão interrompe o drag da pessoa e aciona `onAppendPerson(id)` via clique.

## Recursos, Ciclo de Vida e Limitações

- A cena não utiliza Drei `Html` roots nem elementos DOM flutuantes dentro do WebGL canvas. Todos os rótulos de dimensão e área utilizam `THREE.CanvasTexture` otimizados e descartados no desmonte (`dispose`).
- O container do canvas possui `touch-action: none` e recorte com `overflow: hidden`, mantendo DPR limitado a 1.5 e frameloop sob demanda para máxima eficiência de bateria em dispositivos móveis.
