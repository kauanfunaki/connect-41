// O lado servidor das telas fiscais no modo real (22/10/2026): credencial,
// alcance, ator e o mapa Company ↔ estabelecimento. Nada daqui vai ao
// navegador — a tela recebe dados já resolvidos, nunca o token.

import "server-only";
import { cache } from "react";
import { getPrisma } from "@/lib/prisma";
import type { AuthContext } from "@/lib/auth/context";
import { credenciaisDoSped, type CredenciaisDoMotor } from "@/lib/sped/credenciais";
import { raizesDoAlcance } from "@/lib/sped/raizes";
import { criarClienteDoMotor, type AtorDoMotor, type ClienteDoMotor } from "@/lib/sped/motor";
import { alcanceDaEquipe } from "@/app/(app)/documentos-fiscais/alcance";
import { escolherModo, type ModoFiscal } from "./modo";
import { mapearEstabelecimentos, soDigitos, type CompanyFiscal, type MapaDaRaiz } from "./estabelecimentos";

const credenciais = cache((tenantId: string) => credenciaisDoSped(tenantId));

/** A integração é a única fonte das telas fiscais, também no desenvolvimento. */
export async function modoDoFiscal(ctx: AuthContext): Promise<ModoFiscal> {
  if (!ctx.tenantId) return "indisponivel";
  return escolherModo({ motorConfigurado: !!(await credenciais(ctx.tenantId)) });
}

export type MotorDoEscritorio = {
  cliente: ClienteDoMotor;
  /** Há token de escrita gravado. Sem ele, as ações aparecem desabilitadas. */
  escrita: boolean;
  /** As raízes que o escritório pode consultar — do alcance da equipe, nunca da URL. */
  raizes: string[];
};

export const abrirMotor = cache(async (tenantId: string): Promise<MotorDoEscritorio | null> => {
  if (!tenantId) return null;
  const creds: CredenciaisDoMotor | null = await credenciais(tenantId);
  if (!creds) return null;
  const raizes = [...(await raizesDoAlcance(alcanceDaEquipe(tenantId)))].sort();
  return { cliente: criarClienteDoMotor(creds), escrita: !!creds.tokenEscrita, raizes };
});

const companiesDoEscritorio = cache(async (tenantId: string): Promise<CompanyFiscal[]> => {
  const linhas = await getPrisma().company.findMany({
    where: { tenantId, cnpj: { not: null } },
    select: { id: true, name: true, displayName: true, cnpj: true, taxRegime: true },
  });
  return linhas.map((c) => ({ id: c.id, nome: c.displayName?.trim() || c.name, cnpj: soDigitos(c.cnpj), regime: c.taxRegime }));
});

/** Os estabelecimentos da raiz, já cruzados com as empresas do escritório. Uma leitura por requisição. */
export const estabelecimentosDaRaiz = cache(async (tenantId: string, raiz: string): Promise<MapaDaRaiz> => {
  const motor = await abrirMotor(tenantId);
  if (!motor || !motor.raizes.includes(raiz)) return { visiveis: [], semCadastro: [], semMotor: [] };
  const [empresas, companies] = await Promise.all([motor.cliente.listarEmpresas(raiz, true), companiesDoEscritorio(tenantId)]);
  return mapearEstabelecimentos(raiz, empresas.itens, companies);
});

/**
 * Quem age, para o `X-Connect-Ator`: sempre da sessão do servidor (§8.2),
 * nunca de campo de formulário. `null` quando o usuário não existe mais.
 */
export async function atorDaSessao(ctx: AuthContext): Promise<AtorDoMotor | null> {
  if (!ctx.userId) return null;
  const u = await getPrisma().user.findUnique({ where: { id: ctx.userId }, select: { id: true, name: true, email: true } });
  if (!u) return null;
  return { id: u.id, nome: u.name, email: u.email, tenant: ctx.tenantId };
}
