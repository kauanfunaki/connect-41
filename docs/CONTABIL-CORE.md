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
| **D: independentes** | ajustes do porte (D0), exportações restantes, "Conflitos e qualidade" do NEO, painel e carteira (D1), relatórios (D2) e ConcilPro (D3). Open Banking e aplicações financeiras ficam fora (ver "Bloco D") | cada um por conta própria |

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
| C4 | `feat/contabil-core-carga-documentos` | As tabelas do Bloco C na carga (espelho), com os arquivos dos comprovantes e os PDFs das faturas em disco e as travas novas do Connect decididas antes de gravar. Sem migration. Ver "Carga dos dados", parte do Bloco C. |

**O Bloco C está completo** com a C4 (25/11/2026): notas, comprovantes e cartões, com a carga e a conferência. Como os outros, vai para a produção desligado até a virada única.

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
  - Corrigir é uma decisão à parte, que vale para os dois sistemas. **Decidido (Angelo, 26/11/2026): fica como está.**
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
- **Fica como no original (decidido pelo Angelo em 26/11/2026):** a nota cadastrada à mão nasce com a procedência `xml_assinado` (o padrão do `NotaFiscalCreate`, que a tela do original não mudava).
- **Fora da C1:** o uso das notas pelo NEO (`_selecionar_nota_candidata`, a contraparte pela nota e o número da nota no histórico) vai para a C2, junto dos comprovantes, porque o motor usa os dois do mesmo jeito. A exportação das notas (`nfe_entrada`, `nfse_tomado`…) e os números do painel vieram na Fase D1 (ver "Fase D1").
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
- **A contraparte** (`resolverContraparte`): a nota candidata (o emitente no débito, o destinatário no crédito), depois o documento do comprovante candidato, depois o documento impresso no histórico e por último o nome. O número da nota vai para o histórico gerado ("PGTO REF NF 4321 - …") só quando a contraparte veio da nota; pelo documento do histórico e pelo nome, não (a nota é de outro CNPJ). Pelo nome, o original levava o número: desde a D0 é divergência deliberada (ver "Fase D0").
- **Com regra**, a contraparte é só medida (modo sombra): a decisão grava a contraparte, a conta, a origem (agora também `nota_fiscal` e `comprovante`) e a divergência de conta, e a classificação é a da regra.
- **A ligação:** quem classifica (pela regra ou pela contraparte) liga os dois candidatos, depois das partidas, na mesma transação do lançamento, por `updateMany` que exige o documento ainda livre (`transacaoId` nulo; a nota, também "pendente"). É o lugar do `with_for_update(skip_locked=True)`: se outra pessoa ou outra execução ligou o documento nesse meio-tempo, ele simplesmente não é ligado. Ligado ou não, sai do conjunto da execução (os consumidos). As contagens `comprovantesAssociados` e `notasAssociadas` contam só o que de fato ligou, e a aba NEO as mostra no resumo da execução.

**Gabaritos:**

