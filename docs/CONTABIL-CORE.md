# Contábil Core no Connect

O **Contábil Core** é a ferramenta do time contábil que importa extratos bancários, classifica as transações em lançamentos (o motor **NEO**), concilia contas e gera o arquivo de importação do Domínio. Ele substituiu o antigo MrContador e está em uso.

Este documento é o plano da migração para o Connect: o que entra, em que ordem, como os dados de produção chegam e quais regras de código e de segurança valem durante o porte.

## Origem

| | Backend | Frontend |
|---|---|---|
| Repositório | `dev41tech/contabil-core`, `main` em `e074176` (26/10/2026) | `dev41tech/contabil-front`, `main` em `0dc56490` (26/10/2026) |
| Pilha | Python 3.12, FastAPI, SQLAlchemy assíncrono, PostgreSQL 16, Alembic (44 migrations) | React 18, Vite, react-query, shadcn |
| Tamanho | cerca de 49 mil linhas, 36 tabelas e 1.450 testes | 19 telas, cerca de 18 mil linhas |
| Deploy | EasyPanel: API na porta 3012 e front com nginx na porta 3013 | |

Os dois repositórios ficam **congelados para funcionalidade nova** a partir da Fase 1. Correção de bug urgente continua lá até a virada do bloco correspondente, e cada correção é repetida aqui.

## Decisões (Angelo, 06/11/2026)

1. **O NEO convive com o SPED Contábil.** As regras e os lançamentos do NEO ficam em tabelas próprias. Não se mexe em `ContabilRegra`, `ContabilConta` nem nas telas do `contabil_sped`.
2. **Os dados de produção são migrados.** O time já usa a ferramenta, e começar do zero prejudicaria o trabalho. Daí duas exigências:
   - preservar os identificadores (UUID);
   - calcular a chave contra duplicidade (`hash_dedup`) exatamente como o Python, para que um extrato já importado continue sendo reconhecido depois da migração.
3. **Os arquivos reais de teste vêm de todo o time.** Cada colaborador pode juntar extratos, Razões e SISPAGs numa pasta compartilhada, separada por banco e layout. A pasta fica fora do git. O repositório guarda só os resultados de referência, sem dado de cliente.

## Blocos e virada

O time não consegue importar o extrato num sistema e classificar no outro, porque o NEO lê as transações. Por isso a passagem acontece por **blocos**, cada um com uma virada e uma carga de dados. Enquanto o bloco não está completo, o módulo vai para a produção **desligado** (`defaultEnabled: false`) e o time continua no Contábil Core.

| Bloco | O que contém | Virada |
|---|---|---|
| **A: núcleo** | cadastros (empresas, plano de contas, agências, contrapartes), extrato, importações, Regras, NEO, registros e exportação para o Domínio | numa vez só, com a carga das tabelas do bloco |
| **B: conciliação** | conciliação bancária (Razão × extrato, SISPAG), revisões manuais e financeiro | depois do A |
| **C: documentos** | notas fiscais, comprovantes e cartões | junto com o A ou depois dele |
| **D: independentes** | ConcilPro, Open Banking, aplicações financeiras, relatórios e painel | cada um por conta própria |

### Fases do Bloco A

Cada fase tem sua branch e seu PR. Uma fase que começa antes do merge da anterior nasce da branch anterior.

| Fase | Branch | O que entra |
|---|---|---|
| 1 | `feat/contabil-core-nucleo` | Este plano. Tabelas do bloco, registro do módulo, motores puros com testes-gabarito: texto, documento no histórico, contraparte por nome, valor confiável, OFX, chave de duplicidade, seleção de regra e projeção do Domínio. |
| 2 | `feat/contabil-core-telas` | Serviços no servidor (Prisma): cadastros, importação OFX com lote e conferência de saldo, NEO (regra, contraparte, decisão, manual, cancelar, devolver ao automático) e exportação. Telas: Importações, Extrato, NEO, Regras, Contrapartes, Registros e Configurações. |
| 3 | `feat/contabil-core-neo` | Restante do NEO: reclassificação, composição manual (ADR-017), fila agrupada por padrão, simulação e sugestão de regra pela seleção, classificar criando a regra, criar regra e aplicar. |
| 3b | `feat/contabil-core-cadastros` | Importação por planilha: regras (modelo de seis colunas) e contrapartes (relações fiscais, ADR-016) com prévia e confirmação, e plano de contas direto, como no original. Ver "Fase 3b". |
| 4 | `feat/contabil-core-extratos` | Extrato em PDF: o texto extraído como o pdfplumber, os 22 leitores por banco, o leitor genérico, o período e as conferências de saldo, e a importação de PDF. Ver "Fase 4". |
| 4b | `feat/contabil-core-planilhas` | Extrato em planilha (`planilha_parser.py`): leitores próprios de .xlsx, .xls (BIFF8) e .csv, e a importação. Ver "Fase 4b". |
| 5 | `feat/contabil-core-carga` | Carga dos dados do Contábil Core como espelho (cópia de mão única que pode ser repetida), com conferência e ensaio local. Ver "Carga dos dados". |

## Bloco B: conciliação bancária contábil

### Decisões (Angelo, 11/11/2026)

- A conciliação Razão × extrato vira uma **aba do módulo Contábil Core**: a mesma empresa, as mesmas contas bancárias e os mesmos extratos. O módulo "Conciliação" que o Connect já tem é a do financeiro do BPO (contas a pagar e receber contra o banco) e continua separado.
- Do ConcilPro entra agora **só o leitor de Razão em planilha** (`concilpro/planilha.py`), que a leitura do Razão de uma conta banco reaproveita. O ConcilPro inteiro (Razão de fornecedores, IA, consolidação) fica para o Bloco D.

### O que o original faz

