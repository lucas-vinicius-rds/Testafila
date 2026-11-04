# Frontend TestaFila

Atualizado em 28/10/2026 após Onda 3 (Sprint 05). Este documento registra a estrutura visual, rotas, app shell e a integração do editor touch.

## 1. Rotas do Aplicativo

| Rota | Descrição |
|---|---|
| `/` | Redireciona para a galeria. |
| `/dashboard` | Galeria compartilhada da instância, com miniaturas SVG métricas derivadas da cena, estados de carregamento, erro, navegação de app shell e CTAs claros de **Abrir**, **Editar** e **Apagar**. |
| `/projects/new` | Criação guiada: planta métrica, revisão 3D no canvas, paleta de itens, cadeia de pessoas conectadas (+1), áreas restritas e salvamento inicial. |
| `/projects/[id]` | Visualização de leitura da cena salva, medidas métricas consolidadas e botão de ação para edição. |
| `/projects/[id]/edit` | Editor completo da fila carregando a revisão existente com resolução atômica de conflitos (409) e histórico. |
| `/xr-check` | Spike isolado de diagnóstico WebXR/hit-test (experimental, não integrado ao fluxo de persistência de projetos). |

## 2. Componentes e Estrutura da Onda 3

- **`apps/web/components/app-nav.tsx`**:
  - Menu principal mobile/desktop com links ativos: *Minhas filas*, *Criar nova fila* e *Configurações*.
  - Utiliza ícones Phosphor (`@phosphor-icons/react/dist/ssr`).
- **`apps/web/components/undo-redo-bar.tsx`**:
  - Barra vertical flutuante posicionada sobre o canvas 3D.
  - Alvos de 44 px com acessibilidade completa (`aria-label`) e contador numérico do histórico sem poluir a bandeja inferior.
- **`apps/web/lib/scene-thumbnail.ts`**:
  - Gerador leve de miniatura vetorial SVG a partir do `ProjectScene`.
  - Exibe contorno do perímetro, obstáculos, conexões de fitas, postes e pessoas sem instanciar WebGL redundante.
- **`apps/web/components/settings-panel.tsx`**:
  - Painel de controle de preferências espaciais: passo da grade métrica (0,10m, 0,25m, 0,50m, 1,00m e desligada) e modo de interação (Navegar vs Editar).
- **`apps/web/components/queue-editor.tsx`**:
  - Primeira pessoa fixa o início da fila; pessoas seguintes são encadeadas via botão DOM touch de 48 px (`+1 atrás`) com cópia de orientação e aplicação do espaçamento métrico (`spacingMeters`).
  - Toque em qualquer elemento abre o inspetor lateral/inferior com Mover, Girar e Apagar (com confirmação destrutiva).
  - Indicador `• Pronta para salvar` puramente textual, sem conflito de affordance com botões de ação.

## 3. Execução e Build

Para compilar e subir em produção:
```bash
npm run build:api
npm run build:web
npm run start --workspace @testafila/web
```
O servidor escuta na porta `3000` (host `0.0.0.0`). O proxy interno repassa requisições `/api/**` para a API Nest na porta `3001`.
