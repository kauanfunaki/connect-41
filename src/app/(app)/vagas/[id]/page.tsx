import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { VagaStatus, VagaPrioridade } from "@/generated/prisma/enums";
import { getAuthContext, canManageSector, canActOnSector } from "@/lib/auth/context";
import { scopedVagaWhere } from "@/lib/auth/scope";
import { getSectorMaps } from "@/lib/sectors";
import { DeleteButton } from "@/components/pessoas/DeleteButton";
import { AddCandidatoForm } from "@/components/vagas/AddCandidatoForm";
import { CandidaturaRow } from "@/components/vagas/CandidaturaRow";
import { formatInstantDate } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { excluirVaga, encerrarVaga } from "../actions";
import { adicionarCandidato, atualizarStatusCandidatura, removerCandidatura } from "./actions";

const STATUS_LABEL: Record<VagaStatus, string> = {
  ABERTA:       "Aberta",
  EM_ANDAMENTO: "Em andamento",
  ENCERRADA:    "Encerrada",
  CANCELADA:    "Cancelada",
};

const PRIORITY_LABEL: Record<VagaPrioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA:  "Alta",
};

export default async function VagaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getAuthContext();

  const prisma = getPrisma();
  const vaga = await prisma.vaga.findFirst({
    where: { id, ...scopedVagaWhere(ctx) },
    include: {
      company: { select: { id: true, name: true } },
      cargo: { select: { id: true, name: true } },
      candidaturas: {
        orderBy: { createdAt: "desc" },
        include: { person: { select: { id: true, name: true } } },
      },
    },
  });
  if (!vaga) notFound();

  const canManage = canManageSector(ctx, vaga.sectorCode);
  const canAct = canActOnSector(ctx, vaga.sectorCode);
  const { labels: sectorLabels } = await getSectorMaps(ctx.tenantId);

  const linkedPersonIds = new Set(vaga.candidaturas.map((c) => c.personId));
  const candidatos = await prisma.person.findMany({
    where: { tenantId: ctx.tenantId, type: "CANDIDATO", active: true, id: { notIn: [...linkedPersonIds] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const deleteAction = excluirVaga.bind(null, id);
  const encerrarAction = encerrarVaga.bind(null, id);
  const addCandidatoAction = adicionarCandidato.bind(null, id);

  return (
    <PageContainer variant="narrow">
      <div className="flex items-center gap-2 mb-6">
        <Link href="/vagas" className="text-[13px] text-fg-muted hover:text-fg transition-colors">Vagas</Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg truncate">{vaga.title}</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">{vaga.title}</h1>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-surface-2 text-fg-secondary border-border">
              {STATUS_LABEL[vaga.status]}
            </span>
          </div>
          <p className="text-[13px] text-fg-muted">
            {vaga.company.name} · {sectorLabels[vaga.sectorCode] ?? vaga.sectorCode}
          </p>
        </div>

        {canManage && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <Link
              href={`/vagas/${id}/editar`}
              className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors inline-flex items-center"
            >
              Editar
            </Link>
            {vaga.status !== "ENCERRADA" && (
              <form action={encerrarAction}>
                <button
                  type="submit"
                  className="h-8 px-3 rounded-md border border-border text-[12px] font-medium text-fg-secondary hover:text-fg hover:bg-surface-2 transition-colors"
                >
                  Encerrar Vaga
                </button>
              </form>
            )}
            <DeleteButton action={deleteAction} nome={vaga.title} />
          </div>
        )}
      </div>

      {/* Detalhes */}
      <div className="bg-surface border border-border rounded-lg p-5 mb-4">
        <h2 className="text-[14px] font-semibold text-fg mb-4">Detalhes</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <InfoRow label="Cargo" value={vaga.cargo?.name} />
          <InfoRow label="Quantidade" value={String(vaga.quantity)} />
          <InfoRow label="Prioridade" value={PRIORITY_LABEL[vaga.priority]} />
          <InfoRow
            label="Aberta em"
            value={formatInstantDate(vaga.openedAt, { day: "2-digit", month: "long", year: "numeric" })}
          />
          {vaga.closedAt && (
            <InfoRow
              label="Encerrada em"
              value={formatInstantDate(vaga.closedAt, { day: "2-digit", month: "long", year: "numeric" })}
            />
          )}
        </div>
        {vaga.notes && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[10px] text-fg-muted mb-0.5">Observações</p>
            <p className="text-[13px] text-fg whitespace-pre-wrap">{vaga.notes}</p>
          </div>
        )}
      </div>

      {/* Candidatos */}
      <div className="bg-surface border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-fg">
            Candidatos ({vaga.candidaturas.length})
          </h2>
          {canAct && (
            <Link href="/candidatos/nova" className="text-[12px] text-brand hover:underline">
              + Novo Candidato
            </Link>
          )}
        </div>

        {vaga.candidaturas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">Nenhum candidato vinculado ainda.</p>
        ) : (
          <div>
            {vaga.candidaturas.map((c) => (
              <CandidaturaRow
                key={c.id}
                candidatura={{
                  id: c.id,
                  status: c.status,
                  origin: c.origin,
                  personId: c.person.id,
                  personName: c.person.name,
                }}
                updateAction={atualizarStatusCandidatura.bind(null, c.id)}
                removeAction={removerCandidatura.bind(null, id, c.id)}
                canManage={canManage}
              />
            ))}
          </div>
        )}

        {canAct && <AddCandidatoForm action={addCandidatoAction} candidatos={candidatos} />}
      </div>
    </PageContainer>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] text-fg-muted mb-0.5">{label}</p>
      <p className="text-[13px] text-fg">{value ?? "—"}</p>
    </div>
  );
}
