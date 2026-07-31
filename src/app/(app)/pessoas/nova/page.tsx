import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { Briefcase, Building2, ChevronRight } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { PessoaForm } from "@/components/pessoas/PessoaForm";
import { criarPessoa } from "../actions";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { canViewSensitiveField } from "@/lib/auth/sensitiveFields";

// O tipo (interno x cliente) é escolhido ANTES do formulário: os dois pedem
// campos bem diferentes (colaborador tem CTPS, jornada e folha; contato de
// cliente não), e descobrir isso só no meio do preenchimento — via um checkbox
// perdido na primeira etapa — fazia todo mundo cadastrar tudo como a mesma
// coisa. Sem `tipo` na URL, a página é o seletor.
export default async function NovaPessoaPage({
  searchParams,
}: {
  searchParams: Promise<{ internal?: string; tipo?: string }>;
}) {
  const { internal, tipo } = await searchParams;
  const ctx = await getAuthContext();
  if (!canWrite(ctx.role)) notFound();

  // ?internal=1 continua valendo — é o link da aba "Internos" e de favoritos antigos.
  const kind = tipo === "interno" || internal === "1" ? "interno" : tipo === "cliente" ? "cliente" : null;

  if (kind === null) {
    return (
      <PageContainer variant="narrow">
        <BackButton className="mb-3" />
      <PageHeader title="Nova Pessoa" />
        <p className="text-[length:var(--fs-helper)] text-fg-muted mb-6">
          Que tipo de cadastro é este? O formulário muda conforme a escolha.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TipoCard
            href="/pessoas/nova?tipo=interno"
            icon={<Briefcase size={20} />}
            title="Funcionário interno"
            description="Colaborador da 41, com vínculo empregatício: admissão, jornada, CTPS, folha e conta de acesso ao Connect."
          />
          <TipoCard
            href="/pessoas/nova?tipo=cliente"
            icon={<Building2 size={20} />}
            title="Cliente / contato"
            description="Pessoa ligada a uma empresa cliente — sócio, responsável ou contato. Sem dados de folha."
          />
        </div>
      </PageContainer>
    );
  }

  const prisma = getPrisma();
  const [companies, cargos, departments, canEditSensitive] = await Promise.all([
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.cargo.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    prisma.department.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, companyId: true },
    }),
    canViewSensitiveField(ctx, "DADOS_BANCARIOS"),
  ]);

  return (
    <PageContainer>
      <div className="flex items-center gap-2 mb-6">
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Cadastros
        </Link>
        <span className="text-fg-muted">/</span>
        <Link href="/pessoas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Pessoas
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">Nova Pessoa</span>
      </div>

      <BackButton className="mb-3" />
      <PageHeader title={kind === "interno" ? "Novo Funcionário Interno" : "Novo Cliente / Contato"} />

      <PessoaForm
        action={criarPessoa}
        cancelHref={kind === "interno" ? "/pessoas?tab=internos" : "/pessoas"}
        companies={companies}
        cargos={cargos}
        departments={departments}
        canEditSensitive={canEditSensitive}
        defaultIsInternal={kind === "interno"}
      />
    </PageContainer>
  );
}

function TipoCard({
  href, icon, title, description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 bg-surface border border-border rounded-lg p-5 hover:border-brand transition-colors"
    >
      <span className="inline-flex w-10 h-10 rounded-lg bg-brand-subtle text-brand items-center justify-center">
        {icon}
      </span>
      <span className="flex items-center gap-1 text-[length:var(--fs-card-title)] font-semibold text-fg">
        {title}
        <ChevronRight size={16} className="text-fg-muted group-hover:text-brand group-hover:translate-x-0.5 transition-all" />
      </span>
      <span className="text-[length:var(--fs-helper)] text-fg-muted leading-relaxed">{description}</span>
    </Link>
  );
}
