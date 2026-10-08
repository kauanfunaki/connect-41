import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { formatInstantDate, formatarReaisDeCentavos } from "@/lib/format";
import { estadoDosAgentes } from "@/lib/ia/data";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { propostasDoSetor, qualidadeDoSetor } from "@/lib/ia/propostas";
import { AGENTE_CONTRATO, AGENTE_VARREDURA } from "@/lib/societario/iaDoSetor";
import { RodarVarredura } from "@/components/societario/ia/RodarVarredura";
import { rodarVarreduraAction } from "./actions";

// A IA do Societário (29/09): as funções do protótipo do Marcos — varredura de
// pendências, leitura de contrato social, fila de aprovação e painel de
// qualidade — numa tela só, da coordenação do setor.

const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

const STATUS = {
  PENDENTE: { rotulo: "Esperando revisão", variante: "info" },
  APROVADA: { rotulo: "Aprovada", variante: "success" },
  EDITADA: { rotulo: "Aprovada com ajuste", variante: "warning" },
  REJEITADA: { rotulo: "Rejeitada", variante: "danger" },
} as const;

const CONFIANCA = { ALTA: "alta", MEDIA: "média", BAIXA: "baixa" } as const;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const MES = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" });

export default async function IaDoSocietarioPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canManageSector(ctx, setor)) notFound();

  const [{ pendentes, revisadas }, qualidade, estados] = await Promise.all([
    propostasDoSetor(ctx.tenantId, setor),
    qualidadeDoSetor(ctx.tenantId, setor),
    estadoDosAgentes(ctx.tenantId, [AGENTE_VARREDURA, AGENTE_CONTRATO]),
  ]);
  const ligado = (code: string) => {
    const e = estados.get(code);
    return !!e && e.ligado && e.temChave;
  };
  const varreduraLigada = ligado(AGENTE_VARREDURA);
  const nome = (code: string) => agenteDoCatalogo(code)?.label ?? code;

  return (
    <PageContainer>
      <BackButton className="mb-3" />
      <PageHeader
        title="IA do Societário"
        subtitle="A IA propõe; a coordenação aprova, corrige ou rejeita. Nada é gravado sem aprovação."
        action={<RodarVarredura rodar={rodarVarreduraAction} desligada={!varreduraLigada} />}
      />

      {(!varreduraLigada || !ligado(AGENTE_CONTRATO)) && (
        // Revisão de 05/10: botão não é link — o caminho era texto azul no meio da frase.
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-surface-2 px-4 py-3 text-fs-3 text-fg-secondary">
          <p>
            {[!varreduraLigada && nome(AGENTE_VARREDURA), !ligado(AGENTE_CONTRATO) && nome(AGENTE_CONTRATO)].filter(Boolean).join(" e ")}{" "}
            {!varreduraLigada && !ligado(AGENTE_CONTRATO) ? "estão desligadas" : "está desligada"}. Um administrador liga em
            Administração › Inteligência Artificial. A leitura de contrato social fica na tela de sócios de cada empresa.
          </p>
          <Button href="/admin/ia" variant="secondary" size="xs">
            Abrir Inteligência Artificial
          </Button>
        </div>
      )}

      <section aria-labelledby="fila" className="mb-6 flex flex-col gap-2">
        <h2 id="fila" className="text-card-title font-semibold text-fg">
          Esperando revisão ({pendentes.length})
        </h2>
        {pendentes.length === 0 ? (
          <Card>
            <EmptyState
              title="Nenhuma proposta esperando"
              description="Rode a varredura para ver as pendências do setor, ou leia um contrato social na tela de sócios de uma empresa."
            />
          </Card>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {pendentes.map((p) => (
              <li key={p.id}>
                <Link href={`/societario/ia/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="text-fs-4 font-medium text-fg">{p.title}</p>
                    <p className="text-fs-2 text-fg-muted">
                      {nome(p.agentCode)} · pedido por {p.createdBy?.name ?? "—"} em {formatInstantDate(p.createdAt)}
                      {p.confidence && ` · confiança ${CONFIANCA[p.confidence]}`}
                    </p>
                  </div>
                  <span className="text-fs-3 text-brand">Revisar →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="qualidade" className="mb-6 flex flex-col gap-2">
        <div>
          <h2 id="qualidade" className="text-card-title font-semibold text-fg">
            Qualidade da IA, últimos 6 meses
          </h2>
          <p className="text-fs-2 text-fg-muted">
            Quanto do que a IA propõe é aprovado como veio, quanto precisa de ajuste e quanto é descartado — e quanto custou.
          </p>
        </div>
        {qualidade.length === 0 ? (
          <p className="text-fs-3 text-fg-muted">Ainda não há proposta para medir.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {qualidade.map((q) => {
              const maior = Math.max(1, ...q.porMes.map((m) => m.total));
              return (
                <Card key={q.agentCode} className="p-4 flex flex-col gap-3">
                  <p className="text-fs-4 font-semibold text-fg">{nome(q.agentCode)}</p>
                  <dl className="grid grid-cols-3 gap-2 text-fs-2">
                    <div>
                      <dt className="text-fg-muted">Propostas</dt>
                      <dd className="text-fs-7 font-semibold text-fg tabular-nums">{q.total}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted">Com ajuste</dt>
                      <dd className="text-fs-7 font-semibold text-fg tabular-nums">{pct(q.taxaDeEdicao)}</dd>
                    </div>
                    <div>
                      <dt className="text-fg-muted">Rejeitadas</dt>
                      <dd className="text-fs-7 font-semibold text-fg tabular-nums">{pct(q.taxaDeRejeicao)}</dd>
                    </div>
                  </dl>
                  <p className="text-fs-2 text-fg-secondary tabular-nums">
                    {q.aprovadas} aprovadas como vieram · {q.editadas} com ajuste · {q.rejeitadas} rejeitadas · {q.pendentes} esperando
                  </p>
                  <p className="text-fs-2 text-fg-secondary tabular-nums">
                    Confiança que a IA declarou: {q.confianca.ALTA} alta · {q.confianca.MEDIA} média · {q.confianca.BAIXA} baixa
                  </p>
                  <div aria-label="Propostas por mês" className="flex items-end gap-2 h-16">
                    {q.porMes.map((m) => (
                      <div key={m.mes} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full rounded-sm bg-brand/70" style={{ height: `${(m.total / maior) * 40}px`, minHeight: m.total ? 3 : 0 }} title={`${m.total}`} />
                        <span className="text-[10px] text-fg-muted">{MES.format(new Date(`${m.mes}-15T12:00:00Z`))}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-fs-2 text-fg-muted">Custo no período: {formatarReaisDeCentavos(q.custoCentavos)}</p>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {revisadas.length > 0 && (
        <section aria-labelledby="revisadas" className="flex flex-col gap-2">
          <h2 id="revisadas" className="text-card-title font-semibold text-fg">
            Revisadas recentemente
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {revisadas.map((p) => (
              <li key={p.id}>
                <Link href={`/societario/ia/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2">
                  <div className="min-w-0">
                    <p className="text-fs-3 text-fg">{p.title}</p>
                    <p className="text-fs-2 text-fg-muted">
                      {p.reviewedBy?.name ?? "—"} · {p.reviewedAt ? formatInstantDate(p.reviewedAt) : ""}
                    </p>
                  </div>
                  <Badge variant={STATUS[p.status].variante}>{STATUS[p.status].rotulo}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PageContainer>
  );
}
