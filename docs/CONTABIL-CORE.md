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
| B3 | `feat/contabil-core-conciliacao-revisao` | Revisão manual salva (decisões e vínculos com versão). Migration. |
| B4 | `feat/contabil-core-conciliacao-financeiro` | Conferência do financeiro: documentos, análises salvas e sugestões. Migration. |
| B5 | `feat/contabil-core-carga-conciliacao` | As tabelas do Bloco B na carga (espelho), com os originais do financeiro em disco. Sem migration. |

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

### Fase B3: a revisão manual

| Onde | Porte de |
|---|---|
| `conciliacao/revisao.ts` (puro) | as partes de `RevisaoService` sem banco: `_hash`, `_moeda`, `_identidade_linha`, `_evidencia_extrato`, `ordenar_como_o_extrato`, o snapshot da criação, o Razão de apoio e a validação do vínculo, com as recusas na ordem do original |
| `servidor/revisao.ts` | `RevisaoService`: criar, obter, listar, renomear, excluir, apoio, vínculo e desfazer, cada escrita numa transação |
| `entradasRevisao.ts` | `VinculoCreate`, `VinculoDesfazer`, `NomeConciliacao` e `ExclusaoConciliacao` |
| migration `20261112150000_contabil_core_conciliacao_revisao` | `0040_conciliacao_revisao` e `0042_gestao_revisoes`, com as três checagens como CHECK |

- **O banco guarda o JSON do original.** `snapshot`, `relatorio`, `extratoIds` e `razaoItens` têm as chaves e os valores do `model_dump(mode="json")` (snake_case, dinheiro como o texto do `Decimal`). A carga (B5) copia sem conversão, e o `extrato_hash`, o `revisao_hash` e os `hashes_apoio` continuam valendo. A conversão para a tela (camelCase, `revisaoTipos.ts`) fica no servidor.
- **O hash é o do Python, byte a byte:** `json.dumps(..., ensure_ascii=False, sort_keys=True, separators=(",", ":"))`, com as chaves por ponto de código.
- **Versão otimista:** toda escrita é um `updateMany` que exige a versão vista e a revisão viva. Se outra pessoa mudou antes, nada é gravado e a recusa é `VERSAO_DESATUALIZADA`.
- **Auditoria:** a rota registra. Cada escrita devolve a ação e os mesmos dados do `_auditar` do original. Quando `criar` devolve uma revisão que já existia, não há auditoria.
- **Gabarito:** `gabarito_revisao.py` grava as chamadas de criar, apoio e vínculo da suíte do original, mais casos inventados para cada ramo, as chamadas diretas de `_hash` (acentos, aspas, barra, controles, emoji, chaves fora de ordem), `_moeda`, `_identidade_linha`, `_evidencia_extrato`, a ordem do extrato e os validadores. Ao todo, 789 casos, todos iguais.
  - A saída sai do serviço original rodando num SQLite montado só com a entrada gravada.
  - O plugin confere que esse banco montado repete a suíte de verdade.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-revisao.ts` percorre o caminho normal e cada recusa, inclusive a criação simultânea, o CHECK do MySQL, o extrato desfeito e a exclusão da empresa.

Divergências da B3:

- **Ordem do `conciliados_por_tipo` lido de volta:** o tipo JSON do MySQL guarda as chaves ordenadas (pelo tamanho e depois pelos bytes). O `json` do PostgreSQL mantinha a ordem do `Counter`. O que se grava é igual; só a ordem dos tipos na tela muda.
- **Recusas da conciliação na criação:** vêm da B2, sem código, a não ser a conta bancária de outra empresa, que vira `NAO_ENCONTRADA`.
- **Versão:** é aceita como inteiro de 1 até o maior `INT` do banco. O pydantic aceitaria também `true`, "1_0" e inteiros maiores, que no original davam conflito de versão.
- **Mensagens de formato:** as recusas genéricas do pydantic ("String should have at most…") viram frases em português. As frases próprias ("Informe o motivo…", "Informe um nome…") são as mesmas.
- **Criação simultânea:** o original usava savepoint e `IntegrityError`. Aqui a coluna única recusa (P2002) e a revisão existente é devolvida, com o mesmo efeito.
- **Exclusão:** devolve `{ revisao: null, auditoria }`; o original respondia 204.
- **Vínculo de outra revisão ou id inválido no desfazer:** "não encontrado". O original recusava o id inválido na validação da rota.
- **Ordem dos vínculos:** por criação e id, com o instante em milissegundos (o PostgreSQL guardava microssegundos).
- **Nomes de colunas:** `criado_por` virou `criadoPorId` e `usuario_id` (do vínculo) virou `confirmadoPorId`; a carga (B5) mapeia.
- **Tela:**
  - **Aba para leitura:** a aba "Conciliação" aparece também para quem só pode ver o módulo. Essas pessoas veem as revisões salvas e as conferências, sem conciliar nem alterar, como o `concilpro.read` do original.
  - **Acréscimo "Revisar esta pendência":** em cada pendência, abre a revisão com as linhas do extrato dela já marcadas. O original tinha o parâmetro (`extratoInicialIds`), mas nenhum botão o usava.
  - **Revisão que virou histórico:** o editor e o envio de Razão de apoio ficam ocultos; o original os mostrava desabilitados. Desfazer um vínculo continua permitido, como lá.

### Fase B4: a conferência do financeiro

| Onde | Porte de |
|---|---|
| `conciliacao/financeiro.ts` (puro) | as partes de `FinanceiroService` sem banco: `_valor`, `_nome`, `_banco_compativel`, `_linha`, `_identidade_extrato`, `_limites`, `_validar_snapshot`, `confirmar_empresa`, o snapshot da criação, a incorporação de cada tipo de documento (financeiro, SISPAG, Razão e extrato detalhado), `_validar_vinculo`, o lote de sugestões e a conversão para a tela |
| `servidor/financeiro.ts` | `FinanceiroService`: criar, listar, obter, renomear, excluir, adicionar documento, baixar o original, sugestões, vincular, vincular sugestões e desfazer, cada escrita numa transação |
| `servidor/originaisFinanceiro.ts` | os originais em disco (o original guardava os bytes no banco) |
| `entradasFinanceiro.ts` | `AnaliseCreate`, `FinanceiroVinculoCreate`, `FinanceiroSugestoesLote`, `FinanceiroDesfazer` e, da B3, `NomeConciliacao` e `ExclusaoConciliacao` |
| migration `20261112180000_contabil_core_conciliacao_financeiro` | `0041_financeiro_manual` e `0044_financeiro_razao_sispag`: `core_financeiro_analises`, `core_financeiro_documentos` e `core_financeiro_vinculos`, com as sete checagens como CHECK |

- **O banco guarda o JSON do original.** `snapshot` (`fontes`, `linhas`, `titulos_abertos`, `avisos`), `financeiroIds` e `comparacaoIds` têm as chaves e os valores do `model_dump(mode="json")`, com o dinheiro como o texto do `Decimal` ("-350.00"). A carga (B5) copia sem conversão. O `extrato_hash` usa o mesmo `hashJson` da B3, então os hashes gravados pelo original continuam valendo. A conversão para a tela (`financeiroTipos.ts`, camelCase) fica no servidor.
- **Os originais ficam em disco**, em `storage/contabil-core/financeiro/<tenantId>/<id do documento>.<ext>`. A linha guarda nome, tipo, SHA-256, tipo de mídia, tamanho e a chave (`storageKey`).
  - O arquivo é gravado dentro da transação, depois de a versão avançar, e apagado se a transação não vingar.
  - O download confere tenant, empresa, análise viva e documento antes de ler o disco. A chave tem o formato conferido e o tenant no começo.
  - A exclusão da empresa lista os originais dentro da transação (`arquivosDaEmpresa`, pasta `contabil-core/financeiro`) e os apaga depois do commit, como os da Revisão do fechamento. A exclusão lógica da análise não apaga o arquivo, como no original.
- **Unicidade:** a de (análise, hash do arquivo) é total no original e continua como índice único comum. Não há `chaveAtiva`.
- **Versão otimista:** toda escrita é um `updateMany` que exige a versão vista e a análise viva. Se outra pessoa mudou antes, nada é gravado e a recusa é `VERSAO_DESATUALIZADA`. O envio de documento confere a versão também antes de ler o arquivo, como o original ("A análise mudou. Atualize a tela.").
- **Leitores:** o serviço lê o documento pelo leitor do tipo (`lerFinanceiro`, `lerSispag`, `lerRazaoDoArquivo`, `lerExtratoDetalhado`), depois de `validarConteudo`. A recusa de um leitor vira a frase dele, como a rota do original fazia. As sugestões são as de `sugerir` (`sugestoesFinanceiro.ts`).
- **Auditoria:** a rota registra. Cada escrita devolve `{ analise, auditoria }` com os mesmos dados do `_auditar` do original. As ações estão em `ACOES_DO_FINANCEIRO`:

  | Ação no Connect | No original |
  |---|---|
  | `contabil.core.financeiro.analise.criada` | `financeiro.analise_criada` |
  | `contabil.core.financeiro.analise.renomeada` | `financeiro.analise_renomeada` |
  | `contabil.core.financeiro.analise.excluida` | `financeiro.analise_excluida` |
  | `contabil.core.financeiro.documento.adicionado` | `financeiro.documento_adicionado` |
  | `contabil.core.financeiro.vinculo.confirmado` | `financeiro.vinculo_criado` |
  | `contabil.core.financeiro.vinculos.confirmados` | `financeiro.vinculo_criado`, uma por sugestão do lote |
  | `contabil.core.financeiro.vinculo.desfeito` | `financeiro.vinculo_desfeito` |
- **Gabarito:** `gabarito_financeiro_servico.py` grava as chamadas de criar, adicionar documento, vincular e vincular sugestões da suíte do original, mais casos inventados para cada ramo, e as chamadas diretas de `_nome`, `_valor`, `_banco_compativel` e dos validadores. Ao todo, 858 casos, todos iguais: 204 da suíte (68 criações, 87 documentos, 46 vínculos e 3 lotes), 564 inventados e 90 chamadas diretas e de validação, com 408 recusas.
  - A saída sai do serviço original rodando num SQLite montado só com a entrada gravada. Os leitores e as sugestões são trocados pela saída gravada, para o gabarito não depender do porte deles, que têm gabarito próprio.
  - Os bytes dos arquivos não vão para o gabarito: o banco montado recebe bytes de enchimento do mesmo tamanho.
  - O plugin confere que esse banco montado repete a suíte de verdade, com os bytes reais.
  - Três chamadas da suíte ficam de fora por tamanho (os testes de limite com 600 mil caracteres por linha e 800 transações com 500 ideogramas). Os mesmos ramos estão nos inventados, com limites pequenos.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-financeiro.ts`, com 72 conferências.
  - Gera planilhas inventadas dos quatro tipos e confere o reenvio recusado e o original baixado igual ao enviado e confinado à empresa, ao tenant e à análise.
  - Percorre os vínculos (o aceito, o reuso no mesmo tipo, a mesma linha em outro tipo, o sentido misturado, a diferença sem observação), as sugestões e o lote, a versão desatualizada, desfazer, renomear e excluir.
  - Confere os CHECKs do MySQL e o extrato desfeito: só as conferências com o Extrato param.
  - No fim, a exclusão da empresa apaga as três tabelas e os originais em disco.

