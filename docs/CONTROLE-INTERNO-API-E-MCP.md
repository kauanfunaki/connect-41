# Controle interno pela IA: API e servidor MCP

Desde 05/11/2026 (decisão D2, "API do Connect + servidor MCP, token por pessoa"),
qualquer pessoa com acesso ao Controle interno pode deixar a IA dela — Claude Code,
Codex, Cursor — ou um script consultar, registrar e atualizar bugs, melhorias,
novas funcionalidades, testes e migrações em nome dela.

Duas portas, a mesma regra:

- **Servidor MCP** em `/api/mcp` (Streamable HTTP, sem sessão): o jeito recomendado
  para a IA.
- **API REST** em `/api/v1/controle-interno`: para scripts, CI e integrações.

As duas chamam as mesmas funções das telas (`src/lib/tech-interno/servidor.ts`), com
a pessoa dona do token no lugar da pessoa da sessão. O token age com o papel e os
setores **de hoje** da pessoa; o escopo só restringe. Toda alteração entra no
histórico do item com o nome da pessoa, e a Auditoria marca `via: token pessoal`
com o nome do token.

Nos exemplos, troque `https://app.useconnect.com.br` pelo endereço do seu Connect.

## 1. Gerar o token

1. Configurações › Sua conta › **Tokens de acesso**.
2. Dê um nome (onde vai ser usado), escolha **Consultar e registrar** ou **Só
   consultar** e a validade (30, 90, 180 dias ou 1 ano).
3. Clique em **Criar token** e copie: o token (`c41_…`) aparece uma vez só. Para o
   Claude Code, a tela já mostra o comando pronto.

Escopos:

| Escopo | O que permite |
|---|---|
| `controle-interno:ler` | listar, ver item, ver opções |
| `controle-interno:escrever` | criar, atualizar, mudar situação, comentar, anexar (inclui ler) |

O administrador do escritório vê os tokens ativos de todo mundo na mesma seção e pode
revogar qualquer um. Revogar vale na hora. Guarde o token numa variável de ambiente
(`CONNECT_TOKEN` nos exemplos), nunca no repositório.

## 2. Configurar na IA

### Claude Code

```bash
claude mcp add --transport http connect https://app.useconnect.com.br/api/mcp --header "Authorization: Bearer $CONNECT_TOKEN"
```

Ou, num `.mcp.json` de projeto (o Claude Code expande a variável):

```json
{
  "mcpServers": {
    "connect": {
      "type": "http",
      "url": "https://app.useconnect.com.br/api/mcp",
      "headers": { "Authorization": "Bearer ${CONNECT_TOKEN}" }
    }
  }
}
```

### Codex

Em `~/.codex/config.toml`:

```toml
[mcp_servers.connect]
url = "https://app.useconnect.com.br/api/mcp"
bearer_token_env_var = "CONNECT_TOKEN"
```

### Cursor

Em `~/.cursor/mcp.json` (ou `.cursor/mcp.json` no projeto):

```json
{
  "mcpServers": {
    "connect": {
      "url": "https://app.useconnect.com.br/api/mcp",
      "headers": { "Authorization": "Bearer ${env:CONNECT_TOKEN}" }
    }
  }
}
```

### Ferramentas

Só aparecem as ferramentas do escopo do token.

| Ferramenta | Escopo | O que faz |
|---|---|---|
| `listar_itens` | ler | lista com filtros (situação, tipo, prioridade, sistema, responsável, busca, atrasados, página) |
| `ver_item` | ler | um item com o critério de aceite (`acceptanceCriteria`), os pontos já conferidos (`acceptanceChecks`), comentários, histórico, anexos e a `version` |
| `ver_opcoes` | ler | tipos, situações, sistemas do Ops Center (`key`), pessoas (`id`), entregas recentes |
| `resumo_do_periodo` | ler | concluídos, em andamento, planejados e cancelados no dia, na semana, no mês ou no ano (`period`: `day`, `week`, `month`, `year`; `date`: AAAA-MM-DD) |
| `criar_item` | escrever | cria e devolve o item com o id curto (`shortId`) e o link curto (`url`) |
| `atualizar_item` | escrever | altera só os campos enviados |
| `mudar_situacao` | escrever | Pendente → Em andamento → Em validação → Concluído / Cancelado |
| `comentar` | escrever | comentário no item |
| `anexar` | escrever | arquivo em base64, até 10 MB |

