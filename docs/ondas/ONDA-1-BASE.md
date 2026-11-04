# Onda 1 — Base em paralelo

Quatro frentes em paralelo. Caminhos conforme `status/ONDA-0.md`. Numeração `1.x` e `2.x`
refere-se a [00-PENDENCIAS-CODEX.md](00-PENDENCIAS-CODEX.md).

## Regras práticas vindas da Onda 0

- Leia `status/ONDA-0.md`, principalmente "Comandos novos" e "Para as próximas ondas".
- `next dev` usa a API real: escrita pelo proxy vai para o banco do usuário. Para testar
  escrita, suba uma API própria com `DATABASE_PATH` temporário em outra porta.
- `migrate:back` sem `DATABASE_PATH` atua no banco real. Não rode assim, exceto Codex, se a
  frente dele exigir, e nunca sem backup dos três arquivos do SQLite.
- Portas: Vitral usa 3100 com `.next-dev`. Retina usa 3110 com `.next-dev-retina`. Não comite
  alterações em `front/next-env.d.ts` nem em `front/tsconfig.json` causadas por isso.
- `dev:back` falha nesta máquina por causa do "Á" no caminho. Use a alternativa do marcador.
- Quatro agentes commitam na mesma branch: comite só seus caminhos e repita se o Git
  estiver ocupado. Nunca desfaça alteração de outro agente.

## Frente A — Viga: fila interligada e comandos

**Escopo exclusivo:** `back/core/**` e `back/src/modules/projects/validation*`.

Resolve 1.3, parte de domínio de 1.4 e 1.8. Base: Onda 1 de `docs/SPRINT-05.md`.

1. Modelar a cadeia no documento: uma fila por projeto, ordem persistida, espaçamento e
   vínculo entre vizinhos. Subir a versão da cena com migração.
2. Primeira pessoa define início e orientação. `+1` entra atrás da última pessoa da cadeia.
3. Mudar espaçamento (0,5 / 0,8 / 1 m) recompõe a cadeia inteira.
4. Mover ou girar uma pessoa reposiciona o trecho seguinte e mantém distâncias. As
   anteriores não mudam.
5. Remover pessoa fecha a cadeia, sem órfãos.
6. Toda operação é atômica: se colidir ou sair do ambiente, a cena fica intacta. Undo e
   redo continuam funcionando.
7. Legado: projetos antigos abrem sem perda. Pessoas livres são convertidas só por comando
   explícito e determinístico. Novos salvamentos inconsistentes são rejeitados.
8. Adicionar girar área restrita. Mover e girar devem existir por tipo quando fizer sentido.
   Fita continua derivada dos postes.
9. Publicar função pura para a câmera: montar um ambiente a partir de pontos medidos, com
   origem no primeiro canto e +X na primeira parede, validando polígono simples.
10. Teste de domínio: poste com 3 ou mais fitas em lados distintos, sem liberar duplicata
    A-B/B-A nem passagem por terceiro poste. Se o domínio não for a causa de 1.4, registre.
11. Migração (achado 1 da Onda 0): `migration.ts` não compila e nunca foi chamado. Fazer a
    migração realmente rodar ao ler cenas salvas, cobrindo todas as versões presentes no
    banco, e deixar `typecheck:core` aprovado. Confira em cópia do banco, sem gravar no real,
    que os 21 projetos abrem pelo novo código. Abrir um projeto não pode regravá-lo.

**Publicar cedo:** assim que os tipos estiverem estáveis, grave
`status/ONDA-1-viga-contratos.md` com tipos e comandos e avise o coordenador. Retina e Vitral
dependem disso. Depois disso, tipos publicados não mudam sem avisar.

**Pronto quando:** testes novos cobrem cada item acima, os testes antigos continuam
aprovados e a API aceita, valida, salva e reabre a cadeia.

## Frente B — Codex: backend e testes

**Escopo exclusivo:** `back/src/**` (exceto `validation*`), `back/test/**`, `back/.env`.

1. **Gravação pelo ngrok (1.14).** Permitir mais de uma origem em `APP_ORIGIN`, separadas
   por vírgula, mantendo a validação. Definir `http://localhost:3000` e
   `https://defendant-dragging-dreadlock.ngrok-free.dev`. Atualizar `.env.example`.
   Reiniciar só a API na porta 3001. Provar criar, editar e excluir pelo domínio público,
   usando um projeto de teste próprio, e excluir só esse projeto. Se a política bloquear o
   reinício, não contorne: registre e avise.
