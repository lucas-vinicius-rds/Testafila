# TestaFila — regras de trabalho

Leia primeiro docs/ondas/README.md. Ele prevalece sobre sprints e passagens antigas.
Claude Code coordena; tarefas, escopos e marcadores estão em docs/ondas.
Trabalhe na branch ondas/camera-e-arquitetura. Sem push, merge na main ou operações
Git destrutivas. Comite apenas caminhos autorizados, nunca git add -A.

Não altere os projetos do usuário para testar. Use SQLite temporário. Preserve os
três arquivos SQLite antes de publicação. Não exiba .env ou segredos. Ngrok é do
usuário: não parar/reiniciar/reconfigurar. Serviços 3000 e 3001 só mudam com ordem
expressa e devem ser publicados juntos por causa do contrato de cena v2.

Estrutura: front (Next), back/src (Nest), back/core (contratos e domínio puros).
Core não importa React, Three, Nest ou banco. Front usa @testafila/core e não
importa back/src. Veja docs/ARCHITECTURE.md e docs/README.md para documentação atual.

Uma unidade espacial equivale a um metro. Origem do projeto é persistente;
alinhamento XR pertence à sessão. Nova sessão exige realinhar. Não use medição
por pixels nem câmera comum como prova de escala real. Dados 3D e AR são os mesmos.
Pessoas novas formam uma cadeia; não reintroduza pessoas livres. Legados são lidos
sem regravação e convertidos somente por ação explícita.

A instância atual não exige login e compartilha projetos. Não reative autenticação
por conta própria. iPhone permanece web; não iniciar aplicação nativa/ARKit.
Identidade visual original deve ser preservada. Siga as skills indicadas no README
da onda para a tarefa pertinente e registre testes reais e limites. Simulação não
prova câmera, tracking, toque físico nem compatibilidade de aparelhos.
