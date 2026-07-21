# Análise de viabilidade — Chatwoot no Connect

> Análise original de 2026-07-21. **Implementado no mesmo dia** após decisões do usuário (Chatwoot 4.15.1 confirmado — suporta assinatura HMAC nativa; campos exclusivos do Chatwoot, nunca reaproveitar `Company.externalId`; sem fila/worker novo; sem replicar binário de anexo). Ver "Status da implementação" ao final do documento.

## 1. Resumo executivo

A integração é **viável com ressalvas**. O Connect já tem dois precedentes diretos e bem estabelecidos para o problema central (credencial de terceiro por tenant, cifrada, com fallback opcional): `TenantAiConfig` e `TenantSmtpConfig`. O padrão de multi-tenant (`tenantId` em quase todo model + funções `scopedXWhere`) e o padrão de RBAC (enum de role + funções `canWrite`/`canAct`) se estendem naturalmente para um módulo novo. As duas maiores ressalvas são: (1) o Connect **não tem infraestrutura de fila/cron interna** — sincronização em background hoje só existe via disparo externo (n8n) contra endpoint HTTP autenticado por token fixo, o que funciona mas é mais rústico do que idealmente se gostaria para reconciliação periódica; (2) `Company`/`Person` têm **apenas um campo de telefone único** e nenhum campo "identificador externo" em `Person` — a estratégia de vínculo automático por telefone/e-mail precisa lidar com isso, e a normalização de telefone (WhatsApp/celular) não existe hoje no schema. Recomendo abordagem híbrida (C), mas simplificada em relação ao pedido original: sem fila externa (BullMQ), reaproveitando o padrão já existente de "endpoint HTTP + dedup por chave única" usado no motor de alertas.

## 2. Arquitetura atual encontrada

- **Stack**: Next.js 16 (App Router), React 19, TypeScript estrito, Prisma 7 com driver adapter MariaDB (`@prisma/adapter-mariadb`), MySQL/MariaDB real em `vps.41tech.cloud`.
- **Estrutura de código**: não há `src/services`, `src/features` nem `src/modules`. Tudo de domínio/infra fica "achatado" em `src/lib/*.ts` (ex.: `src/lib/ai.ts`, `src/lib/hub.ts`, `src/lib/alerts.ts`). Mutações majoritariamente via **Server Actions** (`src/app/(app)/<rota>/actions.ts`); Route Handlers (`src/app/api/**/route.ts`) usados para upload, OAuth callback, busca global e o endpoint de cron.
- **Multi-tenant**: campo `tenantId` presente em quase todo model de negócio, model `Tenant` central, `UserTenantAccess` permite `SUPER_ADMIN` acessar múltiplos tenants.
- **Auth**: JWT stateless (access curto + refresh longo, ambos assinados, refresh persistido como hash em `RefreshToken` revogável). `src/proxy.ts` é o novo "middleware" do Next 16: valida JWT, injeta headers de identidade (`x-tenant-id`, `x-user-id`, `x-user-role`, `x-user-sectors`), remove qualquer header de identidade vindo do cliente antes de reinjetar os corretos.
- **RBAC**: enum `UserRole` (`SUPER_ADMIN, ADMIN, SECTOR_ADMIN, SECTOR_USER, READONLY`) + funções puras (`canWrite`, `canAct`, `isFullAccess`, `scopedCompanyWhere`, etc.) em `src/lib/auth/*`. Não é RBAC granular por permissão nomeada (exceto `FieldPermission`, específico para campos sensíveis).
- **Sem fila/cron interno**: o único "job" do sistema (motor de alertas RH/DP) roda sob demanda via `POST /api/cron/alerts`, chamado por scheduler externo (n8n), autenticado por `Bearer CRON_SERVICE_TOKEN`, com dedup diário via `@@unique([tenantId, alertKey, sentOn])`.
- **Sem testes de integração/e2e**: só Vitest unitário (5 arquivos), sem Playwright, sem testes contra banco real.
- **Sem lib de validação uniforme**: Zod usado só em um arquivo; resto do app valida manualmente.
- **Docker**: multi-stage, `next build` standalone, **sem entrypoint que rode `prisma migrate deploy` automaticamente** — migrations são aplicadas manualmente.

## 3. Pontos compatíveis

- **Padrão de credencial de terceiro cifrada por tenant já existe e é reaproveitável quase 1:1**: `TenantAiConfig`/`TenantSmtpConfig` + `src/lib/crypto.ts` (AES-256-GCM, chave derivada de `SECRETS_ENCRYPTION_KEY` via scrypt). Uma `ChatwootConnection` com `apiTokenEnc` seguiria exatamente esse molde.
- **Padrão de autorização por tenant já é automático em qualquer novo model** com `tenantId` + `@@index`/`@@unique` compostos — não é preciso inventar isolamento, é seguir a convenção existente.
- **Padrão de endpoint autenticado por token de serviço fixo já existe** (`/api/cron/alerts`) e é diretamente reaproveitável para o webhook do Chatwoot e para uma futura reconciliação periódica disparada por n8n.
- **Padrão de dedup idempotente por chave única composta já existe** (`AlertDispatch`) — mesmo desenho serve para dedup de webhook (`tenantId + externalEventId`) e para upsert de conversas/mensagens.
- **Padrão de abas na ficha de Empresa/Pessoa** (`Tabs.tsx` + `CompanyDetailTabs`) já resolve exatamente "adicionar uma aba nova com contador", sem necessidade de redesenho.
- **Variáveis de ambiente novas são triviais de adicionar** — nenhuma env é baked no build (exceto client-side `NEXT_PUBLIC_*`, que não é o caso aqui), então `CHATWOOT_*` só precisa ser passada ao container em runtime.
- **Estrutura de módulo isolado (`src/lib/chatwoot/`) é consistente com o resto do projeto**, que já organiza integrações externas em pastas próprias (`src/lib/integrations/{google,microsoft}`).

