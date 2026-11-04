# Onda 3 — Integração, documentação e entrega para teste

## Frente A — Viga: integração

**Escopo:** qualquer arquivo necessário para integrar. Correção de bug de outro dono deve
ser mínima e registrada.

1. Rode tudo: testes de domínio, lógica XR, `test:api`, typechecks e builds, em sequência.
2. Atualize `front/tests/e2e/**` para a aplicação sem login (2.3) e rode nos três viewports.
3. Revise a arquitetura: confirme que `core` não importa React, Three, Nest ou banco e que
   `front` não importa `back/src`. Corrija desvios.
4. Regressão: cancelar arraste, clique residual e erro `removeChild` (2.12).
5. Faça `next build`, reinicie as portas 3000 e 3001 em modo produção e confirme local e
   pelo ngrok: 21 projetos ou mais, saúde da API e gravação pública.

## Frente B — Codex: documentação

**Escopo:** `docs/**`, `README.md`, `AGENTS.md`, `back/README.md`.

1. Atualizar caminhos e comandos para `back/` e `front/`.
2. Reescrever `docs/ARCHITECTURE.md` com a estrutura e as regras de dependência. Atualizar
   `FRONTEND.md`, `BACKEND.md`, `DOMINIO.md`, `EXECUCAO-LOCAL.md` e `XR-PENDENCIAS.md`.
3. Corrigir o que está desatualizado (2.10): login, protótipo Vite e cadeia de pessoas.
   Documentos datados ficam como histórico, com aviso no topo.
4. Reescrever `docs/TESTE-MANUAL.md` com dois roteiros curtos, em linguagem simples:
   - **Samsung:** criar uma fila inteira pela câmera, conferir medidas com trena e anotar
     modelo, sistema e navegador.
   - **iPhone 11:** criar fila por medidas, editar, salvar e reabrir, e conferir que a
     câmera aparece indisponível com a mensagem correta.
5. Marcar como não comprovados: precisão de 5% em 20 m, latência no aparelho, uso
   prolongado e SUS com cinco usuários (1.16). Não registrar nada como aprovado sem teste.

## Fora do escopo

Merge, push e critério de tolerância do alinhamento (2.4). A tolerância só será definida
com medidas reais do aparelho.

## Pronto quando

`status/ONDA-3.md` lista o que passou, o que falhou, a branch final, os commits, os serviços
ativos e tudo que o usuário precisa testar ou decidir.
