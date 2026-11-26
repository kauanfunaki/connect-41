import Link from "next/link";
import { Building2 } from "lucide-react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Selo } from "@/components/ui/Selo";
import { EmptyState } from "@/components/ui/EmptyState";
import { LinhasDeSituacao } from "@/components/shared/Graficos";
import { moeda } from "@/lib/contabil-core/tela";
import type { Estatisticas, ItemDaCarteira } from "@/lib/contabil-core/painel/painel";

// O painel do Contábil Core (Bloco D, Fase D1, 26/11/2026): a tela `Dashboard` do original, como uma aba do
// módulo. A carteira do escritório (o trabalho da competência em cada empresa) e os números da empresa aberta
// (o resumo, a classificação por conta bancária e a atividade dos últimos meses). Só mostra: os números vêm do
// servidor (`servidor/painel.ts`), já contados e com o dinheiro em decimal exato.

const TH = "py-2 pr-3 font-medium";
const CABECALHO = "text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left";
const LINHA = "border-b border-border last:border-0 align-top";
const NUMERO = new Intl.NumberFormat("pt-BR");
const PCT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(2, 4)}`;

/** A situação da empresa na competência, como o `CarteiraStatus` do original. */
function SituacaoNaCarteira({ item }: { item: ItemDaCarteira }) {
  if (!item.haExtratoImportado) return <Selo tom="neutro">Sem extrato importado</Selo>;
  if (item.erros > 0) {
    return (
      <Selo tom="perigo">
        {NUMERO.format(item.erros)} {item.erros === 1 ? "erro" : "erros"}
        {item.pendentes > 0 ? ` · ${NUMERO.format(item.pendentes)} pendentes` : ""}
      </Selo>
    );
  }
  if (item.pendentes > 0) return <Selo tom="atencao">{NUMERO.format(item.pendentes)} {item.pendentes === 1 ? "pendência" : "pendências"}</Selo>;
  return <Selo tom="sucesso">Tudo classificado</Selo>;
}

/**
 * A carteira: uma linha por empresa ativa do escritório, com as de mais pendências primeiro. A linha abre a
 * empresa no NEO (ou em Importações, quando ainda não há extrato no mês), como o "abrir trabalho" do original.
 */
export function CarteiraDoEscritorio({ mes, itens, atual }: { mes: string; itens: ItemDaCarteira[]; atual: string }) {
  if (itens.length === 0) return <p className="text-sm text-fg-muted">Nenhuma empresa ativa no Contábil Core.</p>;
  const href = (i: ItemDaCarteira) =>
    `/contabil-core?${new URLSearchParams({ empresa: i.empresaId, aba: i.haExtratoImportado ? "neo" : "importacoes", ...(i.haExtratoImportado ? { mes } : {}) })}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">Carteira do escritório em {mes}</caption>
        <thead>
          <tr className={CABECALHO}>
            <th className={TH}>Empresa</th>
            <th className={TH}>Situação</th>
            <th className={`${TH} text-right`}>Importadas</th>
            <th className={`${TH} text-right`}>Classificadas</th>
            <th className={`${TH} text-right`}>Pendências</th>
            <th className={`${TH} text-right`}>Valor pendente</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.empresaId} className={`${LINHA} ${i.empresaId === atual ? "bg-surface-muted" : ""}`}>
              <td className="py-2 pr-3">
                <Link href={href(i)} className="font-medium text-brand hover:underline">
                  {i.razaoSocial}
                </Link>
                {i.empresaId === atual && <span className="ml-2 text-micro text-fg-muted">(aberta)</span>}
              </td>
              <td className="py-2 pr-3">
                <SituacaoNaCarteira item={i} />
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{NUMERO.format(i.transacoesImportadas)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{NUMERO.format(i.classificadas)}</td>
              <td className={`py-2 pr-3 text-right tabular-nums ${i.pendentes ? "font-semibold text-warning-fg" : ""}`}>{NUMERO.format(i.pendentes)}</td>
              <td className={`py-2 text-right tabular-nums whitespace-nowrap ${i.pendentes ? "font-semibold" : "text-fg-muted"}`}>{moeda(i.valorTotalPendente)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Os números da empresa aberta: o resumo, a classificação por conta bancária e a atividade mensal. */
export function NumerosDaEmpresa({ e }: { e: Estatisticas }) {
  const r = e.resumo;
  if (r.totalTransacoes === 0 && r.totalRegistros === 0 && r.totalNotas === 0 && r.totalComprovantes === 0) {
    return (
      <EmptyState
        icon={<Building2 size={28} aria-hidden />}
        title="Nada importado nesta empresa"
        description="Os números aparecem depois do primeiro extrato importado."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard label="Transações" value={r.totalTransacoes} />
        {/* "Conciliados" no original: a transação com lançamento vivo no razão. */}
        <MetricCard label="Com lançamento" value={r.totalConciliados} detalhe={`${PCT.format(r.percentualConciliacao)}% das transações`} tom={r.totalConciliados ? "ok" : "neutro"} />
        <MetricCard label="Sem lançamento" value={r.totalNaoConciliados} tom={r.totalNaoConciliados ? "atencao" : "neutro"} />
        <MetricCard label="Lançamentos (partidas)" value={r.totalRegistros} />
        <MetricCard label="Notas fiscais" value={r.totalNotas} />
        <MetricCard label="Comprovantes" value={r.totalComprovantes} />
      </div>

      {e.porAgencia.length > 0 && (
        <LinhasDeSituacao
          titulo="Classificação por conta bancária"
          linhas={e.porAgencia.map((a) => ({
            chave: a.agenciaId,
            rotulo: a.descricao,
            segmentos: [
              { chave: "com", rotulo: "Com lançamento", valor: a.conciliados, tom: "ok" },
              { chave: "sem", rotulo: "Sem lançamento", valor: a.naoConciliados, tom: "atencao" },
            ],
          }))}
          vazio="Nenhuma conta bancária ativa."
        />
      )}

      <div className="overflow-x-auto">
        <p className="mb-2 text-fs-2 font-medium text-fg-secondary">Atividade nos últimos {e.mensal.length} meses</p>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className={CABECALHO}>
              <th className={TH}>Mês</th>
              <th className={`${TH} text-right`}>Transações</th>
              <th className={`${TH} text-right`}>Partidas</th>
              <th className={`${TH} text-right`}>Comprovantes</th>
              <th className={`${TH} text-right`}>Notas fiscais</th>
            </tr>
          </thead>
          <tbody>
            {[...e.mensal].reverse().map((m) => (
              <tr key={m.mes} className={LINHA}>
                <td className="py-1.5 pr-3 tabular-nums">{mesCurto(m.mes)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{NUMERO.format(m.transacoes)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{NUMERO.format(m.registros)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{NUMERO.format(m.comprovantes)}</td>
                <td className="py-1.5 text-right tabular-nums">{NUMERO.format(m.notas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
