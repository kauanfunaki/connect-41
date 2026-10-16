import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { descrever, divergencias, estadoDoBanco, lerMigrations, relacoesComOBanco, type Migration } from "./chavesDoBanco";
import { lerEsquema } from "./lerEsquema";

// O que se testa: o leitor das migrations (chave a chave, coluna a coluna) e a
// varredura que compara o banco que as migrations deixaram com o schema. A
// varredura do projeto de verdade derruba o teste quando aparece divergência
// nova — foi uma dessas (o link do teste com RESTRICT onde o schema diz
// SetNull) que travou a exclusão de candidato e de empresa até 14/10/2026.

const raiz = process.cwd();
const MIGRATIONS = path.join(raiz, "prisma", "migrations");
const m = (nome: string, sql: string): Migration => ({ nome, sql });

describe("leitor das migrations", () => {
  it("a última palavra sobre cada chave é da migration mais nova (DROP + ADD)", () => {
    const banco = estadoDoBanco([
      m(
        "1_cria",
        `CREATE TABLE \`links\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`candId\` VARCHAR(191) NULL,
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE \`links\` ADD CONSTRAINT \`links_candId_fkey\` FOREIGN KEY (\`candId\`) REFERENCES \`cands\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;`
      ),
      m(
        "2_acerta",
        `ALTER TABLE \`links\` DROP FOREIGN KEY \`links_candId_fkey\`;
ALTER TABLE \`links\` ADD CONSTRAINT \`links_candId_fkey\` FOREIGN KEY (\`candId\`) REFERENCES \`cands\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE;`
      ),
    ]);
    expect(banco.chaves.get("links_candId_fkey")).toEqual({
      nome: "links_candId_fkey",
      tabela: "links",
      colunas: ["candId"],
      alvo: "cands",
      onDelete: "SetNull",
      migration: "2_acerta",
    });
  });

  it("sem ON DELETE é RESTRICT (o NO ACTION do InnoDB); chave derrubada some; tabela derrubada leva as chaves", () => {
    const banco = estadoDoBanco([
      m(
        "1",
        "ALTER TABLE `a` ADD CONSTRAINT `a_x_fkey` FOREIGN KEY (`x`) REFERENCES `b`(`id`);\n" +
          "ALTER TABLE `a` ADD CONSTRAINT `a_y_fkey` FOREIGN KEY (`y`) REFERENCES `b`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;\n" +
          "ALTER TABLE `c` ADD CONSTRAINT `c_z_fkey` FOREIGN KEY (`z`) REFERENCES `b`(`id`) ON DELETE NO ACTION;"
      ),
      m("2", "ALTER TABLE `a` DROP FOREIGN KEY `a_y_fkey`;\nDROP TABLE `c`;"),
    ]);
    expect([...banco.chaves.keys()]).toEqual(["a_x_fkey"]);
    expect(banco.chaves.get("a_x_fkey")!.onDelete).toBe("Restrict");
  });

  it("comentário com ponto e vírgula e texto entre aspas não confundem o leitor", () => {
    const banco = estadoDoBanco([
      m(
        "1",
        "-- ALTER TABLE `a` ADD CONSTRAINT `falsa_fkey` FOREIGN KEY (`x`) REFERENCES `b`(`id`) ON DELETE CASCADE;\n" +
          "/* DROP FOREIGN KEY `a_x_fkey`; */\n" +
          "CREATE TABLE `a` (`id` VARCHAR(191) NOT NULL, `x` VARCHAR(191) NULL, `nota` VARCHAR(20) NOT NULL DEFAULT 'a;b,c', PRIMARY KEY (`id`));\n" +
          "ALTER TABLE `a` ADD CONSTRAINT `a_x_fkey` FOREIGN KEY (`x`) REFERENCES `b`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;\n" +
          "UPDATE `a` SET `nota` = 'x; DROP TABLE `a`' WHERE `id` = '1';"
      ),
    ]);
    expect([...banco.chaves.keys()]).toEqual(["a_x_fkey"]);
    expect(Object.fromEntries(banco.colunas.get("a")!)).toEqual({ id: false, x: true, nota: false });
  });

  it("a nulidade da coluna segue CREATE, ADD COLUMN, MODIFY, CHANGE e DROP COLUMN", () => {
    const banco = estadoDoBanco([
      m("1", "CREATE TABLE `t` (\n  `id` VARCHAR(191) NOT NULL,\n  `userId` VARCHAR(191) NOT NULL,\n  `velha` INTEGER NULL,\n  PRIMARY KEY (`id`)\n);"),
      m("2", "ALTER TABLE `t` ADD COLUMN `nome` VARCHAR(120) NULL,\n    MODIFY `userId` VARCHAR(191) NULL;"),
      m("3", "ALTER TABLE `t` CHANGE `velha` `nova` INTEGER NOT NULL DEFAULT 0;\nALTER TABLE `t` DROP COLUMN `nome`;"),
    ]);
    expect(Object.fromEntries(banco.colunas.get("t")!)).toEqual({ id: false, userId: true, nova: false });
  });

  it("`antesDe` para antes da migration indicada", () => {
    const todas = lerMigrations(MIGRATIONS);
    const antes = lerMigrations(MIGRATIONS, { antesDe: "20261014200000" });
    expect(antes.length).toBeGreaterThan(100);
    expect(antes.length).toBeLessThan(todas.length);
    expect(antes.every((x) => x.nome < "20261014200000")).toBe(true);
    expect(todas.map((x) => x.nome)).toContain("20261014200000_assessment_links_set_null");
  });
});

