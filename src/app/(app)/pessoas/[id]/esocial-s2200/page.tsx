import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { getAuthContext } from "@/lib/auth/context";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { buildS2200Preview } from "@/lib/esocialS2200";
import { formatCalendarDate } from "@/lib/format";

export default async function EsocialS2200Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();
  const canViewSalary = await canViewSensitiveField(ctx, "SALARIO");

  const prisma = getPrisma();
  const person = await prisma.person.findFirst({
    where: { id, type: "COLABORADOR", ...(await scopedPersonWhere(ctx)) },
    include: { cargo: { select: { name: true } } },
  });
  if (!person) notFound();

  const dependentes = await prisma.dependente.findMany({
    where: { personId: id, tenantId: ctx.tenantId },
    orderBy: { createdAt: "asc" },
  });

  const preview = buildS2200Preview({
    cpf: person.cpf,
    name: person.name,
    birthDate: person.birthDate,
    rg: person.rg,
    pis: person.pis,
    ctps: person.ctps,
    ctpsSerie: person.ctpsSerie,
    zipCode: person.zipCode,
    addressStreet: person.addressStreet,
    addressNumber: person.addressNumber,
    addressComplement: person.addressComplement,
    neighborhood: person.neighborhood,
    city: person.city,
    stateCode: person.stateCode,
    admissionDate: person.admissionDate,
    cargoName: person.cargo?.name ?? null,
    salary: person.currentSalary?.toString() ?? null,
    workShift: person.workShift,
    weeklyWorkHours: person.weeklyWorkHours?.toString() ?? null,
    includeSalary: canViewSalary,
    dependentes: dependentes.map((d) => ({
      name: d.name,
      relationship: d.relationship,
      birthDate: d.birthDate,
      cpf: d.cpf,
      isIRDependent: d.isIRDependent,
      isSalarioFamilia: d.isSalarioFamilia,
    })),
  });

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Pessoas</Link>
        <span className="text-fg-muted">/</span>
        <Link href={`/pessoas/${id}`} className="text-[13px] text-fg-muted hover:text-fg transition-colors truncate max-w-[200px]">
          {person.name}
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">eSocial S-2200</span>
      </div>

      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">eSocial S-2200 — rascunho</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Cadastramento Inicial do Vínculo e Admissão. Mapeamento dos dados coletados para conferência.
        </p>
      </div>

      {/* Aviso honesto: não é transmissão oficial */}
      <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 mb-4">
        <p className="text-[12px] text-fg">
          <strong>Rascunho para conferência.</strong> Esta tela não gera XML, não assina e não transmite ao eSocial —
          a transmissão oficial continua no software de folha da empresa. Serve para verificar, a partir dos dados da
          admissão, o que já está preenchido e o que ainda falta para o S-2200.
        </p>
      </div>

      {/* Resumo de completude */}
      <div className="flex items-center gap-3 mb-4">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium bg-success/10 text-success border border-success/25">
          {preview.filledCount} preenchido{preview.filledCount !== 1 ? "s" : ""}
        </span>
        {preview.pendingCount > 0 && (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[12px] font-medium bg-warning/10 text-warning border border-warning/25">
            {preview.pendingCount} pendente{preview.pendingCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      <div className="space-y-4">
        {preview.groups.map((g) => (
          <div key={g.title} className="bg-surface border border-border rounded-lg p-5">
            <h2 className="text-[14px] font-semibold text-fg mb-4">{g.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
              {g.fields.map((f) => (
                <div key={f.label}>
                  <p className="text-[10px] text-fg-muted mb-0.5">
                    {f.label} <span className="text-fg-muted/60">· {f.ref}</span>
                  </p>
                  {f.restricted ? (
                    <p className="text-[13px] text-fg-muted italic">Sem permissão para ver</p>
                  ) : f.value ? (
                    <p className="text-[13px] text-fg">{f.value}</p>
                  ) : (
                    <p className="text-[13px] text-warning">Pendente</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Dependentes */}
        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-fg mb-4">Dependentes</h2>
          {preview.dependentes.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nenhum dependente informado.</p>
          ) : (
            <div className="divide-y divide-border">
              {preview.dependentes.map((d, i) => (
                <div key={i} className="py-2.5">
                  <p className="text-[13px] text-fg">{d.nome}</p>
                  <p className="text-[11px] text-fg-muted mt-0.5">
                    {d.tpDep}
                    {d.nascimento && ` · nasc. ${d.nascimento}`}
                    {d.cpf && ` · CPF ${d.cpf}`}
                    {d.irrf && " · IRRF"}
                    {d.sf && " · salário-família"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-fg-muted mt-4">
        Admissão {person.admissionDate ? `em ${formatCalendarDate(person.admissionDate)}` : "sem data registrada"}.
        Campos pendentes precisam ser preenchidos na ficha antes da geração oficial do evento.
      </p>
    </PageContainer>
  );
}
