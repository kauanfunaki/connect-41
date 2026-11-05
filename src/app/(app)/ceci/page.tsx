import { Activity, AlertTriangle, CircleDollarSign, MessagesSquare, ThumbsUp, Timer, CheckCircle2, Info } from "lucide-react";
import { abrirTelaDoModulo } from "@/lib/auth/modulo";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Colunas } from "@/components/shared/Graficos";
import { getSectorMaps } from "@/lib/sectors";
import { painelDoOrquestrador } from "@/lib/ia/chat/painel";
import { acompanhamentoDaCeci, pontosDaCeci, type PontoDaCeci } from "@/lib/ia/acompanhamentoDaCeci";
import { formatarNumero, formatarReaisDeCentavos, formatInstantDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const segundos = (ms: number | null) => (ms === null ? "—" : `${formatarNumero(ms / 1000, 1)} s`);
const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : null);
const dataDaSemana = (k: string) => k.split("-").reverse().slice(0, 2).join("/");

const ICONE_DO_PONTO: Record<PontoDaCeci["tom"], React.ReactNode> = {
  perigo: <AlertTriangle size={16} className="text-danger" aria-hidden />,
  atencao: <AlertTriangle size={16} className="text-warning-fg" aria-hidden />,
  sucesso: <CheckCircle2 size={16} className="text-success-fg" aria-hidden />,
  neutro: <Info size={16} className="text-fg-muted" aria-hidden />,
};

/**
 * A Ceci na Tech (lote C dos ajustes de 03/11/2026): se ela está melhorando,
 * como está o processamento e o que pede atenção. Só números — o que as pessoas
 * perguntam não aparece aqui (as respostas com 👎 ficam na revisão de
 * Configurações › IA, para o administrador).
 */