- `gabarito_comprovantes.py` (o leitor): 350 chamadas, todas iguais. 43 de `_parse_valor`, 18 de `_parse_data`, 173 de `_parse_por_regex`, 18 de `_parece_nota_fiscal`, 30 de `_comprovante_from_item`, 6 de `_extrair_linhas` (o texto do pdfplumber em PDFs gerados) e 62 leituras inteiras com a IA simulada. Destas, 16 são as da suíte do original, gravadas automaticamente e repetidas pelo plugin (com a entrada original o resultado tem de ser o da suíte; a sanitizada vai para o gabarito). As outras 46 cobrem as quatro combinações das chaves da IA, o orçamento esgotado, a página que traz o valor, a nota reconhecida pela IA e a falha do provedor. As chamadas à IA (texto ou imagem, o texto enviado) são as mesmas.
- `gabarito_comprovantes_servico.py` (o serviço): 524 casos, todos iguais. 55 da suíte (29 cadastros, 6 associações, 2 desassociações, 2 exclusões, 3 leituras, 10 listas e 3 buscas por arquivo), 430 inventados e 39 chamadas diretas do `ComprovanteCreate`. A saída sai do serviço original num SQLite montado só com a entrada; o arquivo não vai para o gabarito (o SHA-256 dos bytes fica no lugar). O banco montado ordena a lista como o PostgreSQL (o pagamento sem data PRIMEIRO na ordem decrescente) e devolve as datas com o fuso; para a conferência com a suíte vale a ordem do SQLite.
- `gabarito_neo_documentos.py` (o NEO): 300 casos, todos iguais na C2. Desde a D0, 3 deles divergem de propósito (o número da nota pela via do nome), contados um a um no teste; o gabarito não foi regerado. 16 da suíte `test_neo.py` (4 execuções do `processar` com nota ou comprovante, 2 escolhas de comprovante, 2 de nota, 4 associações diretas, 1 resolução de contraparte e 3 medições da sombra) e 284 mundos inventados, sorteados em volta das tolerâncias, da direção da nota, dos dois candidatos, do número no histórico e da sombra, inclusive as pontas da janela uma a uma (3/4 e 7/8 dias, à meia-noite, um segundo depois e às 23h59). Ao todo, 19 comprovantes e 34 notas ligados. O teste (`motor/neoDocumentos.test.ts`) repete o laço do servidor sobre a entrada e confere as contagens, o status de cada transação, a decisão gravada, a partida da classificação e a ligação de cada documento. O banco montado compara a janela de datas como o PostgreSQL (o SQLite deixava de fora o pagamento à meia-noite do último dia).
- Para gerar de novo, o `GABARITO_NOMES` (fora do git) precisa também dos nomes reais do teste do leitor do original (o comprovante do Sicredi em `test_comprovantes_pdf_parser.py`), inclusive o trecho do CNPJ que aparece junto do nome do destinatário.
- **Rotas:** `api/contabil-core/comprovantes/route.test.ts`, 15 testes (permissão, empresa e id conferidos, a consulta, o cadastro em JSON e em formulário, os códigos com os detalhes do duplicado, o download e as ações auditadas iguais às do serviço).
- **Arquivos reais (só contagens, nada no git):** os 4 comprovantes de Downloads (2 PDFs e 2 imagens), com a IA desligada, deram a mesma saída no original e no porte: os 2 PDFs lidos pelos rótulos (com as mesmas linhas do pdfplumber) e as 2 imagens recusadas com a mesma frase.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-comprovantes.ts`, com 52 conferências, rodado 3 vezes seguidas. Percorre a leitura (PDF com texto, imagem e PDF escaneado sem a IA, PDF sem rótulo, nota fiscal, formato não suportado), o cadastro com o arquivo em disco e o download, o arquivo repetido (na leitura e no cadastro), o mesmo pagamento sem e com a confirmação, a lista, o isolamento entre escritórios e empresas, associar, desassociar e excluir com cada recusa, e o NEO: a contraparte pelo comprovante único, pela nota única com o número no histórico, dois comprovantes candidatos (nenhum ligado), a regra com o comprovante (a sombra pelo comprovante), a gravação condicionada, desfazer a classificação e desfazer a importação soltando os dois. Confere os CHECKs e, no fim, a exclusão da empresa apaga as linhas e os arquivos em disco.

**Achados sobre o original (reproduzidos de propósito):**

- **O número de nota de outro CNPJ vai para o histórico pela via do nome.** `_resolver_contraparte_candidata` explica que o `numero_nf` NÃO viaja pela via do documento no histórico, porque chegar ali significa que a nota candidata é de outro CNPJ. Mas a via do nome, logo abaixo, devolve o `numero_nf` junto. Uma transação sem regra cuja nota candidata é de um CNPJ sem contraparte cadastrada, e cujo histórico traz o nome de uma contraparte, sai com "PGTO REF NF <número daquela nota> - <a contraparte do nome>". **Corrigido na D0** (decisão do Angelo, 26/11/2026): virou divergência deliberada, ver "Fase D0".
- **A nota emitida para destinatário sem CNPJ** tem direção "crédito" e é candidata, mas não dá documento para a contraparte: a resolução cai no histórico e no nome. O original levava o número pelo nome (item acima); desde a D0, não leva.
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
- **Travas:** o que o original fazia com `with_for_update` sobre a fatura (alterar, pagar, desvincular, lançar, importar, remover gasto, e toda a distribuição e os documentos) roda numa transação que trava a linha da fatura (`SELECT … FOR UPDATE`); o pagamento também é travado. A consulta da distribuição (`obter`) deixou de travar na D0 (ver "Fase D0"). A versão da distribuição avança por `updateMany` condicionado à versão vista (`_avancar`).
- **A distribuição usa a composição do NEO da Fase 3.** `alterarComposicao` foi partida em duas (`alterarComposicaoNaTransacao`), para a aplicação compor o pagamento na mesma transação em que grava a aplicação, como o original. O pagamento pendente é classificado antes na conta do primeiro componente (`classificar_manualmente_lote`: valor suspeito e falta de histórico recusam). Desfazer devolve a composição de antes (ou cancela o lançamento com `cancelarLancamento`, que solta notas e comprovantes); se a classificação mudou no NEO depois, só com "preservar a classificação atual". A aplicação guarda o `NeoComposicaoResponse` inteiro em `antes` e o hash, com as chaves do original, para a carga.
- **O hash da classificação** (`hashDaClassificacao`) é o `sha256(repr((id, valor, data, dc, status, agência, [partidas])))` do Python byte a byte: o hash gravado pelo original continua conferindo depois da carga.
- **Documentos:** o PDF (até 25 MiB; até 32 documentos e 100 MiB por fatura) vai para `storage/contabil-core/faturas/<tenantId>/<id>.pdf` e a linha nasce "processando". A leitura roda depois da resposta (`after` do Next, o `BackgroundTasks` do original), fora de qualquer transação, e grava "revisar" ou "falhou" só se o documento ainda estiver na mesma tentativa ("processando" e o mesmo `updatedAt`). A leitura presa há mais que o prazo da imagem (300 s) mais 60 s aparece como "falhou" ("A leitura foi interrompida; tente novamente.") e pode ser reenviada, como o `leitura_expirada` do original. Nenhuma compra entra sem a revisão: a fonte principal substitui os gastos (pede "substituir" quando já há gastos), a complementar só fica guardada.
- **A IA é a da C1** (`ia/leituraPorIa.ts`): `leitor_de_fatura_texto` (faixa rápida, a camada 2 do leitor) e `leitor_de_fatura_imagem` (faixa padrão, a leitura por imagem do documento), do setor `contabil` e desligados por padrão, com a MESMA chave do escritório (`TenantContabilCoreConfig.iaDocumentosFinanceiros`). A página escaneada vai como PDF de uma página. A fundação ganhou, de forma aditiva, o aviso de resposta cortada (`exigirFim` em `gerarTexto`, `RespostaIncompletaDaIa`), para a frase "A leitura por imagem veio incompleta…" (o `finish_reason != "stop"` do original).
- **Fora do módulo:** excluir a conta contábil usada por um gasto de cartão vivo é recusado (`excluirConta`, "N gasto(s) de cartão"), e a importação do plano conta o gasto de cartão (também o excluído, como `_tem_movimentacao`) entre as contas movimentadas, que não mudam de natureza. A trava de agência do original (`_referencias_restantes` do reapontamento da conta sintética) entrou com o reapontamento, na D0: o gasto de cartão na sintética a mantém viva. A exclusão da empresa apaga as cinco tabelas antes das transações e do plano, e os PDFs depois do commit (`arquivosDaEmpresa`, pasta `contabil-core/faturas`). O original não usa cartões na exportação, no painel, no cancelamento do NEO nem no desfazer da importação: não há o que levar ao Bloco D.
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
- **A empresa inexistente** é "não encontrada" antes de tudo (1 caso). **A transação desfeita não paga a fatura** ("Transação não encontrada para esta empresa."), como nas notas e nos comprovantes; o original não olhava o `deleted_at`. A recusa foi mantida por decisão do Angelo (26/11/2026).
- **PDF sem páginas:** o PyMuPDF abre e recusa por "Quantidade de páginas…"; o pdf.js não abre, e cai na falha genérica (1 caso).
- **Mensagens:** as recusas genéricas do pydantic viram frases em português. As frases da IA desligada dizem onde ligar no Connect ("Leitura por imagem não autorizada na configuração: ligue em Contábil Core › Configurações › Leitura de documentos por IA…").
- **Respostas:** o dinheiro sai sempre com 2 casas (o original devolvia o limite como foi enviado, "50000", e o gasto arredondado meio para par); as exclusões devolvem `{ ok: true, <chave>: null }` (o original respondia 204); a lista de faturas traz o resumo da transação que pagou.
- **Ordens:** os cartões por nome e id; os gastos pela data, pela criação e pelo id; os documentos pela criação e pelo id.
- **A IA de imagem:** a página vai como PDF de uma página, com uma linha de texto (a fundação exige) e sem pedir o formato JSON; "incompleta" só aparece quando a fundação sinaliza o corte (uma recusa da Anthropic vira a falha genérica). As coordenadas dos traços (pdf.js) diferem do original na sexta casa decimal.
- **A leitura em segundo plano** não é interrompida pelo prazo (300 + 10 s): o resultado chega e é descartado se a tentativa mudou, como lá.
- **`contaBancaria`** (a conta sintética do banco, quando a agência não tem conta) é criada numa transação própria, antes da aplicação: se a aplicação for recusada depois, a conta sintética fica, como na classificação manual do Connect.
- **Reler o documento** fica na auditoria (o original não registrava).
- **Tela:** editar e ativar/inativar o cartão e reabrir a fatura fechada sem pagamento são novos (o serviço já aceitava); os pagamentos possíveis vêm de uma rota própria (débitos vivos com o valor exato, até 100); motivo e confirmações em diálogos (o original usava `window.prompt`/`confirm`); um botão só para importar CSV ou PDF (o PDF vai ao leitor direto; a revisão fica em "Enviar PDF para revisão"); o PDF baixa como "fatura.pdf"; as somas da tela são em centavos. A tela consulta a distribuição a cada 2 s enquanto um documento é lido; desde a D0 essa consulta não trava a fatura (o original travava).

**Precisavam de decisão (todas resolvidas pelo Angelo em 26/11/2026, ver "Bloco D"):**

- ~~`obter` trava a fatura (`for_update`, como o original) e a tela consulta a cada 2 s durante a leitura: tirar a trava da leitura?~~ **Resolvido:** a consulta não trava mais; as escritas continuam travando (D0).
- ~~O reapontamento da conta sintética (`ReapontamentoService`) não foi portado; a trava dos gastos de cartão dele fica para quando vier.~~ **Resolvido:** portado na D0, com o gasto de cartão entre as referências restantes.
- ~~`editarConta` do Connect não recusa mudar a natureza (tipo e S/A) de conta movimentada, como o `atualizar` do original; com os cartões, o gasto também contaria. É anterior à C3.~~ **Resolvido:** fica como está.
- ~~A transação desfeita pagar a fatura: o porte recusa (como C1 e C2); o original aceitava.~~ **Resolvido:** a recusa se mantém.

## Bloco D: independentes

### Decisões (Angelo, 26/11/2026)

- **Fases do Bloco D:**

  | Fase | Branch | O que entra |
  |---|---|---|
  | D0 | `feat/contabil-core-ajustes-d0` | Ajustes do porte decididos nesta data: o número da nota no histórico, o reapontamento da conta sintética e a trava da leitura da fatura. Sem migration. Ver "Fase D0". |
  | D1 | | As exportações restantes (lançamentos em CSV, extrato, as quatro de notas e a conferência), "Conflitos e qualidade" do NEO, o painel e a carteira. |
  | D2 | `feat/contabil-core-relatorios` | Os relatórios (DRE, Balancete e Livro Caixa), portados como estão no original. Sem migration. Ver "Fase D2". |
  | D3 | | O ConcilPro, mais a carga das tabelas dele. |

- **Ficam fora, sem previsão:** Open Banking (Pluggy) e aplicações financeiras. Entram só se surgir necessidade.
- **Ficam como estão:**
  - a assinatura de NF-e real que nunca confere no original (C1): toda NF-e real continua entrando como `xml_nao_verificado`;
  - a nota cadastrada à mão nascendo `xml_assinado` (C1);
  - `editarConta` permitindo mudar a natureza (tipo e S/A) de conta movimentada (anterior à C3).
- **Corrige-se** o número da nota no histórico pela via do nome (C2). Ver a D0.
- **Porta-se** o reapontamento da conta sintética (`ReapontamentoService`). Ver a D0.
- **Tira-se** a trava da leitura da fatura (C3). Ver a D0.
- **Mantém-se** a recusa da transação desfeita no pagamento da fatura (C3), como nas notas (C1) e nos comprovantes (C2).

### Fase D0: ajustes

| Onde | O quê |
|---|---|
| `motor/neo.ts` (`resolverContraparte`) | o número da nota só vai para o histórico quando a contraparte veio da própria nota candidata |
| `cadastro/reapontamento.ts` (puro) | `ReapontamentoService.reapontar` (`src/domain/agencias/service.py:228-343`): o laço, as referências restantes e o relatório, sobre `BancoDoReapontamento` |
| `servidor/cadastros.ts` (`reapontarContasSinteticas`) | o banco do reapontamento (Prisma, numa transação) e a auditoria |
| `api/contabil-core/agencias/reapontar-contas-sinteticas` | `POST /empresas/{id}/agencias/reapontar-contas-sinteticas` (`src/api/v1/agencias.py:104-124`) |
| `CorrigirContaDoRazao.tsx`, em Configurações › Contas bancárias | o botão "Corrigir conta do razão", a confirmação e o relatório de `AgenciasTab.tsx` |
| `servidor/faturas.ts` (`obterDistribuicao`) | a consulta da distribuição sem `FOR UPDATE` |

**1. O número da nota no histórico (divergência deliberada).** `resolverContraparte` não leva mais o `numeroNf` pela via do nome, só pela própria nota candidata (pelo documento do histórico já não levava). A transação sem regra cuja nota candidata é de um CNPJ sem contraparte cadastrada, e cujo histórico traz o nome de outra contraparte, sai com "PGTO REF <contraparte do nome>", e não mais com o número de uma nota que não é dela.

- O gabarito da C2 (`motor/gabarito/documentos/`) NÃO foi regerado: continua sendo a saída do original.
- O teste (`motor/neoDocumentos.test.ts`) conta os casos que agora divergem, um a um: 3 dos 300 (os inventados 46, 117 e 249, todos de `processar`). Em cada um, a única diferença aceita é o "NF <número> - " a menos no histórico da partida classificada pelo nome. O resultado, os status, as decisões e os documentos ligados são os mesmos. Nenhum caso de `resolver` nem da sombra mudou.

**2. O reapontamento da conta sintética.** Quando a conta bancária não tem conta contábil, o NEO cria a conta `1.1.B.<16 primeiros hex do id da agência>` sem código reduzido e a vincula à conta bancária (`contaBancaria`, o `_obter_conta_bancaria` do original). O Domínio usa o código reduzido, e a exportação cai no código `1.1.B.…`, que ele não importa (com o aviso "Contas sem código reduzido"). Vincular a conta certa conserta os lançamentos novos; o reapontamento move os que já estão gravados.

- **O que faz:** para cada conta bancária viva da empresa com conta contábil vinculada (também as inativas, como o original), acha a sintética viva com o código dela e move para a conta vinculada:
  - as partidas (`core_registros`), todas, também as canceladas, como o original;
  - as decisões do NEO, pela conta e pela conta da contraparte (uma decisão com as duas na sintética conta 2, como lá).

  Depois conta as referências restantes. Sem nenhuma, desativa a sintética como o Connect desativa conta (`deletedAt` e `codigoAtivo` nulo). Devolve o relatório por conta bancária, com os campos do original em camelCase: `agencia`, `contaSintetica`, `registrosMovidos`, `decisoesMovidas`, `sinteticaDesativada` e `referenciasRestantes`.
- **Referências restantes** (a sintética fica viva e o relatório diz o quê):

  | Chave | O que conta | Origem |
  |---|---|---|
  | `regras` | regras do NEO na sintética, também as inativas e as apagadas | original |
  | `contrapartes` | contrapartes na sintética, também as apagadas | original |
  | `lancamentosCartao` | gastos de cartão na sintética, também os apagados (a trava que a C3 deixou pendente) | original |
  | `agencias` | outra conta bancária viva vinculada à sintética | só no Connect |
  | `contasFilhas` | conta viva do plano com a sintética como pai | só no Connect |
  | `distribuicoesFatura` | distribuição de fatura viva com um componente salvo na sintética (JSON) | só no Connect |

  Nenhuma tabela que só o Connect tem aponta para conta do plano. As conciliações (B2 a B4) leem a conta vinculada da agência na hora e guardam o código, não o id; notas, comprovantes e faturas não têm conta. As três últimas linhas são referências que o original também tinha nas tabelas dele, mas não contava:
  - a conta bancária e a conta filha são as mesmas que `excluirConta` do Connect recusa;
  - o componente da distribuição é o mesmo que `aplicar` recusaria depois ("Escolha contas analíticas desta empresa, não excluídas").

  Desativar a sintética com elas deixaria uma referência órfã, que é o que a própria rotina diz querer evitar.
- **Transação e travas:** tudo numa transação Prisma. As contas bancárias vinculadas da empresa são travadas no começo (`SELECT … FOR UPDATE`), para ninguém trocar o vínculo no meio. A desativação é um `updateMany` condicionado à conta ainda viva. Cada gravação é filtrada pelo tenant e pela empresa.
- **Acesso:** "gerir", como as outras escritas de conta bancária (`salvarAgenciaAction`, `mudarAtivaDaAgenciaAction`). O original pedia `agencias.write`.
- **Auditoria:** `contabil.core.contas_sinteticas.reapontadas` ("moveu para a conta contábil vinculada os lançamentos da conta bancária sintética na empresa"), na empresa, com a razão social e, por conta bancária, os ids (agência, de, para) e a linha do relatório. Só quando o relatório não vem vazio. O original só registrava em log (`agencias.reapontamento`).
- **Tela:** em Configurações › Contas bancárias, para quem pode "gerir" e quando há conta bancária. O botão "Corrigir conta do razão" abre a confirmação (`ConfirmDialog`), que explica a sintética e avisa que a ação **reescreve registros contábeis já lançados**; "Corrigir agora" chama a rota. Relatório vazio vira o aviso "Nada a corrigir". Senão, o diálogo "Contas corrigidas" mostra cada conta bancária, o que foi movido e, quando a sintética ficou, por quê.
- **Exportação:** conferida no ensaio. Antes, as 3 linhas do Domínio saem com `1.1.B.…` na coluna do banco e com o aviso; depois, com o código reduzido da conta vinculada, sem aviso e com o resto da linha igual.

Divergências do reapontamento (contadas no teste):

- **A conta bancária ainda vinculada à PRÓPRIA sintética é pulada** (3 casos). É o estado em que o NEO a deixa enquanto ninguém vincula a conta certa. O original "movia" as partidas para a mesma conta (contando-as como movidas) e desativava a sintética que a conta bancária ainda usava; na execução seguinte, o NEO criava outra sintética com o mesmo código, e as partidas antigas ficavam numa conta excluída. Aqui não há o que corrigir, e a tela diz "Nada a corrigir".
- **As três referências só do Connect** mantêm a sintética (3 casos: outra conta bancária, conta filha e distribuição de fatura). A conta filha apagada e a distribuição de fatura apagada não contam, e esses casos saem iguais ao original.
- **A sintética é achada pelo código byte a byte** (`codigoAtivo`, o SHA-256), porque a collation do MySQL não diferencia maiúscula e acharia "1.1.b.ABC…". Com o código em outra caixa, nada a corrigir, como no PostgreSQL (1 caso, igual).
- **Ordem do relatório:** pelas contas bancárias (banco, agência, número e id). O original não ordenava; o teste compara pela conta sintética.
- **Empresa:** o original movia e contava sem filtrar a empresa (a conta é de uma empresa só, então isso só mudaria com referência cruzada, que nenhuma tela cria). Aqui toda leitura e gravação é do tenant e da empresa, e a empresa de outro escritório é "não encontrada".
- **Resposta:** `{ ok: true, relatorio }`.

Achados sobre o original (reproduzidos):

- O reapontamento move **todas** as partidas da sintética, não só as da conta bancária dela (1 caso no gabarito, igual). Só faz diferença se outra conta bancária tiver lançado na sintética de uma primeira, o que só acontece vinculando à mão a conta `1.1.B.…` de outra; aí a sintética fica, pela referência `agencias`.
- A conta vinculada já excluída recebe as partidas assim mesmo (1 caso, igual). No Connect isso só aparece por carga, porque `excluirConta` recusa conta vinculada a conta bancária.
- **Merece decisão:** o hash da classificação do pagamento de uma fatura (`hashDaClassificacao`, C3) inclui a conta de todas as partidas da transação, também a do banco. Reapontar a sintética de um pagamento com distribuição aplicada deixa a aplicação "DESATUALIZADA", e desfazê-la passa a pedir "preservar a classificação atual". É assim nos dois sistemas; o porte não recalcula o hash guardado.

**3. A consulta da fatura não trava (divergência deliberada).** `obterDistribuicao` lê numa transação, para ver um retrato consistente, mas sem `FOR UPDATE` na fatura e no pagamento (`naFatura(…, travar = false)` e `vista(…, travar = false)`). A tela a repete a cada 2 s enquanto um documento é lido, e a trava fazia a consulta esperar as escritas e segurá-las.

- Todos os outros chamadores de `naFatura`, `vista` e `lerPagamento` são escritas (salvar, aplicar e desfazer a distribuição; adicionar, reler e confirmar documento) e continuam travando como antes.
- `obterFatura`, `listarLancamentos` e o download do PDF já liam sem trava.
- O ensaio confere, com a fatura travada por outra transação, que a consulta responde e que a escrita continua esperando.

**4. A transação desfeita no pagamento da fatura continua recusada.** Sem mudança de código.

**Testes:**

- `cadastro/reapontamento.test.ts`, sobre o gabarito `cadastro/gabarito/reapontamento/` (`scripts/contabil-core/gabarito_reapontamento.py`): 52 casos e 78 linhas de relatório, todos iguais fora as divergências contadas (3 da conta bancária vinculada à própria sintética e 3 das referências só do Connect).
  - 2 da suíte (`test_agencias.py`: o caminho normal e a regra que mantém a sintética).
  - 50 inventados (semente 20261126): de uma a quatro contas bancárias, sem sintética, sintética já desativada, conta bancária sem vínculo, apagada e inativa, o código em outra caixa, regra (ativa, inativa e apagada), contraparte e gasto de cartão (vivos e apagados), decisões pela conta e pela conta da contraparte, partidas canceladas, a outra empresa, a conta vinculada excluída e as partidas de outra conta bancária.
  - A saída sai do `ReapontamentoService` original rodando num SQLite montado só com a entrada; o plugin confere que o banco montado repete a suíte. O teste roda o mesmo laço do servidor (`reapontar`) sobre a mesma entrada.
- `api/contabil-core/agencias/reapontar-contas-sinteticas/route.test.ts`, 7 testes: "gerir", a empresa conferida, a auditoria (e nenhuma quando não há o que corrigir), a empresa de outro escritório, o erro que não vaza e a ação com frase.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-reapontamento.ts`, com 22 conferências, rodado 3 vezes seguidas. Percorre o NEO criando a sintética, o Domínio antes e depois, corrigir antes de vincular (nada a corrigir), vincular e corrigir (partidas e decisão movidas, sintética desativada), corrigir de novo (nada a corrigir), a sintética com regra e gasto de cartão (fica, com o motivo, e repetir não move nada), o isolamento entre escritórios e empresas, a consulta da fatura com a fatura travada e, no fim, a exclusão das empresas.

  ```
  node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-reapontamento.ts
  ```

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

