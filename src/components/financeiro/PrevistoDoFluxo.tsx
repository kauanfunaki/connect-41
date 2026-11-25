// A aba "Previsto" do Fluxo de caixa, na equipe e no portal (25/11/2026,
// funcionalidade-837, a opção C escolhida pelo Kauan).
//
// Em cima, o que se lê primeiro: o saldo das contas hoje, o menor saldo
// previsto e quando, e quantos períodos passam pelo negativo, com o saldo dia
// a dia em miniatura. Embaixo, a troca entre dias, semanas e meses e a grade.
// Uma célula clicada abre o painel com as contas que a formam.

import { Card } from "@/components/ui/Card";
import { Aviso } from "@/components/ui/Aviso";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Sparkline } from "@/components/shared/Graficos";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";
import { GRUPOS_DO_FLUXO, rotuloDaLinha } from "@/lib/fluxoDeCaixa/estrutura";
import { celulaParaTexto, HORIZONTE, type Granularidade } from "@/lib/fluxoDeCaixa/projecao";
import type { DadosDoPrevisto } from "@/lib/fluxoDeCaixa/previstoServidor";
import { GradeDoPrevisto } from "./GradeDoPrevisto";
import { PainelDaCelula } from "./PainelDaCelula";

const NOME_DO_PERIODO: Record<Granularidade, [string, string]> = {
  dias: ["dia", "dias"],
  semanas: ["semana", "semanas"],
  meses: ["mês", "meses"],
};

const dm = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;
const tom = (c: number) => (c < 0 ? "text-danger" : "text-fg");

/** Os pontos do saldo diário, de 0 a 1, para a miniatura. */
function pontosDoSaldo(serie: { centavos: number }[]): { x: number; y: number }[] {
  if (serie.length < 2) return [];
  const valores = serie.map((s) => s.centavos);
  const min = Math.min(...valores, 0);
  const max = Math.max(...valores, 0);
  const faixa = max - min || 1;
  return valores.map((v, i) => ({ x: i / (valores.length - 1), y: (v - min) / faixa }));
}

function dias(n: number): string {
  return n === 0 ? "no dia" : n === 1 ? "1 dia depois" : `${n} dias depois`;
}