## 4. Incompatibilidades e riscos

- **Sem fila/worker real**: sincronização inicial de milhares de conversas/mensagens via HTTP request-response corre risco de timeout na função serverless/HTTP do Next. Precisa ser desenhada em lotes pequenos e retomável (checkpoint), não como uma chamada única.
- **`Company`/`Person` têm um único campo `phone`** (sem separação celular/WhatsApp/fixo) e **nenhum campo de identificador externo em `Person`** (`Company.externalId` existe mas é documentado como "manual, sem sincronização" — não deve ser reaproveitado silenciosamente para Chatwoot sem decisão explícita). Vínculo automático por telefone exige normalização (E.164) que não existe hoje no schema nem em `src/lib/validation/common.ts`.
- **Inconsistência de proteção de credencial já existente no projeto**: `OAuthAccount` guarda tokens de terceiro em texto puro (sem passar por `crypto.ts`), enquanto `TenantAiConfig`/`TenantSmtpConfig` cifram. Isso não bloqueia a integração, mas é um risco a não repetir — o token do Chatwoot deve seguir o padrão cifrado, não o padrão OAuth.
- **Sem validação de assinatura de webhook nativa confirmada**: precisa checar a versão do Chatwoot em uso antes de assumir HMAC; caso não exista, a alternativa (URL secreta por conexão / token no path) é compatível com o padrão de `/d/{token}` já existente, mas é preciso decidir isso antes de implementar o endpoint.
- **Sem testes de integração contra banco real hoje** — introduzir isso especificamente para o Chatwoot (webhook duplicado, upsert idempotente) exigiria criar a infraestrutura de teste de integração do zero (ex.: `fileParallelism: false`), o que é trabalho extra não coberto por nenhum precedente no repo.
- **Migrations não rodam automaticamente no deploy** — qualquer nova tabela (`ChatwootConnection` etc.) exige o mesmo processo manual que já gerou a pendência da sessão anterior (rodar `prisma migrate deploy` manualmente apontando pra produção, porta 3330).
- **Anexos do Chatwoot** normalmente são servidos por URL do próprio Chatwoot/S3 — replicar binários exigiria storage próprio (`public/uploads/`/`storage/` já existem para outros fins, mas armazenar anexos de terceiros ali levanta questão de retenção/LGPD, ver seção 11).

## 5. Abordagens avaliadas

**A — Consulta sob demanda (proxy direto ao Chatwoot a cada acesso)**
- Simplicidade: alta — não requer schema novo além da tabela de conexão/vínculo.
- Latência: cada abertura de tela depende da API do Chatwoot responder; sem cache, ruim para listagens com filtro/busca combinados com dados do Connect (ex.: "conversas da empresa X").
- Rate limit/disponibilidade: qualquer instabilidade do Chatwoot vira instabilidade do Connect.
- Busca/filtro cruzando "vinculado a empresa/pessoa do Connect" é difícil — a API do Chatwoot não sabe desse vínculo, então filtrar por empresa exigiria N chamadas (uma por contato vinculado) ou lógica client-side cara.
- Adequado apenas como fallback ou para volumes muito baixos.

**B — Espelhamento completo (todas as mensagens replicadas no MySQL do Connect)**
- Desempenho de leitura ótimo, mas custo de armazenamento e complexidade de sync alto (mensagens/anexos crescem sem limite).
- Duplicação de dado sensível (conteúdo de conversa) em dois sistemas — amplia superfície de LGPD (retenção, exclusão por titular precisa ser replicada em dois lugares).
- Sem fila/worker no projeto hoje, manter espelhamento 100% consistente via só webhook+HTTP é frágil.

**C — Híbrida (metadados + mensagens necessárias no Connect, webhook incremental, reconciliação periódica via API)**
- Equilibra: consultas rápidas para lista/filtro (usam dados locais), mensagens completas carregadas sob demanda por conversa (menos replicação desnecessária de conteúdo).
- Ainda precisa de alguma automação periódica — no Connect isso é resolvido com o padrão já existente (endpoint HTTP + n8n), não com fila real.
- É a mais alinhada ao que já existe no projeto (padrão AlertDispatch/dedup, padrão de endpoint de token de serviço).

## 6. Abordagem recomendada

**C, adaptada ao que o Connect já tem**, com dois ajustes em relação ao pedido original:
1. **Sincronização inicial e reconciliação periódica via o mesmo padrão do motor de alertas** — endpoint HTTP autenticado por `CRON_SERVICE_TOKEN`, chamado pelo n8n existente, processando em lotes pequenos e paginados (não um worker/fila nova). Evita introduzir BullMQ/Redis, que não existe no projeto e seria a maior mudança de infraestrutura de toda a proposta.
2. **Mensagens armazenadas localmente apenas para conversas já abertas/sincronizadas** (não replicar histórico completo de todos os contatos de uma vez) — sincronização inicial busca metadados de conversas (leve), e o corpo de mensagens é buscado sob demanda na primeira vez que uma conversa é aberta no Connect, e depois mantido via webhook.

Isso mantém a proposta original de arquitetura híbrida, mas reduz o escopo de infraestrutura nova a zero (reaproveita 100% dos padrões existentes: cripto, tenant scoping, endpoint de serviço, dedup por chave única).