- **Só relata.** Nenhum lançamento é criado, estornado ou marcado: a análise e os ajustes ficam com o contador.
- **Três conferências antes de cruzar:** o CNPJ do Razão é o da empresa; a conta do Razão é a conta contábil vinculada à conta bancária; o extrato importado cobre o período do Razão (senão, aviso).
- **Cruzamento em camadas:** mesmo dia e valor; mesmo valor em outro dia (até N dias); agrupado (vários de um lado somam um do outro); lote do SISPAG; lote do dia; duplicidade; valor divergente; o que sobra só no Razão ou só no extrato. Dentro do mesmo dia e valor, o par é decidido pela semelhança do histórico.
- **SISPAG:** a consulta de pagamentos do Itaú compõe a linha "Sispag Fornecedores" do extrato (o banco junta por dia e por tipo).
- **Extrato detalhado do Itaú:** o extrato com favorecido e CPF/CNPJ por linha, com o saldo de cada dia conferido.
- **Revisão manual e financeiro:** decisões e vínculos salvos com versão (contra decisões concorrentes) e a conferência de documentos do financeiro (relatório financeiro, Omie, contas a pagar e receber), sempre como evidência, nunca como lançamento.

### Fases do Bloco B

| Fase | Branch | O que entra |
|---|---|---|
| B1 | `feat/contabil-core-conciliacao-motores` | Motores puros com gabarito: leitores do Razão (planilha e PDF) e do Razão de apoio, SISPAG, extrato detalhado, cruzamento e composição dos lotes do SISPAG. Sem tela e sem migration. |
| B2 | `feat/contabil-core-conciliacao-tela` | Conciliação de ponta a ponta: as três conferências, a aba "Conciliação" e o relatório em planilha. |
| B3 | — | Revisão manual salva (decisões e vínculos com versão). Migration. |
| B4 | — | Conferência do financeiro: documentos, análises salvas e sugestões. Migration. |
| B5 | — | As tabelas do Bloco B na carga (espelho). |

### Fase B1: os motores

Em `src/lib/contabil-core/conciliacao/`, sem tela, sem banco e sem migration:

| Arquivo | Porte de |
|---|---|
| `razao.ts`, `razaoPdf.ts`, `razaoXlsx.ts`, `razaoTipos.ts` | `conciliacao_bancaria/razao.py`: o Razão de uma conta banco (planilha ou PDF), com o total conferido |
| `razaoPlanilha.ts` | `concilpro/planilha.py` (e as três funções de `parser.py` que ele usa): o leitor do ConcilPro |
| `apoio.ts`, `folhas.ts` | `conciliacao_bancaria/apoio.py`: o Razão auxiliar de outras contas e a leitura das folhas com limites, usada também pelos dois seguintes |
| `sispag.ts` | a consulta de pagamentos do SISPAG (Itaú) |
| `extratoDetalhado.ts` | o extrato detalhado do Itaú, com o saldo de cada dia conferido |
| `cruzamento.ts` | `cruzamento.py`: as camadas do cruzamento Razão × extrato |
| `composicao.ts` | a composição das linhas "Sispag" do extrato e as parcelas iguais |

Os gabaritos foram gerados por `gabarito_razao.py`, `gabarito_sispag.py` e `gabarito_cruzamento.py`. Cada um é um plugin do pytest: grava cada chamada da suíte do original e acrescenta milhares de casos inventados. Ao todo são 7.341 chamadas, todas iguais no porte:

- 852 nos leitores de Razão;
- 462 no SISPAG e no extrato detalhado;
- 6.027 no cruzamento e na composição.

Nomes com cara de reais foram trocados por fictícios, inclusive dentro dos bytes das planilhas. Conferência com arquivos reais (só contagens, nada no git):

- 6 Razões em planilha;
- 6 consultas SISPAG;
- 1 extrato detalhado com 5.060 movimentos.

Todos saíram iguais ao original, inclusive nas recusas.

Divergências do B1, todas fora do caminho normal:

- **Leitura:**
  - Os leitores de Razão são assíncronos e recebem de fora o leitor de PDF (`razaoPdf.ts`, só no servidor). Se o PDF não abre, a mensagem é a do pdf.js, com o mesmo prefixo do original.
  - As planilhas são lidas de uma vez, não folha a folha. Muda só qual frase aparece quando duas folhas têm defeitos diferentes.
  - XML malformado de forma incomum dentro do .xlsx pode ser lido, enquanto o openpyxl recusaria.
  - Chartsheets não contam no limite de 32 folhas.
- **Valores:**
  - O texto "NaN" numa célula de valor é tratado como ilegível, porque o `Dec` não representa NaN.
  - Somas acima de 28 dígitos ficam exatas; o `Decimal` do Python arredondaria.
- **Cruzamento:**
  - O `IGNORECASE` do Python casa "I" com "ı" e "İ". Os padrões trazem essas letras de forma explícita.
  - As chaves por valor usam o valor normalizado ("10.0" e "10.00" são a mesma chave, como no Python).

### Fase B2: a conciliação de ponta a ponta

| Onde | Porte de |
|---|---|
| `conciliacao/servico.ts` (puro) | `conciliar_razao_extrato` (`service.py`) depois das leituras: as conferências, os avisos, o cruzamento, as composições, o resumo e o "por dia" |
| `servidor/conciliacao.ts` | as leituras do mesmo serviço: empresa do tenant, conta bancária, conta contábil vinculada e o extrato do período. Só lê |
| `conciliacao/relatorio.ts` | `schemas/conciliacao_bancaria.py`, com `relatorioParaJson` (o dinheiro vai como o texto do `Decimal`) |
| `conciliacao/planilhaDoRelatorio.ts` | `exportar.py`: as folhas Resumo, Pendências, Por dia e Aplicação não conferida |
| `api/contabil-core/conciliacao` | `POST /razao-extrato` (JSON ou planilha), com o limite de 25 MB por arquivo e a auditoria `contabil.core.conciliacao.gerada` |
| aba "Conciliação" (`Conciliacao.tsx`, `telaDaConciliacao.ts`) | `RazaoExtratoTab.tsx`, sem a revisão manual (B3) |