describe("comparação com o schema", () => {
  const SCHEMA = `
model Cand {
  id    String @id
  links Link[]
  @@map("cands")
}

model Link {
  id     String  @id
  candId String?
  donoId String
  outra  String?
  cand   Cand?   @relation(fields: [candId], references: [id])
  dono   Cand    @relation("dono", fields: [donoId], references: [id], onDelete: Cascade)
  sem    Cand?   @relation("sem", fields: [outra], references: [id], onDelete: NoAction)
  @@map("links")
}
`;
  const esquema = lerEsquema(SCHEMA);

  it("acha ação diferente, nulidade diferente, chave só de um lado — e NO ACTION vale RESTRICT", () => {
    const banco = estadoDoBanco([
      m(
        "1",
        "CREATE TABLE `links` (`id` VARCHAR(191) NOT NULL, `candId` VARCHAR(191) NULL, `donoId` VARCHAR(191) NULL, `outra` VARCHAR(191) NULL, PRIMARY KEY (`id`));\n" +
          "ALTER TABLE `links` ADD CONSTRAINT `links_candId_fkey` FOREIGN KEY (`candId`) REFERENCES `cands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;\n" +
          "ALTER TABLE `links` ADD CONSTRAINT `links_donoId_fkey` FOREIGN KEY (`donoId`) REFERENCES `cands`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;\n" +
          "ALTER TABLE `links` ADD CONSTRAINT `links_outra_fkey` FOREIGN KEY (`outra`) REFERENCES `cands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;\n" +
          "ALTER TABLE `velha` ADD CONSTRAINT `velha_candId_fkey` FOREIGN KEY (`candId`) REFERENCES `cands`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;"
      ),
    ]);
    const d = divergencias(esquema, banco);
    expect(d.map(descrever)).toEqual([
      "links.candId → cands: banco ON DELETE Restrict, schema SetNull (Link.cand; links_candId_fkey, 1)",
      "links.donoId: banco NULL, schema obrigatório (Link.dono)",
      "velha.candId → cands: chave velha_candId_fkey (ON DELETE Restrict) sem relação no schema",
    ]);
    expect(relacoesComOBanco(esquema, banco).find((r) => r.campo === "cand")!.onDelete).toBe("Restrict");
  });

  it("relação do schema sem chave nas migrations aparece", () => {
    expect(divergencias(esquema, estadoDoBanco([])).map((d) => d.tipo)).toEqual(["so-no-schema", "so-no-schema", "so-no-schema"]);
  });
});

