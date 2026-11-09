import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { registrarRecusaDeXml, registrarRecusaSemTravar, type RecusaDeXml } from "./recusasServidor";
import { TAMANHO_MAXIMO_GUARDADO } from "./recusas";

// Banco falso: só o upsert que a gravação usa. Nada aqui toca o MySQL.
function bancoFalso(falha?: Error) {
  const upsert = vi.fn(async (args: unknown) => {
    if (falha) throw falha;
    return args;
  });
  return { db: { fiscalXmlRefusal: { upsert } } as never, upsert };
}

const XML = `<CompNfse><Nfse><InfNfse><OrgaoGerador><CodigoMunicipio>4106902</CodigoMunicipio></OrgaoGerador></InfNfse></Nfse></CompNfse>`;
const base: RecusaDeXml = {
  tenantId: "t1",
  companyId: "c1",
  origem: "entrada",
  nomeDoArquivo: "nota-ficticia.xml",
  xml: XML,
  motivo: "campo_obrigatorio_ausente",
  detalhe: "número da NFS-e ausente",
  userId: "u1",
};

describe("registrarRecusaDeXml", () => {
  it("uma linha por arquivo: a chave é o SHA-256, com as pistas e o XML guardado", async () => {
    const { db, upsert } = bancoFalso();
    await registrarRecusaDeXml(base, db);
    const args = upsert.mock.calls[0][0] as { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> };
    const sha256 = createHash("sha256").update(XML, "utf8").digest("hex");
    expect(args.where).toEqual({ tenantId_sha256: { tenantId: "t1", sha256 } });
    expect(args.create).toMatchObject({
      tenantId: "t1",
      companyId: "c1",
      source: "entrada",
      fileName: "nota-ficticia.xml",
      sha256,
      bytes: Buffer.byteLength(XML),
      reason: "campo_obrigatorio_ausente",
      probableType: "nfse",
      rootTag: "CompNfse",
      municipalityCode: "4106902",
      xml: XML,
    });
    // Reenvio soma em vezes e atualiza motivo e detalhe; não cria outra linha.
    expect(args.update).toMatchObject({ timesSeen: { increment: 1 }, reason: "campo_obrigatorio_ausente", companyId: "c1" });
  });

  it("reenvio sem empresa não apaga a empresa de antes", async () => {
    const { db, upsert } = bancoFalso();
    await registrarRecusaDeXml({ ...base, companyId: null }, db);
    const args = upsert.mock.calls[0][0] as { update: Record<string, unknown> };
    expect(args.update).not.toHaveProperty("companyId");
  });

  it("XML acima do teto: a linha fica, sem o conteúdo", async () => {
    const { db, upsert } = bancoFalso();
    const grande = `<Nfse>${"x".repeat(TAMANHO_MAXIMO_GUARDADO)}</Nfse>`;
    await registrarRecusaDeXml({ ...base, xml: grande }, db);
    const args = upsert.mock.calls[0][0] as { create: Record<string, unknown> };
    expect(args.create.xml).toBeNull();
    expect(args.create.bytes).toBe(Buffer.byteLength(grande));
  });

  it("corta motivo, detalhe e nome nos tamanhos das colunas", async () => {
    const { db, upsert } = bancoFalso();
    await registrarRecusaDeXml({ ...base, motivo: "m".repeat(60), detalhe: "d".repeat(900), nomeDoArquivo: "n".repeat(400) }, db);
    const { create } = upsert.mock.calls[0][0] as { create: Record<string, string> };
    expect(create.reason).toHaveLength(40);
    expect(create.detail).toHaveLength(500);
    expect(create.fileName).toHaveLength(255);
  });
});

describe("registrarRecusaSemTravar", () => {
  it("falha na gravação não derruba quem chamou", async () => {
    const { db } = bancoFalso(new Error("banco fora"));
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(registrarRecusaSemTravar(base, db)).resolves.toBeUndefined();
    expect(erro).toHaveBeenCalled();
    erro.mockRestore();
  });
});
