# EFD no Connect

O Fiscal usa a API `/api/connect/v1` preparada pelo Kauan. A base adotada é o [PR #279 do Connect](https://github.com/kauanfunaki/connect-41/pull/279), integrado em `32926252c5f914dd7d0e0af7afa17bc57ae1968a`, com o [PR #31 do SPED](https://github.com/kauanfunaki/sped_generator/pull/31). O contrato oficial é [API-CONNECT.md](https://github.com/kauanfunaki/sped_generator/blob/7cb41be645978ea694671bedc2be32d350564239/docs/API-CONNECT.md).

As páginas usam exclusivamente a integração configurada do escritório, inclusive no desenvolvimento. Sem conexão, ficam indisponíveis. Uma consulta válida sem registros apresenta lista vazia. Não há troca automática para o cenário local.

## O que está disponível

| Área | Operação |
| --- | --- |
| Painel | Saúde do banco, agentes, fila e arquivos da competência |
| Executar | Solicitar extração ou geração de EFD ICMS/IPI e EFD Contribuições na fila existente |
| Histórico | Consultar execução e log; cancelar pedido pendente; destravar execução sem sinal, conforme permissão e regra do motor |
| SPED gerados | Listar versões e detalhes, baixar TXT, consultar validação, decisões posteriores e entrega; regerar, solicitar validação e registrar entrega |
| Configurações › Empresas | Conferir cadastro e vínculo entre estabelecimentos do SPED e empresas do Connect; edição parcial conforme permissão |
| Classificação, ajustes e Contribuições | Consultar e gravar os tipos de decisão suportados pelo motor, com autoria e histórico |

Documentos/importações, apuração, demonstrativos, fechamento e conferência ainda dependem de endpoints do motor. Essas áreas orientam o uso do painel SPED. A exclusão de documentos continua bloqueada enquanto o motor não a liberar. As decisões por registro de Contribuições dependem da listagem desses registros para permitir novas inclusões.

## Banco e conexão

O Connect mantém seu banco de usuários, empresas e permissões. O motor continua usando a base SPED no serviço **n8n/mysql_xml** do EasyPanel, separado do banco do Connect. O contrato chama essa base de `xml_vault`; confirmar o schema no ambiente, pois nome do serviço e nome do banco podem ser diferentes.

A comunicação do Connect com `https://sped.41tech.cloud` é por HTTPS. Credenciais do MySQL do SPED não são configuradas no Connect. Kauan deve confirmar que a API e os executores apontam para a base SPED correta.

## Configurar a integração

Em **Administração → Integrações → SPED Generator**, ativar a integração do escritório e preencher:

| Campo | Configuração |
| --- | --- |
| URL do SPED | `https://sped.41tech.cloud` |
| Token de serviço | Mesmo valor de `CONNECT_TOKEN_LEITURA` e do `CONNECT_TOKEN_SERVICO` existente no motor |
| Token de escrita | Valor próprio de `CONNECT_TOKEN_ESCRITA`, quando a escrita estiver habilitada |

Os tokens de leitura e escrita do motor precisam ter pelo menos 32 caracteres; conferir o token existente antes de habilitar a nova API.

O campo de escrita é `serviceTokenEscrita` no JSON cifrado de `TenantIntegration`. Sem ele, consultas e downloads continuam disponíveis e as ações ficam desabilitadas. O token contábil existente tem escopo próprio. Nenhum token vai ao navegador e não há fallback de credencial global do Connect.

As raízes autorizadas vêm do alcance do escritório. No motor, também precisam estar em `CONNECT_RAIZES_PERMITIDAS`. Cadastrar cada estabelecimento como empresa do Connect, pelo CNPJ completo. **Configurações → Empresas** mostra divergências de vínculo.

Após configurar, clicar em **Testar conexão**, que consulta a saúde do motor sem gravar dados fiscais.

## Executar EFD

Em **Executar**, selecionar estabelecimento e mês inteiro, escolher a obrigação e informar **Original** ou **Substituto**. Contribuições é solicitada pela matriz e consolida a raiz. A operação entra na fila do SPED; os agentes existentes executam o trabalho. Se já houver pedido igual, a tela apresenta o existente e solicita uma decisão antes de enviar outro.

Consultar o andamento no Histórico e abrir o log. Cancelamento afeta somente pendentes; destravar depende da ausência de sinal e de permissão de gestão. Destravar não encerra o processo no computador do executor.

Em **SPED gerados**, abrir os detalhes e baixar o arquivo. O proxy preserva os bytes, o encoding e o SHA-256 recebidos da API. Decisões registradas depois da geração identificam arquivos defasados. A pré-validação não substitui o programa oficial. Geração e download não comprovam transmissão; o registro de entrega depende do recibo efetivo.

## Implantação

O PR do Connect sozinho não habilita o processamento. Kauan precisa disponibilizar o PR #31 no painel/API e alinhar as versões dos agentes, incluindo seu computador. O [repasse de implantação](EFD-CONTRATO-KAUAN.md) resume os pontos do contrato oficial.

Não há migration nova do Connect específica para EFD. Nenhum arquivo do motor SPED é entregue ou alterado por esta implementação. Não aplicar uma SQL de SPED no banco do Connect.

Para suspender o uso, desativar a integração ou os módulos fiscais do escritório. Preservar filas, decisões e arquivos. O retorno de versões do SPED deve ser coordenado com seu responsável.

## Verificação local

- `npm run test:efd`: cliente HTTP, credenciais, permissões, idempotência, ações, adaptação de dados, seleção da fonte e download.
- `npm run build:efd:verification`: build em cópia isolada, sem carregar o `.env` operacional.
- `npm run test:efd:ui`: navegador com o build isolado e um serviço HTTP local que implementa o contrato v1 para os casos verificados. Não executa o motor. Exige Playwright/Chromium ou Edge e schema Connect descartável em `127.0.0.1:33382/connect41`. O runner cria registros com IDs exclusivos nesse banco.

Evidências ficam em `.local/efd/`. Os runners não devem usar o banco de produção do Connect, o serviço `mysql_xml` nem documentos de clientes. A homologação com a API publicada e com os executores permanece uma etapa separada.

Os resultados desta entrega estão no [registro de validação](EFD-CONNECT-VALIDACAO.md).