export function PrevistoDoFluxo({
  dados,
  enderecoDaVisao,
  noPortal = false,
}: {
  dados: DadosDoPrevisto;
  /** O endereço da tela numa visão, sem célula: `?aba=previsto&ver=semanas&empresa=…`. */
  enderecoDaVisao: (g: Granularidade) => string;
  noPortal?: boolean;
}) {
  const { previsto, dataDeCaixa, celula } = dados;
  const g = previsto.granularidade;
  const [um, varios] = NOME_DO_PERIODO[g];
  const { saldoHoje, menor, periodosNegativos, primeiroNegativo, serieDiaria } = previsto.indicadores;
  const base = enderecoDaVisao(g);
  const apoio = noPortal ? "text-ui" : "text-helper";

  // O título do painel: o que foi clicado e quando.
  const painel = (() => {
    if (!celula) return null;
    const c = celula.celula;
    const periodo = previsto.periodos.find((p) => p.chave === c.periodo);
    if (!periodo) return null;
    const alvo =
      c.nivel === "grupo"
        ? `Fluxo ${(GRUPOS_DO_FLUXO.find((x) => x.code === c.code)?.label ?? c.code).toLowerCase()}`
        : c.nivel === "linha"
          ? rotuloDaLinha(c.code)
          : (c.item ?? "");
    const total = celula.contas.reduce((s, x) => s + x.centavos, 0);
    return { titulo: `${alvo} · ${periodo.rotulo}`, contas: celula.contas, total, texto: celulaParaTexto(c) };
  })();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <p className={`${apoio} text-fg-muted`}>Saldo das contas hoje</p>
          {saldoHoje === null ? (
            <p className="text-section font-semibold text-fg-muted mt-0.5">—</p>
          ) : (
            <p className={`text-section font-semibold tabular-nums mt-0.5 ${tom(saldoHoje)}`}>{moeda(saldoHoje)}</p>
          )}
          <p className={`${apoio} text-fg-muted`}>
            {dados.saldo.atualizadoAteKey ? `extrato até ${dm(dados.saldo.atualizadoAteKey)}` : "sem extrato importado"}
          </p>
        </Card>
        <Card className="p-3">
          <p className={`${apoio} text-fg-muted`}>Menor saldo previsto</p>
          <p className={`text-section font-semibold tabular-nums mt-0.5 ${menor ? tom(menor.centavos) : "text-fg-muted"}`}>{menor ? moeda(menor.centavos) : "—"}</p>
          <p className={`${apoio} text-fg-muted`}>{menor ? `em ${dm(menor.dataKey)}` : "sem contas no período"}</p>
        </Card>
        <Card className="p-3">
          <p className={`${apoio} text-fg-muted`}>{varios[0]!.toUpperCase() + varios.slice(1)} com saldo negativo</p>
          <p className={`text-section font-semibold tabular-nums mt-0.5 ${periodosNegativos > 0 ? "text-danger" : "text-fg"}`}>
            {periodosNegativos} de {HORIZONTE[g]}
          </p>
          <p className={`${apoio} text-fg-muted`}>
            {primeiroNegativo ? `${g === "semanas" ? "a primeira" : "o primeiro"}: ${primeiroNegativo.rotulo}` : "nenhum aperto previsto"}
          </p>
        </Card>
        <Card className="p-3 flex flex-col">
          <p className={`${apoio} text-fg-muted`}>Saldo previsto dia a dia</p>
          <Sparkline pontos={pontosDoSaldo(serieDiaria)} cor={menor && menor.centavos < 0 ? "var(--c41-danger)" : undefined} className="h-12 mt-1 flex-1" />
          <p className={`${apoio} text-fg-muted`}>
            até {dm(previsto.periodos.at(-1)!.fimKey)}
          </p>
        </Card>
      </div>

      {!previsto.comSaldo &&
        (noPortal ? (
          <Aviso tom="neutro">O saldo das suas contas ainda não está aqui. Por enquanto, o previsto mostra só o que vai entrar e sair, a partir de zero.</Aviso>
        ) : (
          <Aviso tom="atencao">
            Sem saldo das contas: o previsto parte de zero. Cadastre a conta e importe o extrato em “Conciliação bancária”.
          </Aviso>
        ))}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <SegmentedControl
          label="Ver por"
          active={g}
          items={(["dias", "semanas", "meses"] as const).map((k) => ({
            key: k,
            label: k === "dias" ? "Dias" : k === "semanas" ? "Semanas" : "Meses",
            href: enderecoDaVisao(k),
          }))}
          tocavel={noPortal}
        />
        <p className={`${apoio} text-fg-muted`}>
          A receber entra {dias(dataDeCaixa.diasReceber)} da previsão, a pagar sai {dias(dataDeCaixa.diasPagar)}, sempre em dia útil.
        </p>
      </div>

      <GradeDoPrevisto previsto={previsto} base={base} celulaAtiva={painel?.texto ?? null} />

      <div className="flex flex-col gap-1">
        <NotaDeFonte>
          Clique num valor para ver as contas. Entradas positivas, saídas com o sinal de menos; os grupos abrem nas linhas e nas categorias
          {dados.comNomenclaturaDoCliente ? " do cliente" : " do Omie"}.
        </NotaDeFonte>
        {(previsto.atrasados.entradas > 0 || previsto.atrasados.saidas > 0) && (
          <p className={`${apoio} text-warning-fg`}>
            Fora da grade: {moeda(previsto.atrasados.entradas)} a receber e {moeda(previsto.atrasados.saidas)} a pagar que já venceram e
            {noPortal ? " ainda não foram pagos ou recebidos." : " não foram baixados."}
          </p>
        )}
        {previsto.foraDoFluxo.n > 0 && (
          <NotaDeFonte>
            {previsto.foraDoFluxo.n === 1 ? "1 conta" : `${previsto.foraDoFluxo.n} contas`} de transferência entre as contas da empresa
            ficam fora: não mudam o caixa.
          </NotaDeFonte>
        )}
        {previsto.depoisDoHorizonte > 0 && (
          <NotaDeFonte>
            {previsto.depoisDoHorizonte === 1 ? "1 conta cai" : `${previsto.depoisDoHorizonte} contas caem`} depois do último {um} da grade.
          </NotaDeFonte>
        )}
        {dados.noTeto && <NotaDeFonte>O previsto considera só as 5.000 contas em aberto mais antigas.</NotaDeFonte>}
      </div>

      {painel && (
        <PainelDaCelula titulo={painel.titulo} fecharHref={base}>
          <div className="flex flex-col gap-3">
            <p className="text-ui text-fg">
              {painel.contas.length === 1 ? "1 conta" : `${painel.contas.length} contas`} ·{" "}
              <span className={`font-semibold tabular-nums ${tom(painel.total)}`}>{moeda(painel.total)}</span>
            </p>
            {painel.contas.length === 0 ? (
              <p className="text-helper text-fg-muted">Nenhuma conta nesta célula.</p>
            ) : (
              <ul className="divide-y divide-border border-y border-border">
                {painel.contas.map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-ui font-medium text-fg truncate" title={c.contraparte}>
                        {c.contraparte}
                      </p>
                      <p className="text-fs-2 text-fg-muted truncate" title={[c.item, c.descricao].filter(Boolean).join(" · ")}>
                        {dm(c.dataKey)} · {c.item}
                        {c.descricao ? ` · ${c.descricao}` : ""}
                      </p>
                    </div>
                    <span className={`text-ui tabular-nums whitespace-nowrap ${tom(c.centavos)}`}>{moeda(c.centavos)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </PainelDaCelula>
      )}
    </div>
  );
}