**Leitores e sugestões:**

| Onde | Porte de |
|---|---|
| `conciliacao/financeiroDocumentos.ts` (servidor) | `financeiro_documentos.py`: `ler_financeiro` e `validar_conteudo` (planilhas do financeiro com o total declarado conferido, e o PDF de conciliação lido pelas coordenadas dos caracteres, com saldos e totais conferidos) |
| `conciliacao/financeiroComum.ts`, `financeiroTitulos.ts` e `financeiroOmie.ts` (puros) | `_valor`, `_texto` e `_data_planilha`, mais `financeiro_titulos.py` e `financeiro_omie.py` |
| `conciliacao/sugestoesFinanceiro.ts` | `sugestoes_financeiro.py`: `sugerir`, `identidade` e `normalizar`. Recebe as linhas e os vínculos do snapshot (snake_case) e devolve o id de cada sugestão com o mesmo sha256 do original |
| `pdf/mupdf.ts` | o texto e as palavras do PyMuPDF, que o original usa para ler o Omie |

- **Gabarito:** `gabarito_financeiro.py` registra 1.737 chamadas da suíte do original, mais documentos inventados, todas iguais:
  - 961 dos leitores, cobrindo todas as frases de recusa;
  - 776 das sugestões;
  - mais 100 PDFs comparados com o PyMuPDF (o mesmo texto, e as caixas das palavras a menos de 0,02 ponto).
- **Arquivos reais (só contagens, nada no git):** 121 PDFs e planilhas de Downloads, todos iguais ao original, inclusive nas recusas:
  - 9 documentos lidos, entre eles um Omie de 85 páginas com 4.662 movimentos e um saldo conciliado de 19 páginas;
  - 112 recusados com a mesma frase.
- **Para gerar o gabarito de novo:** o `GABARITO_NOMES` (fora do git) precisa também dos nomes da suíte de integração do original, que aparecem dentro das planilhas de Razão e SISPAG.

Divergências da B4:

- **Original em disco, não no banco.** O original guardava os bytes em `financeiro_documentos.conteudo`, na mesma transação. Aqui o arquivo é gravado na transação e apagado se ela falhar. Se o processo cair entre gravar o arquivo e o commit, sobra um arquivo órfão que ninguém vê. A carga (B5) terá de tirar os bytes de `conteudo` e gravá-los em disco.
- **Auditoria do lote:** o original gravava uma auditoria `financeiro.vinculo_criado` por sugestão confirmada. Aqui é um registro só, `vinculos.confirmados`, com a lista dos mesmos dados (`{ vinculos: [...] }`).
- **Códigos de erro:** os `ConflictError` sem código do original viram `VERSAO_DESATUALIZADA` (versão), `EXTRATO_ALTERADO` (o extrato mudou) ou `CONFLITO` (arquivo repetido, movimento já vinculado, sugestão mudou). As frases são as mesmas.
- **Tipo de mídia:** o original quebrava (500) quando o nome limpo não terminava em .pdf, .xls ou .xlsx. Aqui fica o tipo de mídia enviado. Na prática, `validarConteudo` recusa esses nomes antes.
- **Exclusão:** devolve `{ analise: null, auditoria }`; o original respondia 204.
- **Empresa de outro tenant e conta contábil:** a empresa é conferida antes de tudo, com o "não encontrada" do Connect. A conta contábil vinculada é lida só dentro da empresa; o original lia por id e conferia a empresa depois, com a mesma recusa.
- **Versão e mensagens de formato:** como na B3, a versão é inteiro de 1 até o maior `INT`, e as recusas genéricas do pydantic viram frases em português.
- **Nome imprimível:** `str.isprintable()` vira as categorias Unicode do JavaScript. Num caractere atribuído só na versão nova do Unicode (o Node tem uma mais nova que o Python), o resultado pode mudar.
- **Ordem dos vínculos:** por criação e id, com o instante em milissegundos.
- **Nomes de colunas:** `criado_por` virou `criadoPorId` e `usuario_id` (do vínculo) virou `confirmadoPorId`; a carga (B5) mapeia.
- **Omie pelo PyMuPDF imitado:** o original lê o Omie com o PyMuPDF. Aqui, `pdf/mupdf.ts` reproduz o texto e as palavras dele a partir dos mesmos caracteres do porte do pdfplumber. As diferenças conhecidas ficam fora desse layout: texto vertical, escrita da direita para a esquerda, glifo sem Unicode, métrica de fonte embutida (vem do pdf.js) e fonte não embutida fora das 14 padrão (aproximada pela Helvetica).
- **Tempo-limite do Omie (30 s):** começa antes de o pdf.js interpretar o arquivo, então essa interpretação entra na conta.
- **`validarConteudo` é assíncrona:** contar as páginas do PDF passa pelo pdf.js.
- **Tela:**
  - **Onde fica:** é a segunda vista da aba "Conciliação" (`?vista=financeiro`), ao lado de "Razão × extrato", como a terceira aba da Conciliação Bancária do original.
  - **Somas:** usam `Dec`, então não existe mais o aviso "Valor fora do limite".
  - **Desfazer:** o motivo é pedido na própria linha, como na B3.
  - **Ao trocar de empresa,** a tela volta para "Razão × extrato".

## Bloco C: documentos

### Decisões (Angelo, 18/11/2026)

- **A leitura por IA passa pela fundação do Connect** (`src/lib/ia`: a chave do escritório, o teto de gasto e o uso registrado), e não pela OpenAI chamada direto, como no original.
- **A leitura por IA vem desligada por padrão**, como o `ALLOW_FINANCIAL_DATA_TO_OPENAI=false` do original. Desligada (ou sem provedor no escritório), o PDF e a imagem que precisariam dela são recusados com a frase do leitor, e a tela mostra. O XML não depende de IA.

### O que o original faz

- **Notas fiscais:** NF-e e NFS-e importadas do XML (com a assinatura conferida e o protocolo da SEFAZ obrigatório), do ZIP com vários XML, ou do PDF e da imagem pela IA, além do cadastro à mão. A procedência fica registrada. A nota é associada à mão a uma transação do extrato, e o NEO a usa para achar a contraparte.
- **Comprovantes de pagamento:** o PDF do banco lido (e, sem texto, pela IA), com favorecido, documento e valor, ligado à transação.
- **Cartões:** faturas importadas e distribuídas em lançamentos.

### Fases do Bloco C

| Fase | Branch | O que entra |
|---|---|---|
| C1 | `feat/contabil-core-notas` | Notas fiscais: os leitores (XML com a assinatura conferida; PDF e imagem pela IA, atrás da chave), o serviço, as rotas e a aba "Notas". Migration. Ver "Fase C1". |
| C2 | `feat/contabil-core-comprovantes` | Comprovantes de pagamento (o leitor em camadas, o serviço, o arquivo em disco, as rotas e a aba "Comprovantes"), e o uso das notas e dos comprovantes pelo NEO (candidata pelo valor e pela data, contraparte pelo documento, número da nota no histórico). Migration. Ver "Fase C2". |
| C3 | `feat/contabil-core-cartoes` | Cartões de crédito: cartões, faturas, gastos (à mão, CSV e PDF), os documentos da fatura para revisão (composição, texto e imagem pela IA, atrás da chave), o pagamento pela transação do extrato e a distribuição da fatura sobre ela pela composição do NEO. Migration. Ver "Fase C3". |
| C4 | — | As tabelas do Bloco C na carga (espelho). |

### Fase C1: as notas fiscais

| Onde | Porte de |
|---|---|
| `notas/servico.ts` (puro) | as partes de `NotaService` sem banco: a validação do `NotaFiscalCreate`, `_normalizar_chave_acesso`, `_calcular_identidade_nota` (o `dedup_key`), a procedência, a conferência do CNPJ da empresa (com a filial apontada), `_validar_zip` e a abertura do ZIP, as recusas de associar e desassociar e os filtros de `listar` |
| `servidor/notas.ts` | `NotaService`: listar, obter, criar, importar (XML, ZIP, PDF e imagem), associar, desassociar e cancelar, cada escrita numa transação |
| `notas/rotaDasNotas.ts` e `api/contabil-core/notas/**` | `src/api/v1/notas.py`: a lista com filtros e paginação, uma nota, o cadastro à mão, a importação (um arquivo por envio, até 25 MB), associar (`POST`) e desassociar (`DELETE`) e cancelar, mais as transações pendentes para associar |
| aba "Notas" (`Notas.tsx`, `notas/telaDasNotas.ts`) | `Notas.tsx` do contabil-front |
| migration `20261118180000_contabil_core_notas_fiscais` | `notas_fiscais` (0001, 0010, 0018 e 0035): `core_notas_fiscais`, com os três enums como CHECK |

Os leitores (`notas/xml.ts`, com a assinatura em `notas/assinatura.ts`, e `notas/visual.ts`, pela IA) e a leitura por IA têm gabarito próprio.

