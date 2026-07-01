import Link from "next/link";
import { getPrisma } from "@/lib/prisma";
import { getSectorMaps } from "@/lib/sectors";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedPipelineWhere } from "@/lib/auth/scope";

export default async function PipelinesPage() {
  const ctx = await getAuthContext();
  const canCreate = canWrite(ctx.role);
  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);

  const prisma = getPrisma();
  const pipelines = await prisma.pipeline.findMany({
    where: scopedPipelineWhere(ctx),
    orderBy: [{ sectorCode: "asc" }, { name: "asc" }],
    include: { _count: { select: { items: true } } },
  });

  const grouped = pipelines.reduce<Record<string, typeof pipelines>>((acc, p) => {
    (acc[p.sectorCode] ??= []).push(p);
    return acc;
  }, {});

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[20px] font-semibold text-fg tracking-[-0.01em]">Pipelines</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {pipelines.length} pipeline{pipelines.length !== 1 ? "s" : ""} configurado{pipelines.length !== 1 ? "s" : ""}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/pipelines/novo"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
          >
            + Novo Pipeline
          </Link>
        )}
      </div>

      {pipelines.length === 0 ? (
        <div className="bg-surface border border-border rounded-lg py-16 text-center text-[13px] text-fg-muted">
          Nenhum pipeline cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([sectorCode, list]) => (
            <div key={sectorCode}>
              <div className="flex items-center gap-2 mb-3">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: sectorColors[sectorCode] ?? "#586577" }}
                />
                <h2 className="text-[13px] font-medium text-fg">
                  {sectorLabels[sectorCode] ?? sectorCode}
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {list.map((p) => (
                  <Link
                    key={p.id}
                    href={`/pipelines/${p.id}`}
                    className="bg-surface border border-border rounded-lg p-4 hover:border-border-strong transition-colors"
                  >
                    <p className="text-[13px] font-medium text-fg mb-1">{p.name}</p>
                    <p className="text-[12px] text-fg-muted">
                      {p._count.items} item{p._count.items !== 1 ? "s" : ""} ·{" "}
                      {p.entityType === "COMPANY" ? "Empresas" : "Pessoas"}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
