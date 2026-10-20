import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getActiveSectors, getSectorMaps } from "@/lib/sectors";
import { garantirAssuntosPadrao } from "@/lib/solicitacoes/assuntos";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Button } from "@/components/ui/Button";
import { StatusDot } from "@/components/shared/StatusDot";
import { AcoesDoAssunto } from "@/components/admin/AcoesDoAssunto";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { AssuntoForm } from "@/components/admin/AssuntoForm";
import { alternarAssunto, atualizarAssunto, criarAssunto } from "./actions";

/**
 * Os assuntos que o cliente escolhe ao abrir uma solicitação no portal (01/10).
 * Nascem com a lista padrão na primeira visita e são editados aqui.
 */
export default async function AssuntosPage({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  // Criar e editar no painel ao lado (escolha 2B, 20/10/2026) — ver `PainelDeCadastro`.
  const { novo, editar } = await searchParams;

  await garantirAssuntosPadrao(ctx.tenantId);
  const [assuntos, { labels }, ativos] = await Promise.all([
    getPrisma().serviceRequestSubject.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: "desc" }, { order: "asc" }, { label: "asc" }],
      include: { _count: { select: { requests: true } } },
    }),
    getSectorMaps(ctx.tenantId),
    getActiveSectors(ctx.tenantId),
  ]);
  const setores = ativos.map((s) => ({ value: s.code, label: s.label }));
  const emEdicao = editar ? assuntos.find((a) => a.id === editar) : undefined;

  return (
    <PageContainer>
      <PageHeader
        title="Assuntos das solicitações"
        subtitle="O que o cliente escolhe ao pedir algo pelo portal. Cada assunto diz o setor que atende e em quantos dias úteis a equipe responde."
        action={
          <Button href="/admin/assuntos?novo=1">
            <Plus size={14} /> Novo assunto
          </Button>
        }
      />

      <div className="bg-surface border border-border rounded-lg shadow-[var(--c41-shadow-xs)] divide-y divide-border">
        {assuntos.map((a) => (
          <div key={a.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${a.id === emEdicao?.id ? "bg-surface-hover" : ""}`}>
            <div className="min-w-0 flex-1 basis-72">
              {/* Inativo pela bolinha, a do ativo/inativo de cadastro (escolha 2A, 08/10/2026). */}
              <p className={`flex flex-wrap items-center gap-x-2.5 text-fs-4 font-semibold ${a.active ? "text-fg" : "text-fg-muted"}`}>
                {a.label} {!a.active && <StatusDot color="var(--c41-fg-muted)" label="Inativo" className="font-normal" />}
              </p>
              {a.description && <p className="text-fs-2 text-fg-muted mt-0.5">{a.description}</p>}
              <p className="text-fs-2 text-fg-secondary mt-1">
                {labels[a.sectorCode] ?? a.sectorCode} · responde em até {a.responseDays} {a.responseDays === 1 ? "dia útil" : "dias úteis"} ·{" "}
                {a._count.requests} {a._count.requests === 1 ? "solicitação" : "solicitações"}
              </p>
            </div>
            <AcoesDoAssunto id={a.id} nome={a.label} ativo={a.active} alternar={alternarAssunto.bind(null, a.id)} />
          </div>
        ))}
      </div>

      {novo === "1" && (
        <PainelDeCadastro titulo="Novo assunto" voltarPara="/admin/assuntos">
          <AssuntoForm action={criarAssunto} cancelHref="/admin/assuntos" setores={setores} />
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar assunto" voltarPara="/admin/assuntos">
          <AssuntoForm
            key={emEdicao.id}
            action={atualizarAssunto}
            cancelHref="/admin/assuntos"
            setores={setores}
            valores={{
              id: emEdicao.id,
              label: emEdicao.label,
              description: emEdicao.description,
              sectorCode: emEdicao.sectorCode,
              responseDays: emEdicao.responseDays,
            }}
          />
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