- **Unicidade:** as duas do original (`uq_nota_empresa_chave` e `uq_nota_empresa_dedup`) são TOTAIS, não parciais, e continuam como índices únicos comuns, por empresa. Não há `chaveAtiva`.
- **A identidade é a do original byte a byte.** A NF-e é identificada pela chave; a NFS-e e a NF-e sem chave, por emitente, número, série, valor (2 casas, meio para par, o `quantize` do Python) e emissão em UTC no formato do `isoformat()` do Python. A carga (C4) copia o `dedup_key`, e uma nota já importada no Contábil Core continua reconhecida.
- **A transação ligada:** `transacaoId` é chave estrangeira para `core_transacoes`, como no original. A transação nunca sai de verdade (só `deletedAt`), então a chave não trava o desfazer da importação; a exclusão da empresa apaga as notas antes das transações.
- **Quando a transação some** (como no original, por `cancelar_lancamento`): desfazer a classificação, reclassificar ou desfazer a importação de uma transação classificada **desvincula** a nota, que volta para "pendente" (`cancelarLancamento` em `servidor/neo.ts`). A transação sem lançamento sai na importação desfeita com a nota ainda ligada a ela; a tela mostra "A importação desta transação foi desfeita", e a pessoa desassocia.
- **Importar:** o arquivo é lido inteiro antes de gravar (a IA pode levar segundos e fica fora da transação). As notas são gravadas numa transação, na ordem, com a duplicidade decidida contra o banco e contra as anteriores do mesmo arquivo. Se outra importação gravar a mesma nota nesse intervalo, a coluna única recusa (P2002) e a gravação é refeita uma vez, com a nota contada como duplicada.
- **Associar, desassociar e cancelar:** cada um é um `updateMany` que exige o estado lido (status e transação), para duas pessoas não ligarem a mesma nota a transações diferentes ao mesmo tempo.
- **Auditoria:** o original só registrava em log. Aqui a rota registra, com as ações em `ACOES_DAS_NOTAS`:

  | Ação no Connect | Log do original |
  |---|---|
  | `contabil.core.nota.criada` | `nota.criada` (cadastro à mão) |
  | `contabil.core.notas.importadas` | `nota.criada`, uma por nota; aqui um registro por arquivo, com os ids, só quando alguma nota entra |
  | `contabil.core.nota.associada` | `nota.associada` |
  | `contabil.core.nota.desassociada` | `nota.desassociada` |
  | `contabil.core.nota.cancelada` | `nota.cancelada` |