- **Só leitura:** nada é gravado, nem o arquivo nem o relatório. A aba aparece para quem pode operar o módulo (`agir`).
- **Contas no seletor:** inclui as contas bancárias inativas, como o original, porque o Razão de uma conta encerrada continua conciliável.
- **Gabarito:** `gabarito_servico_conciliacao.py` grava as chamadas da suíte do original e acrescenta casos dirigidos e sorteados, um por ramo. Ao todo, 247 relatórios ou recusas e 200 planilhas, todos iguais.
  - A planilha do original é lida de volta pelo openpyxl (valores, tipos, formatos, negrito, preenchimento, larguras, painel congelado e filtro) e comparada com a do porte.
  - O plugin confere que o banco falso montado a partir da entrada gravada dá o mesmo resultado que o banco de teste do original.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-conciliacao.ts` importa um OFX inventado e concilia um Razão inventado. Confere o caminho normal, cada recusa (empresa, conta contábil, conta bancária, período, mês sem extrato, outro tenant), o aviso de cobertura, a planilha e o extrato desfeito.

Divergências da B2:

- **Empresa de outro tenant:** é recusada antes de tudo. No original, a empresa não achada só pulava a conferência do CNPJ.
- **Ordem do extrato:** a ordem por data e `ordem` é feita no código, com a `ordem` vazia por último, como o PostgreSQL. No empate, desempata pelo id.
- **Escala dos valores:** o valor do extrato volta do MySQL sem os zeros à direita e é reescalado para 2 casas, como o PostgreSQL entregava.
- **Conta contábil vinculada:** é lida dentro do tenant e da empresa.
- **Somas da tela:** vêm prontas do servidor em decimal exato. O original somava no navegador com `Number()`.
- **Formato do dinheiro na tela:** é o `moedaDoRelatorio`, que mantém o sinal de valores entre -1 e 0 ("R$ -0,50"). O `reais` do motor perde esse sinal. Os avisos continuam com o `reais` do serviço, conferido pelo gabarito.

## Arquitetura no Connect

### Módulo

- **Código:** `contabil_core`, setor `contabil`.
- **Rótulo:** "Contábil Core", o nome que o time já conhece. A rota é `/contabil-core` e as abas ficam dentro dela.
- **Registro:** nos mesmos pontos do `contabil_revisao`:
  - `src/lib/module-catalog.ts`;
  - `gruposDaEquipe.ts`;
  - `modulo.contrato.test.ts`;
  - exclusão da empresa (`src/lib/exclusao`);
  - frases da auditoria;
  - ajuda.
- **Acesso:** `abrirTelaDoModulo("contabil_core")` em toda página e `podeNoModulo(ctx, "contabil_core", …)` em toda ação:

| O que a pessoa faz | Nível exigido |
|---|---|
| Ler | `ver` |
| Importar, classificar, cadastrar regra e exportar | `agir` |
| Excluir em massa, desfazer importação de outra pessoa, configurar o plano de contas | `gerir` |

  O par "módulos × papel" do Contábil Core (`permissoes.modulos` e `papel`) **não é migrado**: no Connect, quem decide é o papel e o setor. A conversão de cada pessoa fica registrada na Fase 5.

### Pastas

| Pasta | Conteúdo |
|---|---|
| `src/lib/contabil-core/motor/` | Funções puras portadas do Python, sem banco nem rede. Cada arquivo diz de qual arquivo Python veio. |
| `src/lib/contabil-core/motor/gabarito/` | Saídas geradas pelo Python original (`scripts/contabil-core/gerar-gabarito.py`). |
| `src/lib/contabil-core/servidor/` (Fase 2) | Consultas e gravações com Prisma, todas com `import "server-only"`. |
| `src/app/(app)/contabil-core/` | Páginas e ações (Fase 2). |
| `src/components/contabil-core/` | Componentes de tela (Fase 2). |

### O que vem do Connect, e não é portado

| No Contábil Core | No Connect |
|---|---|
| login com JWT em cookie, CSRF, refresh token | sessão do Connect |
| `usuarios`, `permissoes`, papéis | `User`, papéis e setores |
| `audit_logs` | `logAudit` / `AuditLog` |
| `tenants` | `Tenant` |
| `empresas` | `Company`, ligada pela tabela `core_empresas` (ver abaixo) |
| OpenAI chamada direto | `src/lib/ia` (chave por escritório, teto de gasto e uso registrado), a partir do Bloco C |
| jobs em `BackgroundTasks` com heartbeat | o mesmo padrão de fila em tabela do Connect, quando a Fase 2 precisar |

## Modelo de dados

Todas as tabelas novas têm prefixo `core_` e `tenantId`. Nenhuma tabela existente é alterada.

| Tabela no Connect | Origem | Observação |
|---|---|---|
| `core_empresas` | `empresas` | `id` = UUID original e `companyId` → `Company`. A chave de duplicidade usa este `id`, então ele **não pode** ser o id do `Company`. |
| `core_plano_contas` | `plano_contas` | hierarquia por `paiId`; `contaNumero` é o código reduzido que vai para o Domínio |
| `core_plano_faixas` | `plano_contas_faixas_tipo` | |
| `core_agencias` | `agencias_bancarias` | `contaContabilId` único |
| `core_contrapartes` | `contrapartes` | `dadosCadastrais` em JSON |
| `core_regras` | `regras` | |
| `core_importacoes` | `extrato_importacoes` | lote do arquivo, saldo declarado e alerta |
| `core_transacoes` | `transacoes` | |
| `core_registros` | `registros_contabeis` | duas pernas por lançamento (`lancamentoId`) |
| `core_neo_decisoes` | `neo_decisoes` | |
| `core_exportacoes` | `export_jobs` | histórico do que foi exportado |

**Tipos:**
- **Identificadores:** VARCHAR(191) com o UUID em minúsculas e com hífens, igual ao `str(uuid)` do Python.
- **Dinheiro:** `Decimal(15,2)`, como na origem. O motor calcula em centavos inteiros e nunca em ponto flutuante.
- **Data do lançamento:** `@db.Date`. Instantes ficam em `DATETIME(3)` UTC.
- **Enums do PostgreSQL:** viram `VARCHAR`, com o conjunto de valores validado no código. Assim, valor novo não exige migration.
- **Chaves estrangeiras:**
  - Só `core_empresas` aponta para `tenants` e `companies`. Nas outras tabelas, `tenantId` é coluna com índice, e o vínculo com o tenant passa pela empresa. Assim o modelo `Tenant`, que todo módulo edita, não ganha onze relações novas.
  - Entre as tabelas `core_*` não há cascata, como na origem.
  - A exclusão da empresa no Connect (`src/lib/exclusao/empresa.ts`) apaga de baixo para cima. Antes de apagar o plano de contas, ela solta a hierarquia (`paiId`), porque o MySQL confere a chave linha a linha.
- **Pessoas (`…PorId`):** são ids de `User` sem chave estrangeira, como no resto do Connect. Ficam registradas como trilha em `src/lib/exclusao/registro.ts`.

### Unicidade "só entre as linhas vivas"

O PostgreSQL tem índices únicos parciais (`WHERE deleted_at IS NULL`); o MySQL não. Cada um vira uma coluna `chaveAtiva` (ou nome equivalente) com índice único:
- enquanto a linha está viva, a coluna guarda a chave;
- quando a linha é apagada ou desativada, a coluna fica nula.

No MySQL, nulos não colidem num índice único.

| Índice no PostgreSQL | No Connect |
|---|---|
| `uq_transacao_empresa_hash_ativo` | `core_transacoes (empresaId, hashAtivo)` |
| `uq_plano_empresa_codigo_ativo` | `core_plano_contas (empresaId, codigoAtivo)` |
| `uq_regra_…_ativa` e `uq_regra_…_global` | `core_regras (empresaId, chaveAtiva)`; a agência, ou `*` para a regra global, entra na chave junto com `historico_normalizado` |
| `uq_contraparte_empresa_documento_tipo_ativa` | `core_contrapartes (empresaId, chaveAtiva)` |
| `uq_agencia_empresa_banco_agencia_numero` (único total) | `core_agencias (empresaId, chave)` |
| `uq_registro_transacao_lancamento_dc_ativo` | `core_registros (transacaoId, chaveAtiva)` |
| `uq_registro_transacao_dc_padrao_ativo` | `core_registros (transacaoId, chavePadraoAtiva)` |
| `uq_neo_sem_regra_transacao` | `core_neo_decisoes (transacaoSemRegra)` |

**Chave com texto livre vira SHA-256.** A collation do Connect (`utf8mb4_unicode_ci`) ignora acento e maiúscula. Sem o hash, "TARIFÁ" e "tarifa", ou o código "1.1.B.x" e "1.1.b.X", colidiriam no MySQL e não no PostgreSQL, e a carga recusaria dado que a produção aceitou. Com o hash, a igualdade é byte a byte, como no original.

As colunas são calculadas por funções de `src/lib/contabil-core/motor/chaves.ts`, uma por índice, testadas em `chaves.test.ts`. Gravar nessas tabelas sem passar por elas é erro de revisão.

**Ensaio no MySQL:** `scripts/contabil-core/ensaio-banco.ts` roda num banco local e confere três coisas:
- cada coluna recusa o duplicado vivo;
- o mesmo valor volta a entrar depois do soft delete;
- a exclusão da empresa apaga tudo sem esbarrar em chave.

O comando é `node scripts/local/com-banco-local.mjs npx tsx scripts/contabil-core/ensaio-banco.ts`.

## Fidelidade do porte

O padrão é o mesmo do SPED Generator, do Tributário e da Revisão contábil: **porte fiel com teste-gabarito**.
- `scripts/contabil-core/gerar-gabarito.py` importa as funções do repositório original, roda um conjunto de entradas e grava as saídas em JSON.
- O teste em TypeScript compara cada saída.
- Quando uma função Python está num arquivo que depende de banco (por exemplo, `_calcular_hash` em `extrato/service.py`), o script extrai só aquela função pelo código-fonte (`ast`), para testar o original e não uma cópia.

### Comportamentos do Python que mudam o resultado

- **Chave de duplicidade:** `sha256(json.dumps({...}, sort_keys=True))`. Os separadores são `", "` e `": "`, e o `ensure_ascii` escapa todo caractere fora do ASCII como `\uXXXX`, com par substituto. O `JSON.stringify` não faz nada disso, e o Connect tem a própria função (`jsonPython`).
- **Texto:**
  - `\d` do `re` aceita dígito Unicode;
  - `str.split()` corta em mais espaços que `\s`;
  - `len()` conta caractere, não unidade UTF-16;
  - `unicodedata.normalize("NFKD")` mais `combining` remove acento.
  - Para isso se reaproveita `src/lib/revisao-contabil/motor/py.ts`.
- **Ordem das regras:** `ORDER BY agencia_id IS NULL, length(historico) DESC, id`.
  - O `length` do PostgreSQL conta caractere; o `LENGTH` do MySQL conta byte.
  - Por isso a ordenação é feita no TypeScript, nunca no SQL.
- **Dinheiro:** comparação exata em centavos. O `Decimal` do Python não arredonda em silêncio, e o motor também não pode arredondar.

### Divergências deliberadas

Toda divergência entra aqui, com o porquê.

1. A exportação do Domínio ordenava só por `data_lancamento`. Com datas iguais, a ordem dependia do PostgreSQL. Aqui ela desempata por `createdAt` e `id`, para que dois cliques gerem o mesmo arquivo.
2. **Confirmação da conta do extrato.** No original, quando o arquivo não diz todos os dados da conta, a confirmação era um token assinado (HMAC) emitido numa chamada de validação. Aqui a mesma recusa volta para a tela, e a pessoa reenvia o mesmo arquivo com a confirmação explícita. A importação fica na auditoria como `contabil.core.extrato.importado_com_confirmacao`.
3. **Auditoria da classificação manual.** O original grava uma linha por transação. Aqui vai uma linha por lote (até 200), com os ids das transações nos detalhes.
4. **Textos que passariam de 500 caracteres** (a descrição "Contrapartida bancária: …" de uma regra longa) são cortados. No PostgreSQL a gravação falhava, e a transação ia para "erro".
5. **Notas fiscais e comprovantes** chegam com o Bloco C. Até lá, a contraparte é resolvida pelo documento e pelo nome no histórico, que é o caminho do original quando não há nota nem comprovante candidato.
6. **Cancelamento e "devolver ao automático"** entraram já na Fase 2, porque desfazer uma importação depende deles.
7. **Classificar criando a regra da seleção.** No original, tudo acontecia numa transação de banco: se o cadastro da regra falhasse, a classificação do lote também voltava. Aqui cada transação classificada é a sua, então a regra é conferida antes de qualquer gravação: seleção de um lado só e padrão ainda livre. Se outra pessoa cadastrar o mesmo padrão nesse intervalo, as transações ficam classificadas e a tela avisa que a regra não foi criada.
8. **A fila agrupada** considera as pendências que o NEO já viu (com decisão `sem_regra`), como o original. Na tela, o grupo marca só as pendências que estão listadas (as 500 primeiras da seleção).
9. **Leitura por IA (Fase 4).** O original tem duas camadas depois dos leitores: o texto do PDF enviado ao GPT, quando nenhum leitor reconhece o banco, e a imagem de cada página enviada ao Vision, quando o PDF não tem texto. Elas não vêm: o PDF que só elas leriam é recusado com uma frase que manda importar o OFX. Se o time sentir falta, entram pelo `src/lib/ia`, com o consentimento por escritório.
10. **Falha inesperada de um leitor (Fase 4).** Os leitores reproduzem o original até nos tropeços (o Cresol, por exemplo, lança `IndexError` quando a última linha do arquivo é um lançamento sem descrição). No original o job falhava com o erro cru; aqui vira recusa com a frase "O leitor do … não conseguiu ler este arquivo".
11. **Conferência da conta no PDF (Fase 4).** O original lê o topo de cada página com o PyMuPDF; aqui vem do mesmo texto dos leitores, recortado na mesma altura (230 pontos ou 32% da página). As linhas podem sair agrupadas de outro jeito, mas o que se procura são os rótulos "Agência", "Conta" e o nome do banco.
12. **Comprovante da prévia (Fase 3b).** O original usa um JWT de 15 minutos; aqui é um HMAC com o segredo do Connect derivado para este uso (`servidor/previa.ts`), que amarra também o escritório. A confirmação recebe o arquivo de novo e refaz a análise dentro da trava; a recusa de comprovante de outra pessoa ou empresa usa uma frase só.
13. **O que no original virava erro 500 (Fase 3b)** agora é recusa com frase: `.xls` com o arquivo composto corrompido, CSV do plano com `\r` solto, número de conta infinito ou acima do inteiro do banco.
14. **Importação do plano de contas (Fase 3b).** As contas novas são gravadas numa transação só, já com o pai, em vez de um savepoint por conta: um erro inesperado do banco desfaz a importação inteira, e não só a linha. A falha por linha que o original conhecia (número acima do inteiro) é conferida antes. "A conta tem lançamentos" conta os registros do NEO; as transações de cartão, que o original também olhava, ainda não existem no Connect.

## Segurança e boas práticas

### Acesso e isolamento

- Toda consulta filtra por `tenantId` do contexto **e** pela `core_empresa` do mesmo tenant. Um id vindo do navegador nunca é usado sem essa conferência.
- Página sem `abrirTelaDoModulo` e ação sem `podeNoModulo` não passam no `modulo.contrato.test.ts`.
- Ação de escrita que recebe id confere se o registro pertence à empresa antes de qualquer outra coisa. A mensagem é a mesma para "não existe" e "não é seu".

### Entrada

- Toda ação valida a entrada com zod: tipos, tamanhos (os mesmos `VARCHAR` do banco), `D`/`C`, `AAAA-MM` e UUID.
- Texto livre é cortado no tamanho da coluna, como o Python fazia com `[:500]`, e não estoura no banco.
- **Uploads:**
  - limite de tamanho no servidor, contado nos bytes lidos e não só no `Content-Length`;
  - tipo conferido pelo conteúdo, e não pela extensão;
  - o extrato **não é guardado**: só o SHA-256, como na origem. É minimização de dado bancário de cliente.
- O OFX é lido sem `eval` e sem parser XML com entidades externas. A leitura por regex da origem é mantida, e o XML do OFX 2.x usa um parser sem resolução de entidade.

### Saída

- CSV, TXT e XLSX neutralizam fórmula, prefixando `'` em texto que começa com `=`, `+`, `-` ou `@`. É a `_celula_segura` da origem.
- Erros chegam ao usuário em frase de contador, sem pilha nem SQL. O detalhe técnico fica no log do servidor.
- **Logs:**
  - nunca levam histórico bancário completo, CNPJ/CPF de contraparte, saldo, token nem chave;
  - levam ids e contagens.