Exemplos de pedido: "registre um bug no Controle interno: a busca de empresas não acha
pelo CNPJ, prioridade alta, no sistema do Connect"; "mova para Em validação o item da
busca por CNPJ e comente o link do PR"; "o que a Tech concluiu esta semana?".

**O resumo do período** (06/11/2026) responde numa chamada só o que antes pedia ler o
histórico item a item:
- concluídos e cancelados contam pela data da última mudança de situação;
- em andamento é a foto de agora, com `movedInPeriod` dizendo se o item mudou no período;
- planejados são os pendentes que entraram no período ou vencem nele.

A semana vai de segunda a domingo, e os dias são os de São Paulo. Na tela, é o botão
"Resumo" no topo do Controle interno, com o texto pronto para colar num canal.

**O critério de aceite** (10/11/2026) tem campo próprio, `acceptanceCriteria`, fora da
descrição: em `criar_item` e `atualizar_item` (e no `POST`/`PATCH` da API). Um rótulo
por linha:

```
CRITÉRIO DE ACEITE (dd/mm/aaaa)      ← opcional
Mudança: …
Termos: …                            ← opcional
Antes de testar: …
Onde testar: …
Passos:
1. …
Aprovado quando:
- …
Observação: …                        ← opcional
```

A tela do item mostra o critério numa seção própria, com os passos numerados e cada
linha de "Aprovado quando" como um ponto para marcar; as marcas ficam salvas, com quem
marcou. Ao reescrever o critério, mande o texto inteiro: o anterior fica no histórico do
item, e a marca de um ponto reescrito deixa de valer. A descrição continua com o
contexto (o que acontece, onde, o esperado).

**O id curto** (10/11/2026): cada item tem um número no escritório, uma sequência só
para todos os tipos, e o endereço curto vem do tipo e do número —
`/controle-interno/bug-123`, `/controle-interno/melhoria-45`. Os prefixos são `bug`,
`melhoria`, `funcionalidade`, `teste` e `migracao`.

- Todo item da resposta traz `number` (o número), `shortId` (`"bug-123"`) e `url`, que
  passa a ser o endereço curto. O `origin` ("Veio de") e as `recentDeliveries` também
  trazem o `shortId`.
- Toda ferramenta e toda rota com `{id}` aceitam o `shortId` no lugar do UUID; o
  `originItemId` também. O número é o que vale: se o tipo do item mudou, o prefixo
  antigo ainda acha o item, e a tela passa para o endereço de agora.
- A busca (`q`) com um id curto acha também o item desse número.
- O endereço antigo, com o UUID, continua abrindo e passa para o curto.

## 3. API REST

Base: `https://app.useconnect.com.br/api/v1/controle-interno`. Cabeçalho
`Authorization: Bearer $CONNECT_TOKEN` em toda chamada. Respostas em JSON, sem cache.

| Método e caminho | Escopo | Corpo |
|---|---|---|
| `GET /` | ler | filtros na URL: `status` (`OPEN` padrão, `ALL`, `PENDING`…), `type`, `priority` (0–3), `system`, `assignee` (`me`, `none` ou id), `q`, `overdue`, `page` |
| `GET /opcoes` | ler | — |
| `GET /resumo` | ler | na URL: `period` (`day`, `week` padrão, `month`, `year`) e `date` (AAAA-MM-DD; padrão hoje) |
| `GET /{id}` | ler | — (`{id}` é o UUID ou o id curto, como `bug-123`, aqui e nas rotas abaixo) |
| `POST /` | escrever | `title`, `type` obrigatórios; `description`, `acceptanceCriteria`, `priority`, `status`, `systemKey`, `systemMode`, `assigneeId`, `dueDate` (AAAA-MM-DD), `size` (P/M/G), `originItemId`, `prUrl`, `commitSha` |
| `PATCH /{id}` | escrever | os campos que mudam, mais `version` |
| `POST /{id}/situacao` | escrever | `{ "status": "IN_PROGRESS", "version": 3 }` |
| `POST /{id}/comentarios` | escrever | `{ "body": "texto" }` |
| `POST /{id}/anexos` | escrever | `multipart/form-data`, campo `arquivo` |

