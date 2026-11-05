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
| `ver_item` | ler | um item com comentários, histórico, anexos e a `version` |
| `ver_opcoes` | ler | tipos, situações, sistemas do Ops Center (`key`), pessoas (`id`), entregas recentes |
| `criar_item` | escrever | cria e devolve o item com o link |
| `atualizar_item` | escrever | altera só os campos enviados |
| `mudar_situacao` | escrever | Pendente → Em andamento → Em validação → Concluído / Cancelado |
| `comentar` | escrever | comentário no item |
| `anexar` | escrever | arquivo em base64, até 10 MB |

Exemplos de pedido: "registre um bug no Controle interno: a busca de empresas não acha
pelo CNPJ, prioridade alta, no sistema do Connect"; "mova para Em validação o item da
busca por CNPJ e comente o link do PR".

## 3. API REST

Base: `https://app.useconnect.com.br/api/v1/controle-interno`. Cabeçalho
`Authorization: Bearer $CONNECT_TOKEN` em toda chamada. Respostas em JSON, sem cache.

| Método e caminho | Escopo | Corpo |
|---|---|---|
| `GET /` | ler | filtros na URL: `status` (`OPEN` padrão, `ALL`, `PENDING`…), `type`, `priority` (0–3), `system`, `assignee` (`me`, `none` ou id), `q`, `overdue`, `page` |
| `GET /opcoes` | ler | — |
| `GET /{id}` | ler | — |
| `POST /` | escrever | `title`, `type` obrigatórios; `description`, `priority`, `status`, `systemKey`, `systemMode`, `assigneeId`, `dueDate` (AAAA-MM-DD), `size` (P/M/G), `originItemId` |
| `PATCH /{id}` | escrever | os campos que mudam, mais `version` |
| `POST /{id}/situacao` | escrever | `{ "status": "IN_PROGRESS", "version": 3 }` |
| `POST /{id}/comentarios` | escrever | `{ "body": "texto" }` |
| `POST /{id}/anexos` | escrever | `multipart/form-data`, campo `arquivo` |

Atalhos: `"assigneeId": "me"` é a pessoa do token; `systemKey` sem `systemMode` é um
sistema do Ops Center. Campo com nome errado é recusado (não é ignorado em silêncio).

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

curl -s -X POST "https://app.useconnect.com.br/api/v1/controle-interno/ID-DO-ITEM/anexos" \
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
