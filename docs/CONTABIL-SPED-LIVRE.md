# SPED Contábil — navegação livre

O submenu **SPED** do menu principal abre três páginas: **De-para**,
**Lançamentos** e **Gerar SPED Contribuições**. Não há menu lateral interno
nem abas repetindo essas entradas. Cada página usa abas horizontais próprias:

- De-para: Regras, Pendências e Plano e contas.
- Lançamentos: Lançamentos, Notas de entrada e Resumo.
- Contribuições: Gerar e acompanhar, Arquivos e histórico, Fechamento e
  conferência, Apuração e créditos, Parâmetros e ajustes e Resumo.

Empresa e competência ficam no topo e são preservadas ao navegar. O acesso
padrão abre De-para em Regras. Os endereços antigos continuam sendo aceitos.

Regras e configuração carregam os cadastros da base sem consultar as notas do
mês. No editor, a consulta de notas é feita sob demanda para o fornecedor escolhido.

## De-para e Lançamentos

O Connect processa as NF-e, CT-e e NFS-e tomadas do acervo FiscalDocument.
Pagamentos sem nota, faturamento, comparação com a Domínio e geração anual
de lançamentos não fazem parte deste processamento.

- **Visão geral:** quantidade e valor das entradas, prontas, pendentes e fora.
- **Notas de entrada:** pesquisa por fornecedor/documento e filtros por tipo,
  CFOP e situação, com acesso à ficha da nota.
- **Pendências:** fornecedor + CFOP, notas relacionadas, cadastro de regra,
  exportação para preenchimento e revisão de sugestões em lote.
- **Regras do de-para:** cadastro e edição sem depender das notas do mês,
  importação/exportação, desconsiderar, reativar e remover.
- **Lançamentos:** consulta e exportação XLSX/TXT por tipo, com os filtros
  aplicados. A exportação inclui todas as páginas.
- **Plano e contas:** consulta ao plano, atualização do arquivo e contas fixas.

Regras, plano, contas fixas e sugestões de débito por CFOP pertencem à empresa
base (matriz), compartilhados com suas filiais. A tela identifica essa origem.
O código reduzido é o que entra no arquivo da Domínio.
Remover regras ou sugestões de CFOP segue a regra geral do Connect: somente
Administrador ou Super Admin. Desconsiderar e reativar continuam sendo operações
do dia a dia para quem pode agir no módulo.

### Regras e opções avançadas

O editor lateral permite informar fornecedor, CFOP opcional, contas, código de
histórico e complemento. O complemento aceita {nf}, {serie}, {data}, {cfop}
e {fornecedor}; a prévia indica se usa uma nota do período ou dados ilustrativos.
CT-e, NFS-e e imobilizado configurados mantêm a precedência de seus modelos.

As opções avançadas começam recolhidas: observação, data substituta, valor
substituto positivo, início de lote, filial e centros de custo. Data e valor
informados valem para cada nota alcançada pela regra; em branco, permanecem
os dados originais. Os demais campos vazios mantêm o comportamento anterior.
As substituições não alteram o documento fiscal.

O cadastro CFOP → débito apenas sugere a conta ao criar uma regra. As sugestões
de crédito por nome continuam exigindo revisão humana. No lote, selecione
explicitamente as linhas; a gravação reconfere as pendências e as contas atuais.
Se as contas mudaram depois da revisão, é necessário revisar novamente.

### Importação e exportação de regras

Exporte Regras ou Pendências em CSV. A importação aceita CSV/XLSX até 5 MB e
5.000 linhas, com os cabeçalhos da referência:

cnpj_fornecedor, nome_fornecedor, cfop, conta_debito, conta_credito, historico,
observacao, codigo_historico, data_lancamento, valor, inicia_lote, codigo_filial,
centro_custo_debito, centro_custo_credito e desconsiderar.

Use identificadores como texto na planilha para preservar zeros iniciais.
Contas em classificação com pontos são traduzidas pelo plano carregado;
sem correspondência, a linha apresenta erro. Para valor substituto, use
1234,56 ou 1234.56, sem separador de milhar. Datas substitutas usam AAAA-MM-DD.

