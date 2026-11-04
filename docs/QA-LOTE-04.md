> Registro histórico, anterior ao fechamento da Onda 3 (04/11/2026). Caminhos, login, pessoas livres e limites XR descritos abaixo podem estar superados. Consulte [índice atual](README.md) e [status da Onda 3](ondas/status/ONDA-3.md); este documento não prova o estado publicado.

# QA integrado — editor visual 3D

Data: 28/10/2026. Coordenador: Codex. Implementação: Trama (UI), Prumo (cena),
Cedro (domínio); integração de contratos/API e testes pelo coordenador.

## Resultado

Build Next de produção aprovado e servidor reiniciado em `http://localhost:3000`.
Nest está em `http://127.0.0.1:3001`. Não há medição por câmera integrada.

| Verificação | Resultado |
| --- | --- |
| Domínio completo, Node 24 | 125 testes / 20 suítes aprovados por Cedro |
| Build API e typecheck API | Aprovados |
| Integração Nest, incluindo pessoas livres e persistência após restart | 10 testes aprovados |
| Typecheck web e build Next final | Aprovados |
| Playwright/Edge, build final | 3 fluxos completos aprovados, zero pageerror |
| git diff --check | Sem erros; somente avisos de normalização LF/CRLF |

Playwright usa Edge headless com SwiftShader; o teste toca a cena com touchscreen
emulado nos projetos mobile e usa mouse para arrastes. Não comprova desempenho
de GPU de celular, gestos físicos, Safari/iOS ou WebXR.

## Viewports medidos

Medidas no editor recém-aberto, com bandeja recolhida:

| Viewport | Altura do canvas | Documento | Paleta e salvar |
| --- | --- | --- | --- |
| 1280×900 | 628 px | 1280×987 | Visíveis |
| 390×844 | 498 px | 390×844 | Integralmente no viewport |
| 320×568 | 222 px | 320×568 | Integralmente no viewport |

Sem overflow horizontal nos três; sem scroll global nos dois mobiles. O inspector
expandido rola internamente e reduz o canvas (cerca de 192 px no menor aparelho
emulado). A barra da câmera rola horizontalmente e conserva rótulos e alvos de
44 px. Os alvos invisíveis de objetos 3D buscam 44 px, limitados pela proximidade
de outros objetos/+1; em plantas grandes pode ser necessário aproximar.

## Fluxo exercitado em cada viewport

1. Criar retângulo 10×8 m, sem entrada por coordenadas ou altura de parede.
2. Acionar as 11 ações de câmera; comparar imagem ao inclinar e repor.
3. Colocar pessoa sem percurso; iniciar arraste com ponteiro ativo, cancelar e
   entregar pointerup tardio: nenhuma pessoa/histórico adicional.
4. Usar +1 da cena exatamente uma vez, girar, alterar espaçamento e encadear +1;
   mover por toque e arrastar pessoa; conferir posição persistida.
5. Arrastar poste da paleta e colocar outro por toque; selecionar os dois e
   confirmar fita.
6. Desenhar área, cancelar, redesenhar e confirmar; desfazer/refazer.
7. Arrastar canto da planta e reconfirmar; verificar coordenada persistida.
8. Alternar perspectiva, nomear/salvar pela API real e reabrir no editor;
   documento lido deve corresponder integralmente ao salvo.

Os testes criam projetos numa conta local de QA. Credenciais vêm do ambiente;
nenhuma senha ou banco acompanha a entrega. Execução em [EXECUCAO-LOCAL.md](EXECUCAO-LOCAL.md).

## Correções encontradas nesta rodada

- Barra de câmera em várias linhas deixava só 93 px de canvas em 320×568:
  substituída por faixa horizontal e bandeja recolhida compacta.
- Gesto que errava uma pessoa podia inclinar a vista Planta: giro por gesto foi
  desativado nessa vista; pan/zoom e comandos explícitos permanecem. Perspectiva
  mantém orbit. Alvos de seleção foram ampliados sem alterar colisão.
- Harness tentava arrastar paleta fora do trecho visível do inspector pequeno:
  teste agora rola o botão para dentro da área antes de iniciar o ponteiro.
- Ação de câmera podia ser repetida por mudanças de viewport/inspector: guard
  pelo último id processado impede reexecução. Build e fluxo completo repetidos
  após essa correção.

Capturas finais inspecionadas pelo coordenador:

- [Desktop](qa/lote04/desktop.png)
- [390×844](qa/lote04/390x844.png)
- [320×568](qa/lote04/320x568.png)

Arquivos JSON ao lado das capturas registram as medidas iniciais. Capturas mostram
a perspectiva após montagem, não o estado inicial usado para medir a tabela.

## Aceite humano restante

Testar conforto dos controles, tamanho dos textos, arrastar com dedo real,
cancelamento pelo sistema, zoom/orbit e uso prolongado no celular-alvo. A avaliação
visual de usabilidade ainda depende do usuário. Câmera, captura do ambiente,
alinhamento XR e precisão física continuam fora desta entrega 3D; ver
[XR-PENDENCIAS.md](XR-PENDENCIAS.md). Capacidade conjunta mantém alocação gulosa
e teto de 10.000 pessoas; esta rodada não certificou desempenho nesse teto.
