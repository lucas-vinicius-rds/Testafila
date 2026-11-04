# Requisitos e estado real — 04/11/2026

Os PDFs em docs/referencias são referências; decisões posteriores do usuário
prevalecem. A implementação atual é web, com editor 3D e WebXR experimental.
Os resultados executados e a publicação constam em [Onda 3](ondas/status/ONDA-3.md).

| Pedido / critério | Estado real e limite |
| --- | --- |
| Next + Nest + SQLite | Estrutura front / back/src / back/core; persistência real |
| Criar direto pela câmera | Onda 2B implementa entrada direta em aparelhos com suporte, sem tela intermediária |
| Medir como app Medida | Hit-test XR, cantos e medidas de paredes; precisão física ainda sem aprovação |
| Montar na câmera ou no 3D | Escolha após fechar planta; contrato ProjectScene comum, metros |
| iPhone | Web continua disponível por medidas digitadas; WebAR falhou no iPhone 11 relatado pelo usuário; sem aplicativo nativo autorizado |
| Pessoas ligadas e espaçamento | Cadeia v2; +1, giro/movimento e conversão explícita de legados; sem novas pessoas livres |
| Editor touch/mobile | Paleta, bandeja, alvos e controles implementados; emulação não aprova gesto físico |
| Áreas, postes, fitas e visualização | Implementados, com domínio validando geometria e persistência |
| Projetos antigos | Migração em memória; GET não regrava. Colisões podem impedir conversão até correção explícita |
| Autenticação | Desativada por decisão vigente; galeria compartilhada. Não há isolamento atual por usuário |
| 5% em 20 m | Não comprovado; precisa trena e repetição em aparelho |
| Latência, uso prolongado | Não comprovados em aparelho |
| SUS com cinco usuários | Não executado / não comprovado |
| Realinhamento XR | Implementado sem mudar escala; tolerância de aceite ainda indefinida |
| Recuperação após sessão XR | Rascunho na mesma página e realinhamento; não há persistência automática antes de salvar |

Roteiro e registro: [TESTE-MANUAL.md](TESTE-MANUAL.md). O Samsung citado pelo usuário
não tem modelo, sistema ou navegador registrados; “funcionou” não comprova os
critérios de precisão, nem toda a montagem ou o novo fluxo direto.