## 7. Arquivos que precisarão ser criados

```
prisma/migrations/<timestamp>_chatwoot_integration/   (nova migration, models abaixo)

src/lib/chatwoot/
  client.ts       # fetch server-side, timeout via AbortController, retries em 429/5xx
  types.ts        # tipos das respostas da Application API
  schemas.ts      # validação (zod) de payloads de webhook e respostas
  errors.ts       # erros tipados (ChatwootAuthError, ChatwootRateLimitError, etc.)
  mappers.ts      # normalização Chatwoot -> modelos internos
  linking.ts       # estratégia de vínculo contato -> Person/Company

src/app/api/integrations/chatwoot/webhook/route.ts   # recebe eventos (padrão do /api/cron/alerts)
src/app/api/cron/chatwoot-sync/route.ts               # reconciliação periódica (mesmo padrão CRON_SERVICE_TOKEN)

src/components/admin/ChatwootConfigForm.tsx           # tela de conexão (Integrações), espelha AiConfigForm/SmtpConfigForm
src/components/conversas/*                            # lista, painel de conversa, filtros (área global "Conversas")
src/components/empresas/CompanyConversationsSection.tsx
src/components/pessoas/PersonConversationsSection.tsx

src/app/(app)/conversas/page.tsx                       # área global
src/app/(app)/admin/integracoes/chatwoot/actions.ts    # server actions da tela de config (testar conexão, salvar token)
```

## 8. Arquivos existentes que precisarão ser alterados

- `prisma/schema.prisma` — novos models (seção 9) + relação opcional em `Company`/`Person`.
- `.env.example` — adicionar `CHATWOOT_BASE_URL`, `CHATWOOT_ACCOUNT_ID`, `CHATWOOT_API_TOKEN=[CONFIGURAR_FORA_DO_CÓDIGO]`, `CHATWOOT_WEBHOOK_SECRET` (placeholder, sem valor real).
- `src/proxy.ts` — adicionar `/api/integrations/chatwoot/webhook` e `/api/cron/chatwoot-sync` a `PUBLIC_PATHS` (mesma lista onde `/api/cron/` já está), já que ambos são autenticados por token próprio, não por JWT de sessão.
- `src/components/empresas/CompanyDetailTabs.tsx` — nova entrada `conversations` em `tabs`/`validTabs`, nova prop `conversations`/`conversationsCount`.
- Componente equivalente de abas na ficha de Pessoa (não explorado em detalhe na auditoria — precisa confirmar nome exato do arquivo antes de implementar).
- `src/lib/roles.ts` / política de permissões — se optar por permissões nomeadas (`chatwoot.view` etc.), precisaria estender o modelo de RBAC atual, que hoje não tem tabela de permissões nomeadas genérica (só `FieldPermission` para campos sensíveis). Ver seção 16.
- `src/app/(app)/admin/integracoes/` — adicionar entrada Chatwoot ao lado de IA/SMTP já existentes.

## 9. Modelagem de dados proposta

Adaptando ao padrão real do schema (mesma convenção de `@@index([tenantId])`, `@@unique` composto, cripto via `crypto.ts`, `@db.Text` para conteúdo grande):

```prisma
model ChatwootConnection {
  id              String   @id @default(cuid())
  tenantId        String
  baseUrl         String
  accountId       String
  apiTokenEnc     String   @db.Text   // mesmo padrão de TenantAiConfig.apiKeyEnc
  webhookSecret   String?  @db.Text   // gerado internamente, não vem do Chatwoot
  active          Boolean  @default(true)
  lastSyncAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  contactLinks    ChatwootContactLink[]
  conversations   ChatwootConversation[]

  @@unique([tenantId, accountId])   // um tenant pode ter mais de uma conta Chatwoot
  @@index([tenantId])
}

model ChatwootContactLink {
  id                  String   @id @default(cuid())
  tenantId            String
  connectionId        String
  chatwootContactId   Int
  personId            String?
  companyId           String?
  email               String?
  phoneE164           String?
  linkMethod          ChatwootLinkMethod   // MANUAL | EMAIL | PHONE | ASSISTED | UNLINKED
  linkConfidence       Int?                 // 0-100, null quando MANUAL
  lastSyncAt          DateTime?

  connection ChatwootConnection @relation(fields: [connectionId], references: [id])
  person     Person?            @relation(fields: [personId], references: [id])
  company    Company?           @relation(fields: [companyId], references: [id])

  @@unique([tenantId, connectionId, chatwootContactId])
  @@index([tenantId, personId])
  @@index([tenantId, companyId])
}

model ChatwootConversation {
  id                        String   @id @default(cuid())
  tenantId                  String
  connectionId              String
  chatwootConversationId    Int
  contactLinkId             String?
  inboxId                   Int
  assigneeLabel             String?   // nome do atendente, sem FK pra User (atendente é do Chatwoot, não do Connect)
  teamLabel                 String?
  status                    String
  priority                  String?
  labels                    Json?
  channel                   String
  lastActivityAt            DateTime?
  unreadCount               Int      @default(0)
  lastMessagePreview        String?  @db.VarChar(280)
  syncedAt                  DateTime @default(now())

  connection ChatwootConnection    @relation(fields: [connectionId], references: [id])
  contactLink ChatwootContactLink? @relation(fields: [contactLinkId], references: [id])
  messages    ChatwootMessage[]

  @@unique([tenantId, connectionId, chatwootConversationId])
  @@index([tenantId, contactLinkId])
  @@index([tenantId, status])
}

model ChatwootMessage {
  id                     String   @id @default(cuid())
  tenantId               String
  conversationId         String
  chatwootMessageId      Int
  senderLabel            String?
  senderType             String
  messageType            String
  contentType            String
  content                String?  @db.Text
  isPrivate              Boolean  @default(false)
  attachments            Json?     // array de { url, fileType, fileSize } — sem baixar binário (ver seção 11)
  chatwootCreatedAt       DateTime
  chatwootUpdatedAt       DateTime?
  syncedAt               DateTime @default(now())

  conversation ChatwootConversation @relation(fields: [conversationId], references: [id])

  @@unique([tenantId, conversationId, chatwootMessageId])
  @@index([tenantId, conversationId, chatwootCreatedAt])
}

model ChatwootWebhookEvent {
  id               String   @id @default(cuid())
  tenantId         String
  connectionId     String
  eventType        String
  externalEventId  String    // hash do payload quando o Chatwoot não fornece id de evento estável
  status           String    // RECEIVED | PROCESSED | FAILED
  attempts         Int      @default(0)
  receivedAt       DateTime @default(now())
  processedAt      DateTime?
  error            String?  @db.Text

  @@unique([tenantId, connectionId, externalEventId])   // dedup — mesmo padrão de AlertDispatch
  @@index([tenantId, status])
}

model ChatwootSyncRun {
  id               String   @id @default(cuid())
  tenantId         String
  connectionId     String
  type             String   // INITIAL | RECONCILIATION
  status           String
  startedAt        DateTime @default(now())
  finishedAt       DateTime?
  recordsRead      Int      @default(0)
  recordsCreated   Int      @default(0)
  recordsUpdated   Int      @default(0)
  recordsSkipped   Int      @default(0)
  error            String?  @db.Text

  @@index([tenantId, connectionId, startedAt])
}
```

