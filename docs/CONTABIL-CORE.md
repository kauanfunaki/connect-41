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
| 3b | — | Importação por planilha, com prévia e confirmação: regras (modelo de seis colunas), contrapartes (relações fiscais, ADR-016) e plano de contas. Inclui decidir como ler o `.xls` antigo (BIFF8). |
| 4 | — | Leitores de PDF e planilha por banco, um banco por vez, cada um com arquivos reais (ver "Corpus"). |
| 5 | — | Carga dos dados de produção: script, ensaio local, conferência e roteiro da virada. |

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
  - lê a produção com um usuário **somente leitura**; o repositório de origem já tem `scripts/criar_usuario_restrito.sql`;
  - recebe a conexão por variável de ambiente, nunca por argumento ou arquivo versionado;
  - não imprime credencial nem dado de cliente no terminal.

## Carga dos dados (Fase 5, resumo)

- **Ordem:** `core_empresas` → plano de contas → faixas → agências → contrapartes → regras → importações → transações → decisões → registros → exportações.
- **Idempotente:** `upsert` pelo UUID original. Rodar duas vezes não duplica nada, e é assim que se ensaia antes da virada.
- **Empresas:**
  - cada `empresas.cnpj` é ligada à `Company` do mesmo tenant pelo CNPJ;
  - empresa sem par no Connect para a carga com a lista, e o time decide: criar a empresa ou ignorar.
- **Usuários:**
  - `criado_por`, `cancelado_por` e similares são ligados ao `User` pelo e-mail;
  - quem não existe no Connect fica nulo, e a carga lista os nomes.
- **Auditoria antiga:** `audit_logs` vai para `AuditLog` com a ação prefixada `contabil.core.legado.`, preservando a data.
- **Conferência depois da carga:**
  - contagem por tabela e por empresa;
  - soma de `valor` por empresa e mês, nas transações e nos registros;
  - recálculo da chave de duplicidade de uma amostra, que tem de bater com a gravada;
  - exportação do Domínio de um mês de cada empresa, comparada byte a byte com a do Contábil Core.
- **Ensaio:**
  - o Contábil Core sobe localmente com o `docker-compose.yml` dele e o seed fictício (`scripts/seed_dev.py`);
  - a carga roda contra o banco local do Connect;
  - na produção, quem roda é o Kauan, como nas migrations.

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
