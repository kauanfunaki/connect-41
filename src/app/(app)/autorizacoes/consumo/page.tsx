import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetricCard } from "@/components/ui/MetricCard";
import { getAuthContext } from "@/lib/auth/context";
import { getPrisma } from "@/lib/prisma";
import { acessoAsAutorizacoes } from "@/lib/autorizacoes/servidor";
import { configuracaoDoSerpro, consumoDoMes, prontidaoDoSerpro } from "@/lib/serpro/cliente";
import { reais, ROTULO_DO_TIPO, TIPOS_DE_COBRANCA } from "@/lib/serpro/regras";
import { formatCnpj, formatCpf, formatInstantDateTime } from "@/lib/format";
import { hojeIso } from "@/lib/datas/calendario";
import { Gauge, Receipt, ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const nomeDoMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`;
const mesAnterior = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
};

/**
 * Quanto o Serpro já custou no mês: chamadas cobradas por tipo, a faixa
 * atingida, o custo estimado e o teto. A fatura de verdade é a do Serpro;
 * aqui é a conta pela tabela da Loja, com a faixa valendo para o mês inteiro.
 */
export default async function ConsumoDoSerproPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const acesso = await acessoAsAutorizacoes(await getAuthContext());
  if (!acesso) notFound();
  const cfg = await configuracaoDoSerpro(acesso.tenantId);
  if (!cfg) notFound();

  const params = await searchParams;
  const atual = hojeIso().slice(0, 7);
  const mes = params.mes && /^\d{4}-\d{2}$/.test(params.mes) && params.mes <= atual ? params.mes : atual;
  const [consumo, chamadas] = await Promise.all([
    consumoDoMes(acesso.tenantId, mes),
    getPrisma().serproCall.findMany({
      where: { tenantId: acesso.tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, createdAt: true, caminho: true, idServico: true, contribuinte: true, httpStatus: true, cobrada: true, mensagens: true, origem: true },
    }),
  ]);
  const teto = cfg.tetoCentavos;
  const usado = teto ? Math.round((consumo.custo.totalCentavos / teto) * 100) : null;
  const pronta = prontidaoDoSerpro(cfg);

  return (
    <PageContainer>
      <Breadcrumb items={[{ label: "Autorizações de acesso", href: "/autorizacoes" }, { label: "Consumo do Serpro" }]} />
      <PageHeader
        title="Consumo do Serpro"
        subtitle="As chamadas cobradas do mês e o custo estimado pela tabela da Loja do Serpro. A fatura que vale é a do Serpro."
      />

      {!pronta.pronta && (
        <Aviso tom="atencao" className="mb-4">
          {pronta.motivo}
        </Aviso>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-section font-semibold text-fg first-letter:uppercase">{nomeDoMes(mes)}</h2>
        <div className="flex gap-3 text-ui">
          <a href={`/autorizacoes/consumo?mes=${mesAnterior(mes)}`} className="text-fg-muted hover:text-brand transition-colors">
            ‹ Mês anterior
          </a>
          {mes !== atual && (
            <a href="/autorizacoes/consumo" className="text-fg-muted hover:text-brand transition-colors">
              Este mês ›
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <MetricCard label="Custo estimado" value={reais(consumo.custo.totalCentavos)} icon={<Receipt size={15} />} />
        <MetricCard
          label="Teto do mês"
          value={teto ? reais(teto) : "—"}
          sub={usado !== null ? `${usado}% usado` : undefined}
          tom={usado !== null && usado >= 100 ? "critico" : usado !== null && usado >= 80 ? "atencao" : undefined}
          icon={<Gauge size={15} />}
        />
        <MetricCard
          label="Chamadas cobradas"
          value={TIPOS_DE_COBRANCA.reduce((n, t) => n + consumo.contagem[t], 0)}
          icon={<ShieldCheck size={15} />}
        />
      </div>

      <Card className="p-5 mb-6">
        <h2 className="text-section font-semibold text-fg mb-3">Por tipo</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-ui">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">Tipo</th>
                <th className="py-2 pr-3 font-medium text-right">Chamadas</th>
                <th className="py-2 pr-3 font-medium text-right">Faixa</th>
                <th className="py-2 pr-3 font-medium text-right">Preço</th>
                <th className="py-2 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_DE_COBRANCA.map((t) => {
                const c = consumo.custo.porTipo[t];
                return (
                  <tr key={t} className="border-b border-border-soft tabular-nums">
                    <td className="py-2 pr-3">{ROTULO_DO_TIPO[t]}</td>
                    <td className="py-2 pr-3 text-right">{c.quantidade}</td>
                    <td className="py-2 pr-3 text-right">{c.faixa}</td>
                    <td className="py-2 pr-3 text-right">{reais(c.centavos)}</td>
                    <td className="py-2 text-right font-medium">{reais(c.totalCentavos)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-micro text-fg-muted mt-3">
          Cobradas são as respostas 200, 202 e 403 de consultas, emissões e declarações — inclusive o 403 de cliente sem autorização. A faixa
          atingida no mês vale para todas as chamadas daquele tipo (regra a confirmar no contrato).
        </p>
      </Card>

      <h2 className="text-section font-semibold text-fg mb-3">Últimas chamadas</h2>
      {chamadas.length === 0 ? (
        <EmptyState title="Nenhuma chamada ainda" description="As chamadas ao Serpro aparecem aqui, cobradas ou não." icon={<ShieldCheck />} />
      ) : (
        <div className="overflow-x-auto bg-surface border border-border rounded-lg px-4">
          <table className="w-full min-w-[820px] text-ui">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">Quando</th>
                <th className="py-2 pr-3 font-medium">Serviço</th>
                <th className="py-2 pr-3 font-medium">Contribuinte</th>
                <th className="py-2 pr-3 font-medium">Resposta</th>
                <th className="py-2 font-medium">Mensagens</th>
              </tr>
            </thead>
            <tbody>
              {chamadas.map((c) => (
                <tr key={c.id} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3 tabular-nums whitespace-nowrap">{formatInstantDateTime(c.createdAt)}</td>
                  <td className="py-2 pr-3">
                    {c.idServico}
                    <span className="block text-micro text-fg-muted">
                      {c.caminho} · {c.origem}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-fg-secondary">{c.contribuinte.length === 11 ? formatCpf(c.contribuinte) : formatCnpj(c.contribuinte)}</td>
                  <td className="py-2 pr-3">
                    <span className="tabular-nums">{c.httpStatus ?? "—"}</span>{" "}
                    {c.cobrada ? <Selo tom="atencao">cobrada</Selo> : <Selo tom="neutro">grátis</Selo>}
                  </td>
                  <td className="py-2 text-fg-muted break-words">{c.mensagens ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageContainer>
  );
}
