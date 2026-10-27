import { randomBytes } from "node:crypto";
import { z } from "zod";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { hashToken, ErroOps } from "./servidor";

export const nomeChaveSchema = z.object({ name: z.string().trim().min(1, "Informe um nome para a chave.").max(120, "Use até 120 caracteres.") });
export type ChaveOps = { id: string; name: string; hasToken: boolean; version: number };
export async function listarChavesOps(tenantId: string): Promise<ChaveOps[]> {
  const keys = await getPrisma().opsApiKey.findMany({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true, tokenHash: true, version: true } });
  return keys.map(({ tokenHash, ...key }) => ({ ...key, hasToken: Boolean(tokenHash) }));
}
export async function criarChaveOps(ctx: AuthContext, name: string) {
  if (!ctx.tenantId) throw new ErroOps("Entre novamente para continuar.", 401);
  const token = `ops_${randomBytes(32).toString("hex")}`;
  const key = await getPrisma().opsApiKey.create({ data: { tenantId: ctx.tenantId, name: nomeChaveSchema.parse({ name }).name, tokenHash: hashToken(token) }, select: { id: true, name: true, version: true } });
  return { ...key, hasToken: true, token };
}
export async function alterarChaveOps(ctx: AuthContext, id: string, version: number, revogar = false) {
  const token = revogar ? null : `ops_${randomBytes(32).toString("hex")}`;
  const result = await getPrisma().opsApiKey.updateMany({ where: { id, tenantId: ctx.tenantId, version, ...(revogar ? { tokenHash: { not: null } } : {}) }, data: { tokenHash: token ? hashToken(token) : null, version: { increment: 1 } } });
  if (result.count !== 1) throw new ErroOps("A chave mudou em outra aba ou está indisponível. Atualize e tente novamente.", 409);
  return { id, token, hasToken: !revogar, version: version + 1 };
}
