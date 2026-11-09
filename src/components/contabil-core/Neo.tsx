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
import { classificarManualAction, processarNeoAction } from "@/app/(app)/contabil-core/actions";
import { LiberarParaAutomatico } from "./Botoes";

// O NEO na tela (Fase 2, 09/11/2026): rodar o motor sobre as pendências e classificar à mão o que ficou.

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

export function FilaDoNeo({ empresaId, pendencias, contas }: { empresaId: string; pendencias: Pendencia[]; contas: Opcao[] }) {
  const base = useId();
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [contaId, setContaId] = useState("");
  const [historico, setHistorico] = useState("");
  const [manter, setManter] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [bloqueios, setBloqueios] = useState<{ transacaoId: string; motivo: string }[]>([]);
  const [pendente, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const lados = useMemo(() => new Set(pendencias.filter((p) => marcadas.has(p.id)).map((p) => p.dc)), [pendencias, marcadas]);

  function alternar(id: string) {
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function classificar() {
    setErro(null);
    setBloqueios([]);
    startTransition(async () => {
      const r = await classificarManualAction(empresaId, { transacaoIds: [...marcadas], contaId, descricao: historico, manterHistorico: manter });
      if ("error" in r) return setErro(r.error);
      const v = r.resultado;
      setBloqueios(v.bloqueadas);
      setMarcadas(new Set());
      toast.success(`${v.classificadas.length} classificada(s)${v.ignoradas.length ? `, ${v.ignoradas.length} já não estava(m) pendente(s)` : ""}.`);
      router.refresh();
    });
  }

  if (!pendencias.length) {
    return <p className="text-sm text-fg-muted">Nenhuma pendência nesta seleção.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
              <th className="py-2 pr-2 w-8">
                <Checkbox
                  aria-label="Marcar todas"
                  checked={marcadas.size === pendencias.length}
                  onChange={(e) => setMarcadas(e.target.checked ? new Set(pendencias.map((p) => p.id)) : new Set())}
                />
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
                  <Checkbox aria-label={`Marcar ${p.historico}`} checked={marcadas.has(p.id)} onChange={() => alternar(p.id)} />
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
        {lados.size > 1 && <Aviso tom="atencao">A seleção mistura débito e crédito. Confira se a mesma conta vale para os dois lados.</Aviso>}
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoForm label="Conta contábil" htmlFor={`${base}-conta`} required>
            <SearchableSelect id={`${base}-conta`} name="contaId" options={contas} defaultValue={contaId} onChange={setContaId} placeholder="Escolha a conta" />
          </CampoForm>
          <CampoForm label="Histórico do lançamento" htmlFor={`${base}-hist`} required={!manter}>
            <Input id={`${base}-hist`} value={historico} onChange={(e) => setHistorico(e.target.value)} maxLength={500} disabled={manter} autoComplete="off" />
          </CampoForm>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Checkbox checked={manter} onChange={(e) => setManter(e.target.checked)} label="Usar o histórico do banco de cada transação" />
          <Button type="button" onClick={classificar} disabled={!marcadas.size || !contaId} loading={pendente} loadingLabel="Classificando…">
            Classificar
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
