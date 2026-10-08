import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, Download, ListChecks, Timer, Users, Wallet } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
import { FiltrosDaTela, type CampoDeFiltro } from "@/components/shared/FiltrosDaTela";
import { TabelaFiltravel, LinhaFiltravel, FiltroDaColuna, type LinhaDoFiltro } from "@/components/shared/FiltroDeColunas";
import { campoDeSetor } from "@/components/gestao/FiltroDeSetor";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate, formatarNumero, formatarReais, formatarHoras } from "@/lib/format";
import { contextoDaGestao, recorteComFiltro } from "@/lib/gestao/acesso";
import { custosDoTenant, horasDoPeriodo, periodoDaUrl } from "@/lib/gestao/horas";
import { resumirHoras } from "@/lib/gestao/custo";
import { nomesDasPessoas } from "@/lib/gestao/telas";
// Reais e horas pelos formatadores que já existiam (Valora), no lugar das
// cópias locais. Trocam por `formatarReais`/`formatarHoras` de lib/format.ts
// quando a base os criar (auditoria DRG-01, 07/10/2026).

export const dynamic = "force-dynamic";

const h = (min: number) => formatarHoras(min / 60);
const CABECALHO = "border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted";

/** O `TabelaFiltravel` quando a tabela traz todas as linhas; senão, a tabela sozinha. */
function TabelaNoFiltro({ filtravel, linhas, children }: { filtravel: boolean; linhas: LinhaDoFiltro[]; children: React.ReactNode }) {
  return filtravel ? <TabelaFiltravel linhas={linhas}>{children}</TabelaFiltravel> : <>{children}</>;
}

