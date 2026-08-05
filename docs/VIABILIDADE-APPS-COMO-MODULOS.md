# Viabilidade — trazer apps próprios para dentro do Connect como módulos de setor

**Data:** 2026-08-05
**Escopo:** Conciliador BPO, Radar Societário, Aditiva Pronto
**Premissa do pedido:** não é iframe e não é ponte/integração — as funções do app passam
a ser funções do Connect, com o schema no mesmo banco Prisma e a tela no mesmo Design
System.

---

## 1. Resposta curta

**É viável nos três casos, e o padrão para fazer isso já existe no Connect.** O app não
precisa de nada que o Connect não tenha: o que os três fazem é CRUD + processamento de
planilha + geração de arquivo + notificação, tudo com equivalente pronto aqui.

O custo não está na parte difícil — está no volume. São ~12 mil linhas somadas, e a
maior parte não é lógica de negócio: é infraestrutura que o Connect já resolve (Express,
rotas HTTP, React Query, roteamento de SPA, conexão MySQL na mão). Essa camada é jogada
fora na migração, não portada.

Ordem recomendada, do mais barato ao mais caro:

| App | LOC | Backend | Tabelas | Esforço | Por quê |
|---|---|---|---|---|---|
| **Conciliador BPO** | ~2.200 | nenhum | nenhuma | **Baixo** | Roda inteiro no navegador; o núcleo já é função pura testada |
| **Aditiva Pronto** | ~5.000 | Express | 3 | **Médio** | CRUD + import de planilha + geração de DOCX |
| **Radar Societário** | ~5.000 | Express | 6 | **Médio-alto** | CRUD + cron + e-mail + Trello + anexos |

---

## 2. O que os três têm em comum (e que muda a conta)

**Nenhum dos três tem autenticação.** Não há login, usuário, papel ou permissão em
qualquer um deles — a proteção é de rede (VPN WireGuard + IP fixo da empresa, ver
`Memory-System/Projects/VPN-WireGuard/`). Isso corta nas duas pontas:

- **A favor:** não existe modelo de usuário para migrar nem conflito com o do Connect.
- **Contra:** todo o código assume "quem chegou aqui pode tudo". Cada rota portada
  precisa ganhar `getAuthContext()` + `canViewSector` / `canManageSector` do zero, e
  cada consulta precisa ganhar `tenantId`. Isso não é achado num find-and-replace — é
  revisão linha a linha das rotas.

**Nenhum dos três é multi-tenant.** As tabelas não têm `tenantId`; o app é de um cliente
só (a 41 Tech). Dentro do Connect toda tabela é escopada por tenant. É uma coluna a mais
em cada tabela nova e um filtro em cada consulta — mecânico, mas não opcional.

**Os três usam `xlsx` (SheetJS) para ler planilha; o Connect usa `exceljs`.** Portar o
parsing para `exceljs` é o caminho preferível a adicionar `xlsx` como dependência — a
versão publicada no npm (`0.18.5`, que os três usam) está parada e tem aviso de
prototype pollution; o SheetJS mudou a distribuição para fora do npm. Vale conferir o
impacto antes: é o tipo de troca que dá trabalho em caso de célula com formato exótico.

---

## 3. App a app

### 3.1 Conciliador BPO — **baixo esforço, começar por aqui**

Concilia duas bases Excel por uma coluna-chave escolhida pelo usuário, agrupa e soma
antes de comparar, e classifica cada linha em "De Acordo" / "Valor Divergente" /
"Nota não encontrada".

- **Sem backend e sem banco.** É React + Vite puro; o histórico de arquivos vive em
  IndexedDB no navegador.
- **O núcleo já está isolado e testado:** `src/core/{parser,normalizer,reconciliationEngine,exporter}.ts`,
  com testes (inclusive property-based com `fast-check`). Esses quatro arquivos são
  funções puras — entram no Connect como `src/lib/conciliacao/*` praticamente sem
  edição, e os testes vêm junto (o Connect também roda Vitest).
- **O que dá trabalho:** as 5 telas (`Uploader`, `SheetConfig`, `Stepper`,
  `ReportTable`, `StatusBadge`) são Tailwind cru, fora do Design System — precisam ser
  reescritas com os componentes do Connect. E a troca `xlsx` → `exceljs` no parser.
- **Decisão de produto embutida:** o histórico em IndexedDB é por navegador. Dentro do
  Connect, o natural é gravar a conciliação no banco (vira registro do workspace,
  visível para o time e auditável). Isso é uma tabela nova, não uma porta — mas é
  provavelmente o que se quer.

**Estimativa:** ~1 semana. É o candidato óbvio para provar o padrão.

### 3.2 Aditiva Pronto — **esforço médio**

Gera Termos Aditivos em DOCX a partir de relatório exportado do Domínio Registro.

- **3 tabelas** (`companies`, `company_complements`, `generated_documents`) contra
  ~5.000 linhas de código — a maior parte é UI e montagem de texto, não modelo de dados.
- **Sobreposição de dados com o Connect:** a tabela `companies` do Aditiva e a `Company`
  do Connect descrevem a mesma coisa (empresa cliente, CNPJ, razão social). A migração
  boa **não** cria uma segunda tabela de empresas: liga o módulo à `Company` que já
  existe e move só o que é específico (`company_complements`) para uma tabela nova
  chaveada por `companyId`. Isso é a maior decisão do porte e a que mais economiza
  trabalho depois — é também a que justifica trazer o app para dentro em vez de integrar.
- **Dependência nova:** `docxtemplater` + `pizzip` para preencher o template Word. O
  Connect tem `pdf-lib`, não tem nada de DOCX. São duas dependências pequenas e sem
  conflito; `docxtemplater` tem licença comercial para alguns módulos, mas o núcleo que
  o app usa é a versão aberta — **confirmar antes de fechar o escopo**.
