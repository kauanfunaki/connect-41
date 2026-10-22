# Validação do controle interno do Tech — 21/10/2026

## Resultado do módulo

- Prisma Client regenerado; schema válido.
- Migration `20261021160000_tech_internal` aplicada em MySQL 8.0.46 descartável, restrito a `127.0.0.1:33379/connect41`. As quatro tabelas foram criadas, o escritório fictício anterior foi preservado e o diff entre banco e schema ficou vazio.
- **41 testes aprovados:** 30 de regras e 11 de integração real com banco. Cobrem os cinco tipos, opcionais, três modos de sistema, reabertura, histórico atômico, comentários simultâneos, conflito entre versões, permissões, isolamento entre escritórios, filtros, ordem e paginação. Também verificam a preservação do histórico após exclusão de uma conta e a troca entre responsáveis com o mesmo nome.
- **11 cenários de navegador aprovados** no standalone isolado: cadastro de sistema e item, opcionais vazios, comentários, prazo, responsável, situação, antes/depois, duas abas, sistemas inativos, filtros combinados, consulta global e bloqueio de outros setores.
- Lista e detalhe conferidos em larguras de 1366, 1093, 911, 683 e 390 px, incluindo áreas úteis equivalentes a escalas de 100%, 125%, 150% e 200%. Sem overflow horizontal da página; a ação Salvar permanece acessível por rolagem. Tema claro e escuro; nenhum erro JavaScript detectado.
- Build webpack isolado concluído e TypeScript sem erros. Lint dos arquivos do módulo sem erros ou avisos; lint geral sem erros, com um aviso anterior em `scripts/exportar-empresas-para-prototipos.ts` sobre `_g` não utilizada.

Os cenários de navegador usam uma cópia do aplicativo em `.local/tech-interno/`, sem `.env`, storage ou credenciais reais. Capturas, resultado estruturado e logs ficam nessa pasta ignorada pelo Git. As gravações foram realizadas somente com dados fictícios no banco descartável. As mudanças finais de metadados do histórico foram verificadas novamente pela integração com banco e pelo TypeScript.

## Verificações gerais e trabalho local concorrente

A última suíte geral teve **5.469 testes aprovados, 59 pulados e 2 falhas** em 433 arquivos. As falhas restantes pertencem ao módulo GitHub em implementação no mesmo checkout:

- `src/lib/auditoria/acoes.test.ts`: a ação montada `github.${action}` ainda não está classificada no catálogo de auditoria.
- `src/lib/exclusao/registro.test.ts`: faltam classificar `GithubConnection.githubUserId`, `GithubAccountLease.githubUserId` e `GithubOAuthAttempt.userId` no registro de colunas sem chave estrangeira.

O teste que confere as chaves das migrations contra o schema passou após explicitar `onDelete: Restrict` na relação composta com sistemas. A relação do responsável e as autorias preservadas do controle interno foram registradas na política central de exclusão.

Na exploração inicial, o TypeScript estava bloqueado por duas declarações de `def` em `src/lib/modules.ts`. Esse bloqueio foi resolvido pelo trabalho local concorrente, sem edição desse arquivo nesta implementação. As demais alterações de GitHub e Ops Center foram preservadas.

O build emitiu avisos de cópia de manifests de outras rotas durante a preparação do standalone. As rotas do controle interno abriram normalmente no pacote e passaram pelos cenários acima.

## Publicação

Não houve deploy, aplicação de migration ou ativação em produção. O módulo continua desligado por padrão. Para disponibilizá-lo, seguir o [guia de ativação](TECH-CONTROLE-INTERNO.md), revisando também as outras migrations pendentes do checkout antes de publicar.
