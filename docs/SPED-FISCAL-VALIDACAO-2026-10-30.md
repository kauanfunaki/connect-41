# Validação do SPED Fiscal — 30/10/2026

## Integração da main e navegação final

A main foi integrada à branch `codex/sped-fiscal-contabil-completo`. As quatro
áreas principais ficam no dropdown lateral SPED, aberto por hover, clique ou
teclado; a faixa dessas quatro abas foi retirada da página. As visões internas
seguem o contrato de ícones atualizado na main.

Após a integração: 7.126 testes aprovados, zero falhas e 90 ignorados; 38 testes
direcionados aprovados após os ajustes de compatibilidade; build standalone,
TypeScript, ESLint dos ajustes e verificação de diff aprovados. O navegador
aprovou 34 verificações, incluindo hover nas quatro áreas, gaveta responsiva,
preservação do contexto, gravação/importação, histórico e exportação conferida
com a tela. Captura: `.local/sped-fiscal/capturas/dropdown-sped.png`.

O banco local existente foi alinhado às adições da main pelo atualizador do
projeto, com backup e sem recriação ou alteração de senhas. As evidências das
rodadas anteriores abaixo permanecem como histórico; a integração real com o
motor e o deploy de produção continuam fora dessas verificações.

## Escopo entregue

Quatro áreas com navegação livre, contexto de empresa/período e componentes do Connect. Classificação, apuração e fechamento persistem no Connect. Geração usa revisão imutável e transporte remoto, condicionado à capacidade `geracao_connect_v1`.

Código, migration aditiva, modelos CSV/XLSX, fila retomável e [guia de operação e execução local](SPED-FISCAL-CONNECT.md) acompanham a implementação. O [contrato para o Kauan](SPED-GERACAO-CONNECT-V1-KAUAN.md) inclui o schema verificável do pacote.

## Ambiente e evidências

Somente dados fictícios: contêiner `connect-sped-fiscal-qa`, MySQL em `127.0.0.1:33381`, servidor em `127.0.0.1:3127`. Build e configuração TypeScript em `.local/sped-fiscal/`. A base usual na porta 3307 foi preservada. Não foi feita migração de produção nem utilizado o motor real.

- Testes fiscais: 35 aprovados, incluindo 13 com MySQL real descartável, 21 de regras/formatos e um do cliente HTTP simulado.
- Suíte completa: 7.046 testes aprovados, zero falhas e 89 ignorados pelos critérios dos respectivos testes. Os 13 testes de banco deste SPED foram executados, sem serem ignorados.
- Migration: aplicada em schema descartável separado, com 11 tabelas `sped_fiscal_*`. Conferência confirmou ausência de operações de alteração ou exclusão sobre tabelas existentes.
- ESLint dos arquivos implementados, schema Prisma e `git diff --check`: aprovados.
- Build standalone e TypeScript: aprovados com o ambiente fictício, sem alterar o diretório `.next` usual.
- Navegador sobre o standalone: 31 verificações aprovadas. Incluem login real fictício, acesso direto às quatro áreas sem motor, gravação e persistência de decisão, importação CSV, troca de empresa preservando aba/mês, voltar/avançar/atualizar e downloads pelos botões da tela.
- Exportação: os cinco valores de ICMS do Excel baixado foram comparados com as células exibidas; CSV baixado e identificado. Os arquivos de amostra permanecem em `.local/sped-fiscal/apuracao-navegador.xlsx` e `.csv`.
- Interface: capturas conferidas em desktop, largura 390 e larguras equivalentes às escalas 125%, 150% e 200%, nos temas claro/escuro. A quarta aba foi alcançada com Tab e aberta com Enter na tela pequena. Sem exceções no navegador nessa execução.
- Referências de cálculo: amostra fictícia comparada com os módulos Python de origem, além das verificações de créditos, CFOP, ajustes, saldos, rateio anual e consolidação em TypeScript.

Resultados detalhados ficam em `.local/sped-fiscal/`: `testes-completos.json`, `testes-fiscal.log`, `build.log`, `validacao-migration.json`, `validacao-ui.json` e `capturas/`.

## Correção da abertura no ambiente local existente

O servidor da porta 3100 apresentou `P2021`: a tabela `sped_fiscal_roots` não
existia no banco local 3307. O laboratório 3127/33381 havia sido preparado
separadamente. Foram conferidas 0/11 tabelas antes da correção.

O novo `scripts/local/atualizar-sped-fiscal.mjs --aplicar` fez backup completo
com conferência SHA-256 e criou somente as 11 tabelas SPED. As contagens dos
registros existentes nas tabelas conferidas permaneceram iguais. Uma segunda
execução confirmou 11/11 sem aplicar novas alterações. Não houve recriação,
seed ou alteração de senha.

As quatro rotas em `http://localhost:3100/fiscal/sped/` foram consultadas com
login fictício configurado nesse ambiente; todas retornaram HTTP 200 e o
conteúdo das abas, sem o erro anterior. Evidência:
`.local/sped-fiscal/validacao-3100.json`. O script e a documentação local foram
conferidos com ESLint e `git diff --check`.

## Aceite e limites

O teste do motor é simulado: confere capacidade, upload, pacote imutável, hash, metadados de execução, repetição e retomada de resposta perdida. Não comprova geração, validação no PVA ou entrega real.

Kauan deve adaptar e homologar o motor pelo contrato, implantar a migration pelo fluxo autorizado, garantir persistência do volume privado e revisar os módulos habilitados. Homologação fiscal com as amostras autorizadas do escritório continua necessária.

Informações ausentes ou não recuperáveis de um TXT ficam pendentes. XMLs nos leiautes suportados e decisões explícitas completam a escrituração; cabeçalhos antigos do acervo sem itens aparecem para conferência. PDFs ficam como anexos. Não há extração automática, migração do acervo do motor ou teste de volume de produção nesta validação.
