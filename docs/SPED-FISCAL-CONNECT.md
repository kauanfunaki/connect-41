# SPED Fiscal no Connect

As quatro áreas são independentes: Classificação, Apuração, Fechamento e Gerar SPED. As quatro áreas ficam no dropdown do SPED na lateral, aberto por hover, clique ou teclado. A empresa e o período ficam no topo do conteúdo, sem repetir as quatro áreas em abas na página. Trocar de empresa mantém a área aberta; os filtros específicos são reiniciados. O seletor segue a última empresa e o foco do BPO. O ano serve à análise; ao abrir Gerar SPED a partir de um ano, janeiro daquele ano aparece explicitamente para seleção do mês desejado.

Classificação, Apuração e Fechamento usam o banco e o servidor do Connect. Não precisam de integração SPED nem de TXT previamente gerado. A prévia fictícia anterior e as telas antigas continuam nos seus endereços, isoladas no grupo de rotas `(legado)`.

## Operação

1. Escolha a empresa e complete o Perfil fiscal: UF, regime, inscrição estadual e obrigações. O cadastro não decide uma obrigação em função da existência da empresa no motor.
2. Abra **Importar documentos e consultar resultados** em uma das três áreas locais. Envie XML, ZIP, TXT SPED, CSV ou XLSX no modelo fornecido. Cada envio aceita até 25 MiB. ZIP: até 2000 arquivos e 128 MiB descompactados. PDFs são anexos privados, sem extração automática.
3. Consulte os resultados de cada arquivo. A pausa aguarda o lote atual; cancelar preserva os registros anteriores. Retomar continua pelo cursor. Uma lease no banco evita dois executores para o mesmo item. O processamento avança em lotes de até 50 registros por solicitação, acionados pela tela; reabrir a tela permite retomar.
4. Classifique produtos individualmente ou em lote. No lote, “manter” preserva as decisões anteriores e campos vazios não apagam informações. Destinação, CFOP e decisão de crédito PIS/COFINS valem para fornecedor/produto na raiz. O crédito de ICMS vale para estabelecimento e mês; no lote o valor é por produto. No ano, o valor é rateado pelo ICMS das competências, com resíduo preservado e parcelas não negativas. A opção de restaurar o crédito original remove o override, mantendo o histórico auditado.
5. Nos documentos sem nota, informe os dados, anexe o PDF importado, decida crédito e natureza, e confira o pagamento. Rejeição exige motivo. Contrato de locação é cadastro, não pagamento no faturamento.
6. Consulte a Apuração ou o Livro fiscal e faça os ajustes. **Parâmetros e saldos** pertence à competência mensal. Não informado é diferente de zero. Uma decisão de tributação de item fica na sua empresa e competência, preservando o XML original.
7. Confira o Fechamento por empresa ou explicitamente pela raiz. Duplicidades são candidatas à revisão: não há exclusão automática nem travamento obrigatório das outras áreas.
8. Exporte Excel ou CSV. Excel inclui as tabelas da área; o CSV segue a visão selecionada. Identificadores permanecem texto, CSV usa UTF-8 com BOM e `;`, e os valores decimais são explícitos. Não é um leiaute de importação específico de outro fornecedor.

## Regras e referências

Dinheiro é mantido como decimal textual e calculado em unidades inteiras com BigInt. A apresentação também preserva os centavos. O CFOP espelha o prefixo do emitente e usa as tabelas de de-para/desempate do sped-generator, sem importar sua base particular da Domínio. Classificações não resolvidas ficam pendentes.

O crédito de PIS/COFINS de entrada não é concedido pela simples existência do imposto no XML do fornecedor: exige decisão e tributação fiscal conferida do item. XMLs com dados não levantados, leiautes incompletos e regras sem informação suficiente ficam identificados; não se inventam bases ou alíquotas.

Créditos de apoio de pagamentos aceitos e marcados “S” são derivados por categoria/tributo. Categorias de pessoa física seguem a lista de transporte da origem; outras pessoas físicas não recebem crédito automaticamente. As alíquotas comuns e de motorista precisam ser confirmadas nos parâmetros locais, sem aplicar a todos os clientes uma exceção anual do antigo painel. Há rastreabilidade dos documentos que originaram os ajustes.

O TXT conserva seus registros de referência e preenche o que puder ser recuperado. Os totais calculados vêm dos documentos e decisões, não do E110 importado. Documento analítico sem itens permanece incompleto. Reimportação de XML complementa o TXT da mesma chave; o TXT não rebaixa os itens do XML. Outro conteúdo da mesma fonte é conflito e preserva o anterior.

O acervo `FiscalDocument` é reaproveitado por identidade, sem editar vínculos financeiros. A escrituração usa vínculo próprio por estabelecimento; uma transferência entre empresas cadastradas não exige duplicar o documento original. Decisões são auditadas com antes/depois, autor e data. Alteração concorrente de revisão exige atualizar a tela.

