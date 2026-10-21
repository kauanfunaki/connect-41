# Preparação da migração SPED — 14/10/2026

Referência: `C:\Dev\MIGRACAO-CONNECT-VICTOR.md`, confirmada pelo usuário. Plano vigente: `PLANO-BACKEND-FISCAL-SPED.md`. A proposta anterior foi preservada como histórico e substituída por migração incremental da API existente.

## Trabalho realizado

- Branch local `codex/sped-migracao-fundacao` nos dois repositórios.
- Ambiente do Connect conferido sem imprimir segredos: banco `connect41`, host loopback, porta 3307, variáveis legadas SPED vazias em `.env.localdev`.
- Banco MySQL descartável `sped_ci` em container próprio `sped-migracao-ci`, porta local 3308, separado do Connect e do `xml_vault`.
- Lançador de regressão do SPED que recusa host/banco/usuário inesperados antes de importar o motor, desativa `.env` e resolução externa e fornece fixtures fictícias.
- Seis testes de infraestrutura para as guardas e leitura estática do schema.
- CI de PR nos dois repositórios, sem secrets de produção, sem publicação de imagens e com Actions fixadas por commit dos projetos oficiais.
- Exclusão de estado privado, envs e certificados dos contextos Docker.
- Inventário estático V0.3: 125 linhas em 48 arquivos com a raiz literal; 47 tabelas, das quais 34 não têm uma das colunas explícitas de escopo pesquisadas. Classificação preliminar; não corresponde automaticamente às 13 tabelas sem cliente do guia e precisa de revisão semântica.
- Teste de registro de rotas DCIP/DIME adaptado para paths/métodos públicos do OpenAPI. As duas exigências originais foram preservadas; nenhum cálculo/regra fiscal mudou.
- Commits locais da fundação: `ca00b331` no Connect e `c2f068e` no SPED. O usuário decidiu manter as alterações somente locais; nenhum push ou PR foi realizado nesta etapa.

## Verificação executada

| Verificação | Resultado |
|---|---|
| Connect `npm test`, via ambiente local | 299 arquivos e 3.485 testes passaram |
| Connect `npx tsc --noEmit` | Passou |
| Connect `npx eslint .` | Zero erros; um aviso preexistente em `scripts/exportar-empresas-para-prototipos.ts` |
| Connect build de produção via Dockerfile | Passou em imagem local `connect-migracao-ci:local`, sem env de produção |
| SPED guardas/inventário | Seis testes passaram |
| SPED regressão original, Python 3.13/Windows | 952 verificações passaram em `sped_ci` |
| SPED regressão original, Python 3.12/Linux | 952 verificações passaram em `sped_ci`; código montado somente para leitura |
| SPED Dockerfile do painel | Build passou, incluindo import do app sem iniciar servidor/lifespan |
| SPED Dockerfile.agente | Build passou; agente não foi executado |
| Workflows | YAML, gatilho de PR, permissões somente de leitura e Actions com SHA fixado foram validados localmente |
| Ferramentas de infraestrutura | Sintaxe verificada como Python 3.8; isso não substitui teste de runtime nessa versão |

O primeiro teste Connect dentro do sandbox falhou por restrição de `realpath`; o mesmo comando passou fora dessa restrição com o ambiente local verificado. O build standalone na pasta de trabalho foi recusado pela guarda porque dois servidores estavam ativos. O build foi validado em Docker, sem encerrar ou substituir esses processos.

A suíte SPED não era inteiramente independente de banco/dados: consultas reais do teste da API, cadastro da empresa, documentos de apoio e JSON de municípios eram necessários. Foram fornecidas fixtures específicas no banco/cache do processo. Não foi usado dump de produção, XML real, PDF real ou alteração de arquivo fiscal ignorado.

## Limites e próximos passos

- Workflows preparados localmente não significam execução já comprovada no GitHub. Configuração de branch protection também depende do mantenedor.
- O teste em Python 3.12/3.13 não comprova compatibilidade do ambiente Python 3.8 do escritório. Validar separadamente antes de instalar lá.
- `requirements.txt` de produção permanece sem lock integral. Fixação das dependências de release precisa de revisão e homologação; não trocar a versão do motor por efeito colateral do CI.
- O banco read-only de produção (K0.1), o contrato do Obsidian, a definição de efeitos/papéis (K1.1/D4), a confirmação de credencial de escrita (D6), o mapa de empresas e o calendário de congelamento continuam dependências do guia.
- Preparar migrations versionadas e API de escrita depois de confirmar esses contratos; manter POSTs do painel e suas regras até aceite.
- A branch Connect partiu de `codex/local-banco-build` e contém três commits anteriores ainda diferentes de `origin/main`. Uma PR desta fundação deve separar esses commits; não apresentar as mudanças antigas como trabalho desta etapa.

Não houve migration, geração fiscal, chamada Serpro, alteração de cálculo ou deployment em produção. O painel antigo e seus agentes não foram interrompidos.

O banco descartável foi parado ao terminar a verificação. Para retomá-lo, usar `docker start sped-migracao-ci` e os comandos de `C:\Dev\sped_generator\docs\TESTES-ISOLADOS-MIGRACAO.md`. Os containers e servidores preexistentes permaneceram em execução.

O primeiro push foi rejeitado pela revisão automática por exigir autorização explícita para enviar o código ao destino GitHub. Após a pergunta com conteúdo/destinos, o usuário escolheu manter tudo local. Não tentar publicar por outro meio sem nova instrução do usuário.