2. **Testes (2.3).** Alinhar `back/test/**` à aplicação sem login. Remover chamadas a
   `/api/auth/sign-in/email` e corrigir a contagem de migrações. Não reintroduzir login. Liste
   no marcador cada cobertura retirada; não esconda essa perda.
3. **Compatibilidade.** Quando Viga publicar os contratos, cobrir na API: salvar e reabrir
   cadeia, legado, cena inconsistente rejeitada e conflito de revisão.

**Pronto quando:** `test:api` passa inteiro e a gravação pública está comprovada.

## Frente C — Vitral: iPhone e correções de interface

**Escopo exclusivo:** `front/app/**`, `front/features/{dashboard,settings,editor,project-creation}/**`,
`front/shared/**`, CSS. Não edite `front/features/ar/**`.

**iPhone**
1. Configurar viewport com `viewport-fit=cover` pela API atual do Next. Hoje os
   `env(safe-area-inset-*)` existem no CSS, mas valem zero sem isso.
2. Corrigir no CSS o que o Safari exige: campos com fonte de pelo menos 16 px (evita zoom
   automático), safe areas no topo e nas laterais, `touch-action` no canvas e sem rolagem
   elástica quebrando o editor.
3. Adicionar metadados para abrir pela tela inicial, com ícone a partir da logo existente.
   Sem service worker.

**Correções**
4. Prévias da galeria: `ProjectThumbnail` lê `data.project.scene`, e a API devolve
   `data.scene` (1.12, 2.9). Testar com projetos reais.
5. Navegação: estado ativo errado em Configurações e Criar nova fila (2.2).
6. Configurações sem efeito: grade e modo precisam chegar ao editor (1.10, 2.1). Preferência
   local de interface é permitida; dados do projeto continuam no banco.
7. Distâncias da área: mostrar só em planta realmente retangular; caso contrário, informar
   indisponível (1.11, 2.8).
8. Botão `+1` na cena: legível e tocável em tamanho de tela, independente do zoom, sem
   arrastar a pessoa nem disparar duas vezes (1.7).
9. Várias fitas no mesmo poste: reproduzir no fluxo real, com seleção por toque de poste já
   conectado, e corrigir a causa na interface (1.4).
10. Link de AR visível: botão no topo da revisão do projeto, não no fim da página (2.7).
11. Dividir `queue-editor.tsx` e `scene-viewer.tsx` (cerca de 900 linhas cada) em partes
    menores dentro de `features/editor/`, só conforme você precisar mexer nelas.

**Pronto quando:** typecheck aprovado e fluxo verificado em viewports 390×844 e 320×568.
Registre tudo o que depende do iPhone físico como pendente no aparelho.

## Frente D — Retina: sessão AR e captura da planta

**Escopo exclusivo:** `front/features/ar/**`. Não edite `project-creation`; a integração
com o fluxo é da Onda 2.

1. Extrair de `xr-project-client.tsx` e `xr-check-client.tsx` uma camada única de sessão:
   iniciar, hit-test, retículo, visibilidade, perda de pose, encerrar e limpar recursos.
   As duas rotas passam a usá-la, sem mudar o que fazem.
2. Expor detecção de capacidade reutilizável pela interface.
3. Exigir `dom-overlay` no fluxo de criação. Se não for negociado, encerrar a sessão com
   mensagem clara e oferecer medidas digitadas (2.6).
4. Criar o componente de captura da planta: marcar cantos no chão com o retículo, ver cada
   parede em metros enquanto marca, desfazer o último canto e fechar. Entrega um ambiente
   pela função pura de Viga, sem alterar escala.
5. Guardar a transformação entre sessão e projeto só em memória (ver regra no `AGENTS.md`).
6. Bloquear marcação com tracking perdido ou sessão oculta.

Até Viga publicar a função pura, use uma interface local e troque depois.

**Pronto quando:** rotas atuais seguem funcionando, lógica pura com testes, typecheck
aprovado. Tudo que depende de câmera real fica como pendente no aparelho.
