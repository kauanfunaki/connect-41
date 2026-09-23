import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { formatCalendarDate } from "@/lib/format";
import { ApplyForm } from "@/components/carreiras/ApplyForm";
import { SimpleMarkdown } from "@/components/shared/SimpleMarkdown";
import { buildJobPostingJsonLd, buildJobSummary, publicUrl } from "@/lib/jobPostingSchema";
import { emitirCarimbo } from "@/lib/carreiras/antiRobo";
import { EtiquetasDaVaga } from "@/components/carreiras/EtiquetasDaVaga";
import { beneficiosDaVaga, localDaVaga, whereDoPrazo } from "@/lib/carreiras/portal";

// Dinâmica de propósito: o formulário leva um carimbo de tempo assinado na hora
// em que a página é montada (`src/lib/carreiras/antiRobo.ts`). Página em cache
// serviria o mesmo carimbo velho a todo mundo, e toda candidatura seria recusada.
export const dynamic = "force-dynamic";

// A vaga carregada é a mesma pro metadata e pro corpo — o Next dedupe as duas
// chamadas dentro do mesmo request, então não vira query dobrada.
async function loadVaga(slug: string, vagaId: string) {
  const prisma = getPrisma();
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, active: true },
  });
  if (!tenant || !tenant.active) return null;

  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, tenantId: tenant.id, isPublic: true, status: "ABERTA", ...whereDoPrazo(new Date()) },
    select: {
      id: true,
      title: true,
      quantity: true,
      openedAt: true,
      publicDescription: true,
      salaryMin: true,
      salaryMax: true,
      showSalary: true,
      workMode: true,
      contractType: true,
      benefits: true,
      applicationDeadline: true,
      workCity: true,
      workStateCode: true,
      company: { select: { tradeName: true, name: true, city: true, stateCode: true } },
      cargo: { select: { name: true } },
    },
  });
  if (!vaga) return null;

  return { tenant, vaga };
}

// Antes era `{ title: "Vaga" }` fixo: toda vaga compartilhada no WhatsApp/
// LinkedIn aparecia como "Vaga", sem descrição, e o Google não tinha o que
// indexar.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; vagaId: string }>;
}): Promise<Metadata> {
  const { slug, vagaId } = await params;
  const data = await loadVaga(slug, vagaId);
  if (!data) return { title: "Vaga não encontrada" };

  const { tenant, vaga } = data;
  const companyLabel = vaga.company.tradeName || vaga.company.name;
  const onde = localDaVaga(vaga);
  const local = [onde.cidade, onde.uf].filter(Boolean).join(" – ") || null;
  const title = `${vaga.title} — ${companyLabel}`;
  const description = buildJobSummary(vaga.title, companyLabel, local, vaga.publicDescription);
  const url = publicUrl(`/carreiras/${slug}/${vaga.id}`);

  return {
    title,
    description,
    ...(url ? { alternates: { canonical: url } } : {}),
    openGraph: {
      type: "website",
      title,
      description,
      ...(url ? { url } : {}),
      siteName: `Trabalhe Conosco — ${tenant.name}`,
      locale: "pt_BR",
    },
    twitter: { card: "summary", title, description },
  };
}

export default async function VagaPublicaPage({
  params,
}: {
  params: Promise<{ slug: string; vagaId: string }>;
}) {
  const { slug, vagaId } = await params;
  const data = await loadVaga(slug, vagaId);
  if (!data) notFound();
  const { tenant, vaga } = data;

  const companyLabel = vaga.company.tradeName || vaga.company.name;
  const onde = localDaVaga(vaga);
  const local = [onde.cidade, onde.uf].filter(Boolean).join(" – ");
  const beneficios = beneficiosDaVaga(vaga.benefits);
  const salaryMin = vaga.salaryMin === null ? null : vaga.salaryMin.toNumber();
  const salaryMax = vaga.salaryMax === null ? null : vaga.salaryMax.toNumber();

  const jsonLd = buildJobPostingJsonLd({
    title: vaga.title,
    description: vaga.publicDescription?.trim() || `Vaga de ${vaga.title} na ${companyLabel}.`,
    datePosted: vaga.openedAt,
    validThrough: vaga.applicationDeadline,
    companyName: companyLabel,
    city: onde.cidade,
    stateCode: onde.uf,
    quantity: vaga.quantity,
    contractType: vaga.contractType,
    remoto: vaga.workMode === "REMOTO",
    salario: vaga.showSalary ? { min: salaryMin, max: salaryMax } : null,
  });

  return (
    <div className="min-h-screen py-10 px-4">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <div className="max-w-2xl mx-auto">
        <Link href={`/carreiras/${slug}`} className="text-[12px] text-fg-muted hover:text-fg transition-colors">
          ← Todas as vagas
        </Link>

        <header className="mt-4 mb-6">
          <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">{vaga.title}</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            {companyLabel}
            {local && ` · ${local}`}
            {vaga.cargo && ` · ${vaga.cargo.name}`}
            {vaga.quantity > 1 && ` · ${vaga.quantity} vagas`}
          </p>
          <div className="mt-3">
            <EtiquetasDaVaga
              workMode={vaga.workMode}
              contractType={vaga.contractType}
              salaryMin={salaryMin}
              salaryMax={salaryMax}
              showSalary={vaga.showSalary}
            />
          </div>
          <p className="text-[11px] text-fg-muted mt-2">
            Publicada em {formatCalendarDate(vaga.openedAt)}
            {vaga.applicationDeadline && (
              <> · <strong className="font-medium text-fg-secondary">inscrições até {formatCalendarDate(vaga.applicationDeadline)}</strong></>
            )}
          </p>
        </header>

        {vaga.publicDescription && (
          <div className="bg-surface border border-border rounded-lg p-5 mb-6">
            <SimpleMarkdown text={vaga.publicDescription} className="text-[13.5px] text-fg leading-relaxed" />
          </div>
        )}

        {beneficios.length > 0 && (
          <div className="bg-surface border border-border rounded-lg p-5 mb-6">
            <h2 className="text-[14px] font-semibold text-fg mb-2">Benefícios</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
              {beneficios.map((b) => (
                <li key={b} className="text-[13px] text-fg flex items-start gap-2">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Card className="p-5">
          <h2 className="text-[15px] font-semibold text-fg mb-4">Candidatar-se</h2>
          <ApplyForm slug={slug} vagaId={vaga.id} carimbo={emitirCarimbo(new Date())} />
        </Card>

        <p className="text-[11px] text-fg-muted mt-6 text-center">
          Processo seletivo conduzido por {tenant.name}.
        </p>
      </div>
    </div>
  );
}