export default async function CeciPage() {
  const { ctx } = await abrirTelaDoModulo("tech_ceci");
  const tenantId = ctx.tenantId!;
  const agora = new Date();
  const [dados, painel, { labels }] = await Promise.all([acompanhamentoDaCeci(tenantId, agora), painelDoOrquestrador(tenantId, agora), getSectorMaps(tenantId)]);

  const { semanas, agentes, motivos, falhas } = dados;
  const totais = agentes.reduce(
    (a, g) => ({ chamadas: a.chamadas + g.chamadas, erros: a.erros + g.erros, custo: a.custo + g.custoCents, boas: a.boas + g.boas, ruins: a.ruins + g.ruins }),
    { chamadas: 0, erros: 0, custo: 0, boas: 0, ruins: 0 }
  );
  const perguntas30 = painel?.perguntas.reduce((s, p) => s + p.perguntas, 0) ?? 0;
  const tempos = agentes.filter((g) => g.mediaMs !== null);
  const mediaGeral = tempos.length ? tempos.reduce((s, g) => s + g.mediaMs! * g.chamadas, 0) / tempos.reduce((s, g) => s + g.chamadas, 0) : null;
  const pontos = pontosDaCeci({ semanas, agentes, motivos, semIa: painel?.semIa ?? {}, nomeDoSetor: (c) => labels[c] ?? c });
  const taxaBoa = pct(totais.boas, totais.boas + totais.ruins);

  return (
    <PageContainer>
      <PageHeader
        title="Ceci"
        subtitle="Como a assistente do Connect está indo: avaliações, processamento e o que pede atenção. Os números contam os últimos 30 dias; a evolução, as últimas 8 semanas."
        action={
          ctx.role === "SUPER_ADMIN" ? (
            <Button href="/admin/ia?aba=respostas" variant="secondary">
              <MessagesSquare size={14} aria-hidden /> Respostas com 👎
            </Button>
          ) : undefined
        }
      />

      <FaixaDeTotais
        className="mb-6"
        itens={[
          { rotulo: "Perguntas", valor: formatarNumero(perguntas30, 0), icone: <MessagesSquare /> },
          {
            rotulo: "Respostas boas",
            valor: taxaBoa === null ? "—" : `${taxaBoa}%`,
            detalhe: `${totais.boas} 👍 · ${totais.ruins} 👎`,
            tom: taxaBoa !== null && taxaBoa < 70 ? "text-warning-fg" : undefined,
            icone: <ThumbsUp />,
          },
          {
            rotulo: "Chamadas com erro",
            valor: formatarNumero(totais.erros, 0),
            detalhe: `de ${formatarNumero(totais.chamadas, 0)} chamadas`,
            tom: totais.erros > 0 ? "text-danger" : undefined,
            icone: <Activity />,
          },
          { rotulo: "Tempo médio", valor: segundos(mediaGeral), icone: <Timer /> },
          { rotulo: "Custo", valor: formatarReaisDeCentavos(totais.custo), icone: <CircleDollarSign /> },
        ]}
      />

      <div className="flex flex-col gap-5">
        {/* O que pede atenção primeiro: é o que se procura ao abrir. */}
        <Card as="section" aria-labelledby="pontos" className="p-4 flex flex-col gap-3">
          <h2 id="pontos" className="text-section font-semibold text-fg">
            Pontos importantes
          </h2>
          <ul className="flex flex-col gap-2">
            {pontos.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-ui text-fg">
                <span className="mt-0.5 shrink-0">{ICONE_DO_PONTO[p.tom]}</span>
                {p.texto}
              </li>
            ))}
          </ul>
        </Card>

        <div className="grid gap-5 xl:grid-cols-2">
          <Card as="section" aria-labelledby="melhora" className="p-4 flex flex-col gap-3 min-w-0">
            <div className="flex flex-col gap-0.5">
              <h2 id="melhora" className="text-section font-semibold text-fg">
                Melhora
              </h2>
              <p className="text-fs-2 text-fg-muted">Respostas boas entre as avaliadas, semana a semana.</p>
            </div>
            <Colunas
              titulo="% de respostas boas"
              formatar={(n) => `${n}%`}
              formatarCurto={(n) => `${n}%`}
              vazio="Nenhuma resposta avaliada nas últimas 8 semanas."
              colunas={semanas.map((s, i) => ({
                chave: s.inicio,
                rotulo: dataDaSemana(s.inicio),
                valor: pct(s.boas, s.boas + s.ruins) ?? 0,
                dica: `${s.boas} 👍 · ${s.ruins} 👎 · ${s.perguntas} perguntas · ${s.falhas} falhas`,
                destaque: i === semanas.length - 1,
              }))}
            />
            <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[480px]">
                <thead>
                  <tr>
                    {["Semana de", "Perguntas", "👍", "👎", "Falhas", "Custo"].map((c) => (
                      <th key={c} className="px-3 py-2">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...semanas].reverse().map((s) => (
                    <tr key={s.inicio} className="border-b border-border-soft tabular-nums">
                      <td className="px-3 py-2">{dataDaSemana(s.inicio)}</td>
                      <td className="px-3 py-2">{s.perguntas}</td>
                      <td className="px-3 py-2">{s.boas}</td>
                      <td className={`px-3 py-2 ${s.ruins > 0 ? "text-warning-fg" : ""}`}>{s.ruins}</td>
                      <td className={`px-3 py-2 ${s.falhas > 0 ? "text-danger" : ""}`}>{s.falhas}</td>
                      <td className="px-3 py-2">{formatarReaisDeCentavos(s.custoCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {motivos.length > 0 && (
              <p className="text-fs-2 text-fg-secondary">
                Motivos do 👎 nos últimos 30 dias: {motivos.map((m) => `${m.rotulo} (${m.vezes})`).join(" · ")}.
              </p>
            )}
          </Card>

          <Card as="section" aria-labelledby="processamento" className="p-4 flex flex-col gap-3 min-w-0">
            <div className="flex flex-col gap-0.5">
              <h2 id="processamento" className="text-section font-semibold text-fg">
                Processamento
              </h2>
              <p className="text-fs-2 text-fg-muted">As chamadas de cada Ceci nos últimos 30 dias. P90: 9 em cada 10 respostas saíram em até esse tempo.</p>
            </div>
            {agentes.length === 0 ? (
              <p className="text-fs-2 text-fg-muted">Nenhuma chamada nos últimos 30 dias.</p>
            ) : (
              <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr>
                      {["Ceci", "Chamadas", "Erros", "Média", "P90", "Custo"].map((c) => (
                        <th key={c} className="px-3 py-2">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {agentes.map((g) => (
                      <tr key={g.agentCode} className="border-b border-border-soft tabular-nums">
                        <td className="px-3 py-2 font-medium">{g.nome}</td>
                        <td className="px-3 py-2">{g.chamadas}</td>
                        <td className={`px-3 py-2 ${g.erros > 0 ? "text-danger font-medium" : ""}`}>
                          {g.erros}
                          {g.travadas > 0 && <span className="block text-micro text-warning-fg">{g.travadas} sem terminar</span>}
                        </td>
                        <td className="px-3 py-2">{segundos(g.mediaMs)}</td>
                        <td className="px-3 py-2">{segundos(g.p90Ms)}</td>
                        <td className="px-3 py-2">
                          {formatarReaisDeCentavos(g.custoCents)}
                          {g.semCusto > 0 && <span className="block text-micro text-warning-fg">{g.semCusto} sem custo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {falhas.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-label font-semibold text-fg">Últimos erros</h3>
                <ul className="flex flex-col divide-y divide-border-soft rounded-md border border-border">
                  {falhas.map((f, i) => (
                    <li key={i} className="px-3 py-2 text-fs-2">
                      <span className="text-fg">{f.nome}</span>
                      <span className="text-fg-muted"> · {formatInstantDateTime(f.quando)}</span>
                      <span className="block break-words font-mono text-micro text-danger">{f.erro}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
