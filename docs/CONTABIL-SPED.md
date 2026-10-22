# Contábil — SPED

O módulo contabil_sped, ligado por padrão, abre /contabil/sped. Sua ativação continua sujeita ao plano, ao escritório e às permissões de setor. O cadastro de Contábil já existente é reaproveitado.

## Como usar

1. Escolha estabelecimento, competência ou ano e os tipos de lançamento. Entradas vêm selecionadas. Clique em **Conferir período**.
2. Confira documentos, lançamentos, pendências e exclusões. Documento, fornecedor e lançamento têm contadores separados. Arquivo de origem ausente não significa ausência de movimento.
3. Resolva pendências por fornecedor, CFOP, categoria ou nome. **Ver documentos** mantém a lista atrás do painel. Campos adicionais ficam recolhidos. As sugestões só são aplicadas após confirmação. É possível baixar pendências, preencher o CSV e conferir a prévia antes de importar.
4. Atualize a conferência depois de alterar regras. Revise o destino e gere XLSX, TXT ou CSV conforme o tipo. Havendo pendências, confirme explicitamente a geração apenas dos lançamentos prontos.

Entradas anuais usam o ZIP original, com arquivos por competência, pendências e _CONFERENCIA.csv. Faturamento é mensal. Pagamentos sem nota são sempre destinados à matriz. A opção “Só o que ainda não está na Domínio” começa desmarcada, como no motor atual.

O processamento continua fora da página. O endereço preserva contexto e identificadores; **Últimas consultas** permite reabrir pedidos. A parada acontece entre itens. Retomar preserva checkpoints completos; se as regras ou origens mudaram, faça uma nova conferência.

**Arquivos gerados** confirma somente a geração. Baixar não confirma importação na Domínio.

## Configurar a integração

Em **Configurações → Integrações → SPED Generator**, mantenha URL e token de leitura já existentes. O novo campo **Token de escrita contábil** é opcional e separado: sem ele, consultar e exportar continuam possíveis; salvar regras exige esse token e permissão de ação.

No servidor Python, configurar explicitamente:

- CONNECT_CONTABIL_TENANT_ID: identificador do escritório no Connect.
- CONNECT_CONTABIL_CNPJ_RAIZ: raiz da base contábil atual, com oito dígitos.
- CONNECT_TOKEN_SERVICO: credencial de consulta existente.
- CONNECT_CONTABIL_TOKEN_ESCRITA: credencial própria para escrita, diferente da leitura.

Não colocar valores reais em arquivos versionados. No Connect, as credenciais ficam cifradas em TenantIntegration; não há fallback para um token global de ambiente.

A raiz deve estar autorizada em sped_sync_roots e os estabelecimentos devem estar cadastrados em Company no mesmo escritório. A API Python recusa bases com mais de uma raiz, inclusive em empresas inativas, pois plano de contas, de-para e pagamentos ainda são compartilhados na base atual. Uma base independente pode conectar somente ao escritório configurado.

## API e persistência

O navegador acessa /api/contabil/sped/[operacao], protegido pela sessão e pelo módulo. O Connect resolve autor, escritório e capacidade de exclusão; valores enviados pelo navegador não substituem a sessão.

No Python:

- GET /api/integracao/contabil/: contexto, regras, contas, históricos, documentos, andamento e downloads.
- POST /api/consultas/contabil/: conferir, gerar, parar, retomar e previa-csv. Usa leitura e persiste apenas pedidos/resultados técnicos.
- POST /api/comandos/contabil/: regras de fornecedor, CFOP, categoria e nome, desconsideração/reconsideração, sugestões e importação de CSV. Exige escrita; remover também exige a capacidade administrativa enviada pelo Connect.

Todos os comandos carregam contexto e chave UUID de idempotência. A auditoria e a alteração de regra compartilham uma transação, inclusive quando o legado faz commits internos. Repetir a chave com conteúdo distinto retorna 409. Pedidos ativos iguais compartilham execução, mesmo quando solicitados por usuários diferentes.

O agente existente executa a ação interna contabil. Uma trava MySQL serializa o processamento contábil da base entre agentes; consultas do navegador verificam o estado a cada dez segundos. Não se cria outro watcher nem se habilita inicialização automática.

Resultados e arquivos ficam em tabelas técnicas do SPED. TXT mantém seus bytes ISO-8859-1; XLSX e ZIP preservam os exportadores originais. Consultar pagamentos não percorre pastas de PDF na rede. Listas no Connect são limitadas/paginadas; arquivos completos continuam disponíveis pela geração.

## Implantação e retorno

1. Revisar e aplicar no banco SPED autorizado migrations/20261022_contabil_connect.sql. Ela somente cria quatro tabelas técnicas. Não há migration Prisma nova nem cópia de documentos.
2. Atualizar **todos os agentes** antes de habilitar os novos comandos da API. Um agente antigo não reconhece a ação contabil.
3. Atualizar o painel/API Python, preencher as variáveis e testar o vínculo de escritório/raiz.
4. Atualizar o Connect e configurar sua integração cifrada.
5. Homologar uma competência e os arquivos na Domínio em ambiente autorizado.

O painel antigo e seus fluxos continuam disponíveis. Para retornar, desligar contabil_sped por escritório e restaurar as versões anteriores de painel/agentes/Connect. Preservar as tabelas técnicas e os arquivos para consulta e recuperação; não remover dados para fazer rollback. Se um agente morrer sem registrar o encerramento da fila, confirmar que não existe executor ativo antes de corrigir a fila pelo procedimento operacional já utilizado no SPED.

## Validação local

Nunca usar o .env da raiz para testes. O build de verificação copia o código para .local/contabil sem copiar credenciais, evitando interferir no .next em uso.

- npm run test:contabil
- npm run lint
- npm test
- npm run build:contabil:verification
- CONTABIL_TEST_DATABASE_URL=mysql://root:<senha-descartavel>@127.0.0.1:33382/connect41 npm run test:contabil:ui

O teste de interface exige um banco descartável explícito e cria somente fixtures locais. O backend possui scripts/testar_contabil_isolado.py e a regressão original protegida por scripts/testar_isolado.py. O primeiro exige sped_ci em loopback/33382, desativa dotenv e bloqueia rede externa.

Os testes cobrem autorização, escrita com token separado, auditoria transacional, idempotência, CSV, dinheiro em centavos nos resumos, arquivos, ausência de origem, anual, parada e retomada. Evidências e resultados específicos ficam em .local/contabil e são resumidos em CONTABIL-SPED-VALIDACAO.md. Isso não substitui homologação dos arquivos no importador da Domínio nem implantação em produção.
