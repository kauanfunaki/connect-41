import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { formatCalendarDate } from "@/lib/format";

export const metadata = { title: "Vagas abertas" };

export default async function CarreirasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const prisma = getPrisma();

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, logoUrl: true, active: true },
  });
  if (!tenant || !tenant.active) notFound();

  const vagas = await prisma.vaga.findMany({
    where: { tenantId: tenant.id, isPublic: true, status: "ABERTA" },
    select: {
      id: true,
      title: true,
      quantity: true,
      openedAt: true,
      publicDescription: true,
      company: { select: { tradeName: true, name: true, city: true, stateCode: true } },
      cargo: { select: { name: true } },
    },
    orderBy: { openedAt: "desc" },
  });

  return (
    <div className="min-h-screen py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <header className="mb-8 text-center">
          {tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="" className="h-12 mx-auto mb-4 object-contain" />
          )}
          <h1 className="text-[22px] font-semibold text-fg tracking-[-0.01em]">Trabalhe Conosco</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            Vagas abertas — {tenant.name}
          </p>
        </header>

        {vagas.length === 0 ? (
          <div className="bg-surface border border-border rounded-lg p-8 text-center">
            <p className="text-[14px] text-fg">Nenhuma vaga aberta no momento.</p>
            <p className="text-[12px] text-fg-muted mt-1">Volte em breve — novas oportunidades aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vagas.map((v) => {
              const companyLabel = v.company.tradeName || v.company.name;
              const local = [v.company.city, v.company.stateCode].filter(Boolean).join(" – ");
              return (
                <Link
                  key={v.id}
                  href={`/carreiras/${slug}/${v.id}`}
                  className="block bg-surface border border-border rounded-lg p-5 hover:border-border-strong hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-[15px] font-semibold text-fg">{v.title}</h2>
                      <p className="text-[12px] text-fg-muted mt-0.5">
                        {companyLabel}
                        {local && ` · ${local}`}
                        {v.cargo && ` · ${v.cargo.name}`}
                      </p>
                    </div>
                    {v.quantity > 1 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-brand/10 text-brand border-brand/25 flex-shrink-0">
                        {v.quantity} vagas
                      </span>
                    )}
                  </div>
                  {v.publicDescription && (
                    <p className="text-[12.5px] text-fg-muted mt-2 line-clamp-2">{v.publicDescription}</p>
                  )}
                  <p className="text-[11px] text-fg-muted mt-2">Publicada em {formatCalendarDate(v.openedAt)}</p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