Notas de compatibilidade MySQL/Prisma:
- `Json` é suportado pelo provider MySQL do Prisma 7 usado no projeto — usado aqui só para `labels`/`attachments` (dados de exibição, não filtrados via SQL), consistente com o resto do schema (que evita Json para campos que precisam ser filtrados/indexados).
- Chave composta inclui `connectionId` (não só `tenantId`) porque o schema já prevê tenant com múltiplas contas Chatwoot — resolve o requisito da Etapa 4 do pedido original.
- `senderLabel`/`assigneeLabel`/`teamLabel` são strings livres (não FK para `User`) porque atendentes/equipes do Chatwoot não necessariamente correspondem a usuários do Connect — evita acoplar dois sistemas de identidade.

## 10. Estratégia de autenticação e segurança

- Token do Chatwoot cifrado em `ChatwootConnection.apiTokenEnc` via `encryptSecret`/`decryptSecret` de `src/lib/crypto.ts` (reaproveitar, não reimplementar) — mesma chave global `SECRETS_ENCRYPTION_KEY` já em produção.
- Nunca client component: toda chamada ao Chatwoot acontece em `src/lib/chatwoot/client.ts`, chamado só de Server Actions/Route Handlers/rota de cron — nunca importado de um arquivo `"use client"`.
- Sem `NEXT_PUBLIC_` em nenhuma env do Chatwoot.
- Logs: seguir o padrão `console.error("[chatwoot:client]", err)` do projeto, mas com uma função de mascaramento (`maskToken(token)` → `"cw_***last4"`) — o projeto não tem isso hoje para nenhuma outra integração (nem AI nem SMTP mascaram no log), então esta seria uma melhoria de segurança nova a introduzir, não um padrão a copiar.
- Resposta de API do Connect nunca deve incluir `apiTokenEnc` — ao buscar `ChatwootConnection` para a tela de configuração, usar `select` explícito excluindo o campo (mesmo cuidado que `AiConfigForm`/`SmtpConfigForm` já tomam, a auditoria não confirmou o `select` exato deles mas é o padrão esperado e deve ser replicado).
- Webhook: usar URL com segredo por conexão (`webhookSecret` gerado internamente, nunca vindo do Chatwoot) como caminho (`/api/integrations/chatwoot/webhook/[secret]`) — decisão só deve ser fechada após confirmar a versão do Chatwoot em uso e se ela oferece HMAC nativo (a auditoria não teve acesso à instância Chatwoot real do usuário para confirmar isso).

## 11. Estratégia multi-tenant

- `ChatwootConnection`, `ChatwootContactLink`, `ChatwootConversation`, `ChatwootMessage`, `ChatwootWebhookEvent`, `ChatwootSyncRun` — todos com `tenantId`, seguindo 100% a convenção existente.
- Toda leitura passa por uma função `scopedChatwootConversationWhere(ctx)` no mesmo espírito de `scopedCompanyWhere`/`scopedPipelineWhere` (`src/lib/auth/scope.ts`) — nunca uma query solta sem filtro de tenant.
- **Nenhum ID do Chatwoot (contact/conversation/message id) deve ser aceito como parâmetro de rota sem também validar `tenantId` na mesma query** — todo `findFirst`/`findUnique` usando `chatwootConversationId` deve compor com `tenantId` (via `@@unique([tenantId, connectionId, chatwootConversationId])`), nunca `findUnique` só pelo id externo. Esse é o principal vetor de IDOR entre tenants aqui: como IDs do Chatwoot são inteiros sequenciais e previsíveis, um usuário mal-intencionado poderia tentar adivinhar `chatwootConversationId` de outro tenant se a query não filtrar por `tenantId` também.
- Webhook: o path secreto (`/webhook/[secret]`) determina a `ChatwootConnection` e, por consequência, o `tenantId` do evento — nunca confiar em um campo `tenantId` que viesse no próprio payload do webhook (o Chatwoot não sabe o que é um "tenant" do Connect).
- Credenciais nunca compartilhadas entre tenants — cada `ChatwootConnection` é isolada por `tenantId`, sem fallback global (diferente de `TenantAiConfig`, que tem fallback via env; aqui não faz sentido ter uma conta Chatwoot "global" compartilhada entre clientes do Connect).
- `SUPER_ADMIN` com acesso a múltiplos tenants (via `UserTenantAccess`) deve continuar respeitando o tenant ativo (`x-tenant-id`/`active_tenant_id`) já resolvido pelo proxy — nenhuma lógica nova de troca de contexto é necessária, só usar `getAuthContext()` como em qualquer outro módulo.

