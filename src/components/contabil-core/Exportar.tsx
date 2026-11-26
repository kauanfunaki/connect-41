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

// As exportações do Contábil Core: o arquivo de lançamentos do Domínio (Fase 2, 09/11/2026) e, na Fase D1
// (26/11/2026), os outros arquivos do original (as "Exportações Especializadas" da tela Registros): os
// lançamentos contábeis, as baixas de NF-e e NFS-e e a simples conferência, em CSV ou XLSX (o TXT é só do
// Domínio). Baixa pelo `fetch` para ler os avisos que o servidor manda no cabeçalho (conta sem código reduzido,
// lançamento sem par) antes de salvar.

type Tipo = "lancamentos_importacao" | "lancamentos" | "nfe_entrada" | "nfe_saida" | "nfse_tomado" | "nfse_prestado" | "conferencia";

const TIPOS: { valor: Tipo; rotulo: string; formatos: ("txt" | "csv" | "xlsx")[] }[] = [
  { valor: "lancamentos_importacao", rotulo: "Lançamentos para o Domínio", formatos: ["txt", "csv", "xlsx"] },
  { valor: "lancamentos", rotulo: "Lançamentos contábeis (as partidas)", formatos: ["csv", "xlsx"] },
  { valor: "nfe_entrada", rotulo: "Baixa de NF-e de entrada", formatos: ["csv", "xlsx"] },
  { valor: "nfe_saida", rotulo: "Baixa de NF-e de saída", formatos: ["csv", "xlsx"] },
  { valor: "nfse_tomado", rotulo: "Baixa de NFS-e tomada", formatos: ["csv", "xlsx"] },
  { valor: "nfse_prestado", rotulo: "Baixa de NFS-e prestada", formatos: ["csv", "xlsx"] },
  { valor: "conferencia", rotulo: "Simples conferência (transação × nota × comprovante)", formatos: ["csv", "xlsx"] },
];

const ROTULO_DO_FORMATO = { txt: "TXT (importação do Domínio)", csv: "CSV", xlsx: "Excel (XLSX)" } as const;
const NOTAS: readonly Tipo[] = ["nfe_entrada", "nfe_saida", "nfse_tomado", "nfse_prestado"];

/** Pede o arquivo e salva com o nome que o servidor deu; devolve os avisos do cabeçalho ou a frase do erro. */
async function baixar(q: URLSearchParams, nomePadrao: string): Promise<{ ok: true; avisos: string[] } | { ok: false; erro: string }> {
  const resp = await fetch(`/api/contabil-core/exportacao?${q}`).catch(() => null);
  if (!resp?.ok) {
    const corpo = (await resp?.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, erro: corpo?.error ?? "Não deu para gerar o arquivo." };
  }
  const nome = /filename="([^"]+)"/.exec(resp.headers.get("Content-Disposition") ?? "")?.[1] ?? nomePadrao;
  const url = URL.createObjectURL(await resp.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
  return { ok: true, avisos: decodeURIComponent(resp.headers.get("X-Avisos") ?? "").split(" | ").filter(Boolean) };
}