- **Acesso:** ler pede "ver"; importar, cadastrar, associar e cancelar pedem "agir" (o `notas.read` e o `notas.write` do original).
- **Gabarito:** `gabarito_notas_servico.py` grava as chamadas de `criar`, `importar_xml`, `importar_visual`, `associar_transacao`, `desassociar_transacao`, `cancelar` e `listar` da suíte do original, mais casos inventados com semente fixa para cada ramo (inclusive `importar_zip`, que a suíte não chama, com ZIPs inventados) e chamadas diretas do `NotaFiscalCreate`. Ao todo, 621 casos, todos iguais: 44 da suíte, 531 inventados e 46 de validação.
  - A saída sai do serviço original rodando num SQLite montado só com a entrada gravada. Os leitores são trocados pela saída gravada.
  - O plugin confere que esse banco montado repete a suíte de verdade.
  - As divergências abaixo são contadas no teste, uma a uma.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-notas.ts`, com XMLs inventados e assinados de verdade (`ensaio_notas_xml.py`, conferidos com o leitor do original): NF-e assinada, NF-e alterada depois de assinada, NFS-e, a repetida, a de outra empresa, o ZIP, o PDF e a imagem sem a IA, o cadastro à mão, a lista, o isolamento, cada recusa, a classificação desfeita, a importação desfeita, os CHECKs e a exclusão da empresa.

**Leitores e IA:**

| Onde | Porte de |
|---|---|
| `notas/xml.ts`, `xmlArvore.ts`, `c14n.ts`, `esquemaDsig.ts` e `assinatura.ts` | `xml_parser.py`: NF-e 4.0 e NFS-e ABRASF, eventos recusados com a frase própria e a conferência da assinatura, que emula o `signxml.verify` com `node:crypto`, sem dependência nova. Inclui a árvore como o `ElementTree`, a C14N como o lxml e o esquema XSD do DSig |
| `notas/visual.ts` | `visual_parser.py`: o PDF com texto vai para a IA de texto; o PDF sem texto e a imagem vão para a IA de visão. Tem orçamento de 60 s, 120 páginas, 30 chamadas e até 30 s por chamada, e a resposta da IA é conferida como no original |
| `ia/leituraPorIa.ts` | a peça comum "documento → IA" que a C2 e a C3 reaproveitam: confere a chave do escritório e o provedor, chama a fundação de IA (`gerarTexto` em `src/lib/ai.ts`, com catálogo, teto do mês e auditoria por chamada) e devolve o texto ou a recusa |

- **Agentes no catálogo** (`src/lib/ia/catalogo.ts`), do setor `contabil` e desligados por padrão, como o catálogo exige:
  - `leitor_de_nota_texto`, faixa rápida;
  - `leitor_de_nota_imagem`, faixa padrão.

  O original fixava `gpt-4o-mini` e `gpt-4o`. O catálogo do Connect só aceita modelos da tabela de faixas, com preço conhecido, e os 4o já saíram dela. Quem quiser outro modelo escolhe por agente em Integrações › Inteligência artificial.
- **A chave do escritório** (o `ALLOW_FINANCIAL_DATA_TO_OPENAI` do original): fica em `TenantContabilCoreConfig.iaDocumentosFinanceiros` (`tenant_contabil_core_configs`, na migration desta fase), **desligada por padrão**.
  - Quem pode "gerir" liga e desliga em Contábil Core › Configurações › "Leitura de notas por IA" (na C2, "Leitura de documentos por IA", porque a mesma chave passou a valer para os comprovantes).
  - A ação tem confirmação e auditoria (`contabil.core.ia_documentos.alterada`, gravada só quando o valor muda).
  - Com a chave desligada, PDF e imagem são recusados com a frase do original adaptada, dizendo onde ligar. Sem provedor configurado, a frase manda para Integrações.
- **Gabarito dos leitores:** `gabarito_notas.py`, com 399 chamadas, todas iguais. O plugin assina NF-e e NFS-e com certificados de teste gerados nele mesmo. Os cenários visuais usam a IA simulada com as respostas da suíte do original: as chamadas (texto ou imagem, e o texto enviado) e o resultado são idênticos. As chamadas reais de IA não entram no gabarito.
- **Conferência com arquivos reais:** os Downloads não têm XML de nota. Os 5 XMLs que havia dentro de ZIPs não são notas, e original e porte deram a mesma saída nos 5.
- **Achados sobre o original:**
  - **A assinatura de uma NF-e real nunca confere no original.** Com o `signxml` 5.2 e o `lxml` 6.1, a assinatura no padrão da NF-e (`<Signature xmlns="…xmldsig#">`, sem prefixo) sai sempre "assinatura não confere (InvalidInput)". O lxml canonicaliza o `SignedInfo` como raiz e deixa um `xmlns=""` falso. Só a assinatura com prefixo `ds:` chega a ser conferida.
  - O porte reproduz isso de propósito: toda NF-e real entra como `xml_nao_verificado`, como no original, e a carga (C4) não muda de procedência.
  - Corrigir é uma decisão à parte, que vale para os dois sistemas.
  - **Certificado vencido:** o `signxml` confere a validade no momento da importação, não na emissão. Uma nota assinada por certificado já vencido entra como `xml_nao_verificado` ("InvalidCertificate"), ao contrário do que diz um comentário do original. O porte segue o comportamento real.

Divergências da C1:

- **O motivo da assinatura é gravado.** O original tem a coluna `assinatura_motivo` e a tela a mostra, mas `criar` não a passava ao modelo: o motivo nunca chegava ao banco. Aqui ele é gravado.
- **Valor acima de `Decimal(15,2)`:** é recusado com frase ("O valor da nota passa do limite aceito."), antes de qualquer outra conferência. No original, a gravação falhava no PostgreSQL (erro 500).
- **Associar a uma transação desfeita:** é recusado ("Transação não encontrada nesta empresa."). O original não olhava o `deleted_at` da transação.
- **Busca da lista:** o `%` e o `_` digitados são procurados como texto (no `ilike` do original eram curingas), e a collation do MySQL ignora acento além de maiúscula ("sao jose" acha "São José"). Na mesma emissão, a ordem desempata pelo id. O tipo ou a situação inexistente devolve lista vazia (no PostgreSQL, erro do enum).
- **Datas do filtro:** "AAAA-MM-DD" é o dia inteiro no fuso do escritório. O original mandava o início em UTC e o fim no fuso do navegador.
- **Mensagens:** as recusas genéricas do pydantic ("1 validation error for NotaFiscalCreate…") viram frases em português; as dos validadores próprios são as mesmas. O ZIP que não abre diz "Arquivo ZIP inválido: o arquivo não é um ZIP ou está corrompido." (o original repetia a frase do Python, em inglês).
- **Recusa do leitor:** toda recusa do leitor de XML vira linha de erro do arquivo, inclusive a codificação desconhecida, que no original escapava como `LookupError` (erro 500).
- **Dígitos de outras escritas:** são aceitos onde o `\d` do Python aceita. Os sobrescritos ("²"), que o `isdigit()` do validador de CNPJ do original contava e depois quebravam no `int()`, ficam de fora.
- **Página de PDF para a IA de visão:** vai como PDF de uma página, não como PNG de 200 dpi, porque desenhar PDF em imagem exigiria dependência nova. A ordem, o orçamento e a contagem de chamadas são os mesmos.
- **Exceção crua do original vira recusa com frase:** a falha do provedor na leitura por imagem, o PDF ilegível ou sem páginas (no original, `FileDataError`/`EmptyFileError` do PyMuPDF, erro 500) e a codificação desconhecida.
- **Codificações:** as de 1 byte fora da lista (latin-1, cp1252, iso8859-15, ascii e utf-8) são recusadas como desconhecidas. O DTD em UTF-16 é recusado com a frase do DTD.
- **Fica como no original, mas merece decisão:** a nota cadastrada à mão nasce com a procedência `xml_assinado` (o padrão do `NotaFiscalCreate`, que a tela do original não mudava).
- **Fora da C1:** o uso das notas pelo NEO (`_selecionar_nota_candidata`, a contraparte pela nota e o número da nota no histórico) vai para a C2, junto dos comprovantes, porque o motor usa os dois do mesmo jeito. A exportação das notas (`nfe_entrada`, `nfse_tomado`…) e os números do painel ficam para o Bloco D.
- **Tela:**
  - **O texto do cancelamento** diz que a associação sai junto, como o serviço faz. O original dizia que ela seria mantida.
  - **O dia da emissão:** a nota sem hora (a NFS-e só com a data e o cadastro à mão) é gravada à meia-noite UTC, como no original, e aparece no dia gravado; o original a mostrava no dia anterior.
  - **Associar** tem busca pelo histórico (o original listava as 100 primeiras pendentes).
  - **A transação ligada** vem no resumo da lista (o original fazia uma leitura por transação na tela).
  - **No extrato e no NEO** a nota não aparece: o original também não a mostra ali, a não ser na contagem de notas que o NEO associou, que vem com a C2.

### Fase C2: os comprovantes de pagamento e o NEO com notas e comprovantes

| Onde | Porte de |
|---|---|
| `comprovantes/leitor.ts` | `pdf_parser.py`: os rótulos do texto do PDF (`_parse_por_regex`), a recusa da nota fiscal (`_parece_nota_fiscal` e `_recusar_se_nota_pela_ia`), a IA de texto e a de imagem, a conferência da resposta (`_comprovante_from_item`), o orçamento (`_PDFBudget`) e as frases de `_dica_camadas_ia` |
| `comprovantes/servico.ts` (puro) | as partes de `ComprovanteService` sem banco: a validação do `ComprovanteCreate`, o arquivo repetido (`buscar_por_arquivo`, `erro_ja_importado`), o mesmo pagamento (`_mesmo_pagamento`), `_descrever`, `_resumo`, `_brl` e as recusas de associar e desassociar |
| `servidor/comprovantes.ts` | `ComprovanteService` (listar, obter, criar, associar, desassociar e excluir) e a rota `extrair_dados_pdf`, mais o download |
| `servidor/originaisComprovantes.ts` | o arquivo em disco (o original guardava o base64 numa coluna) |
| `comprovantes/rotaDosComprovantes.ts` e `api/contabil-core/comprovantes/**` | `src/api/v1/comprovantes.py`: a lista com os filtros (conta bancária, transação e status `associado`/`nao_associado`) e a paginação, um comprovante, o cadastro (JSON ou formulário com o arquivo), ler o arquivo para pré-preencher (`extrair`), associar (`POST`) e desassociar (`DELETE`), excluir, o arquivo e as transações pendentes para associar |
| aba "Comprovantes" (`Comprovantes.tsx`, `comprovantes/telaDosComprovantes.ts`) | `Comprovantes.tsx` do contabil-front: arrastar vários arquivos, a fila (um por vez, pular, descartar com confirmação), o pré-preenchimento, o possível duplicado com confirmação, a nota e o arquivo repetido pulados sozinhos |
| `motor/neo.ts` e `servidor/neo.ts` | o que faltava de `neo/engine.py`: `_selecionar_comprovante_candidato`, `_selecionar_nota_candidata`, `_direcao_nota`, `_resolver_contraparte_candidata` (a nota primeiro, o comprovante depois), o modo sombra com nota e comprovante, `_vincular_*`, os consumidos da execução e as contagens `comprovantes_associados` e `notas_associadas`; e, de `neo/cancelamento.py`, os comprovantes soltos (`comprovantes_desvinculados`) |
| migration `20261119200000_contabil_core_comprovantes` | `comprovantes` (0002 e 0037): `core_comprovantes`, com as restrições do `ComprovanteCreate` como CHECK |

- **O leitor tem as camadas do original**, e para na primeira que acha o valor pago:
  - o texto do PDF (o porte do pdfplumber) linha a linha, pelos rótulos, com o valor na mesma linha ou na seguinte;
  - o mesmo texto à IA de texto, quando os rótulos não acham o valor;
  - o PDF sem texto e a imagem à IA de imagem, uma página por chamada.
  Antes dos rótulos, o texto que parece nota fiscal (DANFSe, DANFE, prestador e tomador, o endereço do portal da prefeitura) é recusado com `DOCUMENTO_NAO_E_COMPROVANTE`, e a tela pula o arquivo. A IA também declara o tipo do documento.
- **A IA é a da C1** (`ia/leituraPorIa.ts`): os agentes `leitor_de_comprovante_texto` (faixa rápida) e `leitor_de_comprovante_imagem` (faixa padrão), do setor `contabil` e desligados por padrão, e a MESMA chave do escritório (`TenantContabilCoreConfig.iaDocumentosFinanceiros`, desligada por padrão). Como ela agora vale também para os comprovantes, o bloco de Configurações passou a se chamar "Leitura de documentos por IA", e as frases dizem nota e comprovante. A página do PDF escaneado vai como um PDF de uma página, como na C1. O orçamento ganhou as frases próprias de cada leitor (o do comprovante fala em "PDF").
- **Unicidade:** como no original, NÃO há índice único. O índice de (empresa, SHA-256) é comum, de propósito: a base do original tem duplicados de antes do hash, e um índice único derrubaria a carga. Quem barra o arquivo repetido é o serviço:
  - o mesmo arquivo (o SHA-256 dos BYTES) num comprovante vivo da empresa é sempre recusado (`COMPROVANTE_JA_IMPORTADO`), na leitura (antes de gastar IA) e no cadastro, mesmo com a confirmação. O excluído não conta: excluir é como se corrige uma importação errada;
  - o mesmo pagamento com outro arquivo (mesmo valor, mesmo dia em UTC e o mesmo documento, ou o mesmo nome quando falta documento) pede confirmação (`COMPROVANTE_POSSIVEL_DUPLICADO`, com os detalhes do que já existe);
  - o cadastro trava a linha da empresa (`SELECT … FOR UPDATE`) durante a conferência e a gravação, para dois envios do mesmo arquivo ao mesmo tempo não passarem os dois (no original, passavam).
- **O arquivo fica em disco**, como na B4: `storage/contabil-core/comprovantes/<tenantId>/<id>.<ext>`. A linha guarda o nome, o tipo (pelo conteúdo), o tamanho, o SHA-256 e a chave (`storageKey`).
  - O arquivo é gravado dentro da transação, depois da linha, e apagado se ela não vingar.
  - O download confere tenant, empresa e comprovante vivo antes de ler o disco; PDF, PNG e JPEG abrem na tela (`inline`, como o original), sempre com `nosniff` e sem cache.
  - A exclusão lógica não apaga o arquivo (o base64 ficava na linha excluída, lá). A exclusão da empresa apaga as linhas pelos passos do Core e os arquivos depois do commit (`arquivosDaEmpresa`, pasta `contabil-core/comprovantes`).
  - **A carga (C4) converte o `arquivo_base64` do original para o disco**: decodifica, grava em `storage/contabil-core/comprovantes/<tenantId>/<id>.<ext>` e preenche `storageKey`, `arquivoTipo` e `arquivoTamanho`. O `arquivo_sha256` vem como está (o original o calculava sobre os bytes decodificados, como aqui); o base64 inválido, que lá ficou sem hash, entra sem arquivo.
- **A transação ligada:** `transacaoId` é chave estrangeira para `core_transacoes`. Desfazer a classificação, reclassificar ou desfazer a importação de uma transação classificada SOLTA o comprovante (`cancelarLancamento`, que agora devolve as partidas, as notas e os comprovantes soltos; a auditoria de `lancamento.cancelado` leva as duas contagens, como o `dados_depois` do original). A transação sem lançamento sai na importação desfeita com o comprovante ainda ligado, como no original, e a tela mostra.
- **Associar, desassociar e excluir:** cada um é um `updateMany` que exige o estado lido (transação e vivo).
- **Auditoria:** o original só registrava em log. Aqui a rota registra, com as ações em `ACOES_DOS_COMPROVANTES`:

  | Ação no Connect | Log do original |
  |---|---|
  | `contabil.core.comprovante.criado` | `comprovante.criado` |
  | `contabil.core.comprovante.associado` | `comprovante.associado` |
  | `contabil.core.comprovante.desassociado` | `comprovante.desassociado` |
  | `contabil.core.comprovante.excluido` | `comprovante.deletado` |

  Ler o arquivo para pré-preencher não grava nada e não audita; cada chamada à IA fica na auditoria da fundação.
- **Acesso:** ler (a lista, um comprovante, o arquivo) pede "ver"; cadastrar, associar, desassociar e excluir pedem "agir" (`comprovantes.read` e `comprovantes.write`). Ler o arquivo para pré-preencher também pede "agir" (ver as divergências).

**O NEO com notas e comprovantes:**

- **A candidata** é escolhida pelo motor puro (`notaCandidata`, `comprovanteCandidato`) sobre os documentos livres da execução (`DocumentosDoNeo`), lidos uma vez no começo: as notas pendentes e os comprovantes sem transação, vivos, perto das datas das pendências.
  - A nota: valor a até R$ 0,01, emitida a até 7 dias e na direção da transação (`_direcao_nota`: emitida pela empresa é crédito; recebida por ela, débito; o CNPJ da empresa nas duas pontas, nenhuma).
  - O comprovante: só para débito, valor a até R$ 0,01 e pago a até 3 dias.
  - Só quando há EXATAMENTE um; dois ou mais, nenhum.
  - A janela é a do PostgreSQL: o dia do extrato menos e mais N dias vira a meia-noite (UTC) daqueles dias, e as pontas entram.
- **A contraparte** (`resolverContraparte`): a nota candidata (o emitente no débito, o destinatário no crédito), depois o documento do comprovante candidato, depois o documento impresso no histórico e por último o nome. O número da nota vai para o histórico gerado ("PGTO REF NF 4321 - …") quando a contraparte veio da nota; pelo documento do histórico, não (a nota é de outro CNPJ). Pelo nome, vai, como no original (ver os achados).
- **Com regra**, a contraparte é só medida (modo sombra): a decisão grava a contraparte, a conta, a origem (agora também `nota_fiscal` e `comprovante`) e a divergência de conta, e a classificação é a da regra.
- **A ligação:** quem classifica (pela regra ou pela contraparte) liga os dois candidatos, depois das partidas, na mesma transação do lançamento, por `updateMany` que exige o documento ainda livre (`transacaoId` nulo; a nota, também "pendente"). É o lugar do `with_for_update(skip_locked=True)`: se outra pessoa ou outra execução ligou o documento nesse meio-tempo, ele simplesmente não é ligado. Ligado ou não, sai do conjunto da execução (os consumidos). As contagens `comprovantesAssociados` e `notasAssociadas` contam só o que de fato ligou, e a aba NEO as mostra no resumo da execução.

**Gabaritos:**

- `gabarito_comprovantes.py` (o leitor): 350 chamadas, todas iguais. 43 de `_parse_valor`, 18 de `_parse_data`, 173 de `_parse_por_regex`, 18 de `_parece_nota_fiscal`, 30 de `_comprovante_from_item`, 6 de `_extrair_linhas` (o texto do pdfplumber em PDFs gerados) e 62 leituras inteiras com a IA simulada. Destas, 16 são as da suíte do original, gravadas automaticamente e repetidas pelo plugin (com a entrada original o resultado tem de ser o da suíte; a sanitizada vai para o gabarito). As outras 46 cobrem as quatro combinações das chaves da IA, o orçamento esgotado, a página que traz o valor, a nota reconhecida pela IA e a falha do provedor. As chamadas à IA (texto ou imagem, o texto enviado) são as mesmas.
- `gabarito_comprovantes_servico.py` (o serviço): 524 casos, todos iguais. 55 da suíte (29 cadastros, 6 associações, 2 desassociações, 2 exclusões, 3 leituras, 10 listas e 3 buscas por arquivo), 430 inventados e 39 chamadas diretas do `ComprovanteCreate`. A saída sai do serviço original num SQLite montado só com a entrada; o arquivo não vai para o gabarito (o SHA-256 dos bytes fica no lugar). O banco montado ordena a lista como o PostgreSQL (o pagamento sem data PRIMEIRO na ordem decrescente) e devolve as datas com o fuso; para a conferência com a suíte vale a ordem do SQLite.
- `gabarito_neo_documentos.py` (o NEO): 300 casos, todos iguais. 16 da suíte `test_neo.py` (4 execuções do `processar` com nota ou comprovante, 2 escolhas de comprovante, 2 de nota, 4 associações diretas, 1 resolução de contraparte e 3 medições da sombra) e 284 mundos inventados, sorteados em volta das tolerâncias, da direção da nota, dos dois candidatos, do número no histórico e da sombra, inclusive as pontas da janela uma a uma (3/4 e 7/8 dias, à meia-noite, um segundo depois e às 23h59). Ao todo, 19 comprovantes e 34 notas ligados. O teste (`motor/neoDocumentos.test.ts`) repete o laço do servidor sobre a entrada e confere as contagens, o status de cada transação, a decisão gravada, a partida da classificação e a ligação de cada documento. O banco montado compara a janela de datas como o PostgreSQL (o SQLite deixava de fora o pagamento à meia-noite do último dia).
- Para gerar de novo, o `GABARITO_NOMES` (fora do git) precisa também dos nomes reais do teste do leitor do original (o comprovante do Sicredi em `test_comprovantes_pdf_parser.py`), inclusive o trecho do CNPJ que aparece junto do nome do destinatário.
- **Rotas:** `api/contabil-core/comprovantes/route.test.ts`, 15 testes (permissão, empresa e id conferidos, a consulta, o cadastro em JSON e em formulário, os códigos com os detalhes do duplicado, o download e as ações auditadas iguais às do serviço).
- **Arquivos reais (só contagens, nada no git):** os 4 comprovantes de Downloads (2 PDFs e 2 imagens), com a IA desligada, deram a mesma saída no original e no porte: os 2 PDFs lidos pelos rótulos (com as mesmas linhas do pdfplumber) e as 2 imagens recusadas com a mesma frase.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-comprovantes.ts`, com 52 conferências, rodado 3 vezes seguidas. Percorre a leitura (PDF com texto, imagem e PDF escaneado sem a IA, PDF sem rótulo, nota fiscal, formato não suportado), o cadastro com o arquivo em disco e o download, o arquivo repetido (na leitura e no cadastro), o mesmo pagamento sem e com a confirmação, a lista, o isolamento entre escritórios e empresas, associar, desassociar e excluir com cada recusa, e o NEO: a contraparte pelo comprovante único, pela nota única com o número no histórico, dois comprovantes candidatos (nenhum ligado), a regra com o comprovante (a sombra pelo comprovante), a gravação condicionada, desfazer a classificação e desfazer a importação soltando os dois. Confere os CHECKs e, no fim, a exclusão da empresa apaga as linhas e os arquivos em disco.

**Achados sobre o original (reproduzidos de propósito):**

- **O número de nota de outro CNPJ vai para o histórico pela via do nome.** `_resolver_contraparte_candidata` explica que o `numero_nf` NÃO viaja pela via do documento no histórico, porque chegar ali significa que a nota candidata é de outro CNPJ. Mas a via do nome, logo abaixo, devolve o `numero_nf` junto. Uma transação sem regra cuja nota candidata é de um CNPJ sem contraparte cadastrada, e cujo histórico traz o nome de uma contraparte, sai com "PGTO REF NF <número daquela nota> - <a contraparte do nome>". O porte faz igual; corrigir é decisão à parte.
- **A nota emitida para destinatário sem CNPJ** tem direção "crédito" e é candidata, mas não dá documento para a contraparte: a resolução cai no histórico e no nome, levando o número (pelo item acima).
- **A regra liga os candidatos mesmo quando eles apontam para outra contraparte** (a ligação não depende da resolução): é o desenho do original, e o porte segue.
- **A suíte do original roda em SQLite**, que compara a janela de datas como texto: o comprovante pago à meia-noite do último dia (o que o leitor grava) fica de fora na suíte e entra na produção (PostgreSQL). E a lista de comprovantes põe o sem data por último na suíte e primeiro na produção. O porte segue a produção, e os gabaritos foram montados assim.
- **O cadastro aceitava** a transação desfeita, qualquer conteúdo em base64 (sem conferir o formato) e texto mais longo que a coluna (erro 500 no PostgreSQL); a leitura do arquivo pedia só leitura no módulo.
- **O teste do leitor do original tem nomes e CNPJs reais** de um comprovante do Sicredi (`test_extrai_comprovante_pix_sicredi`). O gabarito sai sanitizado; vale limpar o teste lá.

Divergências da C2:

- **Arquivo em disco, não em base64 no banco** (decisão da B4). O cadastro recebe o arquivo no formulário, e só PDF, PNG e JPEG (o original guardava qualquer base64). O tipo guardado vem do conteúdo; o original deduzia do nome no download, e o "blob" sem extensão saía como `application/octet-stream`.
- **A empresa inexistente** é "não encontrada" antes de tudo (no original, a gravação esbarrava na chave estrangeira). Conferido no gabarito: 1 caso.
- **A transação desfeita é recusada** no cadastro e na associação ("Transação não encontrada nesta empresa."), como nas notas da C1; o original não olhava o `deleted_at`. Conferido no gabarito: 4 casos.
- **Texto mais longo que a coluna e valor acima de `Decimal(15,2)`** são recusados com frase ("O favorecido passa de 300 caracteres.", "O valor passa do limite aceito."); no original, erro 500 do PostgreSQL. Conferido no gabarito: 4 e 1 casos.
- **Mensagens de validação:** as recusas genéricas do pydantic viram frases em português. `permitir_duplicado` só aceita verdadeiro ou falso (o pydantic aceitava também "true", "yes", "1"…), e a data aceita ISO 8601 de 1000 a 9999 e segundos Unix.
- **O cadastro trava a linha da empresa** para a conferência de duplicidade e a gravação não se intercalarem (no original, dois envios simultâneos do mesmo arquivo entravam os dois).
- **Ler o arquivo para pré-preencher pede "agir"** (no original, `comprovantes.read`): serve a quem cadastra e gasta a IA do escritório.
- **Exceção crua do original vira recusa com frase:** o PDF que nem o PyMuPDF abre ("Não foi possível abrir este PDF. Preencha os campos manualmente.", 4 casos no gabarito) e a falha do provedor na camada de imagem (a frase da fundação, 2 casos).
- **As frases da IA desligada** dizem onde ligar no Connect: "OCR externo desabilitado. Ligue, em Contábil Core › Configurações › Leitura de documentos por IA…" e a dica "(a leitura assistida por IA está desligada neste escritório: …)", no lugar das variáveis do servidor (`OPENAI_API_KEY`, `ALLOW_FINANCIAL_DATA_TO_OPENAI`). A dica segue a ordem do original (primeiro o provedor, depois a chave); a recusa da camada de imagem segue a da peça comum (primeiro a chave).
- **O tempo-limite da leitura (65 s)** devolve a frase do original, mas a leitura em andamento não é interrompida (o pdf.js e a chamada à IA terminam sozinhos, sem efeito).
- **A lista** desempata pelo id no mesmo instante, com o sem data primeiro escrito por extenso (o MySQL o poria por último).
- **Excluir** devolve `{ ok: true }`; o original respondia 204.
- **O NEO lê os documentos livres uma vez por execução** (o original os relia a cada transação): o documento cadastrado durante a execução só entra na próxima. A ligação é gravada condicionada, no lugar do `skip_locked` (no original, o documento travado por outra execução saía da contagem de candidatos; aqui ele entra na escolha e só não é ligado). A janela de datas é comparada em UTC (a sessão do PostgreSQL da produção). Os dígitos do CNPJ são os de `\p{Nd}` (o `isdigit()` do original aceita também sobrescritos).
- **Tela:**
  - o arquivo abre em outra aba (o original o mostrava num diálogo com o PDF embutido);
  - a lista mostra a transação ligada (o histórico, a data, o valor) e avisa quando a importação dela foi desfeita;
  - associar tem busca pelo histórico, como nas notas;
  - as contagens de documentos ligados pelo NEO entram no resumo da execução (o original as mostrava num quadro).

### Fase C3: os cartões de crédito

| Onde | Porte de |
|---|---|
| `cartoes/leitor.ts` | `pdf_parser.py`: o texto do PDF (porte do pdfplumber) pelas linhas de compra (`_LINHA_RE`, mês numérico ou abreviado, hora, parcela, "R$", o negativo que é pagamento), o ano pelo vencimento (`_referencia_fatura`), a IA de texto, o total declarado conferido e o orçamento |
| `cartoes/documentos.ts` e `pdf/tabelas.ts` | `documentos.py`: a leitura revisável (composição pelas tabelas do pdfplumber, texto com total explícito, imagem pela IA, uma página por chamada), `_dinheiro` e `validar_itens`. `pdf/tabelas.ts` porta o `extract_tables` (estratégia "lines"), com os traços do PDF que `pdf/caracteres.ts` passou a devolver |
| `cartoes/servico.ts` (puro) | as partes de `CartaoService` e `DistribuicaoService` sem banco e os esquemas de `schemas/cartoes.py`: a validação, a identidade da compra importada (`_identificador_compra` e o `uuid5`), o CSV como o `csv.DictReader`, o `_parse_data`/`_parse_valor` do serviço, o hash da classificação bancária (`_hash`, o `repr` do Python), a vista (`obter`) e as conferências de salvar, aplicar, desfazer e confirmar documento |
| `servidor/cartoes.ts` | `CartaoService`: cartões, faturas, pagamento (associar e desassociar), gastos (à mão, CSV, PDF pela rota `importar_pdf`, remover) e os pagamentos possíveis para a tela |
| `servidor/faturas.ts` | `DistribuicaoService` e `processar_documento`: obter, salvar, aplicar e desfazer a distribuição; enviar, reler, ler em segundo plano, confirmar e baixar o documento |
| `servidor/originaisFaturas.ts` | o PDF em disco (o original guardava os bytes na coluna `conteudo`) |
| `cartoes/rotaDosCartoes.ts` e `api/contabil-core/cartoes/**` | `src/api/v1/cartoes.py`, com os ids no caminho (`/cartoes/[cartaoId]/faturas/[faturaId]/…`) |
| aba "Cartões" (`Cartoes.tsx`, `cartoes/telaDosCartoes.ts`) | `Cartoes.tsx` e `FaturaDistribuicao.tsx` do contabil-front |
| migration `20261123140000_contabil_core_cartoes` | `cartoes_credito`, `faturas_cartao` e `lancamentos_cartao` (0004 e 0011) e `fatura_documentos` e `fatura_distribuicoes` (0043): `core_cartoes_credito`, `core_faturas_cartao`, `core_lancamentos_cartao`, `core_fatura_documentos` e `core_fatura_distribuicoes` |

- **Unicidade:** as quatro do original são TOTAIS e continuam como índices únicos comuns: (cartão, competência), a transação que quitou a fatura, (fatura, hash do PDF) e a distribuição por fatura. Não há `chaveAtiva`. O serviço confere a competência só entre as faturas vivas, como lá; a coluna recusa o resto (P2002 vira a mesma frase).
- **CHECKs:** o enum do status da fatura, a bandeira, os dias de 1 a 28, o status do documento, o gasto não negativo e a versão não negativa. Ficam de fora a parcela (o leitor do original grava "00/03" como parcela 0) e o limite do cartão (o `CartaoUpdate` aceita negativo). O gasto pode ser 0,00: "0,004" passa no esquema e arredonda na coluna, lá e aqui.
- **Os ids da compra importada são os do original** (`uuid5(fatura, sha256 da identidade)`; na confirmação do documento, `uuid5(documento, "<versão>:<n>")`): o mesmo CSV ou PDF reenviado não duplica, também depois da carga.
- **Travas:** o que o original fazia com `with_for_update` sobre a fatura (alterar, pagar, desvincular, lançar, importar, remover gasto, e toda a distribuição e os documentos) roda numa transação que trava a linha da fatura (`SELECT … FOR UPDATE`); o pagamento também é travado. A versão da distribuição avança por `updateMany` condicionado à versão vista (`_avancar`).
- **A distribuição usa a composição do NEO da Fase 3.** `alterarComposicao` foi partida em duas (`alterarComposicaoNaTransacao`), para a aplicação compor o pagamento na mesma transação em que grava a aplicação, como o original. O pagamento pendente é classificado antes na conta do primeiro componente (`classificar_manualmente_lote`: valor suspeito e falta de histórico recusam). Desfazer devolve a composição de antes (ou cancela o lançamento com `cancelarLancamento`, que solta notas e comprovantes); se a classificação mudou no NEO depois, só com "preservar a classificação atual". A aplicação guarda o `NeoComposicaoResponse` inteiro em `antes` e o hash, com as chaves do original, para a carga.
- **O hash da classificação** (`hashDaClassificacao`) é o `sha256(repr((id, valor, data, dc, status, agência, [partidas])))` do Python byte a byte: o hash gravado pelo original continua conferindo depois da carga.
- **Documentos:** o PDF (até 25 MiB; até 32 documentos e 100 MiB por fatura) vai para `storage/contabil-core/faturas/<tenantId>/<id>.pdf` e a linha nasce "processando". A leitura roda depois da resposta (`after` do Next, o `BackgroundTasks` do original), fora de qualquer transação, e grava "revisar" ou "falhou" só se o documento ainda estiver na mesma tentativa ("processando" e o mesmo `updatedAt`). A leitura presa há mais que o prazo da imagem (300 s) mais 60 s aparece como "falhou" ("A leitura foi interrompida; tente novamente.") e pode ser reenviada, como o `leitura_expirada` do original. Nenhuma compra entra sem a revisão: a fonte principal substitui os gastos (pede "substituir" quando já há gastos), a complementar só fica guardada.
- **A IA é a da C1** (`ia/leituraPorIa.ts`): `leitor_de_fatura_texto` (faixa rápida, a camada 2 do leitor) e `leitor_de_fatura_imagem` (faixa padrão, a leitura por imagem do documento), do setor `contabil` e desligados por padrão, com a MESMA chave do escritório (`TenantContabilCoreConfig.iaDocumentosFinanceiros`). A página escaneada vai como PDF de uma página. A fundação ganhou, de forma aditiva, o aviso de resposta cortada (`exigirFim` em `gerarTexto`, `RespostaIncompletaDaIa`), para a frase "A leitura por imagem veio incompleta…" (o `finish_reason != "stop"` do original).
- **Fora do módulo:** excluir a conta contábil usada por um gasto de cartão vivo é recusado (`excluirConta`, "N gasto(s) de cartão"), e a importação do plano conta o gasto de cartão (também o excluído, como `_tem_movimentacao`) entre as contas movimentadas, que não mudam de natureza. A trava de agência do original (`_referencias_restantes` do reapontamento da conta sintética) não tem onde entrar: o Connect não portou o reapontamento. A exclusão da empresa apaga as cinco tabelas antes das transações e do plano, e os PDFs depois do commit (`arquivosDaEmpresa`, pasta `contabil-core/faturas`). O original não usa cartões na exportação, no painel, no cancelamento do NEO nem no desfazer da importação: não há o que levar ao Bloco D.
- **Auditoria:** a rota registra; cada escrita devolve a lista de auditorias (a aplicação e o desfazer levam também a do NEO, antes da da fatura):

  | Ação no Connect | No original |
  |---|---|
  | `contabil.core.cartao.criado` / `.alterado` / `.removido` | log `cartao.criado` / — / — |
  | `contabil.core.fatura.criada` | log `fatura.criada` |
  | `contabil.core.fatura.alterada` | `fatura.status_atualizado` (só quando o status muda) |
  | `contabil.core.fatura.paga` / `.pagamento_desassociado` | `fatura.paga` / `fatura.pagamento_desassociado` |
  | `contabil.core.fatura.lancamento.criado` / `.removido` | — |
  | `contabil.core.fatura.lancamentos.importados` | log `fatura.csv_importado` / `fatura.pdf_importado` (aqui só quando algo entra) |
  | `contabil.core.fatura.distribuicao.salva` / `.aplicada` / `.desfeita` | `fatura.distribuicao_salva` / `_aplicada` / `_desfeita` |
  | `contabil.core.fatura.documento.adicionado` / `.revisado` | `fatura.documento_adicionado` / `fatura.documento_revisado` |
  | `contabil.core.fatura.documento.relido` | — |
  | `contabil.core.composicao.alterada` / `contabil.core.lancamento.cancelado` | `neo.composicao_alterada` / o cancelamento do NEO |
- **Acesso:** ler (listas, distribuição, o PDF) pede "ver"; cadastrar, lançar, importar, pagar, distribuir, aplicar, desfazer e enviar documento pedem "agir" (`cartoes.write`, `cartoes.execute` e `neo.execute`).

**Gabaritos:**

- `gabarito_cartoes.py` (os leitores): 1.107 chamadas, todas iguais fora as divergências contadas. Do leitor: 26 de `_parse_valor`, 128 de `_parse_data`, 10 de `_referencia_fatura`, 571 de `_parse_por_regex`, 113 de `_validar_total_declarado`, 19 de `_parse_ai_response`, 53 de `_lancamento_from_ai`, 4 de `_extrair_linhas` e 32 cenários de `parse_pdf`. Do documento: 42 de `_dinheiro`, 39 de `validar_itens`, 8 de `_vision` e 56 cenários de `ler_documento`; mais o `extract_tables` em 6 PDFs de grade. Da suíte do original, 4 cenários de `ler_documento` e 1 de `_vision`, repetidos pelo plugin com a entrada original; as chamadas puras da suíte entram sanitizadas. As chamadas à IA (sistema, texto, limite) são conferidas com a IA simulada. Regerado na verificação final: o conteúdo é o mesmo (os PDFs do PyMuPDF mudam de bytes a cada execução, pela data e pelo /ID).
- `gabarito_cartoes_servico.py` (o serviço): 1.012 casos, todos iguais fora as divergências contadas: 160 da suíte (`test_cartoes`, `test_fatura_distribuicao` e a parte de cartões de `test_auditoria`), 577 inventados (semente 20261123) e 275 chamadas diretas (os esquemas, `normalizar_competencia`, 40 de `_identificador_compra`, 6 de `uuid5`, 25 de `_parse_data`, 21 de `_parse_valor`, 20 do `csv.DictReader`, 30 de `_hash` e 8 de `leitura_expirada`). A saída sai do serviço original num SQLite montado só com a entrada; o plugin confere que ele repete as 160 da suíte. O SQLite foi corrigido para o PostgreSQL onde divergia (datas com fuso em UTC, o arredondamento do `Numeric(15,2)` na gravação, texto e valor acima da coluna e a chave estrangeira como erro do banco, a afinidade numérica da coluna UUID). Em `aplicar` e `desfazer`, o hash depois do NEO depende de ids aleatórios: o teste confere a decisão, a versão e o que é pedido ao NEO (componentes, classificação, cancelamento e o `antes`); as partidas ficam para o ensaio. Os dois casos de `test_mil_gastos` ficaram fora por tamanho (430 KB cada); entrou um inventado com 60 gastos.
- Para gerar de novo, o `GABARITO_NOMES` (fora do git) precisa também dos nomes de estabelecimentos dos testes do original (4 em `test_cartoes_pdf_parser.py` e 4 em `test_cartoes.py` e `test_fatura_documentos.py`); o CNPJ real de `test_cartoes.py` é trocado pelo sanitizador.
- **Rotas:** `api/contabil-core/cartoes/route.test.ts`, 10 testes (permissão, empresa e ids conferidos, os nomes do original no corpo, os códigos 404/409/422, CSV × PDF, o pagamento, as auditorias da aplicação na ordem, a leitura depois da resposta, o download e as ações iguais às do serviço e do catálogo da auditoria).
- **Arquivos reais (só contagens, nada no git):** 9 PDFs de Downloads (3 de fatura ou composição de cartão e 6 "fatura-*"/"nota-fiscal-fatura-*"), com a IA desligada, deram a mesma saída no original e no porte. `parse_pdf` recusou os 9 com a mesma frase (8 por layout não reconhecido, inclusive uma fatura Sicredi real, e 1 sem texto). `ler_documento` leu a composição real (22 itens, que só fecham o total com o `extract_tables`: a descrição quebra dentro da célula) e recusou 8 por "imagem não autorizada".
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-cartoes.ts`, com 71 conferências, rodado 3 vezes seguidas. Percorre o cartão e a fatura com as recusas, os gastos (à mão, CSV com reenvio e linha errada, compra removida e reimportada, PDF com texto e escaneado), os documentos (composição lida, escaneado sem a IA, mesmo PDF, reler, complementar, principal com substituição, o PDF baixado), o pagamento (valor, crédito, a transação de outra fatura), a distribuição (excesso, conta sintética, versão velha, hash errado, aplicar no pagamento pendente e desfazer, a classificação mudada no NEO e "preservar", aplicar no pagamento classificado e desfazer devolvendo a composição), as travas (conta do plano, cartão com fatura aberta e com distribuição aplicada, desvincular com a aplicação), o isolamento, os CHECKs e as colunas únicas e, no fim, a exclusão da empresa com os PDFs em disco.

**Achados sobre o original (reproduzidos de propósito):**

- **Desvincular o pagamento de uma fatura sem pagamento a fecha:** `desassociar_transacao` não confere se havia transação e põe "fechada" (numa fatura aberta, também).
- **A fatura paga não aceita nem a observação:** `data.status != "paga"` vale para o status ausente, e a atualização sem status é recusada ("Faturas pagas não podem ser reabertas.").
- **O limite do cartão aceita negativo na edição** (o `CartaoUpdate` não tem o `ge=0` do cadastro), e o pydantic aceita `true` como dia 1.
- **A "outra fatura" que já usou a transação** é procurada em qualquer empresa e também entre as excluídas; `remover_cartao` conta a distribuição aplicada de fatura excluída.
- **O que derrubava o original com erro 500**, e aqui é frase: a compra removida e reimportada (a chave primária do `uuid5` repetida), a linha do CSV com coluna a menos, o `\r` solto e as aspas abertas, o valor acima de `Decimal(15,2)` e a descrição acima de 500 (no PostgreSQL), o NaN e o infinito no valor (`[<class 'decimal.InvalidOperation'>]` na linha), `ultimos_digitos` numérico, e, no leitor, o item da IA que não é objeto, a parcela infinita e o "NaN" com total declarado.
- **No leitor:** a parcela "2.0" escrita como texto descarta o lançamento inteiro; `pagamentos_anteriores` nulo vira a falha genérica e um texto vira uma entrada por letra; o dia impossível na composição ("31-fev") vira a falha genérica; `_dinheiro` aceita e guarda "20.000"; o "TOTAL FATURA" que decide a composição diferencia maiúscula, a busca do valor dele não.
- **A suíte do original em SQLite** guarda o UUID com afinidade numérica: `test_mil_gastos` falhou uma vez com um uuid4 só de dígitos e um "e" (instabilidade do próprio original).
- **Os testes do original têm nomes de estabelecimentos e um CNPJ que parecem reais**: o gabarito sai sanitizado; vale limpar lá.

Divergências da C3:

- **PDF em disco, não na coluna** (decisão da B4). A carga (C4) tira os bytes de `fatura_documentos.conteudo`, grava em `storage/contabil-core/faturas/<tenantId>/<id>.pdf` e preenche `storageKey` e `tamanho`; o `hash_arquivo` vem como está. As outras quatro tabelas vêm sem conversão (os ids, o `resultado`, as `distribuicoes` e a `aplicacao` com o hash).
- **As exceções cruas do original viram recusa com frase** (a lista dos achados). Contadas nos testes: no serviço, 11 de coluna (`alemDaColuna`), 7 do `decimal`, 3 de CSV, 2 de compra removida, 1 do validador e 3 do esquema (o `true` como dia, o limite e o valor acima do banco); no leitor, 3 cenários de `parse_pdf` (`RESPOSTA_FORA_DO_FORMATO`).
- **A empresa inexistente** é "não encontrada" antes de tudo (1 caso). **A transação desfeita não paga a fatura** ("Transação não encontrada para esta empresa."), como nas notas e nos comprovantes; o original não olhava o `deleted_at`.
- **PDF sem páginas:** o PyMuPDF abre e recusa por "Quantidade de páginas…"; o pdf.js não abre, e cai na falha genérica (1 caso).
- **Mensagens:** as recusas genéricas do pydantic viram frases em português. As frases da IA desligada dizem onde ligar no Connect ("Leitura por imagem não autorizada na configuração: ligue em Contábil Core › Configurações › Leitura de documentos por IA…").
- **Respostas:** o dinheiro sai sempre com 2 casas (o original devolvia o limite como foi enviado, "50000", e o gasto arredondado meio para par); as exclusões devolvem `{ ok: true, <chave>: null }` (o original respondia 204); a lista de faturas traz o resumo da transação que pagou.
- **Ordens:** os cartões por nome e id; os gastos pela data, pela criação e pelo id; os documentos pela criação e pelo id.
- **A IA de imagem:** a página vai como PDF de uma página, com uma linha de texto (a fundação exige) e sem pedir o formato JSON; "incompleta" só aparece quando a fundação sinaliza o corte (uma recusa da Anthropic vira a falha genérica). As coordenadas dos traços (pdf.js) diferem do original na sexta casa decimal.
- **A leitura em segundo plano** não é interrompida pelo prazo (300 + 10 s): o resultado chega e é descartado se a tentativa mudou, como lá.
- **`contaBancaria`** (a conta sintética do banco, quando a agência não tem conta) é criada numa transação própria, antes da aplicação: se a aplicação for recusada depois, a conta sintética fica, como na classificação manual do Connect.
- **Reler o documento** fica na auditoria (o original não registrava).
- **Tela:** editar e ativar/inativar o cartão e reabrir a fatura fechada sem pagamento são novos (o serviço já aceitava); os pagamentos possíveis vêm de uma rota própria (débitos vivos com o valor exato, até 100); motivo e confirmações em diálogos (o original usava `window.prompt`/`confirm`); um botão só para importar CSV ou PDF (o PDF vai ao leitor direto; a revisão fica em "Enviar PDF para revisão"); o PDF baixa como "fatura.pdf"; as somas da tela são em centavos. A tela consulta a distribuição a cada 2 s enquanto um documento é lido, e `obter` trava a fatura como o original: pesa, mas funciona (ver as decisões).

**Precisam de decisão:**

- `obter` trava a fatura (`for_update`, como o original) e a tela consulta a cada 2 s durante a leitura: tirar a trava da leitura?
- O reapontamento da conta sintética (`ReapontamentoService`) não foi portado; a trava dos gastos de cartão dele fica para quando vier.
- `editarConta` do Connect não recusa mudar a natureza (tipo e S/A) de conta movimentada, como o `atualizar` do original; com os cartões, o gasto também contaria. É anterior à C3.
- A transação desfeita pagar a fatura: o porte recusa (como C1 e C2); o original aceitava.

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
| `core_conciliacao_revisoes` | `conciliacao_revisoes` | `snapshot` e `relatorio` em JSON, com as chaves do original; `agenciaId` sem chave estrangeira |
| `core_conciliacao_vinculos` | `conciliacao_vinculos` | `usuario_id` vira `confirmadoPorId` |
| `core_financeiro_analises` | `financeiro_analises` | `snapshot` em JSON, com as chaves do original; `agenciaId` sem chave estrangeira; `criado_por` vira `criadoPorId` |
| `core_financeiro_documentos` | `financeiro_documentos` | sem os bytes: o original fica em disco (`storageKey`) |
| `core_financeiro_vinculos` | `financeiro_vinculos` | `usuario_id` vira `confirmadoPorId` |
| `core_notas_fiscais` | `notas_fiscais` | unicidades totais por empresa (chave de acesso e `dedupKey`); `transacaoId` → `core_transacoes` |

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
| `uq_conciliacao_revisao_origem` | `core_conciliacao_revisoes (empresaId, agenciaId, chaveAtiva)`; a chave é o próprio `revisao_hash` (hexadecimal) |

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

- **Ordem:** empresa → plano de contas (sem o pai; o pai numa segunda passada) → faixas → agências → contrapartes → regras → importações → transações → decisões do NEO → partidas → exportações → (Bloco B) revisões → vínculos da revisão → análises do financeiro → documentos, com o original em disco → vínculos do financeiro.
- **Idempotente:** cada linha entra com o UUID do original (`upsert`). Rodar de novo atualiza o espelho, sem duplicar. O que alguém editar no Connect numa empresa espelhada é sobrescrito na rodada seguinte.
- **Retrato consistente:** a leitura é uma transação `REPEATABLE READ READ ONLY` no original.
- **Empresas:** ligadas à `Company` do escritório de destino (`CARGA_TENANT_ID`) pelos dígitos do CNPJ. Empresa sem par, com mais de um par, ou já ligada no Contábil Core do Connect com outro cadastro fica de fora e vai para o relatório.
- **Pessoas:** "criado por", "cancelado por" e similares são ligados ao `User` pelo e-mail; sem par, ficam nulos e vão para o relatório.
- **Colunas de unicidade** (`codigoAtivo`, `chaveAtiva`, `hashAtivo`, `chave`, `transacaoSemRegra`…): calculadas pelas mesmas funções que o Connect usa ao gravar (`motor/chaves.ts`).
- **Recusa por linha:** um lote de 200 que o banco recusa é refeito linha a linha, e só a linha que bateu fica de fora, nomeada no relatório.
- **Saída:** o terminal mostra contagens e o CNPJ mascarado; o que identifica empresa ou pessoa vai para o relatório, um arquivo local (por padrão na pasta temporária) que não vai para o git.
- **Fica para a virada:** o `audit_logs` do original (`contabil.core.legado.*`) e as tabelas dos Blocos C e D.
- **Limite do espelho:** linha apagada de verdade no original (não por `deleted_at`) continua no Connect. O original apaga por `deleted_at` em quase tudo.

**Bloco B (Fase B5, 18/11/2026):** as cinco tabelas da conciliação, só das empresas espelhadas, depois das transações (o `extrato_hash` é calculado sobre elas).

| Tabela no original | No Connect | Copiado | Calculado ou ligado |
|---|---|---|---|
| `conciliacao_revisoes` | `core_conciliacao_revisoes` | `snapshot`, `relatorio`, hashes, período, versão, título | `chaveAtiva` (`revisaoChaveAtiva`); `criado_por` → `criadoPorId` |
| `conciliacao_vinculos` | `core_conciliacao_vinculos` | `extrato_ids`, `razao_itens`, totais, estado e desfazer | `usuario_id` → `confirmadoPorId` |
| `financeiro_analises` | `core_financeiro_analises` | `snapshot`, `extrato_hash`, período, versão, título | `criado_por` → `criadoPorId` |
| `financeiro_documentos` | `core_financeiro_documentos` | nome, tipo, `hash_arquivo`, tipo de mídia, tamanho | `storageKey` (`chaveDoOriginal`); `conteudo` → arquivo em disco |
| `financeiro_vinculos` | `core_financeiro_vinculos` | `financeiro_ids`, `comparacao_ids`, totais, estado e desfazer | `usuario_id` → `confirmadoPorId` |

- **JSON sem conversão.** O leitor recebe as colunas `json` como texto (o `JSON.parse` do `pg` arredondaria em silêncio um inteiro grande), e `jsonDoOriginal` confere e lê. Nos esquemas do Bloco B só há texto, inteiro, booleano e nulo: o dinheiro é o texto do `Decimal` ("-350.00"), e não há número fracionário. O único valor que mudaria é um inteiro fora de ±2^53, e aí a linha é recusada. A ordem das chaves o MySQL refaz, sem mudar valor (ver a divergência da B3). Os hashes gravados (`extrato_hash`, `revisao_hash`, `hashes_apoio`) e os ids das sugestões continuam valendo. Dinheiro das colunas `Numeric(15,2)` vai como o texto do PostgreSQL.
- **Pessoa em coluna obrigatória.** `criadoPorId` e `confirmadoPorId` não aceitam nulo. Sem par no Connect, a coluna recebe `contabil-core:<uuid do original>` em vez de pular a linha. Pular perderia a revisão ou a análise inteira, com os vínculos, e o nome de quem confirmou já fica em `responsavel`. É o mesmo estado de quem foi excluído do Connect: essas colunas são trilha sem chave estrangeira, com tratamento "manter" em `exclusao/registro.ts`, e nada as lê para mostrar nome. O prefixo deixa claro que o id não é de `User`. A pessoa vai para `pessoasSemPar` no relatório.
- **Conta bancária.** `agenciaId` é referência sem chave, como no original; a agência veio antes, com o mesmo UUID. Revisão ou análise cuja agência não veio (apagada de verdade no original) entra assim mesmo e é listada em `semAgencia` no relatório. No Connect, como no original, ela abre como histórico (`fontesValidas` falso).
- **Páginas.** Revisões e análises são lidas em páginas de 50, dentro do mesmo retrato, e gravadas em lotes de 10, porque um snapshot pode ter milhares de linhas.
- **Originais em disco.** Os bytes de `financeiro_documentos.conteudo` são lidos um documento por vez. Antes de gravar, o SHA-256 é conferido contra `hash_arquivo` e o tamanho contra `tamanho`; se algum diferir, a linha é recusada e nomeada no relatório.
  - O arquivo vai para `storage/contabil-core/financeiro/<tenantId do Connect>/<id do documento>.<ext>`, por `chaveDoOriginal` e `gravarOriginal`, as mesmas funções do serviço (B4).
  - **Idempotente:** arquivo que já está lá com o mesmo SHA-256 não é regravado; com outro conteúdo, é reescrito. O terminal mostra novos, iguais e reescritos.
  - Se o banco recusar a linha de um arquivo gravado naquela rodada, o arquivo é apagado.
  - Sem `--gravar`, os hashes são conferidos e nada vai para o disco.
  - Rode a carga da pasta raiz do Connect: o `storage/` é relativo a ela.
- **Exclusão:** a exclusão da empresa no Connect apaga as cinco tabelas e esses arquivos (`arquivosDaEmpresa`), como os criados pela tela.

### Conferência (`scripts/contabil-core/conferir-carga.ts`)

Só lê, dos dois lados, para cada empresa espelhada:

- contagem por tabela (total e vivas);
- soma por mês e lado (D/C) das transações vivas e das partidas vigentes;
- com `--dominio=<pasta>`, o TXT do Domínio que o Connect gera, comparado byte a byte com o baixado do Contábil Core (Exportar › Lançamentos para importação, TXT), nomeado `<CNPJ>_<AAAA-MM>.txt`;
- Bloco B (só contagens de iguais e diferentes, porque o JSON e os arquivos têm dado de cliente):
  - o JSON gravado igual ao do original, valor a valor (`mesmoJson`: listas na ordem, chaves em qualquer ordem): snapshot e relatório de cada revisão, snapshot de cada análise e os ids de cada vínculo;
  - o `extrato_hash` recalculado no Connect a partir das transações espelhadas, por `lerExtrato` com `evidenciaDoExtrato` e `hashJson` (revisão) ou `identidadeDoExtrato` (análise). O resultado é comparado ao gravado e à mesma conta feita no original com as transações de lá. Assim a validade (`fontesValidas`, `extratoValido`) é a mesma nos dois lados; quando o extrato não mudou, continua verdadeira depois da carga;
  - cada revisão e análise viva aberta pelos serviços (`obterRevisao`, `obterAnalise`), com a validade e o número de vínculos iguais aos do original;
  - o SHA-256 de cada original em disco igual ao `hash_arquivo`, e o original baixado por `originalDoDocumento` igual, nos documentos vivos de análises vivas.

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
3. `scripts/contabil-core/povoar_conciliacao_local.py` (B5), no mesmo banco, depois do anterior. Acrescenta a cada empresa uma conta Itaú ligada à conta contábil e o extrato de abril. Depois, pelos serviços do original (`RevisaoService`, `FinanceiroService`), cria dados inventados:
   - **revisões:** uma com SISPAG e Razão de apoio, com vínculos ativos, um desfeito e refeito, e um confirmado pela pessoa sem par; uma renomeada; uma excluída e criada de novo (o mesmo `revisao_hash` vivo e apagado);
   - **análises:** uma com os quatro tipos de documento (planilhas inventadas), com um vínculo direto, um lote de sugestões, uma sugestão confirmada pela pessoa sem par e um vínculo desfeito; outra com documento, renomeada e excluída.
4. `scripts/contabil-core/preparar-ensaio-carga.ts`: cria no Connect local a empresa com par.
5. A carga (simular e gravar duas vezes) e a conferência.

Resultado em 10/11/2026: tudo igual ao original, inclusive o TXT do Domínio byte a byte; a segunda rodada não duplicou nem recusou nada.

Resultado da B5 em 18/11/2026, na empresa com par:
- **Lidas e gravadas:** 4 revisões (1 excluída), 4 vínculos da revisão, 2 análises (1 excluída), 5 documentos e 5 vínculos do financeiro. Nada recusado. A outra empresa ficou de fora.
- **Primeira rodada:** 5 arquivos novos em disco.
- **Segunda rodada:** 0 novos, 5 iguais e 0 reescritos, sem duplicar nem recusar nada.
- **Conferência:** 29 itens iguais, entre eles os 5 originais em disco e os 4 baixados pelo serviço. O JSON de 4 revisões, 2 análises e 9 vínculos saiu igual, e as 6 têm o extrato da criação. O Domínio continua byte a byte.
- **No Connect:** a revisão abre com `fontesValidas` verdadeiro e a análise com `extratoValido` verdadeiro, pelos serviços.
- **Ensaio negativo:** dois arquivos adulterados ou apagados em disco aparecem na conferência (DIFERE) e voltam na rodada seguinte. Bytes adulterados no original recusam a linha ("SHA-256 do conteúdo diferente do hash_arquivo do original").

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
