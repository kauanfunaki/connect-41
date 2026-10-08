import { PageHeader } from "@/components/ui/PageHeader";
import { PessoaBreadcrumb } from "@/components/pessoas/PessoaBreadcrumb";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { BackButton } from "@/components/shared/BackButton";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { scopedPersonWhere } from "@/lib/auth/scope";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";
import { buildS2200Preview } from "@/lib/esocialS2200";
import { formatCalendarDate, formatarNumero } from "@/lib/format";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CheckCircle2, CircleDashed } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";

export default async function EsocialS2200Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { ctx } = await abrirTelaDoModulo("dp_colaboradores");
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
      <PessoaBreadcrumb
        isInternal={person.isInternal}
        personId={id}
        personName={person.name}
        atual="eSocial S-2200"
      />
      <BackButton className="mb-3" />

      <PageHeader
        title="eSocial S-2200 — rascunho"
        subtitle="Cadastramento Inicial do Vínculo e Admissão. Mapeamento dos dados coletados para conferência."
      />

      {/* Aviso honesto: não é transmissão oficial */}
      <Aviso tom="atencao" className="mb-4">
        <p className="text-fg">
          <strong>Rascunho para conferência.</strong> Esta tela não gera XML, não assina e não transmite ao eSocial —
          a transmissão oficial continua no software de folha da empresa. Serve para verificar, a partir dos dados da
          admissão, o que já está preenchido e o que ainda falta para o S-2200.
        </p>
      </Aviso>

      {/* Resumo de completude — eram dois selos soltos (até 30/09); viraram
          os cartões de total. */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: `Campo${preview.filledCount !== 1 ? "s" : ""} preenchido${preview.filledCount !== 1 ? "s" : ""}`,
            valor: formatarNumero(preview.filledCount, 0),
            icone: <CheckCircle2 />,
            tom: "text-success",
          },
          {
            rotulo: `Campo${preview.pendingCount !== 1 ? "s" : ""} pendente${preview.pendingCount !== 1 ? "s" : ""}`,
            valor: formatarNumero(preview.pendingCount, 0),
            icone: <CircleDashed />,
            tom: preview.pendingCount > 0 ? "text-warning" : "text-fg-muted",
          },
        ]}
      />

      <div className="space-y-4">
        {preview.groups.map((g) => (
          // Mesma grade de rótulo/valor da ficha de pessoa (30/09): rótulo de
          // 11px e valor de 13px aqui, 13/15 lá — a mesma informação parecia
          // de outro tamanho. Três colunas no desktop.
          <Card key={g.title} className="p-5">
            <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">{g.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
              {g.fields.map((f) => (
                <div key={f.label} className="min-w-0">
                  <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">
                    {f.label} <span className="text-fg-muted/60">· {f.ref}</span>
                  </p>
                  {f.restricted ? (
                    <p className="text-[length:var(--fs-body)] text-fg-muted italic">Sem permissão para ver</p>
                  ) : f.value ? (
                    <p className="text-[length:var(--fs-body)] text-fg break-words">{f.value}</p>
                  ) : (
                    <p className="text-[length:var(--fs-body)] text-warning">Pendente</p>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}

        {/* Dependentes */}
        <Card className="p-5">
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Dependentes</h2>
          {preview.dependentes.length === 0 ? (
            <p className="text-[length:var(--fs-helper)] text-fg-muted">Nenhum dependente informado.</p>
          ) : (
            <div className="divide-y divide-border">
              {preview.dependentes.map((d, i) => (
                <div key={i} className="py-2.5">
                  <p className="text-[length:var(--fs-body)] text-fg">{d.nome}</p>
                  <p className="text-[length:var(--fs-helper)] text-fg-muted mt-0.5">
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
        </Card>
      </div>

      <p className="text-[length:var(--fs-helper)] text-fg-muted mt-4">
        Admissão {person.admissionDate ? `em ${formatCalendarDate(person.admissionDate)}` : "sem data registrada"}.
        Campos pendentes precisam ser preenchidos na ficha antes da geração oficial do evento.
      </p>
    </PageContainer>
  );
}
