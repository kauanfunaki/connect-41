# SPED contábil — validação local

Data: 22/10/2026.

## Entrega

O Connect oferece `/contabil/sped`, com quatro etapas e o módulo `contabil_sped` ligado por padrão. O backend foi acrescentado ao clone local `C:\Dev\CLONED\sped_generator`. O painel antigo permanece disponível.

| Função do painel original | Onde foi disponibilizada |
| --- | --- |
| O que sobe e o que não sobe | Conferir dados: contagens, valores, origem e exclusões |
| Pendências — fora do de-para | Resolver pendências: busca, filtros e documentos em painel |
| De-para contábil | Definir contas, sugestões confirmadas, CSV com prévia e Regras cadastradas |
| Relatório de lançamentos | Conferir dados e Gerar arquivos, com os exportadores originais |
| Pagamentos sem nota fiscal | Tipo específico, regras por categoria/nome e destino na matriz |
| Saídas — faturamento | Consulta mensal, regras fixas e arquivos XLSX/TXT originais |
| Geração em lote — o ano inteiro | Consulta por competência e ZIP original de entradas |

## Verificações realizadas

| Verificação | Resultado |
| --- | --- |
| Suíte geral do Connect | 438 arquivos passaram; 4 ignorados. 5.614 testes passaram; 76 ignorados |
| Módulo contábil após a revisão de formatos | 16 testes passaram |
| Integração Python em MySQL descartável | 13 testes passaram |
| Regressão original protegida do SPED | 952 verificações passaram |
| Lint geral | Zero erros; um aviso anterior em `scripts/exportar-empresas-para-prototipos.ts:82` |
| Lint dos arquivos do módulo | Sem erros ou avisos |
| Tipos finais | Sem erros, após regenerar o cliente Prisma do schema atual |
| Build Next de produção em cópia isolada | Concluído com a versão final do módulo; rotas de página e API incluídas |
| Docker do agente e do painel/API | As duas imagens foram construídas localmente; imports validados durante o build |
| Interface integrada | 8 grupos de verificações passaram; nenhum erro de navegador |

O build Next usa cópia local sem `.env`. Há avisos do empacotamento standalone sobre manifests de layouts opcionais; eles não impediram o build nem a execução das rotas testadas. O cliente Prisma foi regenerado localmente porque o schema atual continha um modelo ainda ausente no cliente gerado. Essa operação não aplica migrações.

Os testes de backend verificam vínculo de escritório/raiz/empresa/execução, leitura separada de escrita, exclusão administrativa, comandos idempotentes, auditoria na mesma transação da regra, reversão quando a auditoria falha, prévia e reimportação de CSV, relatório desatualizado, arquivos TXT/XLSX/ZIP, anual, pagamentos na matriz, parada/retomada e ausência de varredura de PDFs na consulta de pagamentos. As contagens de documentos não somam duas vezes o mesmo documento quando faltam débito e crédito.

A interface foi exercitada do período até o download do XLSX: abrir documentos, salvar contas, exigir nova conferência, voltar/avançar no navegador, atualizar a página, usar Tab e Escape e devolver o foco à lista. Também foram verificados bloqueios de outro setor, de exclusão por usuário comum e de módulo desligado. Uma resposta da consulta antiga foi retida e liberada somente depois da nova conferência; o resultado atual foi preservado. As capturas das quatro etapas e do formulário de contas foram inspecionadas.

A comparação com o legado usa funções e exportadores reais com dados fictícios. Os cálculos fiscais não foram reimplementados. Esta rodada não compara uma base de clientes de produção inteira.

## Ambiente e evidências

- MySQL descartável em `127.0.0.1:33382`, bancos `sped_ci` e `connect41`.
- Connect standalone, FastAPI e o agente existente executando pedidos reais da fila de teste. Nenhuma transmissão ou importação na Domínio.
- Documentos e lançamentos fictícios; originais de clientes e pastas compartilhadas não foram usados.
- Logs, capturas e XLSX de teste em `.local/contabil/`. O resumo navegável fica em `.local/contabil/resultado-ui.json`.
- Capturas de 1366 × 768, áreas úteis equivalentes a 125%, 150% e 200%, celular de 390 × 844 e tema escuro. Isso verifica adaptação por viewport; não representa homologação manual de todas as escalas do Windows.

## Limites e etapas de implantação

A migração SQL foi revisada como aditiva: quatro tabelas técnicas novas, sem remoção ou alteração de dados fiscais existentes. Foi exercitada somente no banco descartável. Nenhuma migração foi aplicada em produção.

Para disponibilizar o recurso, seguir o [guia de implantação](CONTABIL-SPED.md): aplicar a migração em ambiente autorizado, atualizar todos os agentes, atualizar a API e o Connect, cadastrar vínculo de escritório/raiz e os tokens separados. As imagens Docker locais não foram publicadas.

A parada ocorre entre itens; não interrompe o exportador legado no meio da escrita de um arquivo. Não houve teste de carga com o volume completo de produção, auditoria completa de acessibilidade ou homologação em máquina de usuário.

Antes de considerar a integração plenamente homologada, importar e conferir os arquivos na Domínio em ambiente autorizado, incluindo entradas, pagamentos, faturamento, geração parcial e lote anual. Validar com a equipe os nomes e saldos das contas da base real.