// ─── O projeto de verdade ───────────────────────────────────────────────────

/**
 * Divergências conhecidas que não mexem no ON DELETE de chave existente.
 * Nenhuma delas é corrigida aqui (ver o PR de 14/10/2026); entrar uma nova na
 * lista exige decidir o que fazer com ela.
 */
const CONHECIDAS = [
  // Tabelas e coluna que existem no schema e não em migration nenhuma: em
  // produção foram criadas fora das migrations (`db push`), então a chave —
  // se existe — não aparece aqui. É parte do drift conhecido de produção.
  "people.linkedUserId: relação Person.linkedUser sem chave estrangeira nas migrations",
  "manual_documents.tenantId: relação ManualDocument.tenant sem chave estrangeira nas migrations",
  "manual_documents.createdById: relação ManualDocument.createdBy sem chave estrangeira nas migrations",
  "manual_pages.tenantId: relação ManualPage.tenant sem chave estrangeira nas migrations",
  "manual_pages.documentId: relação ManualPage.document sem chave estrangeira nas migrations",
  "manual_pages.createdById: relação ManualPage.createdBy sem chave estrangeira nas migrations",
  "chatwoot_agent_links.tenantId: relação ChatwootAgentLink.tenant sem chave estrangeira nas migrations",
  "chatwoot_agent_links.linkedUserId: relação ChatwootAgentLink.linkedUser sem chave estrangeira nas migrations",
  "agent_evaluation_summaries.tenantId: relação AgentEvaluationSummary.tenant sem chave estrangeira nas migrations",
  "bpo_credentials.tenantId: relação BpoCredential.tenant sem chave estrangeira nas migrations",
  "bpo_credentials.companyId: relação BpoCredential.company sem chave estrangeira nas migrations",
  "bpo_credentials.createdById: relação BpoCredential.createdBy sem chave estrangeira nas migrations",
  "user_preferences.userId: relação UserPreference.user sem chave estrangeira nas migrations",
  "bpo_credential_views.tenantId: relação BpoCredentialView.tenant sem chave estrangeira nas migrations",
  "bpo_credential_views.credentialId: relação BpoCredentialView.credential sem chave estrangeira nas migrations",
  "bpo_credential_views.userId: relação BpoCredentialView.user sem chave estrangeira nas migrations",
  // A tabela das páginas do Kanban saiu do schema em 27/07/2026 (commit
  // a1eaf9aa) sem migration que a apague. Se ainda existir em produção com
  // linhas, `createdById` → users (RESTRICT) trava a exclusão de quem criou
  // uma página — decisão do dono (apagar a tabela é irreversível).
  "canvas_pages.tenantId → tenants: chave canvas_pages_tenantId_fkey (ON DELETE Restrict) sem relação no schema",
  "canvas_pages.pipelineItemId → pipeline_items: chave canvas_pages_pipelineItemId_fkey (ON DELETE Cascade) sem relação no schema",
  "canvas_pages.createdById → users: chave canvas_pages_createdById_fkey (ON DELETE Restrict) sem relação no schema",
];

