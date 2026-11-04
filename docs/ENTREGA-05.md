> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Entrega Onda 3 e Integração Final (Sprint 05)

**Data:** 28/10/2026  
**Responsável:** Trama (UI/CSS/lib e fechamento integrado)  
**Status:** Integrado, builds sequenciais aprovados e Next.js 16.4.2 reiniciado em produção.

---

## 1. O que foi Implementado e Integrado (Onda 3)

### A. App Shell Mobile e Navegação
- **Componente `AppNav` (`apps/web/components/app-nav.tsx`)**:
  - Links objetivos: **Minhas filas**, **Criar nova fila** e **Configurações**.
  - Estados ativos visíveis com ícones Phosphor (duotone/bold) e indicação de página atual.
  - Alvos mínimos de toque >= 44 px conformes com a skill `mobile-app-ui-design`.

### B. Ícones Phosphor Oficiais
- Manifests atualizados exclusivamente com `@phosphor-icons/react` via imports pontuais (`@phosphor-icons/react/dist/ssr`).
- Ícones integrados em navegação, ferramentas espaciais, histórico (undo/redo), avisos e ações de elemento.

### C. Barra Vertical Flutuante de Desfazer/Refazer
- **Componente `UndoRedoBar` (`apps/web/components/undo-redo-bar.tsx`)**:
  - Posicionada verticalmente no canto superior do canvas 3D.
  - Alvos touch de 44 px com `aria-label` e contador de alterações.
  - Desafoga a bandeja inferior do mobile, liberando espaço vertical essencial.

### D. Prévia Métrica Real nos Projetos (Dashboard)
- **Gerador SVG Métrico (`apps/web/lib/scene-thumbnail.ts`)**:
  - Miniatura precisa desenhada a partir do `ProjectScene` (perímetro, áreas restritas, postes, fitas e pessoas).
  - Sem carregar WebGL pesado por card e sem depender de URLs externas inexistentes.
  - CTAs claros em cada card: **Abrir** (visualizador) e **Editar** (editor direto).

### E. Fila Conectada em Cadeia (+1) e Inspetor Touch
- **Fila em Cadeia**:
  - A primeira pessoa colocada define a orientação inicial (+Z, yaw 0).
  - Pessoas seguintes entram via comando atômico `person:append` (+1 atrás) respeitando o espaçamento configurado (0,5m, 0,8m ou 1m).
  - Botão touch DOM de 48 px no inspetor para repetição ágil e confortável do `+1 atrás`.
- **Ações Mover / Girar / Apagar**:
  - Toque no objeto abre inspetor com ações claras.
  - Ações destrutivas (excluir poste/pessoa/área/fita) contam com confirmação explícita no mesmo painel.
  - Restrições da fita (ligada diretamente aos postes) explicadas contextualmente, sem opções sem efeito.
- **Indicador "Pronta para salvar"**:
  - Transformado em indicador textual discreto (`• Pronta para salvar`), sem aspecto de botão. Salvar é uma ação destacada e separada.

### F. Integração de Câmera e Grade da Onda 2 (Prumo)
- Suporte aos modos **Navegar** e **Editar** na barra de ferramentas.
- Grade métrica ajustável (0,10m, 0,25m, 0,50m, 1m ou desligada).
- Exibição das 4 distâncias externas métricas até as paredes para áreas retangulares selecionadas.

---

## 2. Verificações e Builds Sequenciais Realizados

Conforme exigido pelo Sprint 05, os comandos foram rodados sequencialmente sem concorrência:

1. **Typecheck API**:
   - `npm run typecheck:api` → **0 erros** (Aprovado).
2. **Typecheck Web**:
   - `npm run typecheck:web` → **0 erros** (Aprovado).
3. **Build API**:
   - `npm run build:api` → **Aprovado** (`tsc` compilou para `dist/`).
4. **Build Web**:
   - `npm run build:web` → **Aprovado** (Next.js 16.4.2 Turbopack gerou todas as rotas estáticas e dinâmicas com sucesso).
5. **Reinicialização do Next.js**:
   - Processo antigo na porta 3000 encerrado.
   - Novo servidor iniciado em produção (`npm run start --workspace @testafila/web`) na porta 3000 (host 0.0.0.0).
   - Healthcheck HTTP `http://localhost:3000` retornou **200 OK**.

---

## 3. Roteiro de Teste Manual para o Usuário

1. **Acessar o aplicativo**:
   - Abra o navegador em `http://localhost:3000`.
   - Se já tiver sessão, será redirecionado para `/dashboard`.
2. **Conferir Dashboard e Prévia**:
   - Os cards de projeto exibem miniaturas SVG reais com as cotas e objetos da cena salva.
   - Cada card possui botões claros de **Abrir** e **Editar**.
3. **Criar ou Editar uma Fila**:
   - Clique em **Criar nova fila** (ou navegue para `/projects/new`).
   - Após confirmar a planta básica, o canvas abre com o novo app shell e barra vertical de desfazer/refazer flutuante no canto superior esquerdo.
   - Coloque a primeira pessoa: ela define o início da fila voltada para frente (+Z).
   - Com a pessoa selecionada, toque no botão touch **+1 atrás** no painel: uma nova pessoa é conectada respeitando a distância da cadeia.
   - Experimente alterar o espaçamento (0,5 m / 0,8 m / 1,0 m) e girar a pessoa.
   - Alterne entre os modos **Navegar** (para girar e dar pan na cena livremente) e **Editar** (para manipular elementos).
   - Alterne o passo da grade (ex: 0,10 m, 0,25 m ou desligada).
4. **Salvar**:
   - O indicador textual informa discretamente o status da validação geométrica.
   - Clique em **Nomear e salvar** para persistir a revisão atômica no backend.

---

## 4. Limitações Conhecidas Registradas

- O ambiente WebXR experimental continua isolado na rota `/xr-check`; a câmera de celular para realidade aumentada no editor ainda é uma frente separada não integrada ao produto final.
- O aceite em dispositivos móveis reais e o conforto tátil definitivo dependem de teste no aparelho físico pelo usuário.
