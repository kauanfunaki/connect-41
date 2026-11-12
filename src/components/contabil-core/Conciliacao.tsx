"use client";

import { useId, useRef, useState } from "react";
import { Download, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { Checkbox } from "@/components/ui/Checkbox";
import { Aviso } from "@/components/ui/Aviso";
import { Accordion } from "@/components/ui/Accordion";
import { Badge, type VarianteDoBadge } from "@/components/ui/Badge";
import { Selo } from "@/components/ui/Selo";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import type { GrupoConciliacaoJson, LinhaRazaoJson, RelatorioConciliacaoJson } from "@/lib/contabil-core/conciliacao/relatorio";
import {
  agruparPorTipo,
  dataBr,
  diasDaTela,
  ehLote,
  moedaDoRelatorio as moeda,
  pendenciasDoDia,
  plural,
  rotuloDoGrupo,
  valorZerado,
  type ComposicaoNaTela,
  type SomasDoGrupo,
} from "@/lib/contabil-core/conciliacao/telaDaConciliacao";

// Conciliação Razão × extrato (Bloco B, Fase B2, 12/11/2026): porte do `RazaoExtratoTab.tsx` do
// Contábil Core. O Razão da conta banco (e, se vier, a consulta do SISPAG) é cruzado no servidor com o
// extrato já importado; nada é gravado. "Baixar planilha" reenvia os mesmos arquivos pedindo XLSX.
// A revisão manual do original (análises salvas, vínculos, "Revisar composição") fica para a fase B3.
//
// Dinheiro chega como texto e as somas já vêm prontas da rota (`somas`): a tela só formata.

type Resposta = { relatorio: RelatorioConciliacaoJson; somas: SomasDoGrupo[] };
/** `envio` zera os filtros do relatório a cada conciliação nova (é a chave dele). */
type Conciliado = Resposta & { envio: number };

const URL_DA_ROTA = "/api/contabil-core/conciliacao";
const NUMERO = new Intl.NumberFormat("pt-BR");

const VARIANTE: Record<string, VarianteDoBadge> = {
  DUPLICIDADE_RAZAO: "warning",
  DUPLICIDADE_EXTRATO: "warning",
  VALOR_DIVERGENTE: "warning",
  LOTE_SISPAG_DIVERGENTE: "warning",
  SO_RAZAO: "danger",
  SO_EXTRATO: "danger",
};

const TH = "py-2 pr-3 font-medium";
const CABECALHO = "text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left";

export function Conciliacao({ empresaId, agencias }: { empresaId: string; agencias: Opcao[] }) {
  const base = useId();
  const sispagRef = useRef<HTMLInputElement>(null);
  // Cada envio ganha um número; a resposta de um envio que ficou para trás (a pessoa trocou a conta ou
  // o arquivo enquanto o servidor conciliava) é descartada.
  const pedido = useRef(0);
  const [agenciaId, setAgenciaId] = useState(agencias.length === 1 ? agencias[0].value : "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [sispag, setSispag] = useState<File | null>(null);
  const [conciliando, setConciliando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resposta, setResposta] = useState<Conciliado | null>(null);
  const toast = useToast();

  function mudou() {
    pedido.current += 1;
    setConciliando(false);
    setResposta(null);
    setErro(null);
  }

  function formulario(formato: "json" | "xlsx", razao: File) {
    const form = new FormData();
    form.set("empresa", empresaId);
    form.set("agencia", agenciaId);
    form.set("formato", formato);
    form.set("arquivo", razao);
    if (sispag) form.set("sispag", sispag);
    return form;
  }

  async function conciliar() {
    setErro(null);
    if (!agenciaId) return setErro("Escolha a conta bancária.");
    if (!arquivo) return setErro("Escolha o arquivo do Razão (Excel ou PDF).");
    const meu = ++pedido.current;
    setResposta(null);
    setConciliando(true);
    const resp = await fetch(URL_DA_ROTA, { method: "POST", body: formulario("json", arquivo) }).catch(() => null);
    const corpo = (await resp?.json().catch(() => null)) as (Partial<Resposta> & { error?: string }) | null;
    if (meu !== pedido.current) return;
    setConciliando(false);
    if (!resp?.ok || !corpo?.relatorio || !corpo.somas) return setErro(corpo?.error ?? "Não deu para conciliar. Tente de novo.");
    setResposta({ relatorio: corpo.relatorio, somas: corpo.somas, envio: meu });
  }

  async function baixar() {
    if (!arquivo || !agenciaId) return;
    setBaixando(true);
    const resp = await fetch(URL_DA_ROTA, { method: "POST", body: formulario("xlsx", arquivo) }).catch(() => null);
    setBaixando(false);
    if (!resp?.ok) {
      const corpo = (await resp?.json().catch(() => null)) as { error?: string } | null;
      return toast.error(corpo?.error ?? "Não deu para gerar a planilha.");
    }
    const nome = /filename="([^"]+)"/.exec(resp.headers.get("Content-Disposition") ?? "")?.[1] ?? "conciliacao.xlsx";
    const url = URL.createObjectURL(await resp.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  function tirarSispag() {
    setSispag(null);
    if (sispagRef.current) sispagRef.current.value = "";
    mudou();
  }

  const situacao = conciliando
    ? "Conciliando o Razão com o extrato…"
    : resposta
      ? `Conciliação pronta: ${plural(resposta.relatorio.resumo.pendencias, "pendência", "pendências")}.`
      : "";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby={`${base}-titulo`}>
        <div>
          <h2 id={`${base}-titulo`} className="text-base font-semibold">
            Razão × extrato
          </h2>
          <p className="text-sm text-fg-muted">
            Envie o Razão contábil de uma conta bancária (Excel ou PDF). Ele é cruzado com o extrato já importado desta conta no mesmo período, e
            a tela aponta as pendências. Nada é gravado nem alterado.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3 md:items-start">
          <CampoForm label="Conta bancária" htmlFor={`${base}-ag`} required>
            <SearchableSelect
              id={`${base}-ag`}
              name="agencia"
              options={agencias}
              defaultValue={agenciaId}
              onChange={(v) => {
                setAgenciaId(v);
                mudou();
              }}
              placeholder="Escolha a conta"
            />
          </CampoForm>
          <CampoForm label="Razão da conta" htmlFor={`${base}-razao`} required helper="Excel (.xlsx ou .xls) ou PDF, de uma conta só.">
            <input
              id={`${base}-razao`}
              type="file"
              accept=".xlsx,.XLSX,.xls,.XLS,.pdf,.PDF,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm"
              onChange={(e) => {
                setArquivo(e.target.files?.[0] ?? null);
                mudou();
              }}
            />
          </CampoForm>
          <CampoForm
            label="Consulta de pagamentos do SISPAG (opcional)"
            htmlFor={`${base}-sispag`}
            helper="Com ela, os lotes do Itaú (TED e crédito em conta) são separados pagamento a pagamento."
            acao={
              sispag && (
                <Button type="button" size="xs" variant="linkMuted" onClick={tirarSispag}>
                  <X size={12} aria-hidden /> Tirar
                </Button>
              )
            }
          >
            <input
              id={`${base}-sispag`}
              ref={sispagRef}
              type="file"
              accept=".xlsx,.XLSX,.xls,.XLS,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="block w-full text-sm"
              onChange={(e) => {
                setSispag(e.target.files?.[0] ?? null);
                mudou();
              }}
            />
          </CampoForm>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={conciliar} loading={conciliando} loadingLabel="Conciliando…">
            <Scale size={14} aria-hidden /> Conciliar
          </Button>
          {resposta && arquivo && (
            <Button type="button" variant="secondary" onClick={baixar} loading={baixando} loadingLabel="Gerando…">
              <Download size={14} aria-hidden /> Baixar planilha
            </Button>
          )}
        </div>
        <p className="text-micro text-fg-muted">O extrato do período precisa já estar importado nesta conta, na aba Importações.</p>
        <p aria-live="polite" className="sr-only">
          {situacao}
        </p>
        {erro && (
          <p role="alert" className="text-helper text-danger">
            {erro}
          </p>
        )}
      </section>

      {resposta && <Relatorio key={resposta.envio} relatorio={resposta.relatorio} somas={resposta.somas} />}
    </div>
  );
}

// ─── Relatório ────────────────────────────────────────────────────────────

function Relatorio({ relatorio, somas }: Resposta) {
  const [dia, setDia] = useState<string | null>(null);
  const r = relatorio.resumo;
  return (
    <>
      <section className="flex flex-col gap-3" aria-label="Resumo da conciliação">
        <div>
          <h2 className="text-base font-semibold">
            {r.contaRazao} · {dataBr(r.periodoInicio)} a {dataBr(r.periodoFim)}
          </h2>
          <p className="text-sm text-fg-muted">
            {r.contaBancaria}
            {relatorio.sispagUsado ? " · com a consulta do SISPAG" : ""}
          </p>
        </div>
        <FaixaDeTotais
          className=""
          destaque={false}
          rotulosInteiros
          itens={[
            { rotulo: "Lançamentos no Razão", valor: NUMERO.format(r.lancamentosRazao) },
            { rotulo: "Lançamentos no extrato", valor: NUMERO.format(r.lancamentosExtrato) },
            { rotulo: "Conciliados", valor: NUMERO.format(r.conciliados) },
            { rotulo: "Pendências", valor: NUMERO.format(r.pendencias), tom: r.pendencias > 0 ? "text-warning-fg" : undefined },
            { rotulo: "Movimento do Razão", valor: moeda(r.movimentoRazao) },
            { rotulo: "Movimento do extrato", valor: moeda(r.movimentoExtrato) },
            { rotulo: "Diferença", valor: moeda(r.diferenca), tom: valorZerado(r.diferenca) ? undefined : "text-warning-fg" },
            {
              rotulo: "As pendências explicam a diferença?",
              valor: r.diferencaExplicada ? "Sim" : "Não: revisar",
              tom: r.diferencaExplicada ? "text-success-fg" : "text-danger",
            },
          ]}
        />
        {r.abertura.map((a, i) => (
          <p key={i} className="text-micro text-fg-muted">
            Abertura do período, fora das pendências: {dataBr(a.data)} · {a.historico} · {moeda(a.valor)}
          </p>
        ))}
        {relatorio.avisos.length > 0 && (
          <Aviso tom="atencao">
            <ul className="list-disc pl-4">
              {relatorio.avisos.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </Aviso>
        )}
        {relatorio.conciliadosPorTipo.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-fg-muted">Conciliados por tipo:</span>
            {relatorio.conciliadosPorTipo.map(([tipo, n]) => (
              <Badge key={tipo} variant="success">
                {rotuloDoGrupo(tipo)}: {NUMERO.format(n)}
              </Badge>
            ))}
          </div>
        )}
      </section>

      {relatorio.porDia.length > 0 && <PorDia relatorio={relatorio} dia={dia} onDia={setDia} />}
      <Pendencias relatorio={relatorio} somas={somas} dia={dia} onDia={setDia} />
      {relatorio.aplicacaoSemExtrato.length > 0 && <AplicacaoNaoConferida linhas={relatorio.aplicacaoSemExtrato} />}
    </>
  );
}

// ─── Por dia ──────────────────────────────────────────────────────────────

function PorDia({ relatorio, dia, onDia }: { relatorio: RelatorioConciliacaoJson; dia: string | null; onDia: (d: string | null) => void }) {
  const base = useId();
  const [soComDiferenca, setSoComDiferenca] = useState(true);
  const dias = diasDaTela(relatorio.porDia, soComDiferenca);
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${base}-titulo`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={`${base}-titulo`} className="text-base font-semibold">
            Por dia
          </h2>
          <p className="text-sm text-fg-muted">Escolha um dia para ver só as pendências dele.</p>
        </div>
        <Checkbox
          id={`${base}-filtro`}
          checked={soComDiferenca}
          onChange={(e) => setSoComDiferenca(e.target.checked)}
          label="Só dias com diferença ou pendência"
        />
      </div>
      {dias.length === 0 ? (
        <p className="text-sm text-fg-muted">Todos os dias conferem.</p>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border border-border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-surface">
              <tr className={CABECALHO}>
                <th className={`${TH} pl-3`}>Data</th>
                <th className={`${TH} text-right`}>Razão</th>
                <th className={`${TH} text-right`}>Extrato</th>
                <th className={`${TH} text-right`}>Diferença</th>
                <th className={`${TH} text-right`}>Pendências</th>
              </tr>
            </thead>
            <tbody>
              {dias.map((d) => {
                const escolhido = dia === d.data;
                const diferente = !valorZerado(d.diferenca);
                return (
                  <tr key={d.data} className={`border-b border-border last:border-0 align-top ${escolhido ? "bg-brand/8" : ""}`}>
                    <td className="py-2 pr-3 pl-3">
                      <button
                        type="button"
                        aria-pressed={escolhido}
                        onClick={() => onDia(escolhido ? null : d.data)}
                        className="whitespace-nowrap tabular-nums text-brand hover:underline"
                      >
                        {dataBr(d.data)}
                      </button>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {moeda(d.movimentoRazao)}
                      <span className="block text-micro text-fg-muted">{plural(d.lancamentosRazao, "lançamento", "lançamentos")}</span>
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {moeda(d.movimentoExtrato)}
                      <span className="block text-micro text-fg-muted">{plural(d.lancamentosExtrato, "lançamento", "lançamentos")}</span>
                    </td>
                    <td className={`py-2 pr-3 text-right tabular-nums whitespace-nowrap ${diferente ? "font-semibold text-warning-fg" : ""}`}>
                      {moeda(d.diferenca)}
                      {d.dataDiferente > 0 && <span className="block text-micro font-normal text-fg-muted">{d.dataDiferente} casado(s) em outro dia</span>}
                      {d.aplicacaoSemExtrato > 0 && (
                        <span className="block text-micro font-normal text-fg-muted">{d.aplicacaoSemExtrato} aplicação(ões) não conferida(s)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{d.pendencias || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── Pendências ───────────────────────────────────────────────────────────

function Pendencias({
  relatorio,
  somas,
  dia,
  onDia,
}: Resposta & { dia: string | null; onDia: (d: string | null) => void }) {
  const base = useId();
  const [filtro, setFiltro] = useState<string | null>(null);
  // O dia escolhido filtra tudo abaixo: os tipos e a lista.
  const doDia = pendenciasDoDia(relatorio.pendencias, dia);
  const tipos = agruparPorTipo(doDia);
  const tipoAtivo = filtro && tipos.some((t) => t.tipo === filtro) ? filtro : null;
  const visiveis = tipos.filter((t) => !tipoAtivo || t.tipo === tipoAtivo);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${base}-titulo`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${base}-titulo`} className="text-base font-semibold">
          Pendências
        </h2>
        {dia && (
          <Button type="button" size="xs" variant="secondary" onClick={() => onDia(null)} aria-label={`Tirar o filtro do dia ${dataBr(dia)}`}>
            {dataBr(dia)} <X size={12} aria-hidden />
          </Button>
        )}
      </div>
      {doDia.length > 0 && (
        <div role="group" aria-label="Filtrar pendências por tipo" className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={tipoAtivo === null ? "primary" : "secondary"} aria-pressed={tipoAtivo === null} onClick={() => setFiltro(null)}>
            Todas ({doDia.length})
          </Button>
          {tipos.map((t) => (
            <Button
              key={t.tipo}
              type="button"
              size="sm"
              variant={tipoAtivo === t.tipo ? "primary" : "secondary"}
              aria-pressed={tipoAtivo === t.tipo}
              onClick={() => setFiltro(t.tipo)}
            >
              {t.rotulo} ({t.pendencias.length})
            </Button>
          ))}
        </div>
      )}
      {doDia.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {dia
            ? `Nenhuma pendência em ${dataBr(dia)}. A diferença do dia vem de lançamento casado em outra data.`
            : "Nenhuma pendência. Razão e extrato conferem."}
        </p>
      ) : (
        visiveis.map((t) => (
          <div key={t.tipo} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Badge variant={VARIANTE[t.tipo] ?? "neutral"}>{t.rotulo}</Badge>
              <span className="text-fg-muted font-normal">{plural(t.pendencias.length, "pendência", "pendências")}</span>
            </h3>
            <ul className="flex flex-col gap-2">
              {t.pendencias.map(({ indice, grupo }) =>
                ehLote(grupo) ? (
                  <Lote key={indice} grupo={grupo} somas={somas[indice]} />
                ) : (
                  <PendenciaSimples key={indice} grupo={grupo} />
                ),
              )}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function LinhaDoRazao({ l }: { l: LinhaRazaoJson }) {
  return (
    <div>
      <span className="tabular-nums whitespace-nowrap">
        {dataBr(l.data)} · {moeda(l.valor)}
      </span>
      <span className="block text-micro">{l.historico}</span>
      <span className="block text-micro text-fg-muted">
        Lote {l.lote || "—"}
        {l.contrapartida ? ` · Contrapartida ${l.contrapartida}` : ""}
      </span>
    </div>
  );
}

function PendenciaSimples({ grupo: g }: { grupo: GrupoConciliacaoJson }) {
  return (
    <li className="grid gap-3 rounded-lg border border-border bg-surface p-3 text-sm sm:grid-cols-[1fr_1fr_auto]">
      <div className="flex flex-col gap-2">
        <p className="text-micro uppercase tracking-wide text-fg-muted">Razão</p>
        {g.razao.length === 0 ? <span className="text-fg-muted">—</span> : g.razao.map((l, j) => <LinhaDoRazao key={j} l={l} />)}
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-micro uppercase tracking-wide text-fg-muted">Extrato</p>
        {g.extrato.length === 0 ? (
          <span className="text-fg-muted">—</span>
        ) : (
          g.extrato.map((l) => (
            <div key={l.transacaoId}>
              <span className="tabular-nums whitespace-nowrap">
                {dataBr(l.data)} · {moeda(l.valor)}
              </span>
              <span className="block text-micro">{l.historico}</span>
            </div>
          ))
        )}
      </div>
      <div className="sm:text-right">
        <p className="text-micro uppercase tracking-wide text-fg-muted">Diferença</p>
        <p className={`tabular-nums whitespace-nowrap ${valorZerado(g.diferenca) ? "" : "font-semibold text-warning-fg"}`}>{moeda(g.diferenca)}</p>
      </div>
    </li>
  );
}

const EXPLICACAO: Record<ComposicaoNaTela["criterio"], string> = {
  grupo_unico: "Grupo único: todos os lançamentos do Razão compõem esta linha.",
  soma_unica_sispag: "Composição única pelos valores do SISPAG: escolha para ver só os lançamentos dela.",
  lotes_soma: "Sugestão pela soma e pelos lotes: escolha para conferir.",
  sem_vinculo: "Sem vínculo seguro no relatório.",
};

// Lote: o pagamento sem par vem primeiro, e a composição fica recolhida.
function Lote({ grupo: g, somas }: { grupo: GrupoConciliacaoJson; somas: SomasDoGrupo | undefined }) {
  const base = useId();
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const faltando = g.sispagFaltando;
  const data = (g.extrato[0] ?? g.razao[0])?.data;
  const composicoes = somas?.composicoes ?? [];
  const temSugestao = composicoes.some((c) => c.sugerida);
  const composicao = escolhido === null ? null : (composicoes.find((c) => c.extratoIndice === escolhido) ?? null);
  // Razão → a linha do extrato que ele compõe (só os vínculos seguros ou sugeridos).
  const extratoDoRazao = new Map<number, number>();
  for (const c of composicoes) if (c.criterio !== "sem_vinculo") for (const i of c.razaoIndices) extratoDoRazao.set(i, c.extratoIndice);
  const razaoVisivel = g.razao
    .map((linha, indice) => ({ linha, indice }))
    .filter(({ indice }) => escolhido === null || (composicao !== null && composicao.criterio !== "sem_vinculo" && composicao.razaoIndices.includes(indice)));

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular-nums">{dataBr(data)}</span>
        <span className={`tabular-nums whitespace-nowrap font-semibold ${valorZerado(g.diferenca) ? "" : "text-warning-fg"}`}>Diferença {moeda(g.diferenca)}</span>
      </div>

      {faltando.length > 0 && (
        <Aviso tom="atencao">
          <p className="font-medium">
            {faltando.length === 1
              ? "Pago pelo banco neste lote, sem lançamento no Razão"
              : `${faltando.length} pagamentos do lote feitos pelo banco, sem lançamento no Razão`}
          </p>
          <ul className="mt-1 flex flex-col gap-1">
            {faltando.map((p, j) => (
              <li key={j} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <span className="font-medium">{p.favorecido}</span>
                  {p.documento ? ` · ${p.documento}` : ""} · {p.tipo}
                </span>
                <span className="tabular-nums whitespace-nowrap font-semibold">{moeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        </Aviso>
      )}

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <dt className="text-micro text-fg-muted">Extrato · {plural(g.extrato.length, "linha", "linhas")}</dt>
          <dd className="tabular-nums whitespace-nowrap">{somas ? moeda(somas.totalExtrato) : "—"}</dd>
        </div>
        <div>
          <dt className="text-micro text-fg-muted">Razão · {plural(g.razao.length, "lançamento", "lançamentos")}</dt>
          <dd className="tabular-nums whitespace-nowrap">{somas ? moeda(somas.totalRazao) : "—"}</dd>
        </div>
        <div>
          <dt className="text-micro text-fg-muted">Razão − extrato</dt>
          <dd className={`tabular-nums whitespace-nowrap ${valorZerado(g.diferenca) ? "" : "font-semibold text-warning-fg"}`}>{moeda(g.diferenca)}</dd>
        </div>
      </dl>

      <Accordion
        classeDoCabecalho="text-fg-muted hover:text-fg text-left"
        titulo={`Ver a composição (${plural(g.extrato.length, "linha", "linhas")} do extrato, ${plural(g.razao.length, "lançamento", "lançamentos")} do Razão)`}
      >
        {temSugestao && (
          <Aviso tom="atencao" className="mt-3">
            <p className="font-medium">Sugestão de composição: confira antes de usar</p>
            <p className="mt-1 text-micro">As somas fecham e os lotes formam blocos, mas o lote do Domínio não tem relação garantida com o extrato do banco.</p>
          </Aviso>
        )}
        <div className="mt-3 grid gap-4 lg:grid-cols-[2fr_3fr]">
          <div>
            <p id={`${base}-extrato`} className="mb-1 text-micro font-medium text-fg-muted">
              Extrato
            </p>
            <div role="group" aria-labelledby={`${base}-extrato`} className="flex flex-col gap-2">
              {g.extrato.map((l, j) => {
                const c = composicoes.find((x) => x.extratoIndice === j);
                const ativo = escolhido === j;
                const vinculada = !!c && c.criterio !== "sem_vinculo";
                return (
                  <button
                    key={l.transacaoId}
                    type="button"
                    aria-pressed={ativo}
                    onClick={() => setEscolhido(ativo ? null : j)}
                    className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-surface-2 ${ativo ? "border-brand bg-brand/8" : "border-border"}`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          <Selo tom={vinculada ? (c?.sugerida ? "atencao" : "marca") : "neutro"}>Extrato {j + 1}</Selo>
                          {c?.sugerida && <span className="text-micro text-warning-fg">sugerida</span>}
                        </span>
                        <span className="mt-1 block text-micro text-fg-muted">
                          {dataBr(l.data)} · {l.historico}
                        </span>
                      </span>
                      <span className="tabular-nums whitespace-nowrap font-semibold">{moeda(l.valor)}</span>
                    </span>
                    <span className="mt-3 grid grid-cols-2 gap-2 text-micro">
                      <span>
                        <span className="block text-fg-muted">Razão vinculado</span>
                        <span className="tabular-nums">{c?.totalRazao != null ? moeda(c.totalRazao) : "—"}</span>
                      </span>
                      <span>
                        <span className="block text-fg-muted">Diferença</span>
                        <span className={`tabular-nums ${c?.diferenca != null && !valorZerado(c.diferenca) ? "font-semibold text-warning-fg" : ""}`}>
                          {c?.diferenca != null ? moeda(c.diferenca) : "—"}
                        </span>
                      </span>
                    </span>
                    <span className="mt-2 block text-micro text-fg-muted">
                      {c?.criterio === "soma_unica_sispag" && c.sispagFaltandoIndices.length > 0
                        ? "Soma única; inclui pagamento do SISPAG sem lançamento no Razão."
                        : EXPLICACAO[c?.criterio ?? "sem_vinculo"]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-1 text-micro font-medium text-fg-muted">
              Razão{escolhido !== null ? ` da linha ${escolhido + 1} do extrato` : ""}
            </p>
            {razaoVisivel.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-fg-muted">
                Esta linha do extrato não tem vínculo seguro nos dados. Para não sugerir uma conferência falsa, o Razão não foi filtrado.
              </p>
            ) : (
              <ul className="max-h-72 overflow-y-auto rounded-md border border-border">
                {razaoVisivel.map(({ linha: l, indice }) => {
                  const extrato = extratoDoRazao.get(indice);
                  return (
                    <li key={indice} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
                      <span className="min-w-0">
                        <span className="block">{l.historico}</span>
                        <span className="block text-micro text-fg-muted">
                          {dataBr(l.data)} · Lote {l.lote || "—"}
                          {l.contrapartida ? ` · ${l.contrapartida}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="tabular-nums whitespace-nowrap">{moeda(l.valor)}</span>
                        {extrato !== undefined && <Selo tom="neutro">Extrato {extrato + 1}</Selo>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </Accordion>
    </li>
  );
}

// ─── Aplicação não conferida ──────────────────────────────────────────────

function AplicacaoNaoConferida({ linhas }: { linhas: LinhaRazaoJson[] }) {
  const base = useId();
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`${base}-titulo`}>
      <div>
        <h2 id={`${base}-titulo`} className="text-base font-semibold">
          Aplicação automática não conferida ({linhas.length})
        </h2>
        <p className="text-sm text-fg-muted">
          O extrato importado não traz estes lançamentos do Razão. Eles ficam fora das pendências: confira no extrato consolidado ou no relatório
          de aplicações do banco.
        </p>
      </div>
      <Accordion classeDoCabecalho="text-sm text-fg-muted hover:text-fg" titulo="Ver os lançamentos">
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className={CABECALHO}>
                <th className={TH}>Data</th>
                <th className={TH}>Histórico</th>
                <th className={TH}>Lote</th>
                <th className={TH}>Contrapartida</th>
                <th className={`${TH} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} className="border-b border-border last:border-0 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{dataBr(l.data)}</td>
                  <td className="py-2 pr-3">{l.historico}</td>
                  <td className="py-2 pr-3">{l.lote || "—"}</td>
                  <td className="py-2 pr-3">{l.contrapartida || "—"}</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">{moeda(l.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Accordion>
    </section>
  );
}
