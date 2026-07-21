// Vínculo entre contato do Chatwoot e Pessoa/Empresa do Connect. Ver
// docs/CHATWOOT_INTEGRATION_FEASIBILITY.md §14 para a política completa.
//
// IMPORTANTE: nunca vincula automaticamente em caso de ambiguidade (mais de um
// candidato) — isso fica marcado ASSISTED, para confirmação manual do usuário.
import type { PrismaClient } from "@/generated/prisma/client";

export function normalizeEmail(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

// Normalização E.164 simplificada para números brasileiros (únicos vistos até
// hoje nos dados do tenant) — não tenta ser uma libphonenumber completa.
// Regras: remove tudo que não é dígito; se já começa com 55 e tem 12-13
// dígitos, assume que já é BR com DDI; se tem 10-11 dígitos, prefixa +55.
// Números de outros países ficam sem normalizar (retorna null) — comparar
// literal seria enganoso, melhor cair em vínculo manual/assistido.
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `+${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `+55${digits}`;
  }
  return null;
}

export type ContactMatchCandidate = { personId?: string; companyId?: string; matchedBy: "email" | "phone" };

// Resolve candidatos por e-mail/telefone normalizado dentro do tenant. Nunca
// decide sozinho quando há mais de um candidato — quem chama (sync.ts /
// webhook handler) decide entre MANUAL/EMAIL/PHONE (1 candidato) ou ASSISTED
// (0 ou 2+ candidatos, ambíguo).
export async function findLinkCandidates(
  prisma: PrismaClient,
  tenantId: string,
  contact: { email?: string | null; phone?: string | null }
): Promise<ContactMatchCandidate[]> {
  const email = normalizeEmail(contact.email);
  const phone = normalizePhoneBR(contact.phone);
  const candidates: ContactMatchCandidate[] = [];

  if (email) {
    const [people, companies] = await Promise.all([
      prisma.person.findMany({ where: { tenantId, email: { equals: email } }, select: { id: true } }),
      prisma.company.findMany({ where: { tenantId, email: { equals: email } }, select: { id: true } }),
    ]);
    for (const p of people) candidates.push({ personId: p.id, matchedBy: "email" });
    for (const c of companies) candidates.push({ companyId: c.id, matchedBy: "email" });
  }

  if (candidates.length === 0 && phone) {
    // Telefone salvo no Connect não é garantidamente E.164 — comparação é
    // best-effort via sufixo dos dígitos (mesmo DDD+número, ignorando DDI/máscara).
    const localDigits = phone.replace(/^\+55/, "");
    const [people, companies] = await Promise.all([
      prisma.person.findMany({ where: { tenantId, phone: { not: null } }, select: { id: true, phone: true } }),
      prisma.company.findMany({ where: { tenantId, phone: { not: null } }, select: { id: true, phone: true } }),
    ]);
    for (const p of people) {
      if (p.phone && p.phone.replace(/\D/g, "").endsWith(localDigits)) candidates.push({ personId: p.id, matchedBy: "phone" });
    }
    for (const c of companies) {
      if (c.phone && c.phone.replace(/\D/g, "").endsWith(localDigits)) candidates.push({ companyId: c.id, matchedBy: "phone" });
    }
  }

  return candidates;
}

export type ResolvedLink =
  | { linkMethod: "EMAIL" | "PHONE"; personId?: string; companyId?: string; linkConfidence: number }
  | { linkMethod: "ASSISTED"; personId?: undefined; companyId?: undefined; linkConfidence: null }
  | { linkMethod: "UNLINKED"; personId?: undefined; companyId?: undefined; linkConfidence: null };

export function resolveLink(candidates: ContactMatchCandidate[]): ResolvedLink {
  if (candidates.length === 0) return { linkMethod: "UNLINKED", linkConfidence: null };
  if (candidates.length > 1) return { linkMethod: "ASSISTED", linkConfidence: null };

  const only = candidates[0]!;
  return {
    linkMethod: only.matchedBy === "email" ? "EMAIL" : "PHONE",
    personId: only.personId,
    companyId: only.companyId,
    linkConfidence: only.matchedBy === "email" ? 90 : 70,
  };
}
