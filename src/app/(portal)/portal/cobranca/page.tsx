import { notFound } from "next/navigation";
import { Handshake } from "lucide-react";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { SeloDaCobranca, SeloDoAcordo } from "@/components/cobranca/SeloDaCobranca";
import { contextoFinanceiroDoPortal } from "@/app/(portal)/financeiro";
import { formatInstantDate } from "@/lib/format";
import { moeda } from "@/lib/financeiro/formato";
import { FAIXAS_DE_ATRASO } from "@/lib/financeiro/analise";
import { ROTULO_DO_CANAL, ROTULO_DO_RESULTADO } from "@/lib/financeiro/cobranca/regras";
import { cobrancaDoCliente, MODULO_DE_COBRANCA } from "@/lib/financeiro/cobranca/consultas";

export const dynamic = "force-dynamic";

/**
 * A cobrança vista pelo cliente: o que os sacados dele devem, em que pé está a
 * conversa e os acordos com as parcelas. Só leitura — a cobrança é trabalho da
 * equipe, e o cliente acompanha. A anotação interna do contato não sai daqui.
 */
export default async function PortalCobrancaPage() {
  const { escopo, modulos, grupoNome } = await contextoFinanceiroDoPortal();
  if (!modulos.has(MODULO_DE_COBRANCA)) notFound();

  const { titulos, acordos } = await cobrancaDoCliente(escopo, new Date());
  const vencido = titulos.reduce((n, t) => n + t.valorCentavos, 0);
  const ativos = acordos.filter((a) => a.status === "ATIVO");

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Cobrança"
        descricao="contas a receber vencidas das suas empresas, o andamento da cobrança e os acordos."
        grupoNome={grupoNome}
        ativo="cobranca"
        modulos={modulos}
      />

      <FaixaDeTotais
        itens={[
          { rotulo: "Títulos vencidos", valor: String(titulos.length) },
          { rotulo: "Valor vencido", valor: moeda(vencido), tom: vencido > 0 ? "text-danger" : "" },
          { rotulo: "Acordos ativos", valor: String(ativos.length) },
          { rotulo: "Em aberto nos acordos", valor: moeda(ativos.reduce((n, a) => n + a.resumo.emAbertoCentavos, 0)), tom: "text-fg-muted" },
        ]}
      />

      <h2 className="text-[14px] font-semibold mb-2">Títulos em cobrança</h2>
      {titulos.length === 0 ? (
        <Card className="mb-6">
          <EmptyState icon={<Handshake />} title="Nenhum título vencido" description="Quando um cliente das suas empresas atrasar um pagamento, o título aparece aqui." />
        </Card>
      ) : (
        <div className="overflow-x-auto mb-6">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Vencimento</th>
                <th className="py-2 pr-3 font-medium">Cliente</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium text-right">Valor</th>
                <th className="py-2 pr-3 font-medium">Atraso</th>
                <th className="py-2 pr-3 font-medium">Situação</th>
                <th className="py-2 font-medium">Último contato</th>
              </tr>
            </thead>
            <tbody>
              {titulos.map((t) => (
                <tr key={t.id} className="border-b border-border-soft align-top">
                  <td className="py-2.5 pr-3 tabular-nums whitespace-nowrap">{formatInstantDate(t.vencimento)}</td>
                  <td className="py-2.5 pr-3">
                    <span className="font-medium">{t.sacadoNome}</span>
                    {t.descricao && <span className="block text-[11px] text-fg-muted truncate max-w-[240px]">{t.descricao}</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-fg-secondary">{t.empresaNome}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums font-medium">{moeda(t.valorCentavos)}</td>
                  <td className="py-2.5 pr-3 whitespace-nowrap">{FAIXAS_DE_ATRASO.find((f) => f.chave === t.faixa)?.rotulo}</td>
                  <td className="py-2.5 pr-3">
                    <SeloDaCobranca situacao={t.situacao} />
                  </td>
                  <td className="py-2.5 text-[12px] text-fg-secondary">
                    {t.ultimoContato
                      ? `${formatInstantDate(t.ultimoContato.em)} · ${ROTULO_DO_CANAL[t.ultimoContato.canal]} · ${ROTULO_DO_RESULTADO[t.ultimoContato.resultado]}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="text-[14px] font-semibold mb-2">Acordos</h2>
      {acordos.length === 0 ? (
        <Card>
          <EmptyState icon={<Handshake />} title="Nenhum acordo" description="Quando uma dívida for renegociada em parcelas, o acordo aparece aqui." />
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {acordos.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-[14px] font-semibold">{a.sacadoNome}</span>
                <SeloDoAcordo status={a.status} />
              </div>
              <p className="text-[12px] text-fg-muted tabular-nums mb-2">
                {a.empresaNome} · acordado em {formatInstantDate(a.acordadoEm)} · dívida de {moeda(a.originalCentavos)} renegociada em{" "}
                {moeda(a.acordadoCentavos)} · {a.resumo.pagas}/{a.resumo.total} parcelas pagas · {moeda(a.resumo.pagoCentavos)} recebido
              </p>
              <ul className="flex flex-col gap-1 text-[12px]">
                {a.parcelas.map((p, i) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-2 tabular-nums">
                    <span>
                      {i + 1}/{a.parcelas.length}
                    </span>
                    <span>vence {formatInstantDate(p.vencimento)}</span>
                    <span>{moeda(p.valorCentavos)}</span>
                    {p.pagoEm ? (
                      <Badge variant="success">Paga em {formatInstantDate(p.pagoEm)}</Badge>
                    ) : p.status === "CANCELADO" ? (
                      <Badge variant="info">Encerrada</Badge>
                    ) : (
                      <Badge variant="warning">Em aberto</Badge>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