### Integridade contábil

- Cada passo que grava (importar um lote, classificar uma transação, cancelar) roda numa transação do banco. Se falhar no meio, não fica partida sem par nem transação sem lançamento.
- A concorrência (dois contadores classificando a mesma fila) é tratada com trava de linha (`SELECT … FOR UPDATE` via `$queryRaw` parametrizado) ou com versão otimista. Fica decidido por caso na Fase 2, sempre com teste.
- Nenhum valor é fabricado para fechar total (ADR-013 da origem). Valor suspeito vai para quarentena, não para o razão.
- **Auditoria:** toda mutação relevante gera `logAudit` com antes e depois (importar, desfazer importação, criar, editar ou desativar regra, classificar manualmente, exportar).

### Código

- TypeScript estrito, sem `any`. Funções puras no `motor/`, banco só em `servidor/`.
- `$queryRaw` só com parâmetros (template tag). Nunca `$queryRawUnsafe` com texto do usuário.
- Cada arquivo portado cita a origem (`arquivo.py:linha`) e mantém os comentários de "por quê" que explicam decisões do time contábil.
- O CI do PR roda `tsc`, `eslint .`, `npm test` e `npm run build`. Nada entra sem os quatro verdes.

### Dados reais e segredos

- **Nenhum arquivo de cliente no git:** nem extrato, nem planilha, nem dump. Os gabaritos são gerados com dados fictícios, ou anonimizados antes de gravar.
- **A carga (Fase 5):**
  - lê a produção com um usuário **somente leitura** (`scripts/contabil-core/usuario-somente-leitura.sql`), numa transação `READ ONLY`;
  - recebe a conexão por variável de ambiente, nunca por argumento ou arquivo versionado;
  - não imprime credencial nem dado de cliente no terminal.