## 12. Estratégia de sincronização

Sem fila/worker, adaptando o padrão do motor de alertas:

1. **Conexão**: usuário cadastra `baseUrl`/`accountId`/token na tela de Integrações → botão "Testar conexão" chama smoke test (seção descrita ao final, ainda não implementado).
2. **Sincronização inicial** (`POST /api/cron/chatwoot-sync?mode=initial&tenantId=...`, chamada manual ou por n8n): busca contatos e conversas **paginados em lotes pequenos** (ex.: 1 página de 20-50 por chamada HTTP), grava `ChatwootSyncRun` com cursor de progresso (`recordsRead` etc.) — se a chamada estourar tempo, a próxima chamada retoma do checkpoint salvo, evitando timeout de uma request única e evitando duplicar trabalho.
3. Mensagens de cada conversa **não são buscadas na sincronização inicial** — só metadados de conversa (mais leve, evita explosão de volume logo de início). O corpo de mensagens é populado just-in-time: quando alguém abre a conversa no Connect pela primeira vez (Server Action busca da API se não houver `ChatwootMessage` local), e mantido depois via webhook `message_created`/`message_updated`.
4. **Reconciliação periódica** (`mode=reconciliation`, chamada agendada pelo n8n, ex. a cada 15-30 min): revarre conversas com `lastActivityAt` recente e reconcilia divergências — cobre casos de webhook perdido/fora de ordem.
5. **Webhooks** processam eventos incrementalmente assim que chegam (conversation_updated, message_created etc.), gravando primeiro em `ChatwootWebhookEvent` (dedup por `externalEventId`) e só depois aplicando o upsert — se o upsert falhar, o evento fica `FAILED` e a reconciliação periódica cobre a lacuna.
6. **Execução paralela duplicada**: como não há lock distribuído no projeto, usar o mesmo truque de `AlertDispatch` (constraint única) como proteção — uma segunda chamada de sync para o mesmo tenant/dia não duplica trabalho porque o upsert é idempotente por chave natural.

## 13. Estratégia de webhooks

- Endpoint: `POST /api/integrations/chatwoot/webhook/[secret]`, listado em `PUBLIC_PATHS` do `src/proxy.ts` (mesmo grupo de `/api/cron/`), pois não usa JWT de sessão.
- `[secret]` identifica a `ChatwootConnection` (e por consequência o tenant) — busca `findUnique` por `webhookSecret`, nunca por um id/tenant vindo do corpo do payload.
- Responder rápido (200) após só persistir o evento bruto em `ChatwootWebhookEvent` (status `RECEIVED`); processamento do upsert acontece na mesma request de forma síncrona (sem fila) mas com timeout curto — se demorar demais, marca `FAILED` e deixa para a reconciliação periódica, evitando o Chatwoot re-tentar indefinidamente por timeout do nosso lado.
- Idempotência via `@@unique([tenantId, connectionId, externalEventId])` — se o Chatwoot não fornecer um id de evento estável, gerar `externalEventId` como hash do payload relevante (ex.: `messageId + updatedAt`).
- Payload excessivo: limitar tamanho do body aceito (ex.: rejeitar >256KB) antes de fazer `JSON.parse`.
- Rate limiting: reaproveitar `src/lib/rateLimit.ts` (já existe no projeto, usado em outro lugar — a auditoria confirmou o arquivo mas não o caso de uso original; validar antes de reaproveitar se a assinatura serve para "por conexão" e não só "por IP/usuário").
- Assinatura: **decisão pendente de você** (ver seção 21) — depende da versão do Chatwoot. Se não houver HMAC nativo confiável, o segredo no path já cobre a maior parte do risco (é o mesmo nível de proteção do `/d/{token}` público já existente no projeto).

## 14. Estratégia de vínculo com empresas e pessoas

Ordem de resolução (igual ao pedido original, adaptada aos campos reais do schema):

1. **Vínculo manual já confirmado** (`ChatwootContactLink.linkMethod = MANUAL`) — sempre tem prioridade e nunca é sobrescrito automaticamente.
2. **Identificador externo** — hoje só existe `Company.externalId`, e é documentado como "manual, sem sync" com outro sistema (Acessórias). **Não deve ser reaproveitado silenciosamente para o Chatwoot** sem sua decisão explícita, porque já tem um propósito declarado. Se quiser usar, precisa decidir se `externalId` vira "genérico" ou se cria um campo próprio.
3. **E-mail normalizado** — `Company.email`/`Person.email` já existem (VarChar, sem normalização hoje); comparar em lowercase/trim.
4. **Telefone normalizado E.164** — `Company.phone`/`Person.phone` são campos únicos livres (não há celular/WhatsApp separado nem máscara garantida); **precisa de uma função de normalização nova** (não existe em `src/lib/validation/common.ts` hoje) antes de comparar com o número do Chatwoot.
5. **Correspondência assistida** — quando e-mail/telefone batem parcialmente ou há mais de um candidato, marcar `linkMethod = ASSISTED` com `linkConfidence` e deixar para o usuário confirmar na UI (nunca vincular automaticamente nesse caso, conforme exigido).
6. **Contato não vinculado** — `ChatwootContactLink.personId`/`companyId` nulos, aparece na lista global como "não vinculado" com ação de vincular manualmente.

