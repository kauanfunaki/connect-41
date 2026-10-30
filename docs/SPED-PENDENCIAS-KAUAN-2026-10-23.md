# O que falta para concluir a integração com o SPED

Kauan, comparei as versões atuais dos dois repositórios em 23/10/2026. A maior parte do Fiscal já está implementada dos dois lados. Precisamos confirmar a implantação, homologar a operação real e terminar os fluxos abaixo.

## Situação conferida

| Parte | Situação |
| --- | --- |
| Fiscal | A main dos dois projetos já contém execuções, arquivos, decisões, documentos/importações, cobertura, apuração, demonstrativos, fechamento, conferência e uploads em partes. Os PRs #280, #286 e #287 do Connect foram incorporados. |
| Multirraiz | K1.3 e K1.4 estão implementadas no motor. A liberação de outra raiz depende da migração e da configuração do ambiente. Não é uma API que ainda precise ser criada. |
| Contábil | O lado do Connect está no PR #289, ainda aberto, com CI aprovado. A main atual do SPED não contém a API contábil consumida por esse PR. |
| Implantação e homologação | A revisão dos repositórios não comprova quais versões estão publicadas nem o aceite dos usuários. Os PRs fiscais mais recentes registram testes com fixtures, sem teste contra o motor real ou validação no navegador. |
| BPO e DRE | Há prévia financeira na integração fiscal e trabalho de DRE no SPED. Isso ainda não comprova a migração completa do trabalho do BPO para o Connect. |

## Passo a passo

### 1. Confirmar o que está publicado — Kauan

- Conferir as versões do Connect, da API SPED e de todos os agentes Windows/VPS.
- Confirmar que API e agentes usam a mesma base SPED correta, separada do banco do Connect.
- Definir a janela de implantação e preservar backup, filas, configurações, saldos e arquivos operacionais.

**Concluído quando:** os commits em uso e os executores responsáveis estão identificados. Estar na main não é confirmação de deploy.

### 2. Conferir o schema e atualizar os agentes — Kauan

- Conferir as tabelas/colunas de idempotência, auditoria, registro de decisões, arquivos e batimento dos agentes previstas no contrato.
- Para a migração multirraiz, seguir as fases A e B de `docs/API-CONNECT.md`, seções 12.3 e 12.7. Atualizar todos os agentes antes da fase B.
- Manter `SPED_RAIZ_PADRAO` e `SPED_RAIZ_LEGADA` coerentes em cada ambiente. Só liberar a segunda raiz depois de a ferramenta de migração confirmar que as 22 tabelas estão prontas.
- Atualizar os agentes antes de usar as ações novas de cobertura e reprocessamento de quarentena.
- Conferir os volumes e o executor responsável pela cadeia de saldos de Contribuições, evitando gerações concorrentes com cópias diferentes do saldo.

**Concluído quando:** os agentes reconhecem as ações atuais e consomem a fila com o schema compatível.

### 3. Configurar a conexão e os arquivos — Kauan e Victor

- No motor: `CONNECT_TOKEN_LEITURA` igual a `CONNECT_TOKEN_SERVICO`; token de escrita próprio em `CONNECT_TOKEN_ESCRITA`. Os tokens fiscais precisam ter pelo menos 32 caracteres.
- Autorizar as raízes em `CONNECT_RAIZES_PERMITIDAS` e conferir o vínculo de cada estabelecimento com a empresa do Connect pelo CNPJ completo.
- No Connect: ativar SPED Generator por escritório, preencher URL, token de serviço e token de escrita e executar **Testar conexão**.
- Configurar `CONNECT_UPLOADS_DIR` em volume persistente gravável. Conferir o limite de corpo do proxy do Connect, de pelo menos 26 MB, e os timeouts das operações pesadas.
- Se o Ops Center for usado, cadastrar os agentes Windows/VPS e conferir seus sinais e eventos.

**Concluído quando:** saúde, empresas, consulta, escrita autorizada e upload funcionam no ambiente combinado, sem expor os tokens ao navegador.

### 4. Homologar o Fiscal já implementado — Victor e Kauan, com a Kátia

- Usar primeiro uma base isolada e um agente de homologação. Não apontar testes automatizados para produção.
- Fazer o percurso pelo navegador: consultar documentos, importar, conferir cobertura/quarentena, classificar, ajustar, fechar, gerar, acompanhar log e baixar o arquivo.
- Conferir ICMS/IPI, Contribuições, apuração, demonstrativos, pagamentos e confrontos contra o painel e as fontes aceitas pela equipe.
- Testar repetição sem duplicação, cancelamento pendente, recuperação de falha, permissões e isolamento entre escritórios/raízes.
- Testar upload pequeno e em partes, incluindo interrupção e retomada. Medir a apuração com um arquivo representativo do piloto.
- Comparar os bytes/SHA-256 do download e registrar a validação no PVA e o aceite fiscal em ambiente autorizado.

**Concluído quando:** há evidência de uma competência completa operada pelo Connect e aceita pela Kátia/Kauan. Gerar ou baixar não comprova transmissão.

### 5. Terminar as pendências de Contribuições e de permissões — Kauan no motor; Victor no Connect

- Ligar `validar_contribuicoes.py` ao fluxo de validações da API. Hoje `/arquivos/{id}/validar` aceita somente ICMS/IPI e recusa Contribuições.
- Disponibilizar a listagem dos registros de entrada de Contribuições e conectar a seleção desses registros à criação de novas decisões no Connect. A API de decisões existente, sozinha, não resolve essa seleção.
- Confirmar os papéis autorizados em cada decisão e se mudanças em empresas/entrega devem marcar arquivos como defasados.
- Decidir a liberação de `documento_excluido`, que continua condicionada à autorização explícita no motor, e homologar seu efeito na geração seguinte.