// As horas de operação: o que cada setor e cada pessoa apontou, em card e em
// processo, e quanto isso custou pelo custo da hora do Valora. Custo de equipe
// é confidencial: só aparece para quem vê todos os setores (diretoria e
// administradores).
export default async function HorasDeOperacaoPage({ searchParams }: { searchParams: Promise<{ setor?: string; periodo?: string; pessoa?: string }> }) {
  const g = await contextoDaGestao();
  if (!g) notFound();
  const { ctx } = g;
  const params = await searchParams;
  const { recorte, setor } = recorteComFiltro(g.recorte, g.setores, params.setor);
  const periodo = periodoDaUrl(params.periodo);
  const podeVerCusto = g.recorte === "todos";

  const todas = await horasDoPeriodo(ctx.tenantId, recorte, periodo.de, periodo.ate);
  const pessoa = params.pessoa && todas.some((l) => l.userId === params.pessoa) ? params.pessoa : null;
  const linhas = pessoa ? todas.filter((l) => l.userId === pessoa) : todas;
  const { custoDe, configurado } = await custosDoTenant(ctx.tenantId);
  const resumo = resumirHoras(linhas, podeVerCusto ? custoDe : () => null);
  const nomeDe = await nomesDasPessoas(ctx.tenantId, todas.map((l) => l.userId));

  const q = (extra: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const base = { setor, periodo: periodo.chave === "mes" ? null : periodo.chave, pessoa, ...extra };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `?${s}` : "";
  };
  const hrefDaExportacao = `/gestao/horas/exportar${q({})}`;

  // Setor, período e pessoa no botão "Filtros" (30/09): eram duas fileiras de
  // chips e um "Só as horas de Fulano. Ver todos" solto — a ficha do filtro
  // agora diz a mesma coisa, com o "x" que tira.
  const pessoasDoPeriodo = [...new Set(todas.map((l) => l.userId))]
    .map((id) => ({ value: id, label: nomeDe.get(id) ?? "—" }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  const campos: CampoDeFiltro[] = [
    ...(campoDeSetor(g.setores) ? [campoDeSetor(g.setores)!] : []),
    {
      chave: "periodo",
      rotulo: "Período",
      vazioLabel: periodoDaUrl("mes").rotulo,
      opcoes: (["anterior", "90d"] as const).map((k) => ({ value: k, label: periodoDaUrl(k).rotulo })),
    },
    { chave: "pessoa", rotulo: "Pessoa", vazioLabel: "Todas as pessoas", opcoes: pessoasDoPeriodo },
  ];
  const apontamentos: LinhaDoFiltro[] = linhas.slice(0, 200).map((l) => ({
    id: l.id,
    valores: {
      dia: saoPauloParts(l.dia).dateKey,
      pessoa: nomeDe.get(l.userId) ?? "—",
      onde: l.titulo,
      setor: g.rotuloDoSetor(l.setor),
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FiltrosDaTela campos={campos} />
        {/* `download`: o <Link> pré-carregaria a rota ao aparecer na tela, e
            geraria o CSV a cada visita. */}
        <Button href={hrefDaExportacao} download variant="secondary" size="sm">
          <Download size={14} /> Exportar CSV
        </Button>
      </div>

      {/* O mesmo cartão de total da aba Painel e das outras telas: era o
          `MetricCard`, com o ícone do outro lado (auditoria DRG-12, 07/10/2026).
          Sem o respiro da faixa: aqui quem espaça é o `gap` da coluna. */}
      <FaixaDeTotais
        className=""
        itens={[
          { rotulo: `Horas — ${periodo.rotulo.toLowerCase()}`, valor: h(resumo.total.minutos), icone: <Clock /> },
          ...(podeVerCusto
            ? [{ rotulo: "Custo das horas", valor: resumo.total.custo === null ? "—" : formatarReais(resumo.total.custo), icone: <Wallet /> }]
            : []),
          { rotulo: "Pessoas", valor: formatarNumero(resumo.porPessoa.length, 0), icone: <Users /> },
          { rotulo: "Apontamentos", valor: formatarNumero(linhas.length, 0), icone: <ListChecks /> },
        ]}
      />

      {podeVerCusto && (resumo.minutosSemCusto > 0 || !configurado) && (
        // Revisão de 05/10: botão não é link — o "Custos no Valora" era texto azul.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-border bg-surface-2 px-4 py-3 text-[length:var(--fs-2)] text-fg-secondary">
          <p>
            {!configurado
              ? "O custo das equipes ainda não foi preenchido no Valora, então as horas aparecem sem custo."
              : `${h(resumo.minutosSemCusto)} estão em setores sem custo de equipe no Valora (só Fiscal, DP, Societário e Contábil têm) e ficaram fora do custo.`}
          </p>
          <Button href="/valora/parametros" variant="secondary" size="xs">
            Abrir custos no Valora
          </Button>
        </div>
      )}

      {linhas.length === 0 ? (
        <Card>
          <EmptyState icon={<Timer />} title="Nenhuma hora apontada no período" description="As horas entram pelo cronômetro ou pelo lançamento manual, no card e no processo." />
        </Card>
      ) : (
        <>
          {/* Os dois resumos no casco padrão, dentro do cartão (30/09): ganharam
              cabeçalho, que a tabela sem ele deixava a coluna do custo sem nome. */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card className="p-4 flex flex-col gap-2">
              <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Por setor</h2>
              <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-[length:var(--fs-ui)]">
                  <thead>
                    <tr className={CABECALHO}>
                      <th className="px-3">Setor</th>
                      <th className="px-3">Horas</th>
                      {podeVerCusto && <th className="px-3">Custo</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.porSetor.map((s) => (
                      <tr key={s.setor} className="border-b border-border">
                        <td className="px-3">{g.rotuloDoSetor(s.setor)}</td>
                        <td className="px-3 tabular-nums">{h(s.minutos)}</td>
                        {podeVerCusto && <td className="px-3 tabular-nums text-fg-secondary">{s.custo === null ? "sem custo" : formatarReais(s.custo)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="p-4 flex flex-col gap-2">
              <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Por pessoa</h2>
              <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-[length:var(--fs-ui)]">
                  <thead>
                    <tr className={CABECALHO}>
                      <th className="px-3">Pessoa</th>
                      <th className="px-3">Horas</th>
                      {podeVerCusto && <th className="px-3">Custo</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {resumo.porPessoa.map((p) => (
                      <tr key={p.userId} className="border-b border-border">
                        <td className="px-3">
                          <Link href={`/gestao/horas${q({ pessoa: p.userId })}`} className="font-medium text-fg hover:text-brand transition-colors">
                            {nomeDe.get(p.userId) ?? "—"}
                          </Link>
                        </td>
                        <td className="px-3 tabular-nums">{h(p.minutos)}</td>
                        {podeVerCusto && <td className="px-3 tabular-nums text-fg-secondary">{p.custo === null ? "sem custo" : formatarReais(p.custo)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <section aria-labelledby="apontamentos" className="flex flex-col gap-2">
            <h2 id="apontamentos" className="text-[length:var(--fs-card-title)] font-semibold text-fg">
              Apontamentos
            </h2>
            {/* No celular, cartões em vez da rolagem lateral de 640px (auditoria
                DRG-31, 07/10/2026). O funil por coluna é só da tabela. */}
            <CartoesNoCelular>
              {linhas.slice(0, 200).map((l) => (
                <Cartao key={l.id}>
                  <TopoDoCartao
                    nome={
                      <Link href={l.href} className="text-fg hover:text-brand transition-colors">
                        {l.titulo}
                      </Link>
                    }
                    valor={h(l.minutos)}
                  />
                  {l.nota && <InfoDoCartao>{l.nota}</InfoDoCartao>}
                  <InfoDoCartao>
                    {formatInstantDate(l.dia)} · {nomeDe.get(l.userId) ?? "—"} · {g.rotuloDoSetor(l.setor)}
                  </InfoDoCartao>
                </Cartao>
              ))}
            </CartoesNoCelular>
            {/* Funil por coluna só quando a tabela traz todas as linhas: acima de
                200 ela mostra um pedaço, e filtrar o pedaço mentiria sobre o
                resto. Sem o `TabelaFiltravel`, o funil vira só o rótulo. */}
            <TabelaNoFiltro filtravel={linhas.length <= 200} linhas={apontamentos}>
              <TabelaNoDesktop padrao>
                <table className="w-full min-w-[640px] text-[length:var(--fs-ui)]">
                  <thead>
                    <tr className={CABECALHO}>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Dia" chave="dia" tipo="data" />
                      </th>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Pessoa" chave="pessoa" />
                      </th>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Onde" chave="onde" />
                      </th>
                      <th className="px-3">
                        <FiltroDaColuna rotulo="Setor" chave="setor" align="right" />
                      </th>
                      <th className="px-3">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.slice(0, 200).map((l) => (
                      <LinhaFiltravel key={l.id} id={l.id} className="border-b border-border align-top">
                        <td className="px-3 tabular-nums whitespace-nowrap">{formatInstantDate(l.dia)}</td>
                        <td className="px-3">{nomeDe.get(l.userId) ?? "—"}</td>
                        <td className="px-3">
                          <Link href={l.href} className="font-medium text-fg hover:text-brand transition-colors">
                            {l.titulo}
                          </Link>
                          {l.nota && <span className="block text-[length:var(--fs-micro)] text-fg-muted">{l.nota}</span>}
                        </td>
                        <td className="px-3">{g.rotuloDoSetor(l.setor)}</td>
                        <td className="px-3 tabular-nums">{h(l.minutos)}</td>
                      </LinhaFiltravel>
                    ))}
                  </tbody>
                </table>
              </TabelaNoDesktop>
            </TabelaNoFiltro>
            {linhas.length > 200 && <p className="text-[length:var(--fs-2)] text-fg-muted">Mostrando 200 de {linhas.length}. O CSV traz todos.</p>}
          </section>
        </>
      )}
    </div>
  );
}