describe("varredura: banco pelas migrations × schema", () => {
  const esquema = lerEsquema(readFileSync(path.join(raiz, "prisma", "schema.prisma"), "utf8"));
  const achadas = divergencias(esquema, estadoDoBanco(lerMigrations(MIGRATIONS)));

  it("nenhuma chave com ON DELETE diferente do schema", () => {
    expect(
      achadas.filter((d) => d.tipo === "acao").map(descrever),
      "A migration gravou um ON DELETE que o schema não diz: a exclusão confia no schema. Acerte um dos dois (ver chavesDoBanco.ts)."
    ).toEqual([]);
  });

  it("nenhuma coluna de chave com nulidade diferente do schema", () => {
    expect(achadas.filter((d) => d.tipo === "nulidade").map(descrever)).toEqual([]);
  });

  it("chave só de um lado: só as conhecidas", () => {
    const outras = achadas.filter((d) => d.tipo === "so-no-schema" || d.tipo === "so-no-banco").map(descrever);
    expect(outras.filter((d) => !CONHECIDAS.includes(d)), "Divergência nova entre migrations e schema").toEqual([]);
    expect(CONHECIDAS.filter((d) => !outras.includes(d)), "Divergência resolvida: tire da lista CONHECIDAS").toEqual([]);
  });

  it("antes de 20261014200000 a varredura acusava o link do teste — o que a migration acertou", () => {
    const antes = divergencias(esquema, estadoDoBanco(lerMigrations(MIGRATIONS, { antesDe: "20261014200000" })));
    // Só o link do teste: as chaves que migrations posteriores acertaram têm o
    // seu próprio teste (a do portal, em 20261014210000, logo abaixo).
    expect(antes.filter((d) => d.tipo === "acao" && d.tabela === "assessment_links").map(descrever)).toEqual([
      "assessment_links.candidaturaId → candidaturas: banco ON DELETE Restrict, schema SetNull (AssessmentLink.candidatura; assessment_links_candidaturaId_fkey, 20260724144426_add_assessment_link)",
      "assessment_links.templateId → assessment_templates: banco ON DELETE Restrict, schema SetNull (AssessmentLink.template; assessment_links_templateId_fkey, 20260724180844_add_assessment_template)",
    ]);
  });
});

describe("migration 20261014200000_assessment_links_set_null", () => {
  const sql = readFileSync(path.join(MIGRATIONS, "20261014200000_assessment_links_set_null", "migration.sql"), "utf8");
  const banco = estadoDoBanco(lerMigrations(MIGRATIONS));

  it("derruba e recria as duas chaves, com os nomes da migration de 24/07, em SET NULL", () => {
    expect(sql).toContain("ALTER TABLE `assessment_links` DROP FOREIGN KEY `assessment_links_candidaturaId_fkey`;");
    expect(sql).toContain("ALTER TABLE `assessment_links` DROP FOREIGN KEY `assessment_links_templateId_fkey`;");
    expect(sql).toContain(
      "ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_candidaturaId_fkey` FOREIGN KEY (`candidaturaId`) REFERENCES `candidaturas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;"
    );
    expect(sql).toContain(
      "ALTER TABLE `assessment_links` ADD CONSTRAINT `assessment_links_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `assessment_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;"
    );
    expect(banco.chaves.get("assessment_links_candidaturaId_fkey")).toMatchObject({ onDelete: "SetNull", migration: "20261014200000_assessment_links_set_null" });
    expect(banco.chaves.get("assessment_links_templateId_fkey")).toMatchObject({ onDelete: "SetNull", migration: "20261014200000_assessment_links_set_null" });
  });

  it("só mexe nas duas chaves — nenhum dado, nenhuma coluna", () => {
    const comandos = sql
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((c) => c.trim())
      .filter(Boolean);
    expect(comandos).toHaveLength(4);
    for (const c of comandos) expect(c).toMatch(/^ALTER TABLE `assessment_links` (DROP FOREIGN KEY|ADD CONSTRAINT) `assessment_links_(candidaturaId|templateId)_fkey`/);
  });

  it("SET NULL vale: as duas colunas aceitam NULL no banco", () => {
    expect(banco.colunas.get("assessment_links")!.get("candidaturaId")).toBe(true);
    expect(banco.colunas.get("assessment_links")!.get("templateId")).toBe(true);
  });
});