## Carga dos dados (Fase 5)

### Decisões (Angelo, 10/11/2026)

- O Connect contábil entra em vigor provavelmente em 2027. Até lá o time segue no Contábil Core, e a virada acontece **uma vez só, com todos os blocos**. Não há uso real do Connect contábil antes disso, então não há dado criado lá para conciliar com a carga.
- Por isso a carga agora é um **espelho**: cópia de mão única, Contábil Core → Connect, que pode ser repetida. Serve para validar o porte com os dados reais. Na virada, ela roda uma última vez, já com as tabelas dos outros blocos.
- A carga lê **direto do PostgreSQL** do original, com usuário somente leitura (`scripts/contabil-core/usuario-somente-leitura.sql`) e a conexão por variável de ambiente. O pacote `pg` é dependência de desenvolvimento, só do script.

### Como funciona (`scripts/contabil-core/carga.ts`, `src/lib/contabil-core/carga/mapear.ts`)

- **Ordem:** empresa → plano de contas (sem o pai; o pai numa segunda passada) → faixas → agências → contrapartes → regras → importações → transações → decisões do NEO → partidas → exportações.
- **Idempotente:** cada linha entra com o UUID do original (`upsert`). Rodar de novo atualiza o espelho, sem duplicar. O que alguém editar no Connect numa empresa espelhada é sobrescrito na rodada seguinte.
- **Retrato consistente:** a leitura é uma transação `REPEATABLE READ READ ONLY` no original.
- **Empresas:** ligadas à `Company` do escritório de destino (`CARGA_TENANT_ID`) pelos dígitos do CNPJ. Empresa sem par, com mais de um par, ou já ligada no Contábil Core do Connect com outro cadastro fica de fora e vai para o relatório.
- **Pessoas:** "criado por", "cancelado por" e similares são ligados ao `User` pelo e-mail; sem par, ficam nulos e vão para o relatório.
- **Colunas de unicidade** (`codigoAtivo`, `chaveAtiva`, `hashAtivo`, `chave`, `transacaoSemRegra`…): calculadas pelas mesmas funções que o Connect usa ao gravar (`motor/chaves.ts`).
- **Recusa por linha:** um lote de 200 que o banco recusa é refeito linha a linha, e só a linha que bateu fica de fora, nomeada no relatório.
- **Saída:** o terminal mostra contagens e o CNPJ mascarado; o que identifica empresa ou pessoa vai para o relatório, um arquivo local (por padrão na pasta temporária) que não vai para o git.
- **Fica para a virada:** o `audit_logs` do original (`contabil.core.legado.*`) e as tabelas dos Blocos B, C e D.
- **Limite do espelho:** linha apagada de verdade no original (não por `deleted_at`) continua no Connect. O original apaga por `deleted_at` em quase tudo.