**Concluído quando:** as decisões necessárias podem ser tomadas pelo Connect, com autoria, efeito conferido e indicação de regeração quando aplicável.

### 6. Completar os fluxos fiscais que ainda dependem do painel/ferramentas — Victor e Kauan

- Integrar a abertura de PDF de NF-e e NFS-e no acervo. Na main do Connect, o proxy específico de PDF existente é o de CT-e.
- Completar a geração/download dos arquivos de DCIP/DIME e sua homologação em SC. A tela atual consulta os dados e permite editar pelos ajustes; isso não entrega o TXT estadual.
- Completar o envio e a comparação do arquivo SPED da Domínio pelo Connect. Registrar que vale o arquivo da Domínio não substitui esse fluxo.
- Definir o tratamento das importações que ainda leem arquivos locais/de rede, especialmente aluguéis de imóveis que dependem dos PDFs dos contratos.

**Concluído quando:** cada rotina obrigatória tem um percurso funcional no Connect ou uma exceção operacional expressamente aceita, antes de retirar sua tela antiga.

### 7. Publicar a API do Contábil — Kauan, com contrato alinhado ao PR #289

- Implementar e publicar os endpoints consumidos pelo Connect em `/api/integracao/contabil`, `/api/consultas/contabil` e `/api/comandos/contabil`, ou alinhar formalmente outro contrato nos dois projetos.
- Cobrir contexto/empresas, conferência, documentos, regras/de-para, contas/históricos, prévia/importação de CSV, geração, consulta de pedidos, arquivos, parada e retomada.
- Integrar o processamento à fila/agente e preservar os exportadores e regras existentes.
- Validar escritório, CNPJ e raiz no motor atual, inclusive idempotência, auditoria e token próprio de escrita contábil. Não reaproveitar uma restrição antiga de base com uma única raiz sem revisar o contrato.
- Preparar e revisar a persistência técnica necessária no SPED; atualizar os agentes antes de habilitar a nova ação.

**Concluído quando:** o Connect opera esse contrato contra um motor de homologação real, incluindo geração e download.

### 8. Disponibilizar e homologar o Contábil no Connect — Victor e Kauan, com a Sidineia

- Revisar e incorporar o PR #289 quando o contrato do motor estiver alinhado. O CI do commit `bf78d98a` está aprovado.
- Se o PR for publicado inteiro, seguir também as migrations Tech/Ops do pacote. O módulo Contábil, isoladamente, não exige migration Prisma própria.
- Configurar o token de escrita contábil, o módulo e as permissões do escritório.
- Completar a carga de plano de contas e históricos da Domínio pela interface/fila; isso ainda está previsto no roteiro de migração.
- Homologar entradas, pagamentos sem nota, faturamento/saídas, pendências, regras, arquivos mensais e geração anual.
- Importar os arquivos na Domínio e conferir contas, históricos, valores e lançamentos com a Sidineia.

**Concluído quando:** a Sidineia consegue fechar uma competência pelo Connect e os arquivos são aceitos na Domínio.

### 9. Concluir o escopo do BPO/DRE — Victor e Kauan, com Amanda e Marcos

- Confirmar o que vai para o setor BPO, reaproveitando as APIs financeiras já existentes, sem duplicar a operação fiscal.
- Conferir prévia, pagamentos sem nota e confrontos com a planilha da Amanda.
- Decidir e implementar como a DRE do SPED entra na DRE do Connect. O relatório no SPED não comprova essa integração.
- Manter Integra Contador/Serpro como etapa própria, dependente de contrato e autorizações; o roteiro diz que as fases anteriores não dependem dele.

**Concluído quando:** o trabalho do BPO incluído na migração é feito no Connect e os resultados são aceitos pelos responsáveis.

### 10. Encerrar a migração com aceite — Kauan e equipe

- Atualizar os guias antigos do Connect que ainda dizem que as rotas fiscais de documentos, apuração, demonstrativos, fechamento e conferência não existem.
- Registrar o aceite por fluxo e acompanhar um mês completo no Connect.
- Depois do aceite, fora do congelamento, retirar as telas antigas gradualmente e preservar API, agentes, histórico e recuperação.

**Concluído quando:** as rotinas acordadas deixam de depender do painel antigo sem interromper entregas.

## Referências da conferência

- SPED main: `eba7d3e2c8f32169a25b79a573d6768525d5afa1`.
- Connect main: `f38a23ca8e54f041841572d0fb66f412e4663557`.
- [Contrato atual do motor](https://github.com/kauanfunaki/sped_generator/blob/eba7d3e2c8f32169a25b79a573d6768525d5afa1/docs/API-CONNECT.md), especialmente seções 9, 10, 12, 13 e 14.
- [Roteiro completo da migração](https://github.com/kauanfunaki/sped_generator/blob/eba7d3e2c8f32169a25b79a573d6768525d5afa1/docs/MIGRACAO-CONNECT-VICTOR.md), confrontado com o contrato/código atual: várias tarefas históricas já foram implementadas.
- Connect: [PR #280](https://github.com/kauanfunaki/connect-41/pull/280), [PR #286](https://github.com/kauanfunaki/connect-41/pull/286), [PR #287](https://github.com/kauanfunaki/connect-41/pull/287) e [PR #289](https://github.com/kauanfunaki/connect-41/pull/289).
- [CI aprovado do PR #289](https://github.com/kauanfunaki/connect-41/actions/runs/40001775145).

Esta conferência leu código, contratos, histórico Git e estados dos PRs/CI. Não executou o motor, não alterou banco nem confirmou a implantação em produção.