describe("migration 20261014210000_portal_por_empresa", () => {
  const PASTA = "20261014210000_portal_por_empresa";
  const esquema = lerEsquema(readFileSync(path.join(raiz, "prisma", "schema.prisma"), "utf8"));
  const sql = readFileSync(path.join(MIGRATIONS, PASTA, "migration.sql"), "utf8");
  const banco = estadoDoBanco(lerMigrations(MIGRATIONS));
  const comandos = sql
    .split("\n")
    .filter((l) => l.trim() && !l.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((c) => c.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  it("antes dela, o banco tinha a conta do portal presa ao cliente (NOT NULL, RESTRICT)", () => {
    const antes = divergencias(esquema, estadoDoBanco(lerMigrations(MIGRATIONS, { antesDe: "20261014210000" })));
    expect(antes.filter((d) => d.tabela === "portal_users").map(descrever)).toEqual([
      "portal_users.clientGroupId → client_groups: banco ON DELETE Restrict, schema SetNull (PortalUser.clientGroup; portal_users_clientGroupId_fkey, 20260904010000_portal_do_cliente)",
      "portal_users.clientGroupId: banco NOT NULL, schema opcional (PortalUser.clientGroup)",
    ]);
  });

  it("depois dela: cliente opcional em SET NULL, e as ligações novas em CASCADE dos dois lados", () => {
    expect(banco.colunas.get("portal_users")!.get("clientGroupId")).toBe(true);
    expect(banco.chaves.get("portal_users_clientGroupId_fkey")).toMatchObject({ onDelete: "SetNull", migration: PASTA });
    for (const nome of [
      "portal_user_companies_portalUserId_fkey",
      "portal_user_companies_companyId_fkey",
      "client_announcement_companies_announcementId_fkey",
      "client_announcement_companies_companyId_fkey",
    ]) {
      expect(banco.chaves.get(nome), nome).toMatchObject({ onDelete: "Cascade", migration: PASTA });
    }
    expect(Object.fromEntries(banco.colunas.get("portal_user_companies")!)).toEqual({
      id: false,
      tenantId: false,
      portalUserId: false,
      companyId: false,
      incluiFiliais: false,
      createdAt: false,
    });
    expect(Object.fromEntries(banco.colunas.get("sped_sync_roots")!)).toEqual({ tenantId: false, cnpjRaiz: false, createdAt: false });
  });

  it("a coluna do cliente muda só a nulidade: mesmo tipo e collation da migration que a criou", () => {
    expect(sql).toContain("MODIFY `clientGroupId` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;");
    const criacao = readFileSync(path.join(MIGRATIONS, "20260904010000_portal_do_cliente", "migration.sql"), "utf8");
    expect(criacao).toContain("`clientGroupId` VARCHAR(191) NOT NULL,");
    expect(criacao).toMatch(/CREATE TABLE `portal_users`[\s\S]*DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;/);
  });

  it("aditiva: nada é apagado nem atualizado; os três preenchimentos pulam o que já existe", () => {
    expect(comandos.filter((c) => /^(DELETE|UPDATE|TRUNCATE|DROP TABLE)\b/i.test(c))).toEqual([]);
    expect(comandos.filter((c) => /DROP FOREIGN KEY/.test(c))).toEqual([
      "ALTER TABLE `portal_users` DROP FOREIGN KEY `portal_users_clientGroupId_fkey`",
    ]);
    const insercoes = comandos.filter((c) => /^INSERT INTO/.test(c));
    expect(insercoes.map((c) => c.match(/^INSERT INTO `(\w+)`/)![1])).toEqual([
      "portal_user_companies",
      "client_announcement_companies",
      "sped_sync_roots",
    ]);
    for (const c of insercoes) expect(c).toMatch(/WHERE NOT EXISTS|AND NOT EXISTS/);
  });

  it("o preenchimento das contas liga as empresas do cliente no mesmo escritório, com as filiais", () => {
    const contas = comandos.find((c) => c.startsWith("INSERT INTO `portal_user_companies`"))!;
    expect(contas).toContain("JOIN `companies` c ON c.`clientGroupId` = pu.`clientGroupId` AND c.`tenantId` = pu.`tenantId`");
    expect(contas).toMatch(/par\.`companyId`, true FROM/);
  });

  it("as raízes do SPED: clientes ativos, com raiz de 8 caracteres — a regra antiga de `sincronizarTenant`", () => {
    const raizes = comandos.find((c) => c.startsWith("INSERT INTO `sped_sync_roots`"))!;
    expect(raizes).toContain("WHERE g.`active` = true AND g.`cnpjRoot` IS NOT NULL AND CHAR_LENGTH(g.`cnpjRoot`) = 8");
  });
});