### Conferência (`scripts/contabil-core/conferir-carga.ts`)

Só lê, dos dois lados, para cada empresa espelhada:

- contagem por tabela (total e vivas);
- soma por mês e lado (D/C) das transações vivas e das partidas vigentes;
- com `--dominio=<pasta>`, o TXT do Domínio que o Connect gera, comparado byte a byte com o baixado do Contábil Core (Exportar › Lançamentos para importação, TXT), nomeado `<CNPJ>_<AAAA-MM>.txt`.

A ideia do plano de recalcular a chave de duplicidade não se sustenta: o original não guarda o `fitid` da transação, só o hash. A carga copia o hash como está, e é ele que barra o mesmo extrato reimportado depois da virada.

### Como rodar

```
# na produção (Kauan): o usuário somente leitura no PostgreSQL do original (usuario-somente-leitura.sql), depois
export CARGA_ORIGEM_URL=postgres://contabil_carga_leitura:...@host:porta/banco   # CARGA_ORIGEM_SSL=1 se for por TLS
export CARGA_TENANT_ID=<id do escritório no Connect>
npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/carga.ts                       # simula
npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/carga.ts --gravar              # grava
npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/conferir-carga.ts [--dominio=<pasta>]
```

### Ensaio local

1. Um PostgreSQL local para o original (porta 5435) e as migrations dele (`alembic upgrade head`).
2. `scripts/contabil-core/povoar_core_local.py`: dados **inventados** pelos serviços do próprio original (importar OFX, NEO, classificação manual, cancelamento, reclassificação, composição, desfazer importação e exportação). Grava o TXT do Domínio de cada empresa e mês, que é o gabarito da conferência. Uma empresa tem par no Connect; a outra não, de propósito.
3. `scripts/contabil-core/preparar-ensaio-carga.ts`: cria no Connect local a empresa com par.
4. A carga (simular e gravar duas vezes) e a conferência.

Resultado em 10/11/2026: tudo igual ao original, inclusive o TXT do Domínio byte a byte; a segunda rodada não duplicou nem recusou nada.