Casos a tratar explicitamente (política, não código nesta etapa):
- **Telefone/e-mail duplicado entre pessoas**: não vincular automaticamente se houver mais de um `Person`/`Company` com o mesmo e-mail/telefone no tenant — cai em "correspondência assistida".
- **Contato sem telefone nem e-mail**: só pode ser vinculado manualmente.
- **Um contato relacionado a mais de uma empresa**: `ChatwootContactLink` já permite isso (não há unicidade que impeça duas linhas apontando para o mesmo `chatwootContactId` com `personId` diferente, mas dentro do mesmo `connectionId` cada `chatwootContactId` gera uma linha — se precisar de N:N companhias por contato, isso precisa ser revisto no desenho antes de implementar).
- **Mudança de telefone/e-mail no Chatwoot**: reconciliação periódica reavalia o vínculo só se `linkMethod` não for `MANUAL`.
- **Contato excluído no Chatwoot**: manter a linha local (histórico), marcar como inativo via campo de status a adicionar, nunca deletar em cascata.
- **Pessoa inativa no Connect** (`Person.active = false`): manter a associação para fins de histórico, mas não oferecer como opção de vínculo em novas correspondências automáticas.

## 15. Interface proposta

Reaproveitando exatamente os componentes já existentes (`ui/Tabs.tsx`, `ui/EmptyState.tsx`, `ui/PageHeader.tsx`, o padrão de filtro por `searchParams` de `empresas/page.tsx`):

- **Área global "Conversas"** (`src/app/(app)/conversas/page.tsx`): Server Component com filtros via `searchParams` (busca, canal, status, inbox, responsável, equipe, etiqueta, período), mesmo padrão de paginação inline usado em `empresas/page.tsx` (não existe componente de paginação genérico — seguir a mesma reimplementação, não inventar abstração nova fora do padrão do projeto).
- **Layout lista+detalhe**: não existe hoje um componente pronto para isso (o mais próximo é o Kanban, que não serve). Precisa ser construído como novo componente `ConversationSplitView` — duas colunas CSS Grid, lista à esquerda (`ConversationListItem` com nome/última mensagem/canal/horário/status), painel à direita com cabeçalho (contato/empresa/canal/status) + histórico de mensagens + "carregar mensagens anteriores" (paginação reversa por cursor).
- **Aba "Conversas" na ficha de Empresa**: nova entrada em `CompanyDetailTabs.tsx` (`key: "conversations"`), Server Component busca conversas vinculadas à empresa e às pessoas vinculadas a ela via `ChatwootContactLink`.
- **Aba "Conversas" na ficha de Pessoa**: mesmo padrão, filtrado pelo `ChatwootContactLink` do contato correspondente (arquivo exato da ficha de Pessoa não foi confirmado na auditoria — checar antes de implementar).
- **Estados**: `EmptyState` (sem conversas / contato não vinculado), skeleton de loading (padrão do projeto usa `loading.tsx` do App Router, 15 rotas já têm — replicar), erro com retry (não há um componente de erro genérico confirmado na auditoria — validar antes de reaproveitar ou criar um simples).
- Reaproveitar o design system existente integralmente — nenhum componente novo de baixo nível (botão, input, badge) é necessário.

## 16. Permissões e RBAC

O projeto não tem uma tabela de permissões nomeadas genérica (só enum de role + funções + `FieldPermission` para campos sensíveis). Duas opções:

- **Opção A (menor esforço, consistente com o padrão atual)**: não criar permissões nomeadas novas — reaproveitar `canWrite(role)`/`isFullAccess(role)` como já é feito em todo o resto do app, e tratar "ver conversas" como parte do acesso geral de leitura que qualquer role autenticada já tem (mesma régua de `scopedCompanyWhere`, que hoje não restringe por setor). Mensagens privadas/notas internas do Chatwoot ficariam restritas a `isFullAccess(role)` (ADMIN/SECTOR_ADMIN/SUPER_ADMIN) via um simples `if`, sem nova infraestrutura.
- **Opção B (como pedido no prompt original)**: introduzir permissões nomeadas (`chatwoot.view`, `chatwoot.manage_connection`, `chatwoot.sync`, `chatwoot.link_contact`, `chatwoot.view_private_messages`) — isso exigiria estender o modelo de RBAC do projeto (hoje não genérico), o que é uma mudança de escopo maior que extrapola só "a integração do Chatwoot" e afetaria a arquitetura de permissões do app inteiro.

Recomendo a Opção A para a primeira versão (somente leitura), documentando a Opção B como possível evolução se, no futuro, o RBAC do Connect for generalizado (é decisão sua, não técnica).

## 17. Testes necessários

