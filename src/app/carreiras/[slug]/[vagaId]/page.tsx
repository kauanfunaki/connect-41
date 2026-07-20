import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { formatCalendarDate } from "@/lib/format";
import { ApplyForm } from "@/components/carreiras/ApplyForm";

export const metadata = { title: "Vaga" };

export default async function VagaPublicaPage({
  params,
}: {
  params: Promise<{ slug: string; vagaId: string }>;
}) {
  const { slug, vagaId } = await params;
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, active: true },
  });
  if (!tenant || !tenant.active) notFound();

  const vaga = await prisma.vaga.findFirst({
    where: { id: vagaId, tenantId: tenant.id, isPublic: true, status: "ABERTA" },
    select: {
      id: true,
      title: true,
      quantity: true,
      openedAt: true,
      publicDescription: true,
      company: { select: { tradeName: true, name: true, city: true, stateCode: true } },
      cargo: { select: { name: true } },
    },
  });
  if (!vaga) notFound();

  const companyLabel = vaga.company.tradeName || vaga.company.name;
  const local = [vaga.company.city, vaga.company.stateCode].filter(Boolean).join(" – ");

  return (
    <div className="min-h-screen py-10 px-4">
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
          <p className="text-[11px] text-fg-muted mt-1">Publicada em {formatCalendarDate(vaga.openedAt)}</p>
        </header>

        {vaga.publicDescription && (
          <div className="bg-surface border border-border rounded-lg p-5 mb-6">
            <p className="text-[13.5px] text-fg leading-relaxed whitespace-pre-wrap">{vaga.publicDescription}</p>
          </div>
        )}

        <div className="bg-surface border border-border rounded-lg p-5">
          <h2 className="text-[15px] font-semibold text-fg mb-4">Candidatar-se</h2>
          <ApplyForm slug={slug} vagaId={vaga.id} />
        </div>

        <p className="text-[11px] text-fg-muted mt-6 text-center">
          Processo seletivo conduzido por {tenant.name}.
        </p>
      </div>
    </div>
  );
}