## Como testar localmente (Fase 2)

Pré-requisito: o banco local, montado pelas migrations e com o seed (ver `scripts/local/README.md`).

1. **Ensaios no banco.** Os dois scripts criam e apagam tudo:
   - `ensaio-banco.ts`: chaves de unicidade e exclusão da empresa;
   - `ensaio-servicos.ts`: ponta a ponta (cadastros, OFX, NEO, manual, Domínio, desfazer e reimportar; e, desde a Fase 3, reclassificar, compor, simular, agrupar e classificar criando a regra).

   ```
   node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-servicos.ts
   ```

   O `sem-server-only.cjs` deixa importar os serviços (`import "server-only"`) fora do Next.
2. **Demonstração.** `preparar-demo-local.ts` liga o módulo no escritório do seed e cria a "Padaria Modelo Teste" com plano, conta, regras, contrapartes e um OFX de janeiro/2026. Rodar de novo volta tudo para pendente.
3. **Telas.** Com o app no ar (`node scripts/local/com-banco-local.mjs npx next dev -p 3102`), `node scripts/contabil-core/telas-local.mjs <pasta> 3102` passeia pelas abas com o navegador. O roteiro roda o NEO, classifica à mão, baixa o TXT do Domínio, confere as linhas e guarda as capturas.

## Corpus de arquivos reais (Fase 4)

- **Pasta compartilhada:** fora do git, separada por `banco/layout/`. Qualquer colaborador pode acrescentar arquivos.
- **Regra para começar um banco:** pelo menos um arquivo real de cada layout desse banco, junto com o resultado do Contábil Core para o mesmo arquivo (as transações importadas). É o gabarito daquele banco.
- **Teste local:** um script lê a pasta e compara o TypeScript com o gabarito. Ele não entra na suíte do CI, porque o CI não tem os arquivos. A suíte usa só os casos sintéticos.

## Fase 4: extrato em PDF

### O texto do PDF

Os leitores do original dependem do texto exato do pdfplumber: um espaço a mais ou uma linha juntada muda o que a regex encontra. O `textContent` do pdf.js não serve, porque entrega pedaços já juntados; medido em 11 extratos reais, 97% a 100% das linhas batiam, e no BB, que é lido caractere a caractere, só metade.

Por isso a extração tem duas partes:

| Arquivo | O que faz |
|---|---|
| `src/lib/contabil-core/pdf/caracteres.ts` | Interpreta os operadores de texto de cada página (pdf.js, pacote `unpdf`) com as contas do pdfminer: matriz do texto × CTM, largura × tamanho × escala, Tc, Tw, TJ, `q`/`Q` guardando também o estado do texto, formulário com estado novo, página girada e a descida AFM das fontes padrão. |
| `src/lib/contabil-core/pdf/plumber.ts` | O agrupamento do pdfplumber 0.11: linhas por `top` com 3 pontos de tolerância, palavras por distância, ligaduras, texto girado, e o `extract_text` (palavras na ordem em que saem, linhas por vizinhança). |

Medido nos mesmos 11 extratos: 10 saem idênticos, página a página e palavra a palavra, em 0,03 a 0,3 s cada. A posição difere da do pdfminer em menos de 0,0001 ponto, porque o pdf.js guarda a matriz em precisão simples.

### Os leitores

`src/lib/contabil-core/extrato/`: `comum.ts` (`_comum.py`), `periodo.ts`, `leitura.ts` (leitor genérico, conferências de saldo e recusas), `leitores/` (os 22 bancos, na ordem do original) e `pdf.ts` (o fluxo do `parse_pdf`: leitor do banco, depois o genérico).

O teste-gabarito (`extrato/gabarito.test.ts`) repete 581 chamadas gravadas da suíte Python original por `scripts/contabil-core/gabarito_extrato.py`, um plugin do pytest. Os poucos CNPJs e nomes com cara de reais nos dados dos testes são trocados por fictícios, e a chamada é repetida com a entrada trocada. O agrupamento do pdfplumber tem gabarito próprio (`gabarito_plumber.py`), e o intérprete é testado num PDF inventado gerado pelo PyMuPDF (`gabarito_pdf_ficticio.py`).

### Comparação com os extratos reais

`scripts/contabil-core/corpus_extratos.py` grava o que o original lê de cada PDF; `corpus-extratos.ts` lê os mesmos arquivos com o porte e compara transação a transação, inclusive o `fitid`, que entra na chave de duplicidade. Na primeira rodada (10/11/2026), com 11 extratos do escritório:

- 9 idênticos: BB, Bradesco, três do Itaú, Cresol, Grafeno e Santander (cerca de 5.700 lançamentos), e um recusado com a mesma frase;
- um Bradesco formado por dois PDFs colados no mesmo arquivo: o pdfminer lê a primeira cópia e o pdf.js a segunda, que tem o cabeçalho da empresa em cada página. O leitor do Bradesco faz o mesmo nos dois; muda só a cópia lida;
- uma página sem texto: o original iria para a leitura por imagem (divergência 9).

Os arquivos ficam fora do git. Para rodar de novo, ver o cabeçalho dos dois scripts.

## Fase 4b: extrato em planilha

O leitor é o `planilha_parser.py`: acha as colunas pelo cabeçalho (Data, Histórico, Crédito, Débito, Valor, Saldo, Razão social, CPF/CNPJ), separa as seções por `SALDO ANTERIOR`, desvira a planilha decrescente, corrige pelo saldo o sinal do valor impresso sem sinal e descarta a linha que não move o saldo. O resultado passa pela mesma cadeia de saldos do PDF. Porte em `src/lib/contabil-core/extrato/planilha.ts`.

### O tipo de cada célula importa