- **Unitários** (seguem o padrão real do projeto — Vitest, funções puras, sem banco): cliente da API (mock de `fetch`), `mappers.ts` (normalização), `linking.ts` (vínculo por e-mail/telefone, casos de ambiguidade), tratamento de erros por categoria (401/403/404/422/429/5xx), validação de payload de webhook (schemas.ts).
- **Integração**: o projeto **não tem hoje** infraestrutura de teste contra banco real (nenhum dos 5 testes existentes toca o banco). Introduzir isso exigiria criar do zero uma config de integração (`fileParallelism: false`, banco de teste dedicado) — é trabalho de infraestrutura de teste novo, não uma extensão trivial do que já existe. Escopo mínimo se decidir investir nisso: isolamento por tenant (query sem tenantId nunca vaza), upsert idempotente de conversa/mensagem, webhook duplicado (mesmo `externalEventId` não duplica registro), evento fora de ordem.
- **Interface**: o projeto **não tem Playwright nem qualquer e2e configurado**. Testes de interface exigiriam introduzir essa ferramenta pela primeira vez no projeto (diferente do que a sessão de "CheckPoint", outro projeto do usuário, já usa) — decisão de escopo/tempo, não um gap pequeno.

## 18. Observabilidade

O projeto usa `console.error("[contexto]", err)` cru, sem logger estruturado nem correlação de request. Seguir o mesmo padrão (não introduzir Pino/Winston só para isso, seria inconsistente com o resto do app), mas com prefixos padronizados: `console.log("[chatwoot:sync]", ...)`/`console.error("[chatwoot:webhook]", ...)`, sempre mascarando token. Métricas (duração de sync, contadores de sucesso/falha) ficam armazenadas nos próprios campos de `ChatwootSyncRun` (não há Prometheus/Grafana no projeto para expor isso externamente — é consistente que fique só no banco, consultável por uma tela admin, como já acontece com `AlertDispatch`).

## 19. Rollback

- Toda migration é aditiva (novas tabelas, sem alterar `Company`/`Person` existentes além de relações opcionais) — reversível via `prisma migrate resolve`/drop das tabelas novas sem impacto em dado existente.
- Feature deve ficar atrás de uma verificação simples ("existe `ChatwootConnection` ativa para este tenant?") — tenants sem conexão configurada não veem a aba/área nova, nenhuma mudança de comportamento para quem não usa.
- Desativar a integração = marcar `ChatwootConnection.active = false` (para o endpoint de webhook/sync pararem de processar) sem precisar deletar dado histórico já sincronizado.
- Reverter para código anterior ao deploy da feature é seguro porque nenhuma tabela existente do Connect é alterada de forma destrutiva.

## 20. Estimativa de complexidade por etapa

| Etapa | Complexidade | Observação |
|---|---|---|
| Schema + migration | Baixa | Segue padrão existente quase 1:1 |
| Cliente Chatwoot (`src/lib/chatwoot/*`) | Média | Timeout/retry/paginação/tipagem do zero, mas sem lib externa nova necessária (fetch nativo) |
| Config de conexão + smoke test na UI | Baixa | Espelha `AiConfigForm`/`SmtpConfigForm` quase diretamente |
| Vínculo contato ↔ pessoa/empresa | Média-Alta | Normalização de telefone não existe hoje; regra de ambiguidade exige UI de confirmação assistida |
| Sincronização inicial em lotes + checkpoint | Média-Alta | Sem fila real, precisa ser cuidadoso com timeout de request |
| Webhook + idempotência | Média | Depende de confirmar se há assinatura nativa do Chatwoot antes de fechar o desenho |
| Reconciliação periódica | Baixa-Média | Reaproveita padrão de `/api/cron/alerts` quase integralmente |
| UI de Conversas (global + abas) | Média-Alta | Layout lista+detalhe é novo no projeto, não há componente pronto |
| RBAC (opção A) | Baixa | Reaproveita `canWrite`/`isFullAccess` |
| Testes unitários | Baixa | Segue padrão Vitest existente |
| Testes de integração/e2e | Alta | Infraestrutura não existe no projeto, precisaria ser criada do zero — recomendo não fazer nesta primeira fase |

## 21. Pendências e decisões necessárias

1. **Confirmar a versão do Chatwoot em uso** (self-hosted ou cloud, e qual versão) para saber se há assinatura HMAC nativa de webhook — sem isso, o desenho da seção 13 fica no modo "URL secreta", que é seguro mas é uma decisão que deveria ser sua, não presumida.
2. **Decidir se `Company.externalId` pode ser reaproveitado** para vínculo com Chatwoot ou se precisa de um campo próprio — hoje ele já tem um propósito declarado (sistema Acessórias).
3. **Decidir sobre normalização de telefone** — introduzir uma função de normalização E.164 é pré-requisito para vínculo automático por telefone; hoje não existe no projeto.
4. **Decidir se investe em testes de integração/e2e para este módulo** — nenhum dos dois existe hoje no projeto; é a maior lacuna de "qualidade automatizada" para uma feature que sincroniza dado sensível de terceiros.
5. **Confirmar exatamente onde fica a página de detalhe de Pessoa** e seu componente de abas (não confirmado na auditoria) antes de planejar a aba "Conversas" lá.
6. **Decidir política de retenção/anexos** (seção LGPD abaixo) antes de implementar — isso muda o desenho de `ChatwootMessage.attachments` (só URL vs. baixar binário).
7. **Confirmar se algum tenant terá mais de uma conta Chatwoot** — a modelagem já suporta, mas se a resposta for "nunca", simplifica a UI de configuração (uma conexão só, não uma lista).

