import { getAuthContext, podeExcluir } from "@/lib/auth/context";
import { podeNoModulo } from "@/lib/auth/modulo";
import { getPrisma } from "@/lib/prisma";
import { lerConfig } from "@/lib/integracoes/data";
import { raizesSincronizadas } from "@/lib/sped/raizesSincronizadas";
import { MODULO_CONTABIL } from "./types";

export class ErroContabil extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export async function acessoContabil(nivel: "ver" | "agir" = "ver", excluir = false) {
  const ctx = await getAuthContext();
  if (!ctx.userId || !await podeNoModulo(ctx, MODULO_CONTABIL, nivel)) throw new ErroContabil("Não encontrado.", 404);
  if (excluir && !podeExcluir(ctx)) throw new ErroContabil("Só o Administrador ou o Super Admin pode excluir.", 403);
  const conexao = await getPrisma().tenantIntegration.findUnique({ where: { tenantId_integrationCode_instanceKey: { tenantId: ctx.tenantId, integrationCode: "sped", instanceKey: "default" } }, select: { enabled: true, configEnc: true } });
  const config = conexao?.enabled ? lerConfig(conexao.configEnc) : {};
  if (!config.baseUrl || !config.serviceToken) throw new ErroContabil("Configure e ative a integração SPED Generator para consultar o Contábil.", 503);
  const empresas = await getPrisma().company.findMany({ where: { tenantId: ctx.tenantId, cnpj: { not: null } }, select: { cnpj: true } });
  const raizes = new Set(await raizesSincronizadas(ctx.tenantId));
  const cnpjs = new Set(empresas.map(e => (e.cnpj ?? "").replace(/\D/g, "")).filter(c => c.length === 14 && raizes.has(c.slice(0, 8))));
  return { ctx, config, cnpjs };
}
export type AcessoContabil = Awaited<ReturnType<typeof acessoContabil>>;
export function exigirEmpresa(acesso: Pick<AcessoContabil, "cnpjs">, cnpj: string) { if (!acesso.cnpjs.has(cnpj)) throw new ErroContabil("Não encontrado.", 404); }
export async function pedirContabil(acesso: AcessoContabil, caminho: string, opcoes: { dados?: unknown; escrita?: boolean; consulta?: boolean; params?: URLSearchParams } = {}) {
  const token = opcoes.escrita ? acesso.config.accountingWriteToken : acesso.config.serviceToken;
  if (!token) throw new ErroContabil("Configure o token de escrita contábil em Integrações → SPED Generator.", 503);
  const prefixo = opcoes.escrita ? "comandos" : opcoes.consulta ? "consultas" : "integracao";
  const params = opcoes.params ?? new URLSearchParams(); params.set("tenant_id", acesso.ctx.tenantId);
  const response = await fetch(`${acesso.config.baseUrl.replace(/\/+$/, "")}/api/${prefixo}/contabil/${caminho}?${params}`, {
    method: opcoes.dados === undefined ? "GET" : "POST", cache: "no-store", signal: AbortSignal.timeout(25_000),
    headers: { Authorization: `Bearer ${token}`, ...(opcoes.dados === undefined ? {} : { "Content-Type": "application/json" }),
      "X-Connect-Actor": acesso.ctx.userId, "X-Connect-Can-Delete": podeExcluir(acesso.ctx) ? "1" : "0" },
    ...(opcoes.dados === undefined ? {} : { body: JSON.stringify(opcoes.dados) }),
  });
  if (!response.ok) {
    const corpo = await response.json().catch(() => ({}));
    const detalhe = typeof corpo.detail === "string" ? corpo.detail : typeof corpo.error === "string" ? corpo.error : "SPED contábil indisponível. Confira a conexão e a versão da API.";
    throw new ErroContabil(detalhe, response.status === 404 ? 404 : response.status >= 500 ? 503 : response.status);
  }
  return response;
}
