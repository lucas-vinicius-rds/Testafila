# WebAR — arquitetura e fluxo atual

Fonte na branch das ondas, 04/11/2026. Publicação e aceite em
`ondas/status/ONDA-3.md`; fluxo direto mais recente em
`ondas/ONDA-2B-FLUXO-DIRETO.md`. Este documento substitui a proposta antiga que
citava apps/web e apenas duas marcas; não é certificado de precisão física.

## Componentes

- `front/features/ar/session/`: controlador único, capacidade e hook.
- `front/features/ar/assembly/`: ArAssembly, estados/comandos e trabalho em memória.
- `front/features/ar/scene/`: objetos/camadas/retículo e renderização incremental.
- `front/features/ar/xr-project/`: /projects/:id/ar para cena salva.
- `front/features/ar/xr-check/`: /xr-check, diagnóstico de duas marcas.
- `front/features/project-creation/`: ligação com criação e editor 3D.
- `back/core/domain/measured-environment.ts`: normalização métrica pura dos cantos.

## Fluxo solicitado

Criar nova fila entra direto na medição se houver suporte. Um toque em Começar
a medir inicia sessão: não iniciar automaticamente fora da ativação do usuário.
Sem suporte, abrir medidas digitadas com explicação simples, inclusive no iPhone.

Marcar cantos no chão, ver paredes/medidas e fechar planta. Escolher Montar na
câmera ou Montar no 3D. AR permite áreas opcionais, postes, fitas e primeira
pessoa/+1/espaçamento; Concluir encerra sessão e entrega ProjectScene ao editor
para confirmar, revisar, nomear e salvar. Não salvar poses XR ou usar storage
para o documento ainda não salvo.

## Sessão e negociação

Exige contexto seguro, immersive-ar, hit-test e local-floor. Não detectar por
user-agent. DOM Overlay é obrigatório no fluxo de montagem, **verificado após
negociação**: a chamada conserva optionalFeatures ['dom-overlay'] para não
alterar a sequência das rotas antigas. Ausência encerra e oferece digitar.
/ar e /xr-check mantêm sua compatibilidade anterior, sem impor essa exigência.

Callback setAnimationLoop sem frame retorna imediatamente, sem renderizar,
alterar estado ou disparar onFrame. Frames XR válidos preservam ordem de
chamadas. As variantes project/check têm diferenças históricas de cleanup,
visibilidade e validação de câmera; não unificá-las sem evidência e autorização.

## Estado, alinhamento e limites

Todos os comandos passam pelo core; rejeição mostra motivo sem alterar cena.
Cantos/objetos ficam nas coordenadas do projeto; transformação de sessão só em
memória. Perder sessão preserva trabalho, permite continuar realinhando os
primeiros cantos ou revisar no editor. Perder a página/aba perde rascunho.

Escala sempre 1. O alinhamento de /ar usa dois pares e terceiro ponto para
conferência. O sinal de yaw no renderizador foi corrigido com teste Three real.
Não há tolerância física validada nem bloqueio por erro acima de limiar aprovado;
isso continua pendente, não foi resolvido por escolher um número arbitrário.

Primeira parede curta amplifica erro angular; retículo horizontal usa heurística
de 20 graus. Precisão/tracking, gestos, beforexrselect e desempenho precisam do
aparelho. Não prometer suporte universal ou precisão a partir de XR simulado.