- **Upload de template e de arquivos gerados:** o Connect já tem o padrão
  (`/api/documents`, `/api/company-logos`); é seguir o mesmo, não inventar.

**Estimativa:** ~2 a 3 semanas, sendo boa parte disso a reconciliação da tabela de
empresas.

### 3.3 Radar Societário — **esforço médio-alto, deixar por último**

Controla vencimento de licenças (alvará, meio ambiente, vigilância sanitária, bombeiros,
IBAMA, ANTT…) por empresa, notifica por e-mail e abre card no Trello.

- **6 tabelas** (`rs_companies`, `rs_company_licenses`, `rs_license_attachments`,
  `rs_settings`, `rs_notification_log`, `rs_trello_cards`) e 5 migrations já aplicadas
  em produção — a `migration_005` é recente e mudou a identidade de licença de
  `(company_id, license_type)` para `id` próprio. **Migrar os dados é parte real do
  trabalho aqui**, não só o código.
- **O que o Connect já resolve melhor:**
  - `node-cron` dentro do processo Express → o Connect usa endpoint de cron acionado
    pelo n8n (`/api/cron/alerts`, autenticado por `CRON_SERVICE_TOKEN`). É o mesmo
    desenho, e mais confiável do que timer em processo web.
  - `nodemailer` direto → o Connect tem `src/lib/email/sendMail.ts` com SMTP por tenant
    (`TenantSmtpConfig`).
  - `rs_notification_log` → o Connect tem `AlertDispatch` para exatamente isso
    (não repetir alerta já enviado).
  - `rs_settings` (tabela chave-valor de configuração) → vira configuração de tenant nas
    telas de `/admin`.
  - `rs_companies` → mesma questão do Aditiva: ligar na `Company` do Connect, não
    duplicar. Note que o `rs_companies` já tem `aditiva_id` justamente para amarrar os
    dois apps — dentro do Connect esse problema deixa de existir.
- **O que precisa de decisão de produto:**
  - **Trello.** É a única peça sem equivalente no Connect. Três saídas: (a) manter a
    chamada à API do Trello como integração de saída; (b) trocar por tarefa numa Lista
    do próprio Connect — que é o que o Connect faz hoje com obrigação recorrente
    (`RecurringObligation`); (c) as duas. A (b) é a que faz o módulo valer a pena, e é
    a que elimina um sistema de fora da rotina do time.
  - **Anexos de licença** entram no padrão de documentos do Connect.

**Estimativa:** ~3 a 4 semanas, incluindo a migração dos dados de produção.

---

## 4. Onde isso encaixa na arquitetura atual

O Connect já tem o encaixe pronto — é o mesmo caminho que `bpo_senhas` e `bpo_manual`
percorreram:

1. **Entrada no catálogo:** `src/lib/module-catalog.ts` ganha `{ code, label, sectorCode,
   description, defaultEnabled }`. É isso que faz o card aparecer em `/setor/{code}` e
   o setor aparecer em "Meus Setores".
2. **Rota própria:** `src/app/(app)/{modulo}/` com Server Components + Server Actions.
   O dispatcher em `src/app/(app)/setor/[code]/[moduleCode]/page.tsx` aponta o card para
   ela.
3. **Permissão:** `canViewSector` / `canManageSector` na página **e** em cada action —
   nunca só na página.
4. **Schema:** modelos novos em `prisma/schema.prisma` com `tenantId` + relação no
   `Tenant`, e migration em `prisma/migrations/`.
5. **Comercialização:** o módulo já nasce podendo ser ligado/desligado por cliente
   (`TenantModule`) e entrar em plano (`Plan.allowedModules`). **Este é o argumento mais
   forte a favor de trazer os apps para dentro** — hoje eles são ferramentas internas
   sem como serem vendidas; como módulo do Connect, viram item de plano.

Setor de destino sugerido: Conciliador e Radar no `bpo` / `societario`; Aditiva no
`societario`.

---

## 5. Riscos e o que confirmar antes de começar

| Risco | Comentário |
|---|---|
| **Duplicar cadastro de empresa** | O maior risco do porte. Se Aditiva e Radar chegarem com a própria tabela de empresas, o Connect passa a ter três verdades sobre a mesma empresa. Decidir por `Company` antes da primeira linha de código. |
| **Migração de dados do Radar** | Tem dado de produção em uso e 5 migrations de histórico. Precisa de script de migração verificado, não de "recadastra à mão". |
| **`docxtemplater`** | Confirmar a licença do que vai ser usado. |
| **Troca `xlsx` → `exceljs`** | Baixo risco, mas exige revalidar com as planilhas reais do Domínio Registro e das bases de conciliação. |
| **Perder o app antigo antes da hora** | Os três estão em produção atrás da VPN. Manter no ar durante o porte e desligar só depois de aceite, senão o time fica sem a ferramenta. |
| **Peso do Connect** | +12k LOC brutas, mas o que entra de fato é bem menos (o que sobra depois de descartar Express/React Query/roteamento). Ainda assim, vale módulo por módulo, não os três de uma vez. |

---

## 6. Recomendação

Fazer **um por vez**, começando pelo **Conciliador BPO**: é o mais barato, não tem dado
de produção para migrar, não tem integração externa e o núcleo já vem testado. Serve
para fechar o padrão de "app próprio vira módulo" com pouco risco.

Depois **Aditiva Pronto**, que é onde a decisão de unificar o cadastro de empresas é
tomada de verdade. E por último **Radar Societário**, que se beneficia das duas decisões
anteriores já resolvidas e é o único com migração de dados de produção no caminho.
