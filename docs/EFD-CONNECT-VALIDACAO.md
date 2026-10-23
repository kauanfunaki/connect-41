# EFD no Connect — validação de 22/10/2026

A implementação do Connect foi ajustada ao contrato `/api/connect/v1` do SPED. As telas fiscais usam a integração configurada do escritório; indisponibilidade não ativa dados locais de demonstração.

## Referências verificadas

- [Connect PR #279](https://github.com/kauanfunaki/connect-41/pull/279), integrado em `32926252c5f914dd7d0e0af7afa17bc57ae1968a`.
- [SPED PR #31](https://github.com/kauanfunaki/sped_generator/pull/31), com o [contrato oficial](https://github.com/kauanfunaki/sped_generator/blob/7cb41be645978ea694671bedc2be32d350564239/docs/API-CONNECT.md) na revisão `7cb41be645978ea694671bedc2be32d350564239`.

O código do Connect foi incorporado preservando as alterações locais de outras tarefas. Não houve pull, commit, push ou deploy. Nenhuma alteração desta entrega permanece nos arquivos do projeto SPED.

## Verificações concluídas

| Verificação | Resultado |
| --- | --- |
| `npm run test:efd` | 97 testes aprovados em 13 arquivos |
| Suíte completa | 5.684 testes aprovados; 76 pulados; 447 arquivos aprovados e 4 pulados |
| TypeScript, `tsc --noEmit` | Aprovado |
| ESLint do código fiscal e dos runners | Aprovado |
| `npm run lint` completo | Sem erros; um aviso preexistente em `scripts/exportar-empresas-para-prototipos.ts:82` |
| Build de produção isolado | Aprovado, com a rota nativa de download e sem a rota EFD provisória |
| Navegador com o build de produção | Sete verificações aprovadas, sem erros de página |

Na primeira tentativa de build houve uma falha no carregamento de fonte pelo `next/font`. A repetição com o cache de build existente foi concluída. O código de fontes do produto não foi alterado.

O navegador verificou:

1. Listagem e download pela API v1, preservando bytes e SHA-256.
2. Geração e cancelamento enviados por Server Actions, com token de escrita, ator da sessão e chave de idempotência.
3. Histórico e log acessíveis após atualizar a página.
4. Layout em 1366 × 768, áreas úteis equivalentes a 125%, 150% e 200%, e celular, sem transbordamento horizontal da página.
5. Orientação de uso do painel SPED nas áreas ainda sem endpoint.
6. Falha de conexão quando a API fica indisponível.
7. Estado indisponível quando a integração é desativada, sem recorrer ao cenário local.

As capturas de arquivos, histórico e telas responsivas foram conferidas visualmente. Os resultados e as evidências locais ficam em `.local/efd/resultado-ui.json`, `.local/efd/evidencias/` e nos logs de testes, tipos e build em `.local/efd/`.

## Alcance da validação

Os testes usaram um banco Connect descartável em `127.0.0.1:33382/connect41`, registros com IDs exclusivos e um serviço HTTP local que responde ao contrato v1. O build isolado não carregou o `.env` operacional.

Esses testes comprovam o comportamento do Connect diante do contrato verificado. Não executaram o motor Python, a fila ou os agentes do Kauan; não acessaram o MySQL `n8n/mysql_xml`, documentos de clientes ou bancos de produção; não geraram nem transmitiram uma obrigação real.

A publicação da API e dos agentes, os tokens, a raiz permitida e a confirmação do banco SPED correto continuam pendentes no ambiente real. Seguir o [repasse para o Kauan](EFD-CONTRATO-KAUAN.md) e realizar a homologação descrita nele antes da liberação operacional.