Conferir arquivo não grava nada. A prévia mostra erros por linha e as linhas
sem contas ignoradas. A confirmação relê e valida o arquivo no servidor e
grava o lote em uma transação. Fornecedor + CFOP é a chave: reenviar atualiza
as regras existentes. Um arquivo com erros não é parcialmente importado.
A confirmação confere a impressão da prévia; alterações na tradução das contas
exigem conferir o arquivo novamente.

O TXT da Domínio mantém ISO-8859-1, ponto-e-vírgula e CRLF. As novas colunas
do exportador são opcionais; o fluxo do BPO conserva seus campos vazios.

## Contribuições

Todas as leituras, decisões fiscais, geração e arquivos desta aba usam a API
do motor remoto, na raiz de CNPJ da empresa selecionada. As decisões e os
parâmetros são compartilhados com o Fiscal; não há uma segunda configuração.

O menu reúne Visão geral, Fechamento e conferência, Apuração e créditos,
Parâmetros e ajustes, Gerar e acompanhar, e Arquivos e histórico. Só a área
aberta consulta seus dados. O demonstrativo pesado é carregado na Apuração.
O acompanhamento consulta o log enquanto o pedido está aberto; não recarrega
demonstrativos em segundo plano.
As tabelas mostram 50 registros por página. Nas listas do motor, a busca filtra
os registros já carregados; os filtros e cursores do motor permitem consultar
as demais páginas sem varrer o histórico inteiro.

Para retificar, informe o recibo anterior. A geração grava o tipo da
escrituração e o recibo nos parâmetros da competência, usando uma chave
idempotente própria, e envia o pedido à fila com a chave do gesto original.
Uma falha de rede mantém a chave para reconciliar/repetir o mesmo pedido.

A integração e seus tokens ficam em Administração → Integrações. Sem token
de escrita, a consulta continua disponível. Sem integração ou com falha no
motor, os menus permanecem acessíveis e a área informa o impedimento.

A validação de EFD Contribuições não está habilitada no contrato atual do
motor; a tela mostra essa limitação e permite consultar o estado retornado.
Validar no PVA e transmitir continuam sendo operações externas. Registrar
uma entrega no Connect registra uma entrega já realizada.

### Autorização e interfaces

O contexto contábil é identificado nas ações compartilhadas pelo campo
opcional empresaContabil. O servidor valida contabil_sped, empresa visível,
tenant, raiz e recurso antes de escrever. Consulta exige ver; operação exige
agir; destravamento exige gerir. Apagar decisões mantém a exigência de perfil
que pode excluir.

O contexto só aceita parâmetros de Contribuições, ajustes do bloco M e decisões
por registro. Cancelamento, log, nova geração e entrega conferem a obrigação
ou ação do recurso; ICMS/IPI é recusado. Envios contábeis ficam restritos a
pagamentos de apoio e faturas do BPO no fechamento remoto.

O ator vem da sessão; tokens nunca são enviados ao navegador. Operações
originadas nesta aba usam o prefixo contabil na auditoria.

As URLs existentes de exportação foram preservadas. A tela usa aba e secao;
links antigos com ver continuam resolvendo suas áreas.

## Migration e validação

Migration aditiva: 20261030120000_contabil_sped_livre. Acrescenta campos opcionais
em contabil_regras e a tabela contabil_cfop_contas. Não migra nem consulta
diretamente o banco do SPED Generator.

Aplicar a migration pelo processo de implantação do projeto antes de publicar
o código. Nenhuma migration ou configuração de produção faz parte desta entrega.

Os testes cobrem históricos, campos avançados, CSV, filtros/exportação,
compatibilidade do BPO e autorização contábil restrita a Contribuições.
A conferência local utiliza somente connect41 em 127.0.0.1:3307, dados fictícios
e respostas simuladas do motor. Essa validação não representa homologação fiscal,
transmissão nem teste de um motor real.
