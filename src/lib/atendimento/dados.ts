// Leituras básicas do Atendimento: configuração, desfechos, nome do contato.

import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { formasLocaisDoTelefone, telefonesConferem } from "@/lib/whatsapp/vinculo";
import { DESFECHOS_PADRAO } from "./regras";

/** A configuração do escritório; criada com os valores padrão na primeira leitura. */
export async function lerConfiguracao(tenantId: string) {
  const prisma = getPrisma();
  const atual = await prisma.atendimentoConfig.findUnique({ where: { tenantId } });
  if (atual) return atual;
  return prisma.atendimentoConfig.upsert({ where: { tenantId }, update: {}, create: { tenantId } });
}

/** Os setores que aparecem no "Encaminhar". Vazio na configuração = todos os ativos menos a triagem. */
export function setoresQueAtendem(configurados: unknown, ativos: readonly string[], triagem: string): string[] {
  const lista = Array.isArray(configurados) ? configurados.filter((s): s is string => typeof s === "string") : [];
  const base = lista.length > 0 ? lista.filter((s) => ativos.includes(s)) : [...ativos];
  return base.filter((s) => s !== triagem);
}

/**
 * Os desfechos ativos, em ordem. O escritório que nunca mexeu ganha a lista
 * padrão na primeira leitura — sem isso o "Encerrar" abriria vazio.
 */
export async function desfechosDoEscritorio(tenantId: string, incluirInativos = false) {
  const prisma = getPrisma();
  const total = await prisma.atendimentoDesfecho.count({ where: { tenantId } });
  if (total === 0) {
    await prisma.atendimentoDesfecho.createMany({
      data: DESFECHOS_PADRAO.map((label, ordem) => ({ tenantId, label, ordem })),
      skipDuplicates: true,
    });
  }
  return prisma.atendimentoDesfecho.findMany({
    where: { tenantId, ...(incluirInativos ? {} : { ativo: true }) },
    orderBy: [{ ordem: "asc" }, { label: "asc" }],
    select: { id: true, label: true, ativo: true, ordem: true },
  });
}

/** As mensagens padrão que valem para um setor (as de todos e as dele). */
export async function mensagensPadraoPara(tenantId: string, sectorCode: string | null) {
  return getPrisma().atendimentoMensagemPadrao.findMany({
    where: { tenantId, ativo: true, OR: [{ sectorCode: null }, ...(sectorCode ? [{ sectorCode }] : [])] },
    orderBy: [{ titulo: "asc" }],
    select: { id: true, titulo: true, texto: true, sectorCode: true },
  });
}

/**
 * A empresa ou a pessoa cujo telefone confere com o número — só quando é uma só.
 * Ambíguo fica sem vínculo, e a triagem liga à mão.
 */
export async function cadastroPeloTelefone(
  tenantId: string,
  waPhone: string
): Promise<{ companyId: string | null; personId: string | null } | null> {
  const formas = formasLocaisDoTelefone(waPhone);
  if (formas.length === 0) return null;
  const fim = formas[0]!.slice(-4);
  const prisma = getPrisma();
  const [empresas, pessoas] = await Promise.all([
    prisma.company.findMany({ where: { tenantId, phone: { contains: fim } }, select: { id: true, phone: true }, take: 50 }),
    prisma.person.findMany({ where: { tenantId, phone: { contains: fim } }, select: { id: true, phone: true, currentCompanyId: true }, take: 50 }),
  ]);
  const e = empresas.filter((x) => telefonesConferem(x.phone, waPhone));
  const p = pessoas.filter((x) => telefonesConferem(x.phone, waPhone));
  if (p.length === 1) return { personId: p[0]!.id, companyId: p[0]!.currentCompanyId ?? (e.length === 1 ? e[0]!.id : null) };
  if (p.length === 0 && e.length === 1) return { companyId: e[0]!.id, personId: null };
  return null;
}

export type ContatoParaNome = {
  waPhone: string;
  nomeNoWhatsapp: string | null;
  nome: string | null;
  companyId: string | null;
  personId: string | null;
};

/** "+55 41 99999-8888" a partir de "5541999998888". */
export function telefoneLegivel(waPhone: string): string {
  const d = waPhone.replace(/\D/g, "");
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`;
}

/** Os nomes de empresas e pessoas de vários contatos, numa leitura só. */
export async function nomesDosContatos(tenantId: string, contatos: readonly ContatoParaNome[]) {
  const prisma = getPrisma();
  const companyIds = [...new Set(contatos.map((c) => c.companyId).filter((x): x is string => !!x))];
  const personIds = [...new Set(contatos.map((c) => c.personId).filter((x): x is string => !!x))];
  const [empresas, pessoas] = await Promise.all([
    companyIds.length
      ? prisma.company.findMany({ where: { tenantId, id: { in: companyIds } }, select: { id: true, name: true, displayName: true } })
      : [],
    personIds.length ? prisma.person.findMany({ where: { tenantId, id: { in: personIds } }, select: { id: true, name: true } }) : [],
  ]);
  const empresaPorId = new Map(empresas.map((e) => [e.id, nomeExibicao(e)]));
  const pessoaPorId = new Map(pessoas.map((p) => [p.id, p.name]));
  return (c: ContatoParaNome) => {
    const empresa = c.companyId ? (empresaPorId.get(c.companyId) ?? null) : null;
    const pessoa = c.personId ? (pessoaPorId.get(c.personId) ?? null) : null;
    const titulo = empresa ?? pessoa ?? c.nome ?? c.nomeNoWhatsapp ?? telefoneLegivel(c.waPhone);
    const subtitulo = empresa && pessoa ? pessoa : null;
    return { titulo, subtitulo, empresa, pessoa };
  };
}
