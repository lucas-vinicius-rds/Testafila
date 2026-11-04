# Dúvidas para o usuário

## Projeto que não converte em fila (Viga, Onda 1)

O projeto `54135db9…` (17 pessoas, 15 postes) não converte em fila interligada: com o
espaçamento vigente, a cadeia recomposta bate em obstáculos. Os outros 16 projetos com pessoas
convertem.

**O que foi feito:** a opção mais reversível. O projeto abre e salva normalmente, sem perda, e
a conversão é recusada com o motivo. As pessoas podem ser movidas ou removidas uma a uma antes
de tentar de novo.

**Para decidir:** manter assim, ou criar uma conversão que contorne obstáculos? Esta segunda
mudaria mais a posição das pessoas.

## Giro da planta em `/projects/:id/ar` (Retina, Onda 1)

Com o alinhamento por pontos, a planta é desenhada girada para o lado errado, embora a tela
informe erro zero. Só fica certa se o giro necessário for 0 ou 180°. O bug é antigo. Medi em
código; não vi no aparelho.

**O que foi feito:** a opção mais reversível. A rota ficou como estava, porque a ordem era não
mudar o que já funcionou no Samsung. A captura nova não tem esse problema.

**Para decidir:** corrigir agora (provavelmente uma linha, a validar no aparelho) ou deixar para
quando `/ar` for revista?

## Qual rota funcionou no Samsung? (Retina, Onda 1)

Os documentos dizem só que "WebAR funcionou". A orientação da Frente D aponta
`/projects/:id/ar`, mas nada registra isso.

**O que foi feito:** as duas rotas foram preservadas, com a mesma sequência de chamadas de antes.

**Para responder:** foi `/projects/:id/ar` ou `/xr-check`? Até onde o teste foi (abriu a câmera,
marcou pontos, a planta apareceu no lugar certo)? Qual o modelo do aparelho?
