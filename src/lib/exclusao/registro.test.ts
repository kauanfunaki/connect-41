import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/browser";
import { lerEsquema } from "./lerEsquema";
import { COLUNAS_SOLTAS, LIGACOES, type Entidade } from "./registro";

// O que se testa: o registro de ligações (registro.ts) bate com o schema do
// Prisma. Relação nova com Company, Person ou User que ninguém classificou
// derruba este teste — com a mensagem dizendo onde classificar. O mesmo para
// coluna que guarda o id sem chave estrangeira (pelo nome da coluna).
//
// O schema é a fonte de onde o cliente é gerado; os nomes de model são
// conferidos contra `Prisma.ModelName` do cliente gerado. (O datamodel que o
// Prisma 7 embute no cliente não guarda o lado da chave nem o `onDelete`, que
// é o que decide a exclusão — ver lerEsquema.ts.)

const esquema = lerEsquema(readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8"));
const ENTIDADES: Entidade[] = ["Company", "Person", "User"];
const chave = (modelo: string, campo: string) => `${modelo}.${campo}`;

describe("registro de ligações × schema do Prisma", () => {
  it("o leitor do schema acha os models do cliente gerado", () => {
    expect([...esquema.modelos.keys()].sort()).toEqual(Object.values(Prisma.ModelName).sort());
  });

  for (const entidade of ENTIDADES) {
    describe(entidade, () => {
      const doSchema = esquema.relacoes.filter((r) => r.alvo === entidade);
      const doRegistro = LIGACOES[entidade];

      it("toda relação do schema está classificada", () => {
        const classificadas = new Set(doRegistro.map((l) => chave(l.modelo, l.campo)));
        const faltando = doSchema.filter((r) => !classificadas.has(chave(r.modelo, r.campo))).map((r) => `${chave(r.modelo, r.campo)} (onDelete ${r.onDelete})`);
        expect(faltando, `Classifique em LIGACOES.${entidade} (src/lib/exclusao/registro.ts) e trate no plano`).toEqual([]);
      });

      it("nada no registro que o schema não tenha", () => {
        const existentes = new Set(doSchema.map((r) => chave(r.modelo, r.campo)));
        expect(doRegistro.filter((l) => !existentes.has(chave(l.modelo, l.campo))).map((l) => chave(l.modelo, l.campo))).toEqual([]);
      });

      it("sem repetição", () => {
        const chaves = doRegistro.map((l) => chave(l.modelo, l.campo));
        expect(chaves.length).toBe(new Set(chaves).size);
      });

      it("a coluna da chave e o tratamento batem com o schema", () => {
        const problemas: string[] = [];
        for (const l of doRegistro) {
          const r = doSchema.find((x) => x.modelo === l.modelo && x.campo === l.campo);
          if (!r) continue;
          if (r.fks.length !== 1 || r.fks[0] !== l.fk) problemas.push(`${chave(l.modelo, l.campo)}: chave é ${r.fks.join(",")}, registro diz ${l.fk}`);
          // Cascata só onde o banco apaga junto, e vice-versa.
          if ((l.tratamento === "cascata") !== (r.onDelete === "Cascade")) {
            problemas.push(`${chave(l.modelo, l.campo)}: registro diz ${l.tratamento}, schema diz onDelete ${r.onDelete}`);
          }
          // "Desligar" é o banco anulando a coluna — só com SetNull.
          if (l.tratamento === "desligar" && r.onDelete !== "SetNull") {
            problemas.push(`${chave(l.modelo, l.campo)}: desligar exige onDelete SetNull (é ${r.onDelete})`);
          }
          if (l.tratamento === "reatribuir" && entidade !== "User") problemas.push(`${chave(l.modelo, l.campo)}: só usuário reatribui`);
          if (l.historico && !l.rotulo) problemas.push(`${chave(l.modelo, l.campo)}: histórico precisa de rótulo para aparecer na prévia`);
        }
        expect(problemas).toEqual([]);
      });
    });
  }
});

/** Colunas que guardam o id do cadastro sem chave — pelo nome. */
const PADRAO_SOLTO: Record<Entidade, RegExp> = {
  Company: /^(companyId|entityId)$|CompanyId$/,
  Person: /^(personId|entityId|candidaturaId)$|PersonId$/,
  User: /^userId$|UserId$|ById$|PorId$/,
};

describe("colunas sem chave estrangeira", () => {
  const comChave = new Set(esquema.relacoes.flatMap((r) => r.fks.map((f) => chave(r.modelo, f))));

  for (const entidade of ENTIDADES) {
    it(`${entidade}: toda coluna solta pelo nome está listada em COLUNAS_SOLTAS`, () => {
      const listadas = new Set(COLUNAS_SOLTAS[entidade].map((c) => chave(c.modelo, c.coluna)));
      const achadas: string[] = [];
      for (const modelo of esquema.modelos.values()) {
        for (const [coluna, info] of modelo.escalares) {
          if (info.tipo !== "String" || !PADRAO_SOLTO[entidade].test(coluna)) continue;
          if (comChave.has(chave(modelo.nome, coluna))) continue;
          achadas.push(chave(modelo.nome, coluna));
        }
      }
      expect(
        achadas.filter((c) => !listadas.has(c)),
        `Classifique em COLUNAS_SOLTAS.${entidade} (src/lib/exclusao/registro.ts)`
      ).toEqual([]);
    });

    it(`${entidade}: toda coluna listada existe, sem chave, e "manter" diz por quê`, () => {
      const problemas: string[] = [];
      for (const c of COLUNAS_SOLTAS[entidade]) {
        const modelo = esquema.modelos.get(c.modelo);
        if (!modelo?.escalares.has(c.coluna)) problemas.push(`${chave(c.modelo, c.coluna)} não existe`);
        if (comChave.has(chave(c.modelo, c.coluna))) problemas.push(`${chave(c.modelo, c.coluna)} tem chave — vai em LIGACOES`);
        if (c.tratamento === "manter" && !c.motivo) problemas.push(`${chave(c.modelo, c.coluna)}: manter sem motivo`);
        if (c.tratamento === "desligar" && !modelo?.escalares.get(c.coluna)?.opcional) {
          problemas.push(`${chave(c.modelo, c.coluna)}: desligar numa coluna obrigatória`);
        }
      }
      expect(problemas).toEqual([]);
    });
  }
});

describe("a trilha de auditoria sobrevive ao usuário (migration 20261013200000)", () => {
  it("AuditLog.user é opcional e SetNull, e a linha guarda o nome de quem agiu", () => {
    const r = esquema.relacoes.find((x) => x.modelo === "AuditLog" && x.campo === "user")!;
    expect(r).toMatchObject({ opcional: true, onDelete: "SetNull", fks: ["userId"] });
    expect(esquema.modelos.get("AuditLog")!.escalares.get("actorName")).toEqual({ tipo: "String", opcional: true });
  });

  it("a migration faz o mesmo no banco", () => {
    const sql = readFileSync(path.join(process.cwd(), "prisma", "migrations", "20261013200000_exclusao_de_verdade", "migration.sql"), "utf8");
    expect(sql).toContain("ADD COLUMN `actorName` VARCHAR(120) NULL");
    expect(sql).toContain("MODIFY `userId` VARCHAR(191) NULL");
    expect(sql).toMatch(/audit_logs_userId_fkey` FOREIGN KEY \(`userId`\) REFERENCES `users`\(`id`\) ON DELETE SET NULL/);
  });
});
