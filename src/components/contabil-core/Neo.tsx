"use client";

import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";
import { classificarComRegraAction, classificarManualAction, processarNeoAction, simularRegraAction } from "@/app/(app)/contabil-core/actions";
import { prefixoComumDePalavras } from "@/lib/contabil-core/motor/fila";
import { LiberarParaAutomatico } from "./Botoes";

// O NEO na tela: rodar o motor sobre as pendências e classificar o que ficou (Fase 2), com a fila
// agrupada por padrão, a regra da seleção e a simulação de alcance (Fase 3, 09/11/2026).

export function ProcessarNeo({ empresaId, agenciaId, mes }: { empresaId: string; agenciaId: string | null; mes: string | null }) {
  const [pendente, startTransition] = useTransition();
  const [resumo, setResumo] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  function rodar() {
    setResumo(null);
    startTransition(async () => {
      const r = await processarNeoAction(empresaId, { agenciaId: agenciaId ?? "", mes: mes ?? "" });
      if ("error" in r) return toast.error(r.error);
      const v = r.resultado;
      setResumo(
        `${v.totalPendentes} pendência(s): ${v.associadas} classificada(s)` +
          `${v.classificadasPorContraparte ? ` (${v.classificadasPorContraparte} pela contraparte)` : ""}, ${v.semRegra} sem regra` +
          `${v.bloqueadasValorSuspeito ? ` (${v.bloqueadasValorSuspeito} com valor suspeito)` : ""}${v.erros ? `, ${v.erros} com erro` : ""}.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button type="button" onClick={rodar} loading={pendente} loadingLabel="Classificando…">
        <Zap size={14} aria-hidden /> Rodar o NEO{mes ? ` (${mes.slice(5)}/${mes.slice(0, 4)})` : ""}
      </Button>
      {resumo && <Aviso tom="info">{resumo}</Aviso>}
    </div>
  );
}

export type Pendencia = {
  id: string;
  data: string;
  historico: string;
  dc: string;
  valor: string;
  motivo: string | null;
  estrategia: string | null;
  recusadaPorPessoa: boolean;
};

export type GrupoDaTela = { chave: string; rotulo: string; dc: string; quantidade: number; total: string; contas: number; transacaoIds: string[] };

type Simulacao = { pendencias: number; amostras: string[]; contabilizadas: number; conflitos: number; amostrasDeConflito: string[] };

export function FilaDoNeo({
  empresaId,
  pendencias,
  contas,
  agencias,
  grupos,
  parcial,
}: {
  empresaId: string;
  pendencias: Pendencia[];
  contas: Opcao[];
  agencias: Opcao[];
  grupos: GrupoDaTela[];
  parcial: boolean;
}) {
  const base = useId();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [contaId, setContaId] = useState("");
  const [historico, setHistorico] = useState("");
  const [manter, setManter] = useState(false);
  const [criarRegra, setCriarRegra] = useState(false);
  const [textoDaRegra, setTextoDaRegra] = useState<string | null>(null);
  const [agenciaDaRegra, setAgenciaDaRegra] = useState("");
  const [aplicar, setAplicar] = useState(true);
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueios, setBloqueios] = useState<{ transacaoId: string; motivo: string }[]>([]);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const selecionadas = useMemo(() => pendencias.filter((p) => marcadas.has(p.id)), [pendencias, marcadas]);
  const lados = useMemo(() => new Set(selecionadas.map((p) => p.dc)), [selecionadas]);
  // A sugestão sai da PRIMEIRA linha marcada, como no original; o contador pode editar.
  const sugestao = useMemo(() => prefixoComumDePalavras(selecionadas.map((p) => p.historico)), [selecionadas]);
  const regra = textoDaRegra ?? sugestao;

  function marcar(ids: string[], ligar: boolean) {
    setSimulacao(null);
    setTextoDaRegra(null);
    setMarcadas((m) => {
      const n = new Set(m);
      for (const id of ids) {
        if (ligar) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  }

  function simular() {
    setErro(null);
    startTransition(async () => {
      const r = await simularRegraAction(empresaId, { historico: regra, dc: lados.size === 1 ? [...lados][0] : "", agenciaId: agenciaDaRegra, contaId });
      if ("error" in r) return setErro(r.error);
      setSimulacao(r.simulacao);
    });
  }

  function classificar() {
    setErro(null);
    setBloqueios([]);
    const pedido = { transacaoIds: selecionadas.map((p) => p.id), contaId, descricao: historico, manterHistorico: manter };
    startTransition(async () => {
      if (criarRegra) {
        const r = await classificarComRegraAction(empresaId, { ...pedido, regra: { historico: regra, agenciaId: agenciaDaRegra, manterHistorico: manter, aplicarNosSemelhantes: aplicar } });
        if ("error" in r) return setErro(r.error);
        const v = r.resultado;
        setBloqueios(v.bloqueadas);
        toast.success(
          `${v.classificadas.length} classificada(s)` +
            (v.regraCriada ? `; regra criada${v.semelhantes !== null ? `, ${v.semelhantes} semelhante(s) classificada(s) pelo NEO` : ""}` : "; a regra não pôde ser criada") +
            ".",
        );
      } else {
        const r = await classificarManualAction(empresaId, pedido);
        if ("error" in r) return setErro(r.error);
        const v = r.resultado;
        setBloqueios(v.bloqueadas);
        toast.success(`${v.classificadas.length} classificada(s)${v.ignoradas.length ? `, ${v.ignoradas.length} já não estava(m) pendente(s)` : ""}.`);
      }
      setMarcadas(new Set());
      setSimulacao(null);
      setTextoDaRegra(null);
      router.refresh();
    });
  }

  if (!pendencias.length) return <p className="text-sm text-fg-muted">Nenhuma pendência nesta seleção.</p>;

  return (
    <div className="flex flex-col gap-3">
      {grupos.length > 0 && (
        <section aria-label="Pendências por padrão" className="flex flex-col gap-2">
          <p className="text-sm font-medium">Por padrão de histórico</p>
          {parcial && <p className="text-micro text-fg-muted">A fila é grande: os grupos descrevem as 10.000 primeiras pendências. Filtre por mês ou conta.</p>}
          <div className="flex flex-wrap gap-2">
            {grupos.map((g) => {
              const todas = g.transacaoIds.every((id) => marcadas.has(id));
              return (
                <button
                  key={g.chave}
                  type="button"
                  onClick={() => marcar(g.transacaoIds, !todas)}
                  className={`rounded-md border px-2 py-1 text-left text-micro ${todas ? "border-brand bg-brand/8" : "border-border bg-surface"}`}
                  aria-pressed={todas}
                >
                  <span className="block font-medium">{g.rotulo}</span>
                  <span className="text-fg-muted">
                    {g.dc === "D" ? "Débito" : "Crédito"} · {g.quantidade} · {g.total}
                    {g.contas > 1 ? ` · ${g.contas} contas bancárias` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
              <th className="py-2 pr-2 w-8">
                <Checkbox aria-label="Marcar todas" checked={marcadas.size === pendencias.length} onChange={(e) => marcar(pendencias.map((p) => p.id), e.target.checked)} />
              </th>
              <th className="py-2 pr-3 font-medium">Data</th>
              <th className="py-2 pr-3 font-medium">Histórico do banco</th>
              <th className="py-2 pr-3 font-medium text-right">Valor</th>
              <th className="py-2 font-medium">Por que ficou</th>
            </tr>
          </thead>
          <tbody>
            {pendencias.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 align-top">
                <td className="py-2 pr-2">
                  <Checkbox aria-label={`Marcar ${p.historico}`} checked={marcadas.has(p.id)} onChange={(e) => marcar([p.id], e.target.checked)} />
                </td>
                <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{p.data}</td>
                <td className="py-2 pr-3">{p.historico}</td>
                <td className={`py-2 pr-3 text-right tabular-nums whitespace-nowrap ${p.dc === "D" ? "text-danger" : "text-success-fg"}`}>{p.valor}</td>
                <td className="py-2 text-micro text-fg-muted">
                  {p.estrategia === "valor_suspeito" && <Selo tom="perigo">Valor suspeito</Selo>}{" "}
                  {p.recusadaPorPessoa ? (
                    <span className="flex flex-col gap-1">
                      <Selo tom="atencao">Fora do automático</Selo>
                      <LiberarParaAutomatico empresaId={empresaId} transacaoId={p.id} />
                    </span>
                  ) : (
                    (p.motivo ?? "Ainda não passou pelo NEO.")
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium">
          Classificar à mão {marcadas.size ? `(${marcadas.size} marcada${marcadas.size > 1 ? "s" : ""})` : ""}
        </p>
        {lados.size > 1 && <Aviso tom="atencao">A seleção mistura débito e crédito. Confira se a mesma conta vale para os dois lados; regra não pode ser criada.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoForm label="Conta contábil" htmlFor={`${base}-conta`} required>
            <SearchableSelect id={`${base}-conta`} name="contaId" options={contas} defaultValue={contaId} onChange={(v) => { setContaId(v); setSimulacao(null); }} placeholder="Escolha a conta" />
          </CampoForm>
          <CampoForm label="Histórico do lançamento" htmlFor={`${base}-hist`} required={!manter}>
            <Input id={`${base}-hist`} value={historico} onChange={(e) => setHistorico(e.target.value)} maxLength={500} disabled={manter} autoComplete="off" />
          </CampoForm>
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <Checkbox checked={manter} onChange={(e) => setManter(e.target.checked)} label="Usar o histórico do banco de cada transação" />
          <Checkbox checked={criarRegra} disabled={lados.size > 1} onChange={(e) => setCriarRegra(e.target.checked)} label="Criar uma regra com esta seleção" />
        </div>

        {criarRegra && (
          <div className="mt-3 flex flex-col gap-3 rounded-md border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoForm label="Texto da regra" htmlFor={`${base}-regra`} required helper="Sugerido pelo trecho que todas as marcadas têm em comum.">
                <Input id={`${base}-regra`} value={regra} onChange={(e) => { setTextoDaRegra(e.target.value); setSimulacao(null); }} maxLength={500} autoComplete="off" />
              </CampoForm>
              <CampoForm label="Conta bancária da regra" htmlFor={`${base}-ag`} helper="Vazio: vale para todos os bancos.">
                <SearchableSelect id={`${base}-ag`} name="agenciaId" options={agencias} defaultValue={agenciaDaRegra} onChange={(v) => { setAgenciaDaRegra(v); setSimulacao(null); }} placeholder="Todos os bancos" vazioLabel="Todos os bancos" />
              </CampoForm>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Checkbox checked={aplicar} onChange={(e) => setAplicar(e.target.checked)} label="Aplicar também nas pendências semelhantes" />
              <Button type="button" size="sm" variant="secondary" onClick={simular} disabled={!contaId || regra.trim().length < 2 || lados.size !== 1} loading={pendente}>
                Simular alcance
              </Button>
            </div>
            {simulacao && (
              <Aviso tom={simulacao.conflitos ? "atencao" : "info"}>
                <p>
                  Pega {simulacao.pendencias} pendência(s) e casaria com {simulacao.contabilizadas} já contabilizada(s)
                  {simulacao.conflitos ? `, ${simulacao.conflitos} delas numa conta diferente` : ""}.
                </p>
                {simulacao.amostrasDeConflito.length > 0 && <p className="mt-1 text-micro">Em outra conta: {simulacao.amostrasDeConflito.join("; ")}</p>}
              </Aviso>
            )}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <Button type="button" onClick={classificar} disabled={!marcadas.size || !contaId || (criarRegra && regra.trim().length < 2)} loading={pendente} loadingLabel="Classificando…">
            {criarRegra ? "Classificar e criar a regra" : "Classificar"}
          </Button>
        </div>
        {erro && (
          <p role="alert" className="mt-2 text-helper text-danger">
            {erro}
          </p>
        )}
        {bloqueios.length > 0 && (
          <Aviso tom="atencao" className="mt-2">
            {bloqueios.map((b) => (
              <p key={b.transacaoId}>{b.motivo}</p>
            ))}
          </Aviso>
        )}
      </div>
    </div>
  );
}
