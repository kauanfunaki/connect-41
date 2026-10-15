# Prévia visual do Fiscal

As nove telas de teste ficam em `/fiscal`, no setor Fiscal. Todas usam dados fictícios, sem chamar a API do SPED, escrever no acervo real ou gerar arquivos fiscais. O módulo real continua em `/documentos-fiscais`, com o rótulo **Documentos fiscais — integrado** e seu controle de acesso original.

## Onde encontrar cada área do SPED generator

| Origem | Destino na prévia |
|---|---|
| Progresso | Painel fiscal |
| Documentos, NFS-e, contratos e recibos, enviar documentos | Documentos e importações: Acervo (filtro Grupo: notas fiscais, NFS-e, contratos e recibos, em quarentena, todos), Enviar documentos |
| Importações, quarentena, cobertura | Documentos e importações: Importações, Acervo com o Grupo "Em quarentena", Cobertura |
| Classificação, decisões em lote e histórico | Classificação: Produtos, Contratos e recibos, Decisões registradas |
| Apuração, demonstrativo ICMS, ajustes, DCIP/DIME | ICMS e IPI: Apuração, Demonstrativo, Ajustes, DCIP e DIME |
| Contribuições, fechamento, demonstrativo, SPED Contribuições | PIS e COFINS: Fechamento, Ajustes, Decisões por registro, Demonstrativo, SPED Contribuições |
| SPED gerados, validação e entrega | Arquivos e entregas: SPED gerados, Validação, Entregas |
| Executar, execuções, erros | Execuções: Executar, Histórico (filtro Estado: na fila, concluída, erro, cancelada) |
| Conferência de documentos e pagamentos | Conferência fiscal: Prévia financeira, Confronto de documentos |
| Parâmetros, de-para CFOP, regras e fontes | Configurações fiscais: Parâmetros, Regras fiscais |

## Um roteiro para testar

1. Em Documentos e importações → Enviar documentos, carregue um lote de exemplo.
2. No Acervo, filtre o Grupo "Em quarentena" e recupere os documentos rejeitados.
3. Em Classificação, selecione e classifique os produtos e os contratos/recibos.
4. Em PIS e COFINS → Fechamento, simule a apuração e feche a competência.
5. Gere uma versão de teste. Em Arquivos e entregas → Validação, valide e registre a entrega.
6. Altere uma decisão: a versão será sinalizada para revisão. Gere outra versão e confira o histórico.
7. Em Execuções, enfileire uma geração com falha, processe no Histórico (Estado "Na fila") e recupere com o Estado "Erro". Confira o log.
8. Em Conferência fiscal, simule o confronto de documentos e concilie um pagamento.

Os filtros de empresa, estabelecimento e competência são compartilhados. As abas têm links diretos usando `?aba=...`, inclusive no histórico do navegador; os filtros das listas também ficam no endereço (`grupo`, `estado`, `situacao`, `tipo`, `pagina`). Os endereços das antigas abas NFS-e, Contratos e recibos, Quarentena, Fila e Erros redirecionam para a lista com o filtro correspondente.

## Organização do fluxo

O painel oferece duas visões: **Visão geral** e **Histórico**.
A visão geral destaca somente a próxima ação da competência e mostra seis
etapas: receber, classificar, apurar/fechar, gerar, validar e entregar. A etapa
atual também é clicável; as demais áreas continuam acessíveis pelo menu lateral,
sem uma segunda listagem de atalhos no painel.
A orientação usa a última versão de cada obrigação e estabelecimento; uma
entrega antiga não conclui uma versão recém-gerada.

Cada tela segue a ordem das outras telas do Connect: a trilha "Painel fiscal /
tela", o cabeçalho (com o selo do modo de teste e o "⋯" de restaurar), a fileira
de empresa, estabelecimento e competência, os avisos, as abas, os totais e a
lista. A classificação usa seleção em lote, com detalhes no número do
documento. Ações únicas aparecem diretamente; o menu **⋯** reúne múltiplas opções. O detalhamento
por CFOP fica recolhido até ser solicitado. Botões e links habilitados usam cursor
de clique; controles desabilitados mantêm o cursor de indisponível.

O seletor de empresa é o das outras telas: busca por nome ou CNPJ e as empresas
recentes no topo, guardadas neste navegador à parte das empresas reais. A
competência se escolhe no campo de mês. As prévias têm navegação de volta ao
modal anterior. Remover ajustes e salvar parâmetros exigem confirmação.
Os parâmetros compartilhados dos quatro impostos ficam somente em Configurações
fiscais; o antigo link de parâmetros em PIS e COFINS redireciona para lá.

De-para contábil e lançamentos não pertencem ao Fiscal. As antigas abas
`depara` e `lancamentos` de Conferência redirecionam para a prévia financeira.
Configurações não oferece edição de nome/regime ou a aba Empresas e filiais;
o antigo endereço `aba=empresas` redireciona para Parâmetros. O seletor de
empresa/estabelecimento continua disponível para definir o contexto do trabalho.
Os dados salvos no navegador são preservados. As tabelas da prévia usam a tabela
padrão do Connect (`.c41-tabela`), centralizada, e viram cartões no celular; as
listas de documentos e de execuções ficam no casco com a barra (contagem, busca,
"Filtros") e a paginação do app. Situações usam o `Selo`, os números do topo a
`FaixaDeTotais` e os avisos o `Aviso`.

De-para CFOP e Fontes das regras foram reunidos na aba Regras fiscais, com CFOP,
tratamento e fonte/procedência na mesma tabela somente leitura. Regras e fontes
pertencem ao código de processamento do SPED, não à edição pelo usuário.
O antigo endereço `aba=cfop` redireciona para `aba=regras`; este último continua
válido. A prévia mostra dados demonstrativos, sem consultar o motor real ou alterar suas regras.

Não há fluxo de Domínio: o Connect gera, valida e registra a entrega dos próprios arquivos.
O antigo endereço `aba=dominio` redireciona para Entregas para não quebrar favoritos antigos.

## Dados locais e acesso

O cenário oferece três empresas fictícias, matrizes/filiais e as competências 09/2026 e 10/2026. Setembro mostra exemplos concluídos; outubro começa com pendências. Os parâmetros e valores servem apenas para experimentar a interface, sem equivalência com o motor tributário.

O estado fica no `localStorage`, em uma chave versionada por escritório e usuário. **Restaurar dados de teste**, no "⋯" do cabeçalho e com confirmação, repõe o cenário inicial. Armazenamento inválido é descartado; indisponibilidade mantém a sessão funcionando em memória, com aviso na tela. Dados não são compartilhados entre navegadores.

Os novos módulos são ligados por padrão no catálogo, sujeitos ao setor permitido, ao plano e às escolhas do escritório. Se um plano usa uma lista explícita de módulos, a liberação usa a administração existente; a prévia não contorna esse controle. Nesta etapa, Contábil e Financeiro permanecem no Fiscal, conforme a decisão para a prévia.

## Validação

O teste `src/lib/fiscal/previa/cenario.test.ts` cobre o fluxo completo, versões, revisão, fila, recuperação, ajustes, confrontos, isolamento, armazenamento e o registro das páginas no catálogo. As páginas usam o gate `abrirTelaDoModulo`; nenhuma ação fiscal da prévia usa Server Actions ou endpoints.

Para testar no Connect local, siga `scripts/local/README.md` e use o lançador `scripts/local/com-banco-local.mjs`. O projeto SPED generator continua sendo apenas referência de leitura.