- **Ordem:** empresa → plano de contas (sem o pai; o pai numa segunda passada) → faixas → agências → contrapartes → regras → importações → transações → decisões do NEO → partidas → exportações → (Bloco B) revisões → vínculos da revisão → análises do financeiro → documentos, com o original em disco → vínculos do financeiro → (Bloco C) notas → comprovantes, com o arquivo em disco → cartões → faturas → gastos → documentos da fatura, com o PDF em disco → distribuições.
- **Idempotente:** cada linha entra com o UUID do original (`upsert`). Rodar de novo atualiza o espelho, sem duplicar. O que alguém editar no Connect numa empresa espelhada é sobrescrito na rodada seguinte.
- **Retrato consistente:** a leitura é uma transação `REPEATABLE READ READ ONLY` no original.
- **Empresas:** ligadas à `Company` do escritório de destino (`CARGA_TENANT_ID`) pelos dígitos do CNPJ. Empresa sem par, com mais de um par, ou já ligada no Contábil Core do Connect com outro cadastro fica de fora e vai para o relatório.
- **Pessoas:** "criado por", "cancelado por" e similares são ligados ao `User` pelo e-mail; sem par, ficam nulos e vão para o relatório.
- **Colunas de unicidade** (`codigoAtivo`, `chaveAtiva`, `hashAtivo`, `chave`, `transacaoSemRegra`…): calculadas pelas mesmas funções que o Connect usa ao gravar (`motor/chaves.ts`).
- **Recusa por linha:** um lote de 200 que o banco recusa é refeito linha a linha, e só a linha que bateu fica de fora, nomeada no relatório.
- **Saída:** o terminal mostra contagens e o CNPJ mascarado; o que identifica empresa ou pessoa vai para o relatório, um arquivo local (por padrão na pasta temporária) que não vai para o git.
- **Fica para a virada:** o `audit_logs` do original (`contabil.core.legado.*`) e as tabelas do Bloco D.
- **Não vem do original:** `tenant_contabil_core_configs` (a chave "Leitura de documentos por IA" do escritório). Lá era a variável de ambiente `ALLOW_FINANCIAL_DATA_TO_OPENAI`, sem tabela; aqui nasce desligada e quem pode "gerir" liga em Configurações.
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

**Bloco C (Fase C4, 25/11/2026):** as sete tabelas dos documentos, só das empresas espelhadas, depois do Bloco B e na ordem das chaves estrangeiras. Nenhuma tem coluna de pessoa nem `chaveAtiva` (as unicidades do original são totais e continuam como índices únicos comuns), então nada é calculado além do que vai para o disco.

| Tabela no original | No Connect | Copiado | Calculado ou ligado |
|---|---|---|---|
| `notas_fiscais` | `core_notas_fiscais` | tudo, inclusive o `dedup_key`, a chave de acesso, a procedência (`origem`), o `assinatura_motivo` e a transação ligada | — |
| `comprovantes` | `core_comprovantes` | tudo menos o `arquivo_base64`; o `arquivo_sha256` como está | `arquivo_base64` → arquivo em disco; `storageKey` (`chaveDoArquivo`), `arquivoTipo` (pelo conteúdo, como o cadastro) e `arquivoTamanho`; o SHA-256 ausente é calculado |
| `cartoes_credito` | `core_cartoes_credito` | tudo | — |
| `faturas_cartao` | `core_faturas_cartao` | tudo, inclusive o `valor_total` e a transação que pagou | — |
| `lancamentos_cartao` | `core_lancamentos_cartao` | tudo, com os ids (`uuid5`) das compras importadas | — |
| `fatura_documentos` | `core_fatura_documentos` | nome, `hash_arquivo`, status, `resultado` (JSON) e erro | `conteudo` → PDF em disco; `storageKey` (`chaveDoArquivo`) e `tamanho` |
| `fatura_distribuicoes` | `core_fatura_distribuicoes` | versão, `distribuicoes` e `aplicacao` (JSON, com o `antes` e o hash) | a `aplicacao` nula vai como NULL do banco |

- **Os ids e as chaves do original continuam valendo.** A nota já importada no Contábil Core é reconhecida pelo `dedup_key`; a compra reenviada por CSV ou PDF, pelo `uuid5`; a aplicação da distribuição, pelo hash da classificação (`hashDaClassificacao`, o `repr` do Python), que a conferência recalcula nos dois lados. O JSON vem sem conversão (`jsonDoOriginal`), como na B5; o `revisado_por` dentro do `resultado` continua o id da pessoa no original (ninguém lê esse campo para mostrar nome).
- **Arquivos dos comprovantes.** O `arquivo_base64` de um comprovante por vez é decodificado como o `base64.b64decode` do Python (`base64DoPython`: os caracteres fora do alfabeto são ignorados, o bloco incompleto é erro), que era o que o original usava para o hash. O Node aceita mais do que isso, por isso a conta própria. Depois:
  - o SHA-256 dos bytes é conferido contra o `arquivo_sha256`; se diferir, a linha é recusada e nomeada no relatório, como o original do financeiro na B5;
  - sem o `arquivo_sha256` (as linhas de antes da migration 0037 cujo backfill não rodou), o hash é calculado aqui, gravado e listado em `sha256Calculado` no relatório;
  - o base64 que o Python não decodifica (lá, o comprovante ficou sem hash) entra sem arquivo, listado em `base64Invalido`; o nome do arquivo fica;
  - o arquivo vai para `storage/contabil-core/comprovantes/<tenantId do Connect>/<id>.<ext>` por `chaveDoArquivo` e `gravarArquivo`, as funções do serviço (C2). A extensão vem do nome (sem uma das aceitas, `.bin`) e o tipo de mídia do conteúdo (`formatoDoComprovante`), como no cadastro; o formato que o Connect não aceita no cadastro fica `application/octet-stream`.