Documentos que já estavam no acervo antes da escrituração aparecem no Fechamento como aguardando itens. Valores ausentes continuam ausentes; esses registros não são somados como zero nem incluídos silenciosamente na apuração. A importação do XML/TXT vincula a mesma identidade e completa o que estiver disponível.

## Implantação — responsabilidade do Kauan

1. Revisar a migration aditiva `20261030120000_sped_fiscal_connect`: cria somente tabelas `sped_fiscal_*`. Aplicá-la pelo fluxo autorizado de deploy, antes do código. Nenhuma migration de produção é executada pelo roteiro local.
2. Manter o volume privado `storage/`, incluindo `storage/sped-fiscal`, persistente e no backup. Originais, anexos e filas não são apagados automaticamente.
3. Conferir os módulos do escritório e os planos que usam lista restrita. O novo `fiscal_fechamento` é independente; ICMS/IPI e Contribuições mantêm suas permissões. Importação usa `fiscal_acervo`; perfil usa gestão de `fiscal_configuracoes`.
4. Implementar e homologar o [contrato de geração v1](SPED-GERACAO-CONNECT-V1-KAUAN.md). Só então anunciar `geracao_connect_v1` na saúde do motor.
5. Homologar separadamente os resultados fiscais com as referências do escritório e a geração/validação/entrega no motor adaptado. A navegação local e o motor simulado não comprovam homologação fiscal ou transmissão real.

## Verificação isolada

Se já usa o Connect em `localhost:3100`, o banco local da porta 3307 precisa das
novas tabelas. O laboratório da porta 3127 é separado e não o atualiza. Para
conferir sem alterar dados: `node scripts/local/atualizar-sped-fiscal.mjs`.
Para fazer backup e acrescentar somente as tabelas SPED ausentes:
`node scripts/local/atualizar-sped-fiscal.mjs --aplicar`. Esse comando recusa
bancos externos, não recria a base nem executa seeds ou outras migrations.
Recarregue a página após a preparação.

O lançador `node scripts/local/sped-fiscal-qa.mjs <comando>` usa exclusivamente o MySQL descartável na porta **33381**, sem aproveitar o banco 3307 nem suas integrações. O servidor de QA usa a porta **3127**, build e configuração TypeScript sob `.local/sped-fiscal/`.

Os testes MySQL requerem `SPED_FISCAL_TEST_DATABASE_URL` explicitamente na porta 33381; sem ela são ignorados, não aprovados. `scripts/local/preparar-sped-fiscal-qa.mjs` cria o schema apenas se esse banco estiver vazio e preserva uma preparação existente. As capturas e resultados de navegador ficam em `.local/sped-fiscal/`.

Com Node, dependências do lockfile e Docker já disponíveis, execute na raiz do repositório. Na primeira preparação, crie o contêiner abaixo; se `connect-sped-fiscal-qa` já existir, confira sua porta e reutilize-o com `docker start connect-sped-fiscal-qa`, sem remover dados:

```powershell
docker run --name connect-sped-fiscal-qa --label codex.task=sped-fiscal -e MYSQL_ROOT_PASSWORD=sped-fiscal-fictional-only -e MYSQL_DATABASE=connect41 -p 127.0.0.1:33381:3306 -d mysql:8.4
# Aguarde o MySQL ficar pronto antes da preparação.
node scripts/local/sped-fiscal-qa.mjs node scripts/local/preparar-sped-fiscal-qa.mjs
node scripts/local/sped-fiscal-qa.mjs node node_modules/vitest/vitest.mjs run src/lib/fiscal/sped/local
node scripts/local/sped-fiscal-qa.mjs npm run build
node scripts/local/sped-fiscal-qa.mjs node .local/sped-fiscal/next/standalone/server.js
```

Abra `http://127.0.0.1:3127`. Em outro terminal, `node scripts/test-sped-fiscal-ui.mjs` confere o servidor iniciado, usando Chrome ou Edge instalado. O lançador cria a configuração TypeScript isolada; o preparo gera o SQL a partir do schema instalado. Não é necessário copiar arquivos de `.local` de outra máquina. Pare o servidor com Ctrl+C e o laboratório com `docker stop connect-sped-fiscal-qa` quando terminar. A base local usual permanece preservada.

Conta exclusivamente fictícia desse laboratório: `fiscal.qa@example.invalid`, senha `SpedFiscalQA-Only-2026`. É preparada pelos testes de banco; não corresponde a uma conta ou credencial de produção.

Verificações: TypeScript, ESLint, Vitest, comparação com os analisadores Python sobre a amostra fictícia, testes reais de banco, roteiro Playwright `scripts/test-sped-fiscal-ui.mjs` e build standalone. O contrato HTTP é testado com respostas simuladas; o motor remoto não é modificado por esta entrega.
