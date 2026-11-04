# Câmera/AR — pendências e protocolo físico

Atualizado para back/front em 04/11/2026. Código da branch possui controlador
compartilhado, montagem ArAssembly, revisão 3D e visualização /ar de cena salva.
A publicação e o resultado dos testes de integração estão em ondas/status/ONDA-3.md.

## Compatibilidade e recursos

Detectar contexto seguro e isSessionSupported('immersive-ar'), sem user-agent.
A montagem exige hit-test/local-floor e DOM Overlay negociado. DOM Overlay é
pedido como opcional na chamada, mas sua ausência impede a montagem e oferece
medidas digitadas. Rotas históricas /ar e /xr-check mantêm overlay opcional.
Câmera comum getUserMedia não mede nem substitui rastreamento espacial.

iOS é web sem AR nesta entrega, por decisão do usuário: iPhone 11 usa medidas
digitadas/editor 3D. Não implementar ARKit, Capacitor, app nativo ou App Clip.
O usuário relatou WebAR funcionando num Samsung; modelo, sistema, navegador,
rota e alcance do teste não foram informados. Não presumir que mediu/alinhou
ou que a nova montagem inteira passou. Nenhum ensaio físico foi feito pelo Codex.

## Implementado não equivale a validado

- Cantos métricos geram ambiente por createEnvironmentFromMeasuredPoints, sem escala.
- Montagem usa comandos do core e mantém trabalho após queda da sessão, não após
  recarregar/fechar a página. Revisão/salvamento usam ProjectScene v2.
- /ar alinha cena salva por dois pares e confere terceiro; giro foi corrigido
  em teste Three real. Ainda precisa confirmar no aparelho.
- Guards contra frame ausente são cobertos por teste; isso não certifica tracking.
- Não há tolerância de alinhamento fisicamente aprovada; não declarar erro zero
  por checks vazios nem ajustar escala para esconder discrepância.

## Protocolo no Samsung

Registrar modelo, SO, navegador/versão, URL HTTPS, permissões, iluminação e rota.
Executar o roteiro completo em TESTE-MANUAL.md, incluindo as duas escolhas após
medir. Comparar dimensões com trena; para referência de 20 m, registrar medida
real e XR e calcular 100 * abs(XR-real)/real. Repetir três vezes em sessões novas.
O alvo documental de 5% em 20 m **não está comprovado** e não garante outras distâncias.

Verificar: retículo em piso e parede; recusa de plano vertical; perda/retorno de
pose; sair para outro app/bloquear tela; realinhar em origem diferente; tocar
botões sem marcar ponto (beforexrselect); marcar na área aberta; desfazer/refazer;
encerrar/reabrir; conforto com uma mão; muitas pessoas; desempenho/latência.
Filtro de 20 graus e mira de poste são heurísticas, não tolerâncias de medição.

## Registro pendente

| Aparelho | SO/navegador | Rota/alcance | Precisão/tracking/gestos |
| --- | --- | --- | --- |
| Samsung, modelo não informado | Não informado | Usuário disse que WebAR funcionou | Não comprovados |
| iPhone 11 | Não informado | WebAR não funcionou; alternativa manual é a decisão | Novo fluxo manual pendente no aparelho |

Latência de colisão, uso prolongado e SUS com cinco usuários também não estão
comprovados. Mocks/headless não preenchem essa tabela como aprovado.