- **PDFs das faturas.** O `conteudo` de um documento por vez, com o SHA-256 conferido contra o `hash_arquivo` (se diferir, a linha é recusada), para `storage/contabil-core/faturas/<tenantId do Connect>/<id>.pdf` (`originaisFaturas.ts`, C3). O tamanho vem dos bytes (o original não o guardava).
- **Idempotente, como na B5:** o arquivo que já está em disco com o mesmo SHA-256 não é regravado; com outro conteúdo, é reescrito; o gravado na rodada cuja linha o banco recusou é apagado. A função de disco é a mesma para os três (`paraODisco`).
- **Travas novas do Connect.** O MySQL tem travas que o PostgreSQL do original não tinha: os CHECKs da C2 (valor pago maior que zero; juros, multa e desconto não negativos) e da C3 (bandeira da lista, dias de 1 a 28, status da fatura e do documento, gasto não negativo, versão não negativa), as unicidades sob a comparação do MySQL (que não diferencia maiúscula) e a faixa do `DATETIME` (anos 1000 a 9999). Como na B5, a carga não para no meio nem corrige nada em silêncio: `puladasPelasTravas` decide ANTES de gravar quais linhas o banco recusaria, e elas ficam de fora com o motivo (todos, quando há mais de um) em `puladas` no relatório. Quem depende de uma linha pulada cai junto, com o motivo (a fatura do cartão pulado; os gastos, os documentos e a distribuição da fatura pulada). O terminal mostra a contagem, e a carga termina com código 1 quando há linha pulada ou recusada: o dado existe no original e não veio, então alguém decide (corrigir lá, pela tela do original, e rodar de novo). Falhar logo no começo travaria todas as empresas por uma linha; pular e nomear é o que a B5 fez com as recusas.
- **Transação desfeita.** A nota, o comprovante ou a fatura ligados a uma transação cuja importação foi desfeita entram assim, como o original deixa e o próprio Connect representa (a tela mostra "A importação desta transação foi desfeita"). A recusa da C1, C2 e C3 vale para associar de novo, não para o que já está ligado. Vão para o relatório em `comTransacaoDesfeita`, só como informação.
- **Decisões do NEO com evidência de nota ou comprovante** (`origem_evidencia` "nota_fiscal" e "comprovante", a sombra da regra, já copiadas desde a Fase 5): passam sem ajuste. A coluna é texto de até 20 caracteres, sem CHECK, e a conferência compara as decisões uma a uma.
- **Exclusão:** a exclusão da empresa no Connect apaga as sete tabelas e os arquivos das pastas `contabil-core/comprovantes` e `contabil-core/faturas`, como os criados pela tela.

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
- Bloco C (também só contagens). As linhas puladas pelas travas, decididas pela mesma `puladasPelasTravas`, ficam fora da conta e aparecem como informação:
  - contagem das sete tabelas (total e vivas);
  - cada linha campo a campo: dinheiro com 2 casas, instantes em UTC, JSON valor a valor (`mesmoJson`), inclusive a transação ligada, o `dedup_key` e a procedência;
  - a transação ligada à nota, ao comprovante e à fatura igual nos dois lados (data, valor, D/C e desfeita ou não);
  - cada arquivo em disco com o SHA-256 e o tamanho dos bytes do original: o base64 do comprovante decodificado como o Python e o `conteudo` do documento da fatura (o SHA-256 calculado pelo PostgreSQL); o comprovante sem arquivo continua sem;
  - as decisões do NEO com evidência de nota ou comprovante iguais;
  - os serviços do Connect abrindo o que veio: `listarNotas`, `listarComprovantes` e `arquivoDoComprovante`, `listarCartoes`, `listarFaturas`, `listarLancamentos` (ids e total), `obterDistribuicao` (a aplicação "APLICADA" ou "DESATUALIZADA" igual à do original, com o hash da classificação recalculado lá com as partidas de lá, e os documentos) e `arquivoDoDocumento`.

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
4. `scripts/contabil-core/povoar_documentos_local.py` (C4), no mesmo banco, depois dos dois anteriores (`python -I`, da raiz do contabil-core). Acrescenta a cada empresa o extrato de maio na conta do banco cooperativo e, pelos serviços do original (`NotaService`, `ComprovanteService`, `CartaoService`, `DistribuicaoService` e o NEO), dados inventados (CNPJs novos começando com 9; a IA não é chamada):
   - **notas:** duas NF-e com XML assinado de verdade (ligadas pelo NEO: uma sem regra, com a contraparte pela nota; outra pela regra da tarifa, com a nota na sombra), uma NF-e alterada depois de assinada (`xml_nao_verificado`, ligada à mão), uma NFS-e da empresa (pendente), uma NF-e "lida pela IA" (`ocr`: a leitura é simulada, a gravação é a do serviço) e uma cadastrada à mão e cancelada;
   - **comprovantes:** dois PDFs ligados pelo NEO (a contraparte e a sombra pelo comprovante), uma imagem com o base64 quebrado em linhas e ligada à mão, um sem arquivo, um excluído, um com o `arquivo_sha256` apagado por SQL (como antes da 0037), um com base64 inválido e um ligado a uma transação cuja importação foi desfeita;
   - **cartões:** um com a fatura de abril fechada (gastos à mão, parcelado e com conta, por CSV e um removido; distribuição salva e não aplicada) e a de maio paga (a composição em PDF lida e confirmada, um PDF que a leitura não leu, o pagamento e a distribuição aplicada); e um cartão removido;
   - **o que as travas do Connect recusariam**, direto por SQL (o serviço do original não deixa): comprovante com valor pago zero, comprovante com juros negativo, cartão com bandeira "master" e dia de fechamento 30 (com uma fatura e um gasto, que caem junto) e um gasto negativo.
5. `scripts/contabil-core/preparar-ensaio-carga.ts`: cria no Connect local a empresa com par.
6. A carga (simular e gravar duas vezes) e a conferência.

Resultado em 10/11/2026: tudo igual ao original, inclusive o TXT do Domínio byte a byte; a segunda rodada não duplicou nem recusou nada.

Resultado da B5 em 18/11/2026, na empresa com par:
- **Lidas e gravadas:** 4 revisões (1 excluída), 4 vínculos da revisão, 2 análises (1 excluída), 5 documentos e 5 vínculos do financeiro. Nada recusado. A outra empresa ficou de fora.
- **Primeira rodada:** 5 arquivos novos em disco.
- **Segunda rodada:** 0 novos, 5 iguais e 0 reescritos, sem duplicar nem recusar nada.
- **Conferência:** 29 itens iguais, entre eles os 5 originais em disco e os 4 baixados pelo serviço. O JSON de 4 revisões, 2 análises e 9 vínculos saiu igual, e as 6 têm o extrato da criação. O Domínio continua byte a byte.
- **No Connect:** a revisão abre com `fontesValidas` verdadeiro e a análise com `extratoValido` verdadeiro, pelos serviços.
- **Ensaio negativo:** dois arquivos adulterados ou apagados em disco aparecem na conferência (DIFERE) e voltam na rodada seguinte. Bytes adulterados no original recusam a linha ("SHA-256 do conteúdo diferente do hash_arquivo do original").

Resultado da C4 em 25/11/2026, na empresa com par (a outra ficou de fora):
- **Lidas:** 6 notas, 10 comprovantes, 3 cartões, 3 faturas, 9 gastos, 2 documentos da fatura e 2 distribuições (1 aplicada). 6 linhas puladas pelas travas, cada uma com o motivo no relatório: os 2 comprovantes (valor pago zero; juros negativo), o cartão "master" com dia 30 (os dois motivos), a fatura dele e o gasto dela, e o gasto negativo. Nada recusado. No relatório também: 1 comprovante com o SHA-256 calculado aqui, 1 sem arquivo (base64 inválido) e 1 ligado a transação desfeita.
- **Primeira rodada:** 5 arquivos de comprovante e 2 PDFs de fatura novos em disco; as tabelas da Fase 5 e da B5 continuaram iguais (os 5 originais do financeiro "iguais").
- **Segunda e terceira rodadas:** 0 arquivos novos e 0 reescritos, nenhuma linha duplicada nem recusada; as mesmas 6 puladas.
- **Conferência:** 56 itens iguais, 27 deles do Bloco C: as sete contagens e os sete campo a campo, o `dedup_key` e a procedência, as 8 ligações com o extrato, os 8 comprovantes e os 2 PDFs em disco, as 2 decisões do NEO com evidência de nota e de comprovante, e os serviços (6 notas, 7 comprovantes e 4 arquivos baixados, o cartão, as 2 faturas com os gastos, as 2 distribuições, com a aplicada "APLICADA" no Connect como no original, e os 2 PDFs baixados). O Domínio continua byte a byte.
- **Ensaio negativo:** o PNG de um comprovante adulterado em disco, o PDF de uma fatura apagado e o valor de uma nota mudado no PostgreSQL deram 5 DIFERE na conferência. Os bytes adulterados no original (o base64 de um comprovante e o `conteudo` de um documento) recusaram as duas linhas com o motivo, e a conferência continuou apontando os dois arquivos. Com o original restaurado, a rodada seguinte reescreveu 1 arquivo, gravou 1 PDF de novo e a conferência voltou a dar tudo igual.

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

## Fase D1: exportações, "Conflitos e qualidade", painel e carteira

Branch `feat/contabil-core-exportacoes-painel` (26/11/2026). Só lê o banco: **sem migration**. Seção autocontida do Bloco D (a tabela de fases do bloco fica na seção dele).

| Onde | Porte de |
|---|---|
| `exportacao/arquivos.ts` (puro) | `ExportacaoService` (`src/domain/exportacao/service.py`) sem o banco: as recusas de `exportar`, `_registros_vigentes`, `_exportar_lancamentos` (`_lancamentos_csv` e `_lancamentos_xlsx`), `_exportar_extrato`, `_exportar_notas` e `_exportar_conferencia` (com `_valor_assinado` e `_sanitize_cnpj`). O Domínio continua em `motor/exportacao.ts` |
| `exportacao/planilha.ts` | `_new_workbook` e `_dicts_to_xlsx` (`formatos.py`), com o exceljs |
| `servidor/exportacao.ts` | as leituras de cada tipo (tenant e empresa conferidos, já recortadas pelo período) e o registro em `core_exportacoes`. `gerarArquivoDoDominio` (Fase 2) passou a usar o mesmo caminho |
| `api/contabil-core/exportacao` | `POST /exportacao/gerar`: os tipos e os formatos novos, na rota da Fase 2 (sem `tipo`, continua sendo o Domínio) |
| `painel/painel.ts` (puro) | `consultar_divergencias` (`neo/consultas.py`) depois da leitura, `StatsService.obter` depois das contagens e `listar_carteira` depois do agrupamento, mais o `round` do Python (`arredondaPy`) |
| `servidor/painel.ts` | as leituras: as decisões medidas da sombra, as contagens das estatísticas (contagens e `GROUP BY` por mês no MySQL) e o agrupamento da carteira |
| `api/contabil-core/neo/divergencias`, `painel` e `carteira` | `GET /neo/divergencias` (`neo.read`), `GET /stats` (`stats.read`) e `GET /carteira` |
| escolha do arquivo na aba Registros (`Exportar.tsx`) e botões da aba Extrato (`ExportarExtrato`) | as "Exportações Especializadas" da tela Registros e o "Exportar" da tela Extrato do original |
| vista "Conflitos e qualidade" da aba NEO (`ConflitosQualidade.tsx`) | `ConflitosQualidadeTab` da página Classificação |
| aba "Painel" (`Painel.tsx`) | a tela `Dashboard` (a carteira operacional e as estatísticas da empresa) |

**Exportações:**

