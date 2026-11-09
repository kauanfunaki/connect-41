"use client";

import { useId, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Checkbox } from "@/components/ui/Checkbox";
import { CampoForm } from "@/components/ui/CampoForm";
import { CampoMes } from "@/components/ui/CampoMes";
import { Aviso } from "@/components/ui/Aviso";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, type Opcao } from "@/components/shared/SearchableSelect";

// O arquivo de lançamentos do Domínio (Fase 2, 09/11/2026). Baixa pelo `fetch` para ler os avisos que
// o servidor manda no cabeçalho (conta sem código reduzido, lançamento sem par) antes de salvar.

export function Exportar({ empresaId, agencias, mes }: { empresaId: string; agencias: Opcao[]; mes: string }) {
  const base = useId();
  const [competencia, setCompetencia] = useState(mes);
  const [agenciaId, setAgenciaId] = useState("");
  const [formato, setFormato] = useState("txt");
  const [historicoExtrato, setHistoricoExtrato] = useState(false);
  const [inativas, setInativas] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const toast = useToast();

  async function baixar() {
    setBaixando(true);
    setAvisos([]);
    const q = new URLSearchParams({ empresa: empresaId, mes: competencia, formato, historicoExtrato: historicoExtrato ? "1" : "0", inativas: inativas ? "1" : "0" });
    if (agenciaId) q.set("agencia", agenciaId);
    const resp = await fetch(`/api/contabil-core/exportacao?${q}`).catch(() => null);
    setBaixando(false);
    if (!resp?.ok) {
      const corpo = (await resp?.json().catch(() => null)) as { error?: string } | null;
      return toast.error(corpo?.error ?? "Não deu para gerar o arquivo.");
    }
    const nome = /filename="([^"]+)"/.exec(resp.headers.get("Content-Disposition") ?? "")?.[1] ?? `lancamentos.${formato}`;
    const url = URL.createObjectURL(await resp.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
    setAvisos(decodeURIComponent(resp.headers.get("X-Avisos") ?? "").split(" | ").filter(Boolean));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm font-medium">Arquivo de lançamentos para o Domínio</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <CampoForm label="Competência" htmlFor={`${base}-mes`} required>
          <CampoMes id={`${base}-mes`} name="mes" value={competencia} onChange={setCompetencia} />
        </CampoForm>
        <CampoForm label="Conta bancária" htmlFor={`${base}-ag`}>
          <SearchableSelect id={`${base}-ag`} name="agenciaId" options={agencias} onChange={setAgenciaId} placeholder="Todas" vazioLabel="Todas" />
        </CampoForm>
        <CampoForm label="Formato" htmlFor={`${base}-fmt`}>
          <Select id={`${base}-fmt`} value={formato} onChange={(e) => setFormato(e.target.value)}>
            <option value="txt">TXT (importação do Domínio)</option>
            <option value="csv">CSV (conferência)</option>
          </Select>
        </CampoForm>
      </div>
      <div className="flex flex-wrap gap-4">
        <Checkbox checked={historicoExtrato} onChange={(e) => setHistoricoExtrato(e.target.checked)} label="Usar o histórico do banco no lugar do contábil" />
        <Checkbox checked={inativas} onChange={(e) => setInativas(e.target.checked)} label="Incluir contas bancárias inativas" />
      </div>
      <div>
        <Button type="button" onClick={baixar} loading={baixando} loadingLabel="Gerando…" disabled={!/^\d{4}-\d{2}$/.test(competencia)}>
          <Download size={14} aria-hidden /> Baixar arquivo
        </Button>
      </div>
      {avisos.length > 0 && (
        <Aviso tom="atencao">
          {avisos.map((a) => (
            <p key={a}>{a}</p>
          ))}
        </Aviso>
      )}
    </div>
  );
}