export function Exportar({ empresaId, agencias, mes }: { empresaId: string; agencias: Opcao[]; mes: string }) {
  const base = useId();
  const [tipo, setTipo] = useState<Tipo>("lancamentos_importacao");
  const [competencia, setCompetencia] = useState(mes);
  const [agenciaId, setAgenciaId] = useState("");
  const [formato, setFormato] = useState<"txt" | "csv" | "xlsx">("txt");
  const [historicoExtrato, setHistoricoExtrato] = useState(false);
  const [inativas, setInativas] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [avisos, setAvisos] = useState<string[]>([]);
  const toast = useToast();
  const doTipo = TIPOS.find((t) => t.valor === tipo)!;
  // As baixas de nota não têm conta bancária (no original, ignoravam o filtro).
  const comConta = !NOTAS.includes(tipo);

  function trocarTipo(novo: Tipo) {
    setTipo(novo);
    const formatos = TIPOS.find((t) => t.valor === novo)!.formatos;
    if (!formatos.includes(formato)) setFormato(formatos[0]);
  }

  async function gerar() {
    setBaixando(true);
    setAvisos([]);
    const q = new URLSearchParams({ empresa: empresaId, tipo, mes: competencia, formato, inativas: inativas && comConta ? "1" : "0" });
    if (tipo === "lancamentos_importacao" && historicoExtrato) q.set("historicoExtrato", "1");
    if (agenciaId && comConta) q.set("agencia", agenciaId);
    const r = await baixar(q, `${tipo}.${formato}`);
    setBaixando(false);
    if (!r.ok) return toast.error(r.erro);
    setAvisos(r.avisos);
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <p className="text-sm font-medium">Exportar arquivo</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CampoForm label="Arquivo" htmlFor={`${base}-tipo`}>
          <Select id={`${base}-tipo`} value={tipo} onChange={(e) => trocarTipo(e.target.value as Tipo)}>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Select>
        </CampoForm>
        <CampoForm label="Competência" htmlFor={`${base}-mes`} required>
          <CampoMes id={`${base}-mes`} name="mes" value={competencia} onChange={setCompetencia} />
        </CampoForm>
        {comConta && (
          <CampoForm label="Conta bancária" htmlFor={`${base}-ag`}>
            <SearchableSelect id={`${base}-ag`} name="agenciaId" options={agencias} onChange={setAgenciaId} placeholder="Todas" vazioLabel="Todas" />
          </CampoForm>
        )}
        <CampoForm label="Formato" htmlFor={`${base}-fmt`}>
          <Select id={`${base}-fmt`} value={formato} onChange={(e) => setFormato(e.target.value as "txt" | "csv" | "xlsx")}>
            {doTipo.formatos.map((f) => (
              <option key={f} value={f}>
                {ROTULO_DO_FORMATO[f]}
              </option>
            ))}
          </Select>
        </CampoForm>
      </div>
      {(comConta || tipo === "lancamentos_importacao") && (
        <div className="flex flex-wrap gap-4">
          {tipo === "lancamentos_importacao" && (
            <Checkbox checked={historicoExtrato} onChange={(e) => setHistoricoExtrato(e.target.checked)} label="Usar o histórico do banco no lugar do contábil" />
          )}
          {comConta && <Checkbox checked={inativas} onChange={(e) => setInativas(e.target.checked)} label="Incluir contas bancárias inativas" />}
        </div>
      )}
      {NOTAS.includes(tipo) && (
        <p className="text-micro text-fg-muted">
          As notas da empresa saem pela comparação do CNPJ dela com o emitente (saída e prestada) ou o destinatário (entrada e tomada), na
          emissão em UTC dentro da competência.
        </p>
      )}
      <div>
        <Button type="button" onClick={gerar} loading={baixando} loadingLabel="Gerando…" disabled={!/^\d{4}-\d{2}$/.test(competencia)}>
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

const SITUACOES = ["pendente", "processada", "erro"];

/**
 * O extrato com os filtros da aba Extrato (Fase D1): as mesmas linhas que a tela mostra, na mesma ordem, sem a
 * paginação. Era o botão "Exportar" da página Extrato do original (lá só em XLSX; a rota aceita também CSV).
 */
export function ExportarExtrato({ empresaId, mes, agenciaId, busca, status }: { empresaId: string; mes: string | null; agenciaId: string | null; busca: string | null; status: string | null }) {
  const [baixando, setBaixando] = useState<"" | "csv" | "xlsx">("");
  const toast = useToast();

  async function gerar(formato: "csv" | "xlsx") {
    setBaixando(formato);
    const q = new URLSearchParams({ empresa: empresaId, tipo: "extrato", formato });
    if (mes) q.set("mes", mes);
    if (agenciaId) q.set("agencia", agenciaId);
    if (busca) q.set("busca", busca);
    // A tela ignora a situação que não existe; o arquivo também.
    if (status && SITUACOES.includes(status)) q.set("status", status);
    const r = await baixar(q, `extrato.${formato}`);
    setBaixando("");
    if (!r.ok) toast.error(r.erro);
  }

  return (
    <div className="mb-3 flex gap-2">
      <Button type="button" size="sm" variant="secondary" onClick={() => gerar("xlsx")} loading={baixando === "xlsx"} loadingLabel="Gerando…" disabled={!!baixando}>
        <Download size={14} aria-hidden /> Excel
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => gerar("csv")} loading={baixando === "csv"} loadingLabel="Gerando…" disabled={!!baixando}>
        <Download size={14} aria-hidden /> CSV
      </Button>
    </div>
  );
}