| Tipo | Formatos | O que sai |
|---|---|---|
| `lancamentos` | CSV, XLSX | as partidas vivas (a cancelada não sai), das contas bancárias ativas (ou todas, com a opção), na ordem da data do lançamento |
| `lancamentos_importacao` | TXT, CSV, XLSX | o arquivo do Domínio da Fase 2; o XLSX é novo no Connect (o original já tinha) |
| `extrato` | CSV, XLSX | as transações com os filtros da aba Extrato (competência, conta, situação e busca; a rota aceita também D/C e a faixa de valor), na ordem da tela, sem a paginação |
| `nfe_entrada`, `nfe_saida`, `nfse_tomado`, `nfse_prestado` | CSV, XLSX | as notas vivas do tipo emitidas na competência, com a empresa como destinatária (entrada, tomada) ou emitente (saída, prestada), e a transação ligada. O CNPJ da empresa inválido é recusado com a frase do original |
| `conferencia` | CSV, XLSX | uma linha por transação viva (mais uma por documento além do primeiro), com as notas e os comprovantes ligados, o total, a divergência assinada (o débito é negativo) e a situação (Pendente, Conciliado, Divergente) |

- **Mesmas colunas, ordem, formatação de número e data e recusas do original:**
  - o CSV com BOM, vírgula e `\r\n`;
  - o dinheiro com o texto do `Decimal` (`1500.00`);
  - `data_lancamento` como o `isoformat()` do instante (`2026-01-10T00:00:00+00:00`), a data do extrato como `dd/mm/aaaa`, a da nota em UTC (`aaaa-mm-dd`);
  - a conta do extrato com a descrição do original (`ITAU 7531 13579 2`);
  - toda célula de texto passa pela `celulaSegura`;
  - as recusas: "Formato deve ser 'csv', 'xlsx' ou 'txt'.", "Tipo de exportação inválido: '…'.", "O formato 'txt' só está disponível para 'lancamentos_importacao' por enquanto." e a do CNPJ da empresa.
- **XLSX:** o exceljs no lugar do openpyxl. O gabarito compara o CONTEÚDO lido de volta (o título da folha, o valor de cada célula, texto ou número, o negrito do cabeçalho e os formatos), não os bytes: as duas bibliotecas escrevem o XML de jeitos diferentes. O `\r` vai como `_x000D_`, a forma do OOXML: escrito cru, a leitura do XML o trocaria por quebra de linha.
- **Período:** a competência (`bounds_do_mes`: do primeiro ao último instante do mês, em UTC; nas colunas de data, os dias do mês). Só o extrato sai sem ela, como a aba Extrato filtra.
- **Acesso e auditoria:** como na exportação da Fase 2. Pede "agir" (o `exportacao.execute`) e registra `contabil.core.exportacao.gerada`, agora com o `tipo` nos detalhes (a frase da auditoria passou a "gerou um arquivo de exportação do Contábil Core"). Cada exportação fica em `core_exportacoes` (formato, período e total). O artigo de ajuda do módulo ganhou os passos das exportações, do Painel e de "Conflitos e qualidade".
- **Tela:** a aba Registros ganhou a escolha do arquivo, com os formatos de cada um, a conta bancária só onde vale e a opção do histórico do banco só no Domínio. A aba Extrato ganhou "Excel" e "CSV", que levam os filtros da tela.

**"Conflitos e qualidade":**

- **O que mede:** quando uma regra classifica, o NEO mede em paralelo a conta que a contraparte daria e grava se as duas divergem (`contaDivergente` em `core_neo_decisoes`, desde a Fase 2 e a C2).
- **O que a consulta resume:** as decisões MEDIDAS (verdadeiro e falso; nulo é "não medido"), recortadas pelo mês e pela conta bancária da transação:
  - avaliadas, divergentes e o percentual (o `round(…, 2)` do Python);
  - o valor total;
  - os pares de contas, pela soma decrescente;
  - a amostra dos 10 maiores valores.
- **Onde fica:** é a segunda vista da aba NEO (`?vista=conflitos`, ao lado de "Pendências"), no padrão da Conciliação (B4). Ela mede o que o NEO decidiu, e no Connect as regras e as contrapartes, que formavam com ela a página Classificação do original, já são abas próprias.
- **O NEO não mudou:** só se lê a decisão gravada. Pede "ver".

**Painel e carteira:** a aba "Painel" é a primeira do módulo e a que abre (era a tela inicial do original). Pede "ver" (o `stats.read`).

- **Carteira do escritório:** as empresas ativas do Contábil Core no escritório, com as transações vivas da competência (importadas, classificadas, pendências, erros e o valor pendente), as de mais pendências primeiro.
  - A empresa sem extrato no mês aparece zerada.
  - A linha abre a empresa no NEO (ou em Importações, quando não há extrato).
  - "Todas as empresas" é o escritório: no Connect não há permissão por empresa no módulo, e quem vê o módulo vê as mesmas empresas do seletor de empresa.
- **Números da empresa:** o resumo (transações, com e sem lançamento vivo, partidas, notas, comprovantes e o percentual), a classificação por conta bancária ativa e a atividade dos últimos 12 meses (transações, partidas, comprovantes e notas por mês).
- **Partes fora do porte:** nenhum número do painel nem da carteira do original depende de Open Banking, aplicações financeiras, ConcilPro ou relatórios. O `StatsService` e o `listar_carteira` só leem transações, partidas, notas, comprovantes e contas bancárias, e a tela `Dashboard` só mostra os dois. Nada foi zerado nem omitido.

**Gabaritos:**

- `gabarito_exportacao.py` (as exportações): **750 casos, todos iguais** fora as divergências contadas.
  - 60 da suíte (`test_exportacao.py`): 50 chamadas de `exportar` e 10 dos exportadores chamados direto.
  - 651 inventados (semente 20261126, 16 mundos): período por competência e por datas com fuso; contas ativas, inativas e apagadas; partidas vigentes e canceladas, composições e lançamento sem par; notas de cada recorte e direção, com o CNPJ com e sem máscara, e o CNPJ da empresa inválido; conferência com e sem nota e comprovante; valores negativos e de 13 dígitos; os filtros do extrato com acento e curinga.
  - 39 diretos: 9 de `_dicts_to_csv` e `_dicts_to_xlsx` e 30 do `ExportJobCreate`.
  - 202 são planilhas e 36 são recusas. Os mundos ficam em `exportacao-mundos.json`; a pasta tem `.gitattributes` com `* -text`.
- `gabarito_painel.py` (divergências, estatísticas e carteira): **275 casos, todos iguais** fora as divergências contadas. 12 da suíte (2 de divergências, 8 de estatísticas e 2 de carteira) e 263 inventados (112, 51 e 100), mais 13 testes do `round` do Python.
- **Como a saída é gravada:** o serviço original roda num SQLite montado só com a entrada, e o plugin confere que ele repete a suíte de verdade.
  - O banco montado se comporta como o PostgreSQL da produção nos instantes (comparados em UTC, com o fuso na volta) e no `ilike` (minúscula Unicode, `%` e `_` curingas).
  - As razões sociais da suíte não são gravadas: viram "EMPRESA NN LTDA", na mesma ordem. O `GABARITO_NOMES` não foi preciso.
- **Para gerar de novo,** a partir da raiz do contabil-core, com a pasta `scripts/contabil-core` do Connect no caminho e o `GABARITO_DIR` apontando para a pasta `gabarito` de cada um:
  - `-p gabarito_exportacao tests/integration/test_exportacao.py tests/unit/test_exportacao_historico.py`;
  - `-p gabarito_painel tests/integration/test_neo.py tests/integration/test_stats.py tests/integration/test_fase3_backend.py -k "divergencias or stats or carteira"`.
