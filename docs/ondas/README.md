# Ondas de desenvolvimento — novembro de 2026

Estes documentos prevalecem sobre `docs/SPRINT-*.md` e sobre instruções antigas do
`AGENTS.md` quando houver conflito. Coordenação: Claude Code (agente `Claude Code` no
canvas). O coordenador não implementa. Só escreve as ondas, lança e acompanha.

## Objetivo

1. Reorganizar o projeto em duas pastas, `back/` e `front/`, com arquitetura adequada.
2. Criar a fila inteira pela câmera no Android e revisar no editor 3D.
3. Deixar o app utilizável no iPhone pela web, sem câmera AR.
4. Resolver as demandas pendentes de [00-PENDENCIAS-CODEX.md](00-PENDENCIAS-CODEX.md).

## Decisões do usuário (04/11/2026)

- iOS é só web. Sem app nativo, sem Capacitor, sem ARKit, sem App Clip.
- WebAR não funcionou no iPhone 11 e funcionou num Samsung (modelo desconhecido; o
  usuário não informou até onde o teste foi). A câmera fica só para aparelhos com
  `immersive-ar`. O iPhone usa medidas digitadas e o editor 3D.
- Detectar por capacidade (`isSessionSupported`), nunca por user-agent.
- Fluxo da câmera: cantos do ambiente, áreas restritas, postes, fitas e pessoas em AR,
  depois revisão e salvamento no editor 3D. Medidas digitadas viram alternativa.
- Câmera comum (`getUserMedia`) nunca substitui AR nem mede nada.
- Nest e SQLite continuam. Login continua removido: não restaurar nem apagar o módulo
  `auth`. Isso é decisão pendente do usuário.
- Fila interligada substitui pessoas livres. Interação de área restrita foi elogiada:
  preservar desenho, confirmar, redesenhar e cancelar.
- Logo, paleta e linguagem seguem `DESIGN.md` e `docs/referencias/DESIGN-SLIDE-CINTIA.md`.
- 1 unidade = 1 metro. Nunca aplicar escala corretiva.

## Equipe

| Agente | Modelo | Papel |
| --- | --- | --- |
| Viga | Claude Opus 5.5 medium | Arquitetura, reorganização, domínio da fila, integração final |
| Retina | Claude Opus 5.5 medium | Sessão WebXR e fluxo de criação pela câmera |
| Vitral | Claude Opus 5.5 low | Toda a interface fora da sessão AR |
| Codex | GPT-6.1 Sol low | Backend, testes da API, ajustes simples e documentação |

## Ordem

| Onda | Quem | Depende de | Marcador |
| --- | --- | --- | --- |
| [Onda 0](ONDA-0-ARQUITETURA.md) | Viga | nada | `status/ONDA-0.md` |
| [Onda 1](ONDA-1-BASE.md) | Viga, Codex, Vitral, Retina em paralelo | Onda 0 | `status/ONDA-1-<agente>.md` |
| [Onda 2](ONDA-2-CAMERA.md) | Retina, Vitral, Codex | Onda 1 | `status/ONDA-2-<agente>.md` |
| [Onda 3](ONDA-3-FECHAMENTO.md) | Viga, Codex | Onda 2 | `status/ONDA-3.md` |

O coordenador lança cada onda. Não comece uma onda sem receber a ordem.

## Regras para todos

**Git**
- Trabalhe só na branch `ondas/camera-e-arquitetura`. Commits locais pequenos, apenas
  dos arquivos do seu escopo (`git add <caminhos>`, nunca `git add -A`).
- Proibido: push, merge na `main`, `reset --hard`, `clean`, `rebase`, `--no-verify`.

**Dados e serviços**
- `*.sqlite` tem os 21 projetos do usuário. Nunca apague, recrie ou edite. Testes usam
  banco temporário.
- Nunca encerre, reinicie ou reconfigure o ngrok. O terminal dele é do usuário.
- Só o dono da tarefa, quando a onda mandar, para ou reinicia as portas 3000 e 3001.
- Nunca exiba ou registre valores de `.env`, segredos ou authtoken.
- Não sobrescreva o `.next` usado pela porta 3000. Só Viga roda `next build`, e apenas
  quando a onda mandar. Para ver a interface, use `next dev` em outra porta (3100+) com
  diretório de build separado.

**Escopo**
- Edite só os caminhos da sua tarefa. Precisou de algo fora? Registre no seu marcador
  e avise o coordenador. Não mude contrato de outro dono.
- `package.json`, lockfile e `back/core/**` têm dono definido em cada onda. Dependência
  nova só com justificativa no marcador.
- Bloqueio de política ou permissão: não contorne. Registre e avise o coordenador.
- Dúvida que só o usuário responde: escolha a opção mais reversível, siga e registre em
  `status/DUVIDAS-USUARIO.md`. O usuário está ausente.

**Evidência**
- Só declare o que executou. Registre comando e resultado real, inclusive falhas.
- Headless, emulação e mocks não provam câmera, tracking, gestos ou iPhone. Marque como
  "pendente no aparelho".
- Documento antigo e texto de interface não provam funcionalidade. Confira o código.

**Skills** (leia o `SKILL.md` antes de começar)
- Interface: `mobile-app-ui-design`, `antiwebslop`, `tastemaker`, `editorial-tech`.
- 3D: `r3f-best-practices`, `react-three-fiber-game`.
- Perfis em `~/.agents/agency-agents`: `engineering/engineering-frontend-developer.md`,
  `engineering/engineering-backend-architect.md`, `design/design-ux-architect.md`,
  `spatial-computing/xr-interface-architect.md`, `testing/testing-reality-checker.md`.
- A identidade do projeto vence qualquer sugestão de skill.
- Next tem mudanças incompatíveis: leia `node_modules/next/dist/docs/` antes de escrever
  código de Next.

**Ao terminar**
1. Grave `docs/ondas/status/<marcador>.md` com: feito, comandos e resultados, pendente no
   aparelho, contratos publicados e dúvidas.
2. Avise com `maestri ask "Claude Code" "<resumo curto e caminho do marcador>"`.