O original faz `Decimal(str(valor))` e põe `str(celula)` no histórico, e o `fitid` é o hash de `str(valor)`. O openpyxl devolve "1500" como `int` e o xlrd devolve todo número como `float` ("1500.0"). Um porte que tratasse todo número do mesmo jeito mudaria o `fitid` e, com ele, a chave de duplicidade dos dados migrados. Por isso cada leitor devolve o tipo que a biblioteca do original devolveria (`planilha/celula.ts`), e `strPy` escreve como o `str()` do Python.

| Arquivo | O que reproduz |
|---|---|
| `planilha/xlsx.ts` | O openpyxl em `read_only` + `data_only`: a primeira folha, `int`/`float` pelo texto do número, data pelo formato do estilo (`is_date_format`), hora e duração, linhas que faltam no XML. Zip pelo `fflate`, com teto de descompressão. |
| `planilha/xls.ts` | O xlrd (decisão do Angelo, 10/11/2026: leitor próprio, sem biblioteca nova): arquivo composto OLE2, BIFF8, textos compartilhados com CONTINUE, RK/MULRK, fórmula com valor guardado e a classificação de data pelo formato. |
| `planilha/csv.ts` | UTF-8 com ou sem BOM e latin-1; o `csv.Sniffer` do Python (entre ";", "," e tabulação) e a máquina de estados do leitor do `_csv.c`. |

O leitor de `.xls` serve também à Fase 3b (relatórios de clientes e fornecedores do sistema fiscal).

### Conferência da conta

Como no original: as linhas antes do cabeçalho da tabela (até 80) ou, no CSV, o texto antes da linha que começa com "data;". Aqui vale a primeira folha, que é a que o leitor do extrato lê (o original olhava todas as folhas).

### Testes e comparação

O gabarito (`extrato/gabarito.json`) ganhou as funções do `planilha_parser`, o `csv.Sniffer` e arquivos inventados gerados pelo openpyxl, pelo xlwt e em CSV com aspas, tabulação, só CR, BOM e latin-1. A comparação local com planilhas reais usa os mesmos `corpus_extratos.py` e `corpus-extratos.ts`.

## Fase 3b: regras, contrapartes e plano de contas por planilha

| Importação | Arquivo | Como entra | Porte |
|---|---|---|---|
| Regras | modelo de seis colunas (DEBITO, CREDITO, HISTORICO CONTABIL, PADRAO DO EXTRATO, BANCO, COPIAR DO EXTRATO), .xlsx ou .xls | prévia e confirmação | `cadastro/relatorioRegras.ts`, `servidor/importacaoRegras.ts` |
| Contrapartes | relação de clientes ou de fornecedores do sistema fiscal, .xlsx ou .xls | prévia e confirmação, com o CNPJ da empresa conferido | `cadastro/relatorioContrapartes.ts`, `cadastro/dadosCadastrais.ts`, `servidor/importacaoContrapartes.ts` |
| Plano de contas | .xlsx (folha ativa) ou .csv | direto, com o resultado por linha | `cadastro/planilhaDoPlano.ts`, `cadastro/loteDoPlano.ts`, `servidor/importacaoPlano.ts` |

- **Leitura comum** (`planilha/excel.ts`): todas as folhas, com os limites do original (25 MB, 20 folhas, 10.000 linhas, 100 colunas, 500.000 células, conferência do zip). No `.xls`, a correção estrita do defeito dos relatórios do sistema fiscal: o BOUNDSHEET aponta para registros BLANK logo antes do BOF da folha, e o xlrd recusa. Os relatórios reais com esse defeito são lidos como no original.
- **Prévia e confirmação:** cada linha sai pronta, já existente, em conflito ou inválida, com o motivo. "Importar" manda o mesmo arquivo de novo com o comprovante; o servidor trava a empresa (e as contas, regras e contrapartes citadas), refaz a análise e só grava se o comprovante e a análise ainda baterem. Nada é gravado na prévia.
- **Tela:** um componente (`ImportarCadastro.tsx`) e uma rota (`/api/contabil-core/cadastros`) para os três. Regras e contrapartes pedem `agir`; o plano de contas, `gerir`. A auditoria registra `contabil.core.regras.importadas`, `contabil.core.contrapartes.importadas` e `contabil.core.plano.importado`.

### Testes

- Gabaritos do Python original sobre planilhas inventadas: `gabarito_regras.py` (leitura comum e modelo de regras), `gabarito_contrapartes.py` (32 planilhas e os dados cadastrais), `gabarito_plano.py` (54 planilhas e 15 lotes rodados no `importar_lote` original com banco de mentira).
- Ensaios no banco local: `ensaio-importacao-regras.ts`, `ensaio-importacao-contrapartes.ts` e `ensaio-importacao-plano.ts`.
- Comparação local com as relações fiscais reais (fora do git): as 5 iguais ao original.

## Fase 1: escopo e aceite

**Entra:**
- este documento;
- as tabelas do Bloco A (migration só com `CREATE TABLE`);
- o módulo registrado e desligado, com uma página que explica a situação;
- os motores puros:

| Motor em TypeScript | Origem |
|---|---|
| `texto.ts` | `core/texto.py` |
| `documentoNoHistorico.ts` | `neo/documento_no_historico.py` |
| `contrapartePorNome.ts` | `neo/contraparte_por_nome.py` |
| `valorConfiavel.ts` | `extrato/validacao.py` |
| `conferencia.ts` | `extrato/conferencia.py` |
| `ofx.ts` | `extrato/ofx_parser.py` |
| `dedup.ts` | `_calcular_hash` |
| `regras.ts` | `estrategia_de_match`, ordem das regras, `gerar_historico_sugerido`, desambiguação por tipo |
| `dominio.ts` | `exportacao/formatos.py` e `historico.py` |
| `chaves.ts` | colunas de unicidade |

**Aceite:**
- os gabaritos batem;
- `tsc`, `eslint`, `npm test` e `npm run build` verdes;
- `prisma migrate deploy` limpo no banco local;
- o módulo não aparece para ninguém enquanto não for ligado.

**Não entra:** telas de trabalho, gravação no banco, PDF e planilha de extrato, carga.
