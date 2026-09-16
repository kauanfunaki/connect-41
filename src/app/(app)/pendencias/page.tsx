import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageSquareWarning, Paperclip } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canViewSector, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { formatInstantDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { AbasDeLink, FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { NovaPendencia, type LancamentoVinculado } from "@/components/pendencias/NovaPendencia";
import { SeloDoPrazo, SeloDoStatus } from "@/components/pendencias/SelosDaPendencia";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { listarPendencias, RECORTES_DE_PENDENCIA, type RecorteDePendencia } from "@/lib/financeiro/pendencias/consultas";
import { ROTULO_DO_TIPO } from "@/lib/financeiro/pendencias/regras";
import { centavosDeDecimal } from "@/lib/financeiro/contas";
import { moeda } from "@/lib/financeiro/formato";

export const dynamic = "force-dynamic";

const MODULE = "bpo_pendencias";
// Setor que opera o módulo neste tenant (ver `setorDoModulo`); o do catálogo
// é só o padrão.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

/**
 * A fila de pendências ao cliente.
 *
 * Filtros por GET (recorte, empresa, só vencidas), para a URL ser copiável. Os
 * contadores são da empresa filtrada e ignoram o recorte: são o mapa da fila, e
 * um mapa que muda conforme a aba escolhida não serve para escolher a aba.
 */
export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canViewSector(ctx, setor) || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const podeAgir = canActOnSector(ctx, setor);

  const params = await searchParams;
  const recorte: RecorteDePendencia = RECORTES_DE_PENDENCIA.find((r) => r.chave === params.recorte)?.chave ?? "andamento";
  const vencidas = params.vencidas === "1";
  const empresas = await empresasDoSeletor(ctx.tenantId);
  const empresaId = params.empresa && empresas.some((e) => e.id === params.empresa) ? params.empresa : null;
  const agora = new Date();

  const [{ linhas, contadores, limitado }, lancamento] = await Promise.all([
    listarPendencias({ tenantId: ctx.tenantId, companyIds: null }, { recorte, empresaId, vencidas }, agora),
    podeAgir && params.lancamento ? lancamentoParaVincular(ctx.tenantId, params.lancamento) : Promise.resolve(null),
  ]);

  function href(mudancas: Record<string, string | undefined>) {
    const q = new URLSearchParams();
    const atual: Record<string, string | undefined> = {
      recorte: recorte === "andamento" ? undefined : recorte,
      empresa: empresaId ?? undefined,
      vencidas: vencidas ? "1" : undefined,
      ...mudancas,
    };
    for (const [k, v] of Object.entries(atual)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/pendencias?${s}` : "/pendencias";
  }

  return (
    <PageContainer>
      <PageHeader
        title="Pendências ao cliente"
        subtitle="O que a equipe precisa do cliente — documento, informação ou confirmação — e a conversa de cada pedido."
        action={
          podeAgir ? (
            <NovaPendencia
              empresas={empresas}
              empresaPadrao={empresaId ?? undefined}
              lancamento={lancamento}
              abertoDeInicio={params.nova === "1"}
            />
          ) : undefined
        }
      />

      <div className="mt-4">
        <FaixaDeTotais
          itens={[
            { rotulo: "Aguardando cliente", valor: String(contadores.aguardando) },
            { rotulo: "Respondidas", valor: String(contadores.respondidas), tom: contadores.respondidas > 0 ? "text-brand" : "" },
            { rotulo: "Vencidas", valor: String(contadores.vencidas), tom: contadores.vencidas > 0 ? "text-danger" : "" },
            { rotulo: "Encerradas", valor: String(contadores.encerradas), tom: "text-fg-muted" },
          ]}
        />
      </div>

      <form method="get" action="/pendencias" className="flex flex-wrap items-center gap-3 mb-4">
        {recorte !== "andamento" && <input type="hidden" name="recorte" value={recorte} />}
        <Select compact name="empresa" defaultValue={empresaId ?? ""} className="w-72 max-w-full" aria-label="Empresa">
          <option value="">Todas as empresas</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Select>
        <Checkbox name="vencidas" value="1" defaultChecked={vencidas} label="Só vencidas" />
        <Button type="submit" variant="secondary" size="sm">
          Aplicar
        </Button>
      </form>

      <AbasDeLink
        abas={RECORTES_DE_PENDENCIA.map((r) => ({ chave: r.chave, rotulo: r.rotulo, href: href({ recorte: r.chave === "andamento" ? undefined : r.chave }) }))}
        ativa={recorte}
      />

      {linhas.length === 0 ? (
        <EmptyState
          icon={<MessageSquareWarning />}
          title="Nenhuma pendência neste recorte"
          description={podeAgir ? "Abra uma pendência quando precisar de algo do cliente — ele responde pelo portal." : undefined}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Pendência</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium">Prazo</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium">Atualizada</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                  <td className="py-2.5 pr-3">
                    <Link href={`/pendencias/${l.id}`} className="font-medium text-brand hover:underline">
                      {l.titulo}
                    </Link>
                    <span className="block text-[11px] text-fg-muted">
                      {ROTULO_DO_TIPO[l.tipo]} · {l.mensagens} {l.mensagens === 1 ? "mensagem" : "mensagens"}
                      {l.anexos > 0 && (
                        <>
                          {" "}
                          · <Paperclip size={10} className="inline" /> {l.anexos}
                        </>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">{l.empresaNome}</td>
                  <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{l.prazo ? formatInstantDate(l.prazo) : "—"}</td>
                  <td className="py-2.5 pr-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <SeloDoStatus status={l.status} lado="EQUIPE" />
                      <SeloDoPrazo situacao={l.situacaoDoPrazo} status={l.status} />
                    </div>
                  </td>
                  <td className="py-2.5 tabular-nums whitespace-nowrap text-fg-muted">{formatInstantDate(l.atualizadaEm)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {limitado && <p className="text-[11px] text-fg-muted mt-3">Mostrando as 500 primeiras. Filtre por empresa para ver o resto.</p>}
        </div>
      )}
    </PageContainer>
  );
}

/** O lançamento que veio de `/pagar` ou `/receber`, conferido no tenant. */
async function lancamentoParaVincular(tenantId: string, id: string): Promise<LancamentoVinculado | null> {
  const l = await getPrisma().financeEntry.findFirst({
    where: { id, tenantId },
    select: { id: true, companyId: true, kind: true, amount: true, dueDate: true, counterparty: { select: { name: true } } },
  });
  if (!l) return null;
  return {
    id: l.id,
    companyId: l.companyId,
    rotulo: `${l.kind === "PAGAR" ? "a pagar" : "a receber"} · ${l.counterparty.name} · ${moeda(centavosDeDecimal(l.amount))} · vence ${formatInstantDate(l.dueDate)}`,
  };
}
