# Tech, chaves do Ops Center e SPED Contábil — 23/10/2026

## O que foi corrigido

As cópias locais usadas para validar Controle interno do Tech e SPED Contábil ainda existiam, mas os módulos não estavam na branch atual. Foram recuperados os arquivos próprios e incorporados os registros de catálogo, rotas, permissões, modelos e configuração necessários, preservando as alterações locais anteriores.

- **Tech:** Controle interno com os mesmos itens em Lista, Kanban e Agenda mensal por prazo. Situação alterável por arraste ou seletor, histórico, comentários, sistemas reutilizáveis, responsável/prazo opcionais, filtros e controle de edição concorrente.
- **Ops:** mantém a chave principal e permite duas ou mais chaves adicionais nomeadas, com troca e revogação independentes. Os bots existentes continuam usando a chave atual. O servidor guarda hashes e mostra a chave completa uma única vez.
- **Contábil:** SPED novamente registrado no setor, com navegação, conferência, pendências, regras, importação de CSV e exportação delegadas à API/fila do motor SPED.

## Validação desta entrega

| Verificação | Resultado |
|---|---|
| Suíte geral Vitest, integrada à main atual | 6.714 aprovados, 85 ignorados por dependerem de outros ambientes |
| Suíte focada com MySQL descartável | 108 aprovados, incluindo 29 testes de integração Tech/Ops |
| Migrations Tech e múltiplas chaves | Aplicadas no MySQL descartável; sem diferença para o schema |
| Prisma, TypeScript, ESLint e git diff --check | Aprovados |
| Build Next com webpack em cópia isolada | Concluído; rotas recuperadas disponíveis no servidor compilado |
| Navegador real | Nove grupos do pacote e 22 verificações do Ops aprovados; nenhum erro de navegador |

O navegador verificou login com senha fictícia, criação pelo formulário, Kanban com gravação e histórico, agenda com navegação mensal/itens sem prazo, duas chaves pela tela, revogação independente, segredo ausente após recarregar, entrada pelo setor Contábil, usuários Somente leitura, bloqueio de outro setor e telas de 1366, 683 e 390 pixels com tema escuro. A evidência local está em `.local/tech-ops-entrega/resultado-ui.json` e nas capturas da mesma pasta.

O banco utilizado foi criado exclusivamente para a tarefa, container `connect-tech-ops-ci-20261023`, MySQL em `127.0.0.1:33379/connect41`. Não foram usados dados de produção, watchers reais ou pastas de rede.

## PR e implantação

A entrega foi publicada no [PR #289](https://github.com/kauanfunaki/connect-41/pull/289), pela conta `victorgomesdesa`, commit `bf78d98aac01656f4a3245cb70ecd0a8d44b4c91`, branch `codex/tech-ops-contabil`. O PR parte da main atual e preserva as mudanças fiscais recentes. O [CI remoto](https://github.com/kauanfunaki/connect-41/actions/runs/40001775145) passou em tipos, lint, testes e build. Não houve merge, deploy ou alteração de banco de produção nesta tarefa.

Os checks integrados foram executados na worktree `C:\Users\vitor.carvalho\.codex\worktrees\tech-ops-contabil\connect-41`, com banco novo e descartável do container `connect-tech-ops-pr-ci-20261023`, parado após a validação. A cópia original com as alterações locais anteriores permanece preservada.

Para disponibilizar no ambiente de uso, publicar o Connect e aplicar as migrations aditivas `20261021160000_tech_internal` e `20261023120000_ops_multiple_keys` no ambiente autorizado. Ativar **Tech → Controle interno** em Setores e módulos; o SPED Contábil nasce ligado. Planos com lista restrita precisam permitir os novos códigos.

O motor SPED precisa receber sua própria API contábil compatível e ser configurado no Connect. A ponte do Connect foi testada com API simulada; a integração real e a geração fiscal com o motor implantado continuam pendentes de homologação. Detalhes em [CONTABIL-SPED.md](CONTABIL-SPED.md), [TECH-CONTROLE-INTERNO.md](TECH-CONTROLE-INTERNO.md) e [OPS-CENTER.md](OPS-CENTER.md).
