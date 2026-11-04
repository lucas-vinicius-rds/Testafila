> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# Conferência antes do desenvolvimento — 22/10/2026

## Origem e preservação

O usuário confirmou que o código existente em Testafila foi feito por um colega.
Base observada: commit 70745cc, Vite/JavaScript/Three.js. Nenhum arquivo de execução
do colega foi alterado nesta conferência. Migração deve portar funções úteis por
módulo, mantendo o histórico Git e evitando apagar o protótipo antes da substituição.

## O que aproveitar

- src/geometry.js: distância XZ, estrutura de métricas e geração de serpentina,
  após validação de entradas e correção das interseções.
- src/arObjects.js: geometria proporcional de postes, fitas, retículo e zonas,
  adaptando materiais à referência slide-cintia e gestão de recursos ao R3F.
- src/main.js: experiência de ferramentas e ciclo WebXR como referência técnica.
  O estado global, vínculos automáticos de fitas e histórico precisam ser substituídos
  pelo documento comum e comandos reversíveis definidos na arquitetura.

## Evidências executadas

- node --check em main.js e arObjects.js: sem erro de sintaxe.
- Importação direta de geometry.js no Node 24.19.0: executou.
- Segmentos (0,0)–(2,0) e (1,0)–(3,0): interseção retornou false, embora sobrepostos.
- Trecho de 18 m: comprimento 18, capacidade 30, espera estimada 8 min.
- Espaçamento -1: capacidade -18; falta validação de parâmetros no domínio.
- Botão de inserir usa reticle.position sem guard de pose XR válida.
- Desfazer remove vértice/poste/zona por prioridade, sem consumir state.history.
- README anuncia AR universal e validador ABNT; as implementações observadas não
  sustentam essas promessas. Portar com descrição fiel e sem certificação presumida.

node_modules ausente: build e navegador não foram validados. Esta conferência não
comprova funcionamento em celular, precisão física, estabilidade ou conformidade.

## Contratos fechados para a fundação

Next/React/TypeScript; domínio puro em metros; postes, fitas, percurso e pessoas
independentes; renderizadores 3D/XR sobre o mesmo documento; PostgreSQL, validação
servidora e isolamento por proprietário. Versões e integração de auth serão verificadas
antes de instalar dependências, conforme ARCHITECTURE.md.

contracts/project.ts agora define o erro observado como máximo dos erros percentuais
das conferências físicas, com denominador medido positivo. Sem conferência não há erro
conhecido. Realinhamento separa pares de ajuste e conferência, exige tolerância aprovada
no teste em aparelho e registra conferências dimensionais. Diagnósticos são derivados
e recalculados. Nenhuma tolerância física foi inventada ou validada nesta sessão.

## Equipe e pendência operacional

Maestri list: Codex, maestro true; nenhum agente conectado. Presets existentes:
Codex, Antigravity, Claude Code, OpenCode e Shell. Nenhum preset foi modificado.

Catálogo local ~/.codex/models_cache.json identifica gpt-6-luna com esforço medium;
codex --help confirma seleção por --model e --config. Ainda não foi recrutado.

agy --help confirma --model e --effort low/medium/high/max. agy models falhou:
acesso negado a arquivos globais e renovação de autenticação bloqueada pelo proxy
127.0.0.1:9. A mensagem final pede login, mas isso não prova ausência de login fora
deste ambiente restrito. Não alterar proxies, permissões ou credenciais para contornar.

Atualização: o usuário executou agy models em seu terminal e forneceu a saída:
gemini-3.8-flash-high, gemini-3.8-flash-medium, gemini-3.8-flash-low,
claude-sonnet-4-6, claude-opus-4-6-thinking e gpt-oss-120b-medium.
Identificação dos modelos resolvida por evidência fornecida pelo usuário.

Distribuição confirmada: tarefas difíceis com agy --model gemini-3.8-flash-high;
simples com agy --model gemini-3.8-flash-low; médias com Codex gpt-6-luna,
model_reasoning_effort=medium. Nenhum desses agentes foi iniciado nesta conferência;
a listagem confirma os IDs, não execução ou disponibilidade de quota.
Recrutar pelo canvas com escopos exclusivos e ask back para Codex, seguindo o primeiro
lote de DELIVERY.md. Não substituir modelos silenciosamente.