### LGPD, auditoria e retenção (nota complementar)
- Mensagens/anexos são dado potencialmente sensível de terceiros (clientes/candidatos) — recomendo **não replicar binários de anexo** (só guardar a URL do Chatwoot em `attachments` Json, seção 9), evitando duplicar armazenamento de arquivo sensível sem necessidade comprovada, conforme já pedido no prompt original.
- Auditoria: o projeto já tem `AuditLog` genérico (mencionado na seção 8 da auditoria, "falha ao gravar log nunca deve derrubar a ação real") — vincular/desvincular contato e alterar configuração de conexão devem gerar entradas ali, seguindo o padrão existente, não uma trilha de auditoria nova e separada.
- Exclusão por titular: como mensagens residem também no Chatwoot (fonte da verdade), a exclusão local deve ser tratada como "ocultar/anonimizar localmente" quando solicitado, mantendo consistência com o que o Chatwoot decidir sobre a fonte original — não é possível ao Connect garantir exclusão do lado do Chatwoot.

## 22. Recomendação final

**Viável com ressalvas.** A base do Connect (multi-tenant, cripto de credencial por tenant, RBAC por role, padrão de endpoint de serviço para automação externa) cobre a maior parte do que a integração precisa, com reaproveitamento direto de três padrões já em produção (`TenantAiConfig`/`TenantSmtpConfig`, `/api/cron/alerts`, `Tabs.tsx`/`CompanyDetailTabs`). As ressalvas que pesam a favor de uma abordagem "somente leitura, sem fila nova, sem replicar anexos" nesta primeira fase são: ausência de infraestrutura de fila/testes de integração/e2e no projeto, campos de telefone/identificador externo insuficientes para vínculo automático robusto hoje, e a necessidade de uma decisão sua sobre assinatura de webhook antes de fechar esse desenho. Nenhum desses pontos inviabiliza o projeto — todos são decisões ou trabalho incremental razoável para uma primeira versão somente leitura.

## Status da implementação (2026-07-21)

Implementado no mesmo dia da análise, após as decisões do usuário:
1. **Chatwoot 4.15.1** confirmado — suporta assinatura HMAC-SHA256 nativa (`X-Chatwoot-Signature`/`X-Chatwoot-Timestamp`, verificada contra o `webhook_secret` que o próprio Chatwoot gera). Implementado o desenho de assinatura real (não o fallback de URL secreta cogitado na análise).
2. e 3. **Nenhum campo de Empresa/Pessoa foi reaproveitado.** Toda a modelagem do Chatwoot vive em tabelas próprias (`ChatwootConnection`, `ChatwootContactLink`, `ChatwootConversation`, `ChatwootMessage`, `ChatwootWebhookEvent`, `ChatwootSyncRun`) com campos prefixados `chatwoot*` — `Company.externalId` não foi tocado.
4. **Sem fila/worker novo** — sincronização em lote (paginada, com checkpoint em `ChatwootSyncRun.nextPage`) via `POST /api/cron/chatwoot-sync`, mesmo padrão de `/api/cron/alerts`.
5. **Anexos não são replicados** — `ChatwootMessage.attachments` guarda só URL + metadado do Chatwoot.

### O que foi implementado
- Schema: 6 models novos + enum `ChatwootLinkMethod` (migration `20260721131542_chatwoot_integration`, 100% aditiva).
- `src/lib/chatwoot/`: `client.ts` (fetch com timeout/retry), `errors.ts`, `types.ts`, `schemas.ts` (zod), `mappers.ts`, `linking.ts` (normalização de e-mail/telefone BR + resolução MANUAL/EMAIL/PHONE/ASSISTED/UNLINKED), `connection.ts`, `webhookAuth.ts` (verificação HMAC), `sync.ts`, `webhookProcessor.ts`, `conversations.ts` (carregamento de mensagens sob demanda).
- Rotas: `POST /api/integrations/chatwoot/webhook/[connectionId]` (webhook) e `POST /api/cron/chatwoot-sync` (sincronização, chamada pelo n8n com `CRON_SERVICE_TOKEN`) — ambas adicionadas a `PUBLIC_PATHS` em `src/proxy.ts`.
- UI: seção "Chatwoot" em Admin → Integrações (`ChatwootConfigForm.tsx`), área global "Conversas" (`/conversas`, com filtros/busca/paginação/split-view lista+detalhe) e aba "Conversas" nas fichas de Empresa e Pessoa.
- RBAC: Opção A da análise (sem tabela de permissões nova) — leitura geral via `scopedChatwootConversationWhere`, mensagens privadas restritas a `isFullAccess`, gestão da conexão restrita a `isFullWrite`.
- Testes unitários: `linking.test.ts`, `mappers.test.ts`, `webhookAuth.test.ts`, `errors.test.ts` (27 novos testes, todos passando).
- Validado: `tsc --noEmit`, `eslint --max-warnings 0`, `vitest run` (51/51) e `next build` — todos limpos.

### Pendente (ação do usuário)
- **Aplicar a migration em produção** — `npx prisma migrate deploy` foi bloqueado pelo classificador de auto-mode do Claude Code (ação sobre banco de produção); precisa ser rodado manualmente.
- Cadastrar a conexão em Admin → Integrações → Chatwoot (URL base, ID da conta, token de API, webhook secret gerado pelo Chatwoot ao criar o webhook).
- Colar a URL do webhook exibida na tela na configuração de Webhooks do Chatwoot.
- Configurar o n8n para chamar `POST /api/cron/chatwoot-sync` com `Authorization: Bearer <CRON_SERVICE_TOKEN>` periodicamente (mesmo token já usado por `/api/cron/alerts`).
- Nenhum commit/push foi feito — trabalho está só no working tree local.
