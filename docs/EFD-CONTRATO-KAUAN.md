# EFD — repasse de implantação para o Kauan

O Connect foi ajustado ao código do [PR #279](https://github.com/kauanfunaki/connect-41/pull/279) e ao contrato `/api/connect/v1` do [PR #31 do SPED](https://github.com/kauanfunaki/sped_generator/pull/31). A especificação de referência é [docs/API-CONNECT.md](https://github.com/kauanfunaki/sped_generator/blob/7cb41be645978ea694671bedc2be32d350564239/docs/API-CONNECT.md), revisão `7cb41be`. Não há uma segunda API EFD a implementar a partir desta entrega.

## Preparar o SPED

1. Disponibilizar o painel/API do PR #31, seguindo os procedimentos do próprio PR para schema, registro de decisões e arquivos anteriores ao rastreamento.
2. Confirmar que API e executores usam a base SPED do serviço **n8n/mysql_xml**, preservando o banco separado do Connect.
3. Configurar `CONNECT_TOKEN_LEITURA` com o mesmo valor de `CONNECT_TOKEN_SERVICO`, com pelo menos 32 caracteres. Configurar `CONNECT_RAIZES_PERMITIDAS` para a raiz do piloto. O código atual recusa mais de uma raiz enquanto o isolamento multirraiz não estiver concluído.
4. Atualizar o agente do Windows e reconstruir a imagem do agente da VPS conforme o PR. Preservar os arquivos de configuração e dados operacionais. Contribuições deve ser gerada em um único executor com a cadeia de saldos correta; conferir o arquivo de saldos e o volume do agente.
5. Para liberar escrita, configurar `CONNECT_TOKEN_ESCRITA` com valor próprio, diferente dos tokens de leitura, com pelo menos 32 caracteres. `CONNECT_DECISOES_ESCRITA` pode restringir os tipos de decisão. Exclusão de documento continua dependendo da liberação específica prevista no contrato.
6. Se forem usados no Ops Center, configurar os agentes com seus próprios `OPS_URL`, `OPS_TOKEN` e `OPS_SLUG`, conforme o cadastro do Connect e a documentação do PR.

Esses ajustes pertencem ao projeto SPED e serão realizados pelo Kauan. Nenhum deles foi aplicado por esta implementação do Connect.

## Devolver para a configuração do Connect

- URL publicada da API compatível com `/api/connect/v1`.
- Tokens de consulta e, quando liberado, de escrita, por canal seguro.
- Raiz liberada no motor e confirmação do vínculo dos estabelecimentos pelo CNPJ completo.
- Confirmação de que o executor está ativo e acessa a base correta.

No Connect, configurar **SPED Generator** por escritório e usar **Testar conexão**. A leitura usa `serviceToken`; a escrita usa `serviceTokenEscrita`, ambos cifrados. As raízes vêm do alcance do escritório. O ator segue em `X-Connect-Ator`, codificado em base64url a partir da sessão; comandos de criação usam `Idempotency-Key`. O proxy de download preserva os bytes e `X-Conteudo-SHA256`.

## Homologar

Conferir saúde, empresas, isolamento por raiz/CNPJ, geração em competência autorizada, replay sem duplicação, cancelamento pendente, acompanhamento do log, download byte a byte, registro de decisões e permissões de escrita. Validar a EFD no programa oficial antes da liberação operacional. Não usar produção como banco de testes nem confundir geração com transmissão.

As áreas de documentos/importações, apuração, demonstrativos, fechamento e conferência permanecem no painel do motor até que suas rotas sejam disponibilizadas. O Connect já as apresenta como indisponíveis.