Atalhos: `"assigneeId": "me"` é a pessoa do token; `systemKey` sem `systemMode` é um
sistema do Ops Center; `originItemId` aceita o id curto da entrega. Campo com nome
errado é recusado (não é ignorado em silêncio).

`version`: mande a que veio no item lido. Se outra pessoa alterou o item no meio-tempo,
a resposta é `409 conflict` — leia de novo e refaça. Sem `version`, vale a versão
atual (a última escrita ganha).

Exemplos:

```bash
curl -s "https://app.useconnect.com.br/api/v1/controle-interno?type=BUG&assignee=me" \
  -H "Authorization: Bearer $CONNECT_TOKEN"

curl -s -X POST "https://app.useconnect.com.br/api/v1/controle-interno" \
  -H "Authorization: Bearer $CONNECT_TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"Busca de empresas não acha pelo CNPJ","type":"BUG","priority":2,"assigneeId":"me"}'

curl -s "https://app.useconnect.com.br/api/v1/controle-interno/bug-123" \
  -H "Authorization: Bearer $CONNECT_TOKEN"

curl -s -X POST "https://app.useconnect.com.br/api/v1/controle-interno/bug-123/anexos" \
  -H "Authorization: Bearer $CONNECT_TOKEN" -F "arquivo=@erro-na-tela.png"
```

### Erros

Sempre `{ "error": { "code": "…", "message": "…" } }`, com a mensagem em português.

| Código | Status | Quando |
|---|---|---|
| `unauthenticated` | 401 | sem o cabeçalho `Authorization: Bearer c41_…` |
| `invalid_token` | 401 | token desconhecido, ou a pessoa dona não está mais ativa |
| `expired_token` | 401 | token vencido |
| `revoked_token` | 401 | token revogado |
| `insufficient_scope` | 403 | o token não tem o escopo da ação |
| `office_unavailable` | 403 | escritório inativo ou assinatura somente leitura |
| `module_disabled` | 403 | Controle interno desligado no escritório |
| `forbidden` | 403 | a pessoa não pode a ação (ex.: tamanho só para quem coordena a Tech) |
| `not_found` | 404 | item inexistente ou de outro escritório |
| `conflict` | 409 | o item mudou depois da leitura (`version`) |
| `payload_too_large` | 413 | corpo acima do limite |
| `validation_error` | 422 | campo inválido ou desconhecido |
| `invalid_json` | 400 | corpo que não é JSON |
| `internal_error` | 500 | falha do Connect; tente de novo |

No MCP, o mesmo `{ error: { code, message } }` volta como resultado da ferramenta com
`isError: true`; a autenticação falha antes, com o status HTTP da tabela.

## Onde está no código

- Token: `prisma/schema.prisma` (`PersonalApiToken`), `src/lib/tokens-pessoais/`.
  Guarda só o SHA-256; o proxy (`src/proxy.ts`, `ehRotaDeTokenPessoal`) deixa as rotas
  passarem sem sessão e sem cabeçalho de identidade.
- Tradução API ↔ servidor: `src/lib/tech-interno/api.ts`.
- Rotas: `src/app/api/v1/controle-interno/`, `src/app/api/mcp/route.ts`,
  ferramentas em `src/lib/mcp/servidor.ts` (SDK oficial `@modelcontextprotocol/sdk`).
- Tela: `src/components/configuracoes/TokensDeAcesso.tsx`.
