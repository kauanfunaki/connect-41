# SPED do Contábil

O módulo `contabil_sped` aparece como **SPED** no setor **Contábil**, em `/contabil/sped`, ligado por padrão para quem tem acesso ao setor. Pode ser desligado em Configurações → Setores e módulos. Planos com catálogo restrito precisam permitir esse código.

O fluxo possui quatro telas: escolher estabelecimento/período, conferir dados, resolver pendências e gerar arquivos. Reúne entradas, pagamentos sem nota e faturamento, regras de fornecedor/CFOP/categoria, prévia de CSV, conferência e exportação conforme o suporte de cada origem. Cálculos e geração longa são executados na fila do motor SPED; o Connect usa a API, sem conexão direta ao banco SPED.

## Integração necessária

Em Configurações → Integrações → SPED Generator, configure URL, token de serviço e, para alterar regras/importar CSV, **Token de escrita contábil**. Essa credencial separada fica cifrada com a configuração existente. O token genérico de escrita fiscal continua independente.

O motor precisa disponibilizar a API contábil compatível em `/api/integracao/contabil`, `/api/consultas/contabil` e `/api/comandos/contabil`, incluindo a fila e seu agente. A implementação do motor pertence ao repositório SPED Generator e exige sua própria implantação. Sem configuração ou API compatível, a tela informa indisponibilidade; registrar o módulo no Connect não implanta o motor.

Empresas são limitadas aos CNPJs do escritório e às raízes sincronizadas. Usuário Somente leitura pode conferir/exportar; alterações exigem ação no setor, e exclusões exigem administrador. API e página validam ativação e acesso. A tela associa respostas assíncronas ao pedido selecionado para evitar que uma resposta antiga substitua o período atual.

## Validação

`node node_modules/vitest/vitest.mjs run src/lib/contabil`

As verificações da ponte usam dados fictícios e API simulada. A homologação com o motor implantado deve ser registrada separadamente. Este módulo não exige migration adicional no banco Connect.