- **Rotas:** `exportacao/route.test.ts` (4 testes), `neo/divergencias/route.test.ts` (3), `painel/route.test.ts` (3) e `carteira/route.test.ts` (3): permissão, empresa conferida, os filtros repassados, a resposta e, na exportação, a auditoria.
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-exportacoes-painel.ts`, com 25 conferências, rodado 3 vezes seguidas.
  - Cria duas empresas "Ensaio D1" e importa um OFX inventado em cada uma.
  - Roda o NEO com uma regra que diverge da conta da contraparte, uma que concorda e uma sem contraparte; depois cadastra notas e um comprovante e os liga.
  - Gera cada exportação (lançamentos em CSV e XLSX, o Domínio em TXT e XLSX, o extrato com a busca e sem competência, as quatro baixas e a conferência) e confere a recusa do TXT, a conta inativa, o lançamento cancelado e o registro em `core_exportacoes`.
  - Consulta as divergências, o painel (inclusive a virada do mês no fuso do escritório) e a carteira.
  - Confere o isolamento entre escritórios e empresas e, no fim, apaga tudo pela exclusão da empresa.

  `node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-exportacoes-painel.ts`

Divergências da D1 (as que mudam a saída são contadas nos testes):

- **Busca do extrato:** é a da aba Extrato do Connect (o `contains` do MySQL, que ignora acento e maiúscula, com `%` e `_` como texto), para o arquivo bater com a tela. No original era o `ilike` (distingue acento; `%` e `_` são curingas). 7 casos no gabarito; com o `ilike` no lugar, saem iguais.
- **Empates de ordem:**
  - a conferência ordena só pela data no original (o empate fica com o plano do banco); aqui desempata pela ordem do extrato (lote, posição e id). 32 casos, conferidos bloco a bloco por dia;
  - na carteira, o empate de pendências e de razão social desempata pelo id (26 casos);
  - nos pares de contas das divergências, pelos códigos e ids (nenhum caso no gabarito);
  - nas partidas e nas notas, por criação e id (a divergência 1 da Fase 2);
  - a conta bancária do painel sai por banco, agência e número. O original não ordena; é a ordem que o SQLite da suíte devolve (nenhum caso).
- **Validação da rota:** a competência "0000-01" (o pydantic aceita o ano zero) e a vazia (aqui, "sem competência"), 2 casos. As frases de recusa são as do Connect, e os erros de validação são 400 (no original, 422).
- **Período:** a rota recebe a competência, como a exportação do Domínio da Fase 2, e não as datas livres do original. O pedido sem competência só vale para o extrato.
- **Mês corrente** (a série do painel e a carteira sem competência): o do escritório. No original era o de UTC; os dois diferem das 21h à meia-noite do último dia do mês. O ensaio confere a virada.
- **Carteira:** sem a permissão por empresa do original (ver acima). A ordem alfabética é a do português (`Intl.Collator`), não a do PostgreSQL.
- **Rótulos:** o "Conciliados" do painel do original virou "Com lançamento": é a transação com partida viva, não a conciliação bancária, que no Connect é outra aba. A atividade mensal sai numa tabela, do mês mais recente para o mais antigo (no original, um gráfico de barras), e a classificação por conta bancária usa as barras de situação dos painéis do Connect.
- **Resposta:**
  - as rotas novas devolvem camelCase, com o dinheiro como texto de duas casas;
  - a recusa do CNPJ inválido vai só com a frase, sem os detalhes (`empresa_id`, `cnpj`);
  - o nome do arquivo baixado é `<tipo>-<cnpj>-<competência>.<formato>` (no original, `<tipo>_<empresa>.<formato>`).

**Achados sobre o original (reproduzidos de propósito):**

- **As divergências contam decisão de transação desfeita e decisão antiga.** A consulta não olha o `deleted_at` da transação, e a decisão é registro: reclassificar ou desfazer a importação deixa as medições antigas valendo no total e no percentual.
- **As notas usam UTC no corte e na data.** A NF-e emitida depois das 21h do último dia do mês (horário de Brasília) cai no mês seguinte, e a data impressa é a de UTC: no ensaio, a NFS-e de 20/01 às 22h30 sai como 21/01. A tela de Notas do Connect mostra o dia no fuso do escritório.
- **A tela Registros mandava a data final no fuso do navegador** (`T23:59:59` local convertido para UTC), e a conferência usa o `.date()` desse instante: o arquivo levava um dia a mais.
- **O painel conta a conta bancária apagada que ficou ativa:** `_por_agencia` olha só o `ativa`.
- **A nota mostra a transação ligada mesmo desfeita:** a transação é lida só pelo id.
- **Ordens sem desempate** na conferência, nos pares de contas, na conta bancária do painel e na carteira.

**Precisam de decisão:**

- As divergências: contar só a decisão vigente de transação viva?
- As baixas de notas: cortar a competência e imprimir a data pelo dia do escritório, com a regra da tela de Notas (a nota à meia-noite UTC fica no dia gravado)?
- O painel: tirar a conta bancária apagada da classificação por conta?
- O Painel como aba inicial do módulo (antes era Importações).
- A carteira mostra todas as empresas do escritório a quem vê o módulo.
- Datas livres na exportação (o original aceitava `data_de` e `data_ate`), além da competência?

## Fase D2: relatórios (DRE, Balancete e Livro Caixa)

Branch `feat/contabil-core-relatorios` (26/11/2026), empilhada sobre a D1. Só lê o banco: **sem migration**. Decisão do Angelo: portar os relatórios do original **como estão**, dentro do módulo. O DRE próprio do Connect (`src/lib/dre`) calcula de outra forma e não foi usado nem alterado.

| Onde | Porte de |
|---|---|
| `relatorios/relatorios.ts` (puro) | `RelatoriosService` (`src/domain/relatorios/service.py`) depois das somas: `dre`, `balancete` e `livro_caixa`, com o `nivel` de `PlanoConta` e a `descricao` de `AgenciaBancaria` (a mesma `descricaoDaAgencia` da D1) |
| `relatorios/planilha.ts` | a planilha de cada relatório (novo no Connect), pela `gerarPlanilhaDeTabelas` das outras exportações em Excel do Connect |
| `servidor/relatorios.ts` | as leituras: as somas das partidas e das transações no MySQL (`SUM` de `DECIMAL`, exato), as contas e as contas bancárias, sempre do tenant e da empresa |
| `api/contabil-core/relatorios/[relatorio]` | `GET /relatorios/dre`, `/balancete` e `/livro-caixa` (`src/api/v1/relatorios.py`, `relatorios.read`), mais `formato=xlsx` |
| aba "Relatórios" (`Relatorios.tsx`, `ImprimirRelatorio.tsx`) | a página `Relatorios.tsx` do original |

**O que cada relatório faz (igual ao original):**

- **DRE:** soma as partidas VIVAS da empresa no período por conta e D/C. Entram só as contas de tipo receita (saldo C − D), custo e despesa (D − C), também a conta apagada com movimento (o legado). Os grupos saem na ordem Receitas, Custos, Despesas, cada um pela ordem do código. Resultado líquido = receitas − custos − despesas. Ativo, passivo, patrimônio líquido, "resultado" e tipos fora da lista não entram.
- **Balancete de Verificação:** toda conta viva do plano (com ou sem movimento) e a apagada que teve movimento no período, pela ordem do código, com débitos, créditos e o saldo devedor OU credor. Os totais somam só as linhas do relatório.
- **Livro Caixa:** por conta bancária viva (ativa ou inativa), as TRANSAÇÕES vivas do extrato no período, classificadas ou não, na ordem da data e, no mesmo dia, do id da transação. O crédito soma e o débito subtrai. Com data inicial, o saldo inicial é a soma de tudo o que veio antes; sem ela, zero.
- **Hierarquia:** o original NÃO soma as analíticas nas sintéticas. A sintética aparece no Balancete com o próprio movimento (zero, já que não recebe lançamento), e o `nivel` (o número de partes do código) só dá o recuo na tela. Portado assim.
- **Partidas desfeitas:** o original filtra só `deleted_at` (a partida cancelada e as da importação desfeita saem). É o `_registros_vigentes` da exportação sem o filtro das contas bancárias inativas: DRE e Balancete não olham a conta bancária. Portado igual.
- **Período:** datas, inclusivas e opcionais.
  - Nas partidas, vai do começo de `de` ao último milissegundo de `ate`, em UTC (`instantesDoPeriodo`). É o que a tela do original mandava: `data_de` à meia-noite e `data_ate` às `23:59:59.999`, sem fuso. O asyncpg lê o instante sem fuso no fuso do processo, e o contêiner do original não define fuso (UTC).
  - A partida é gravada na data da transação, à meia-noite UTC. Então o dia do relatório é o dia do extrato, e o fuso do escritório não entra.
  - No Livro Caixa, são datas do extrato, como no original.

**Gabarito** (`gabarito_relatorios.py`): **391 casos, todos iguais**, sem nenhuma divergência na saída.

- 13 da suíte (`test_relatorios.py`): 6 da DRE, 4 do Balancete e 3 do Livro Caixa.
- 378 inventados (semente 20261126, 14 mundos × 9 períodos × 3 relatórios):
  - um plano com sintéticas e analíticas de ativo, passivo, patrimônio líquido, receita, custo, despesa, resultado e um tipo fora da lista; contas apagadas, com e sem movimento; o mesmo código numa conta viva e numa apagada; uma conta de outra empresa;
  - partidas vivas e canceladas, em dias nas bordas do período e com horas diferentes da meia-noite UTC, e partidas de outra empresa;
  - sete contas bancárias (ativa, inativa, apagada, sem dígito e com dígito vazio, de outra empresa) com transações vivas e desfeitas, várias no mesmo dia;
  - valores de um centavo a 13 dígitos (somas de 16 dígitos) e zero;
  - os períodos: sem datas, só a inicial, só a final, o mês, um dia, a virada do mês e do ano, um período vazio e o invertido;
  - o último mundo sem movimento nenhum.
- **Como a saída é gravada:** como na D1, o serviço original roda num SQLite montado só com a entrada, e o plugin confere que o banco montado repete a suíte de verdade. Onde o SQLite difere da produção:
  - os instantes são comparados em UTC (o `_instalar_pg` da D1);
  - o `SUM` é exato. O SQLite guarda `Numeric` como `REAL` e soma em ponto flutuante, o que perde centavos com valores de 13 dígitos. No banco montado, o `sum()` é trocado por uma soma em `Decimal`, como o `numeric` do PostgreSQL.
- Os textos passam pelo sanitizador. O `GABARITO_NOMES` não foi preciso: a suíte só tem nomes de exemplo. A razão social não é gravada. A pasta tem `.gitattributes` com `* -text`.
- **Empates exercitados:**
  - 106 casos com o mesmo código em duas linhas (50 no Balancete, 56 na DRE);
  - 117 com mais de uma conta bancária;
  - 61 com mais de uma transação no mesmo dia.

  O teste conta como divergências a ordem dos códigos empatados e a das contas bancárias: 0 e 0 (ver abaixo).
- **Para gerar de novo,** a partir da raiz do contabil-core, com a pasta `scripts/contabil-core` do Connect no caminho e o `GABARITO_DIR` apontando para `src/lib/contabil-core/relatorios/gabarito`: `-p gabarito_relatorios tests/integration/test_relatorios.py`.
- **Rota:** `relatorios/[relatorio]/route.test.ts` (5 testes):
  - "ver" e os três relatórios, com o período repassado;
  - sem datas e com uma ponta só;
  - a planilha;
  - as recusas: relatório desconhecido, data inválida, data com hora, ano zero, outro formato, empresa malformada, 403 e 401;
  - a empresa de outro escritório (404).
- **Ensaio no banco local:** `scripts/contabil-core/ensaio-relatorios.ts`, com 21 conferências, rodado 7 vezes seguidas, todas certas, sem sobra no banco.
  - Cria duas empresas "Ensaio D2" e um plano com sintéticas e analíticas.
  - Cadastra duas contas bancárias com OFX inventado e uma inativa sem extrato. O OFX tem um lançamento em fevereiro, outros nas bordas de março, um sem regra, um centavo, um valor de 98 milhões e um em abril. Roda o NEO.
  - Confere a DRE, o Balancete (débitos = créditos) e o Livro Caixa de março contra o esperado; sem período, num período vazio e só com o fim; a planilha da DRE e a do Livro Caixa.
  - Desfaz uma classificação: sai da DRE e do Balancete, e o Livro Caixa (que lê o extrato) não muda. Desfaz a importação de uma conta bancária: sai dos três.
  - Confere o isolamento entre empresas e escritórios e, no fim, apaga tudo pela exclusão da empresa.

  `node scripts/local/com-banco-local.mjs npx tsx --require ./scripts/contabil-core/sem-server-only.cjs scripts/contabil-core/ensaio-relatorios.ts`

**Tela:** a aba "Relatórios", entre Conciliação e Configurações. Pede "ver" (o `relatorios.read`).

- Os três relatórios são vistas da aba (`?vista=balancete` e `?vista=livro-caixa`; a DRE abre), com o filtro "Período" (`de` e `ate` na URL). A empresa é a do seletor do módulo, e o "Gerar Relatório" do original virou o "Filtrar".
- O que cada vista mostra:
  - a DRE: os quatro totais em cartões e uma tabela por grupo;
  - o Balancete: a tabela, com o recuo pelo nível, e a linha de totais;
  - o Livro Caixa: uma tabela por conta bancária, com o saldo inicial, o final e os totais do período.

  As mensagens de vazio são as do original.
- **Imprimir:** o `window.print` do original, com o cabeçalho que só aparece no papel (o relatório, a empresa e o período). O papel é desenhado num portal no `<body>`, como o relatório do Tributário.
- **Excel (novo no Connect):** a página do original só imprimia.
  - A planilha leva os mesmos números da tela: a DRE (as linhas e o resultado), o Balancete (as linhas e os totais) e o Livro Caixa (os lançamentos e os saldos por conta bancária), com o dinheiro como número e a aba "Filtros".
  - Pede "ver", como a tela, e não vai para a auditoria, como a impressão. As exportações da D1 pedem "agir" e são auditadas.
- O original não desenha gráfico nesta página.
- O artigo de ajuda do módulo ganhou "Como gerar a DRE, o Balancete e o Livro Caixa".

**Divergências da D2:**

- **Empates de ordem:**
  - o mesmo código em duas contas (a viva e a apagada do legado): o original ordena só pelo código, e o empate fica com a ordem do plano do banco; aqui, o id desempata;
  - as contas bancárias do Livro Caixa: o original não ordena; aqui, banco, agência, número e id.

  O teste conta as duas: 0 e 0 casos. No SQLite do gabarito, a ordem coincidiu com a do Connect: o `GROUP BY` sai pelo id da conta, e as contas bancárias saem pelo índice único de banco, agência e número. No PostgreSQL da produção, essas ordens não são garantidas.
- **Período:** a rota recebe datas (`de` e `ate`, "AAAA-MM-DD"), como o Livro Caixa do original.
  - Na DRE e no Balancete, o original aceitava também a hora (`datetime`). Aqui é sempre o dia inteiro, que é o que a tela do original mandava.
  - Data inválida, data com hora e o ano zero são 400 (no original, 422).
  - O período invertido é aceito e sai vazio, como lá.
- **Resposta:** camelCase, o dinheiro como texto de duas casas (o `str` do `Decimal`), as datas do período como "AAAA-MM-DD" e sem o `empresa_id`. Uma rota só (`/relatorios/[relatorio]`) para os três.
- **Planilha:** nova, ver acima.

**Achados sobre o original (reproduzidos de propósito):**

- **Sem hierarquia:** a sintética não soma as analíticas, nem na DRE nem no Balancete. O Balancete mostra a sintética zerada logo acima das filhas com movimento.
- **O Livro Caixa é o extrato, não o razão:** traz a transação sem classificação, e desfazer a classificação não o muda.
  - O saldo é calculado das transações importadas, a partir de zero. Não usa o saldo informado pelo banco (`saldoApos`) nem o saldo declarado do lote.
  - Só é o saldo real da conta se o extrato foi importado desde a abertura.
- **No mesmo dia, o Livro Caixa ordena pelo id da transação** (um UUID aleatório), e não pela ordem do extrato (`ordem`). O saldo do fim do dia é o certo, mas os acumulados no meio do dia não seguem o extrato.
- **DRE e Balancete não olham a conta bancária:** a partida de conta bancária inativa ou apagada entra. A exportação de lançamentos, ao contrário, deixa a inativa de fora. O Livro Caixa mostra a conta inativa e deixa a apagada de fora, com as transações dela.
- **A partida numa conta do plano de outra empresa** some do relatório, sem aviso, e também dos totais do Balancete. Nenhuma tela do Connect cria esse caso.
- **O fim do período dependia do fuso do servidor:** a tela mandava `23:59:59.999` sem fuso, e o asyncpg lê no fuso do processo (UTC no contêiner do original).
- **A ordem das contas bancárias e a dos empates de código** não são garantidas no PostgreSQL.
- **`test_relatorio_contrapartes.py` e `test_relatorio_regras.py` não são destes relatórios:** são os leitores das planilhas de cadastro (a relação de clientes e fornecedores do sistema fiscal e o modelo de regras), já portados na Fase 3b.

**Precisam de decisão:**

- A hierarquia: as sintéticas devem somar as analíticas no Balancete (e a DRE ganhar os subtotais)?
- O Livro Caixa: ordenar o dia pela ordem do extrato (`ordem`) em vez do id? Partir do saldo informado pelo banco, quando houver?
- DRE e Balancete: deixar de fora a conta bancária inativa ou apagada, como a exportação de lançamentos?
- A planilha dos relatórios: com "ver" e sem auditoria (como a impressão), ou com "agir" e auditada (como as exportações)?
- O lugar da aba (entre Conciliação e Configurações).
- O período invertido: recusar com uma frase, em vez de sair vazio?

## Fase D3a: a leitura do Razão de fornecedores (ConcilPro)

Branch `feat/contabil-core-concilpro-leitura` (26/11/2026), empilhada sobre a D1. **Só a leitura:** sem banco, sem migration, sem rota e sem tela. Seção autocontida do Bloco D (a tabela de fases do bloco fica na seção dele).

O ConcilPro lê o relatório "Razão" de fornecedores do sistema contábil e devolve, por fornecedor (cada bloco "Conta: <código> - <conta contábil> <nome>"), o saldo anterior, os totais declarados e os lançamentos (data, lote, histórico, contrapartida, débito, crédito, saldo, tipo da operação, número da nota e CNPJ do histórico). O envio do arquivo, a fila, as tabelas `cp_*`, a conciliação FIFO, as rotas, a tela e as exportações ficam para a D3b.

| Onde | Porte de |
|---|---|
| `concilpro/texto.ts` (puro) | a extração do texto de `parser.py`: por palavras (`_extrair_pagina_por_palavras`), por caracteres (`_construir_runs`, `_runs_sobrepostos`, `_montar_linhas_de_runs`, `_extrair_pagina_por_chars`), a pontuação (`_pontuar_extracao`), a escolha da estratégia (`_escolher_estrategia`) e `_extrair_paginas` |
| `pdf/plumber.ts` (`extrairTextoEmLayout`, `arredondaPy`) | o `page.extract_text(layout=True)` do pdfplumber 0.11 (o `to_textmap` com `layout=True`), a terceira estratégia, que faltava no porte do pdfplumber |
| `concilpro/leitor.ts` (puro) | o resto de `parser.py`: `parse_valor`, `parse_data`, `classificar_tipo_operacao`, `_deduplicar_historico_linha`, `_preprocessar_bloco`, `detectar_formato_arquivo` (com o `zipfile.is_zipfile` do Python 3.14), `_deduplicar_lancamentos`, `consolidar_fornecedores_duplicados`, a normalização da resposta da IA (`_ia_decimal`, `_ia_data`, `_normalizar_lancamento_ia`), as colunas do cabeçalho (`_colunas_do_header`, `_coluna_do_valor`, `_valores_por_coluna`, `_corrigir_colunas_por_posicao`), a leitura sem IA (`_ler_linha_lancamento`, `_e_continuacao_de_historico`, `parsear_bloco_deterministico`), o fornecedor (`_identificar_fornecedor`, `_parece_nome_fornecedor`, `_construir_fornecedor_*`) e o laço dos blocos de `parsear_arquivo_razao` (`lerTextoDoRazao`). `calcular_hash_arquivo`, `extrair_numero_nf` e `extrair_cnpj` são os da B1 (`conciliacao/razaoPlanilha.ts`) |
| `concilpro/consolidador.ts` (puro) | `consolidador.py`: `_serie_da_nota`, `consolidar_lancamentos_fornecedor` e `consolidar_todos_fornecedores` |
| `concilpro/ia.ts` (servidor) | `ai_classifier.py`, com os mesmos prompts: `parsearBlocoFornecedorIa` (texto), `parsearBlocoFornecedorIaVisao` (imagem em lotes de 3, `ErroNoLoteDeImagem` = `VisionBatchError`) e `classificarLancamentosIncertos` |
| `concilpro/razao.ts` (servidor) | `parsear_arquivo_razao` (o PDF pelo porte do pdfminer, a planilha pelo leitor da B1), `_renderizar_paginas_pdf` (as páginas como PDF de uma página), `extrair_texto_pdf` e `lerRazaoDeFornecedores`, que faz o que o processamento do envio fazia antes de gravar: ler, `consolidar_todos_fornecedores` e uma chamada de `classificar_lancamentos_incertos` com os incertos de todos os fornecedores |

**Como lê (o do original):**

- **Formato:** `%PDF` é PDF; o arquivo composto OLE2 é XLS; o zip com a pasta de trabalho é XLSX (os dois vão ao leitor de planilha da B1, `conciliacao/razaoPlanilha.ts`, sem IA); outro zip é recusado ("Formato 'ZIP' não suportado…"); o resto é tratado como PDF.
- **O texto do PDF:** cada página sai em três estratégias (layout do pdfplumber, palavras em faixas de 5 pontos, caracteres reagrupados em runs com as cópias sobrepostas do histórico tiradas, o "Formato 6"), e UMA vale para o documento inteiro: a de mais linhas que começam com data e, no empate, a de menos tokens corrompidos (dígito e maiúscula misturados). A posição horizontal é preservada, porque é ela que separa débito de crédito.
- **Os blocos:** o texto é cortado em "Conta:". O "Conta:" repetido no alto da página seguinte com o mesmo código continua o bloco. A linha de títulos da tabela vai na frente de cada bloco. Cada bloco passa por:
  0. a leitura pelas colunas, sem IA: cada número pela borda direita da coluna do título (a folga é a metade do menor vão entre colunas, de 2 a 8 caracteres), a linha sem data e sem valor como continuação do histórico, e o bloco só é aceito se a soma fechar com o "Total da conta" impresso (a R$ 0,01). A conta sem movimento (totais zerados e nenhuma linha com data) também é aceita;
  1. o texto do bloco (limpo do histórico repetido, o "Formato 4") ao agente de texto, com o débito e o crédito corrigidos depois pela coluna em que o número aparece;
  2. as páginas do bloco ao agente de imagem, em lotes de até 3 páginas.
  O bloco que nenhuma dá é descartado. Depois, o mesmo código de conta em vários blocos vira um fornecedor (os totais do último bloco, o saldo anterior do primeiro), e o lançamento lido duas vezes sai (mesma data, ou mesmo lote, com os mesmos valores e o mesmo saldo).
- **A consolidação** (`consolidar_todos_fornecedores`): as compras com o mesmo número de nota, a mesma série e o mesmo dia viram uma, com o crédito somado; o total declarado zerado vira a soma.
- **Os incertos** (DEBITO, CREDITO e OUTRO) vão juntos ao agente de classificação, que devolve o tipo e o número da nota que faltava.

**A IA** é a da fundação do Connect (`ia/leituraPorIa.ts`, `executarAgente`), atrás da mesma chave do escritório (`TenantContabilCoreConfig.iaDocumentosFinanceiros`, desligada por padrão). Três agentes novos no catálogo (`src/lib/ia/catalogo.ts`), do setor `contabil` e desligados por padrão:

| Agente | Faixa | No original | Chamada |
|---|---|---|---|
| `leitor_de_razao_texto` | rápida | `gpt-4o-mini`, `PARSE_SYSTEM_PROMPT` | o texto do bloco, até 16.000 tokens de saída, 90 s |
| `leitor_de_razao_imagem` | padrão | `gpt-4o`, `VISION_SYSTEM_PROMPT` | até 3 páginas por chamada (o texto do bloco, até 800 caracteres, só no 1º lote), até 16.000 tokens, 120 s |
| `classificador_de_razao` | rápida | `gpt-4o-mini`, `CLASSIFY_SYSTEM_PROMPT` | os incertos numa chamada, até 1.024 tokens; o original não tinha prazo (vale o padrão do cliente da OpenAI, 600 s) |

- **Com a chave desligada** (ou sem provedor), nada vai à IA e a leitura determinística segue: o bloco que dependeria da IA é descartado, como no original sem a `OPENAI_API_KEY` (o `_get_client` devolvia nulo). O original só escrevia "IA desativada" no log; aqui a leitura devolve também um **diagnóstico** (`DiagnosticoDoRazao`: blocos, lidos pelas colunas, pelo texto, pela imagem, descartados) com a frase de onde ligar ("…Ligue, em Contábil Core › Configurações › Leitura de documentos por IA…", ou "…configure em Integrações › Inteligência artificial" sem provedor), para a D3b mostrar.
- **A página para a IA de imagem vai como PDF de uma página** (pdf-lib), como na C1 e na C3, não como o PNG de 150 dpi do PyMuPDF: desenhar PDF em imagem exigiria dependência nova. Os lotes, a ordem e a quantidade de chamadas são os mesmos. A peça comum ganhou, de forma aditiva, `anexos` (vários documentos numa chamada), para o lote de 3 páginas continuar sendo UMA chamada.
- **A resposta é lida como no original:** o `json.loads(..., parse_float=Decimal)` (`jsonPython`), sem tirar cercas de markdown (o original pedia `response_format: json_object`).

**Gabarito:** `scripts/contabil-core/gabarito_concilpro.py`, plugin do pytest sobre `test_concilpro_parser.py`, `test_concilpro_correcoes.py` e `test_concilpro_planilha.py`. **1.310 registros, todos iguais** fora as divergências contadas:

- **60 chamadas da suíte** do original (as funções de `parser.py` e `consolidador.py` que ela chama, com a entrada copiada antes da chamada), sanitizadas. O teste do lote de imagem que falha (`test_falha_em_um_batch_vision_invalida_toda_extracao`, que troca o `_visao_batch` por um falso) entra como cenário com a OpenAI simulada falhando na 2ª chamada ("Falha no batch Vision 2 de 3").
- **1.077 chamadas das funções puras** (60 da suíte e as inventadas, semente 20261126): 215 de `classificar_tipo_operacao`, 122 de `_montar_linhas_de_runs`, 55 de `_deduplicar_historico_linha`, 45 de `_construir_runs`, 44 de `_construir_fornecedor_de_ia`, 39 de `_normalizar_lancamento_ia`, 38 de `_extrair_pagina_por_chars`, 38 de `_coluna_do_valor`, 37 de `_valores_por_coluna`, 36 de `_ler_linha_lancamento`, 46 de `_e_continuacao_de_historico`, 31 de `_corrigir_colunas_por_posicao`, 29 de `extrair_numero_nf` e 29 de `extrair_cnpj`, 28 de `_ia_decimal`, 24 de `parse_valor`, 22 de `_colunas_do_header`, 22 de `_ia_data`, 22 de `_serie_da_nota`, 21 de `detectar_formato_arquivo`, 19 de `parsear_bloco_deterministico`, 18 de `parse_data`, 16 de `_pontuar_extracao`, 15 de `_identificar_fornecedor`, 15 de `_parece_nome_fornecedor`, 12 de `_deduplicar_lancamentos`, 11 de `consolidar_lancamentos_fornecedor`, 10 de `consolidar_fornecedores_duplicados`, 10 de `_escolher_estrategia` e as demais. 15 delas são exceções do original, repetidas.
- **27 PDFs de Razão inventados** (33 páginas, gerados pelo PyMuPDF com fornecedores e CNPJs fictícios), com o texto de cada página nas três estratégias, a escolhida (25 "layout" e 2 "chars") e o texto final, iguais ao pdfplumber caractere a caractere.
- **138 leituras inteiras** (`parsear_arquivo_razao`, depois a consolidação e a classificação): 31 PDFs nas quatro combinações da chave da OpenAI e do `ALLOW_FINANCIAL_DATA_TO_OPENAI`, mais 7 arquivos que não são PDF de Razão (.xlsx e .xls pelo leitor da B1, ZIP, ZIP com prefixo, texto, vazio, PDF quebrado) com e sem a chave. Cobrem o caminho sem IA, o total que não fecha (texto, com a correção pela coluna), o bloco sem total e sem cabeçalho (texto e imagem), um fornecedor em 5 páginas (imagem em 2 lotes, com o 2º lote falhando ou incompleto), o fornecedor repetido com o lançamento lido duas vezes, a conta sem movimento, a conta sem código (o nome logo abaixo), os Formatos 4 e 6, o histórico em várias linhas com NF e CNPJ, a data impossível, as colunas deslocadas, o bloco que termina no fim da página, o bloco lido pelas colunas em duas páginas, a página em branco e as respostas da IA fora do formato. Ao todo, **194 chamadas à IA** (98 de texto, 86 de imagem e 10 de classificação), iguais no tipo, no sistema, no texto enviado, nas páginas, no `max_tokens`, no prazo, na ordem e na quantidade.
- **68 chamadas diretas da IA** (20 de texto, 28 de imagem em lotes e 20 de classificação), com 47 chamadas à IA simulada.
- A IA de verdade nunca é chamada: o `_get_client` devolve uma OpenAI falsa que responde por regras (o tipo da chamada e um trecho do texto) e grava cada chamada.
- **Testes:** `concilpro/texto.test.ts` (260), `leitor.test.ts` (990) e `ia.test.ts` (70), com `gabarito/ler.ts` (as conversões do Python) e `gabarito/iaSimulada.ts` (a mesma IA falsa do lado do porte). A pasta do gabarito tem `.gitattributes` com `* -text` (2,3 MB).
- **Para gerar de novo**, a partir da raiz do contabil-core, com a pasta `scripts/contabil-core` do Connect no caminho e o `GABARITO_PASTA` apontando para `src/lib/contabil-core/concilpro/gabarito`: `-p gabarito_concilpro tests/unit/test_concilpro_parser.py tests/unit/test_concilpro_correcoes.py tests/unit/test_concilpro_planilha.py`. O `GABARITO_NOMES` (fora do git) precisa dos nomes de fornecedores de `test_concilpro_parser.py` (das classes `TestConsolidacaoEntrePaginas` e `TestContaSemMovimento`, e o do histórico de `test_bloco_com_data_mas_sem_leitura_nao_vira_sem_movimento`), com trocas do mesmo tamanho (a coluna conta caracteres).

**Conferência com arquivos reais** (IA desligada, só contagens, nada no git): 10 arquivos de Downloads (1 PDF de Razão, 6 .xlsx e 3 .xls), **todos iguais ao original**:

- 7 lidos: 261 fornecedores e 8.318 lançamentos, os 261 totais iguais; 3 recusados com a mesma frase.
- O PDF (63 páginas, estratégia "layout"): 22 fornecedores e 209 lançamentos lidos pelas colunas, em 0,9 s. Dos 61 blocos de fornecedor, **39 dependem da IA** (20 com linha de data que a leitura pelas colunas não lê, 19 cuja soma não fecha com o total) e, com a IA desligada, ficam de fora, no original e no porte.
- A única diferença de forma: no bloco de planilha sem "Total da conta" e sem lançamento, o original devolve o `int` 0 do `sum()` vazio e o porte (B1) o `Decimal` 0. Na gravação os dois viram `Decimal("0")`.

Divergências da D3a (as que mudam a saída são contadas nos testes):

- **A chave do escritório vale para o ConcilPro.** O `_get_client` do original só olhava a `OPENAI_API_KEY`: o Razão ia à OpenAI mesmo com o `ALLOW_FINANCIAL_DATA_TO_OPENAI` desligado. Aqui, com a chave do escritório desligada, nada vai à IA (decisão do Bloco C). 31 cenários (chave presente e envio bloqueado): o porte não chama a IA e dá a saída do original sem a chave.
- **Valor não finito da IA** (NaN, Infinity): o `Dec` não o representa, e o porte levanta `InvalidOperation` (no original, o NaN já levantava na comparação e o Infinity seguia como valor). 3 casos.
- **PDF que não abre:** a mensagem é a do pdf.js, com o mesmo prefixo ("Erro ao extrair texto do PDF: …"). 6 casos.
- **`extrair_texto_pdf`** faz o que diz (as páginas com texto, separadas por uma linha em branco). No original ela sempre falhava (ver os achados); ninguém a chama.
- **IA:** a página como PDF de uma página; os documentos antes do texto (a ordem da fundação); no lote sem o texto do bloco, a linha fixa "Analise as imagens e extraia os lançamentos:" (a fundação exige texto); os modelos das faixas do catálogo, sem `temperature=0` e sem `response_format`; o nome de empresa do exemplo do "Formato 2" no prompt de texto trocado por um fictício ("LOJA FICTICIA DE MATERIAIS DE OBRAS", do mesmo tamanho). O prompt é conferido contra o do original, com a mesma troca.
- **Diagnóstico:** o resultado da leitura do PDF traz `diagnostico` (que o original só escrevia no log). O resto do resultado tem as chaves e os valores do original, em camelCase, com o dinheiro em `Dec` e o `datetime` como o `str()` dele.
- **`is_zipfile`:** o registro ZIP64 não é lido (não muda a resposta para arquivo que chega até aqui).

**Achados sobre o original (reproduzidos de propósito):**

- **O ConcilPro não respeita o `ALLOW_FINANCIAL_DATA_TO_OPENAI`**: com a chave da OpenAI configurada, o Razão de fornecedores (dados financeiros de cliente) vai à OpenAI mesmo com o envio bloqueado. Os outros leitores (extrato, nota, comprovante, cartão) conferem as duas.
- **O cabeçalho do relatório vai à IA como se fosse um fornecedor.** As linhas antes do primeiro "Conta:" (empresa, CNPJ, período, títulos) formam um bloco. Com a IA ligada, todo PDF gasta uma chamada de texto e uma de imagem com a 1ª página nesse bloco, que nunca dá fornecedor (não tem "Conta:"). E se a imagem desse bloco vier sem a lista "lancamentos" ou falhar, o arquivo inteiro para (cenários `cinco-paginas-cabecalho-*`).
- **A falha de um lote da IA de imagem interrompe o arquivo inteiro**, não só o bloco: o `VisionBatchError` não é tratado no laço. O mesmo para a resposta de texto fora do formato em `conciliacao`, `validacao` ou `saldo_anterior`, e para um primeiro lançamento que não é objeto (`AttributeError`, `TypeError`, `InvalidOperation` crus; 6 cenários).
- **As páginas que vão à imagem são estimadas pela contagem de linhas**: a linha de títulos somada ao bloco e as linhas "Conta:" repetidas puladas deslocam o intervalo. O bloco que termina no fim da página leva também a página seguinte (cenário `bloco-no-fim-da-pagina`); o bloco longo pode deixar a última de fora.
- **No bloco lido pelas colunas que atravessa a página, o cabeçalho da página seguinte** (empresa, folha, CNPJ, período e a linha de títulos) **entra no histórico** do último lançamento da página anterior, como continuação (cenário `bloco-em-duas-paginas`).
- **`extrair_texto_pdf` sempre falha** com todo PDF que tem página: o laço usa uma variável `i` que não existe ("Erro ao extrair texto do PDF: name 'i' is not defined"). Ninguém a chama.
- **`detectar_formato_arquivo` pode levantar:** o `is_zipfile` sobre os bytes (`BytesIO`) levanta `ValueError` ("negative seek value") quando o registro final de ZIP aponta para antes do começo do arquivo, e o envio vira erro (1 caso no gabarito).
- **Não há orçamento por arquivo:** cada bloco que não fecha gasta até 2 chamadas (texto e imagem, mais 1 por lote de 3 páginas) e o arquivo, mais 1 de classificação. No Razão real em PDF seriam 40 blocos (os 39 e o cabeçalho), com prazos de 90 s e 120 s por chamada.
- **Os testes do original têm nomes de fornecedores que parecem reais** (e um nome de empresa no prompt de texto): o gabarito sai sanitizado; vale limpar lá.

**Precisam de decisão:**

- **Respostas com cerca de markdown:** o original pedia `response_format: json_object` à OpenAI; a fundação não expõe isso. Com um provedor que devolva o JSON entre ```, o texto vira "nada" (bloco descartado) e a imagem vira `VisionBatchError`, que interrompe o arquivo inteiro. Aceitar a resposta cercada (como a nota da C1 faz)?
- **O cabeçalho do relatório:** pular a IA no bloco sem "Conta:" (economiza 2 chamadas por arquivo e tira o risco de o arquivo inteiro falhar ali)?
- **A falha de um lote de imagem:** continuar interrompendo o arquivo inteiro, ou descartar só o bloco?
- **Orçamento por arquivo** (tempo e chamadas), como os outros leitores têm?
- **Configurações:** o texto de "Leitura de documentos por IA" fala de nota e comprovante; com a D3b ele passa a valer também para o Razão de fornecedores.
- **Os tetos dos três agentes novos:** o de texto e o de imagem copiaram os da leitura de fatura da C3 (R$ 50 e R$ 200 por mês); o de classificação ficou com R$ 20. Todos com 3.000 chamadas por mês.

**Fora da D3a (vai para a D3b):** as tabelas `cp_*` e a migration, o envio do arquivo e a fila (`/upload` e o processamento em segundo plano), `conciliacao_intel.py` (FIFO), as rotas de `src/api/v1/concilpro.py`, a tela, as exportações e a carga.
