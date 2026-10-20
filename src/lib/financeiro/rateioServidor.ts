// O rateio da conta no banco (lote D, 20/10): a conferência das linhas contra
// os cadastros da empresa, a leitura e a gravação. As regras moram em
// `rateio.ts`.

import { getPrisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { centavosDeDecimal } from "./contas";
import { decimalDeCentavos } from "./manual";
import { ondeDaEmpresa } from "./planoDeContas";
import { resumoDoRateio, validarRateio, type LinhaDoRateio } from "./rateio";

type Cliente = Prisma.TransactionClient | ReturnType<typeof getPrisma>;

/**
 * Confere as linhas no banco e devolve o resumo que a conta guarda. A
 * categoria tem de valer no plano da empresa para o tipo da conta; centro e
 * projeto, ser da empresa. Inativo não se escolhe — o que a conta já tinha no
 * rateio pode ficar (`atuais`), como na edição de uma conta.
 */
export async function conferirRateio(p: {
  tenantId: string;
  companyId: string;
  kind: "PAGAR" | "RECEBER";
  linhas: LinhaDoRateio[];
  totalCentavos: number;
  atuais?: LinhaDoRateio[];
}): Promise<{ ok: true; resumo: ReturnType<typeof resumoDoRateio> } | { ok: false; erro: string }> {
  const v = validarRateio(p.linhas, p.totalCentavos);
  if (!v.ok) return v;
  const prisma = getPrisma();
  const unicos = (f: (l: LinhaDoRateio) => string | null) => [...new Set(p.linhas.map(f).filter((x): x is string => x !== null))];
  const ja = (f: (l: LinhaDoRateio) => string | null) => new Set((p.atuais ?? []).map(f).filter(Boolean));
  const [categorias, centros, projetos] = await Promise.all([
    prisma.financeCategory.findMany({
      where: { id: { in: unicos((l) => l.categoriaId) }, ...ondeDaEmpresa(p.tenantId, p.companyId, { kind: p.kind, apenasAtivas: false }) },
      select: { id: true, name: true, active: true },
    }),
    prisma.costCenter.findMany({
      where: { id: { in: unicos((l) => l.centroId) }, tenantId: p.tenantId, companyId: p.companyId },
      select: { id: true, name: true, active: true },
    }),
    prisma.financeProject.findMany({
      where: { id: { in: unicos((l) => l.projetoId) }, tenantId: p.tenantId, companyId: p.companyId },
      select: { id: true, name: true, active: true },
    }),
  ]);
  const conferir = (
    ids: string[],
    achados: { id: string; name: string; active: boolean }[],
    atuais: Set<string | null>,
    nome: { naoAchou: string; inativo: (n: string) => string }
  ): string | null => {
    const porId = new Map(achados.map((a) => [a.id, a]));
    for (const id of ids) {
      const a = porId.get(id);
      if (!a) return nome.naoAchou;
      if (!a.active && !atuais.has(id)) return nome.inativo(a.name);
    }
    return null;
  };
  const erro =
    conferir(unicos((l) => l.categoriaId), categorias, ja((l) => l.categoriaId), {
      naoAchou: "Categoria do rateio não encontrada no plano desta empresa para este tipo de conta.",
      inativo: (n) => `A categoria "${n}" está inativa — escolha outra no rateio.`,
    }) ??
    conferir(unicos((l) => l.centroId), centros, ja((l) => l.centroId), {
      naoAchou: "Centro de custo do rateio não encontrado nesta empresa.",
      inativo: (n) => `O centro "${n}" está inativo — escolha outro no rateio.`,
    }) ??
    conferir(unicos((l) => l.projetoId), projetos, ja((l) => l.projetoId), {
      naoAchou: "Projeto do rateio não encontrado nesta empresa.",
      inativo: (n) => `O projeto "${n}" está inativo — escolha outro no rateio.`,
    });
  if (erro) return { ok: false, erro };
  return { ok: true, resumo: resumoDoRateio(p.linhas) };
}

/** Troca as linhas do rateio da conta pelas novas — nenhuma, para tirar o rateio. */
export async function gravarRateio(tx: Cliente, p: { tenantId: string; entryId: string; linhas: LinhaDoRateio[] }): Promise<void> {
  await tx.financeEntryAllocation.deleteMany({ where: { entryId: p.entryId, tenantId: p.tenantId } });
  if (p.linhas.length === 0) return;
  await tx.financeEntryAllocation.createMany({
    data: p.linhas.map((l, i) => ({
      tenantId: p.tenantId,
      entryId: p.entryId,
      position: i,
      categoryId: l.categoriaId,
      costCenterId: l.centroId,
      projectId: l.projetoId,
      amount: decimalDeCentavos(l.centavos),
    })),
  });
}

/** As linhas do rateio de uma conta, na ordem em que foram montadas. Vazio: sem rateio. */
export async function rateioDaConta(tenantId: string, entryId: string): Promise<LinhaDoRateio[]> {
  const linhas = await getPrisma().financeEntryAllocation.findMany({
    where: { tenantId, entryId },
    select: { categoryId: true, costCenterId: true, projectId: true, amount: true },
    orderBy: { position: "asc" },
  });
  return linhas.map((l) => ({ categoriaId: l.categoryId, centroId: l.costCenterId, projetoId: l.projectId, centavos: centavosDeDecimal(l.amount) }));
}
