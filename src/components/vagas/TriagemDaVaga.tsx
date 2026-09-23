"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { pontuarPassoDoLote, salvarRequisitosDaVaga } from "@/app/(app)/vagas/[id]/triagem-actions";
import { CORTES_PADRAO, ROTULO_DA_FAIXA, type Faixa, type Requisito } from "@/lib/recrutamento/triagem";

type Linha = { tipo: Requisito["tipo"]; texto: string; peso: 1 | 2 | 3 };

type Props = {
  vagaId: string;
  requisitos: { versao: number; itens: Requisito[]; corteCompativel: number; corteParcial: number } | null;
  pendentes: number;
  emAndamento: number;
  podeEditar: boolean;
  podePontuar: boolean;
  iaConfigurada: boolean;
};

/**
 * Requisitos da triagem e o lote de pontuação.
 *
 * O lote roda em passos curtos chamados daqui, um atrás do outro, com o
 * andamento na tela — 200 currículos numa requisição só estourariam o tempo
 * dela, e sem andamento o recrutador não sabe se travou.
 */
export function TriagemDaVaga({ vagaId, requisitos, pendentes, emAndamento, podeEditar, podePontuar, iaConfigurada }: Props) {
  const router = useRouter();
  const [editando, setEditando] = useState(!requisitos && podeEditar);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    requisitos ? requisitos.itens.map(({ tipo, texto, peso }) => ({ tipo, texto, peso })) : [{ tipo: "OBRIGATORIO", texto: "", peso: 2 }],
  );
  const [cortes, setCortes] = useState({
    corteCompativel: String(requisitos?.corteCompativel ?? CORTES_PADRAO.corteCompativel),
    corteParcial: String(requisitos?.corteParcial ?? CORTES_PADRAO.corteParcial),
  });
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();
  const [lote, setLote] = useState<{ rodando: boolean; feitas: number; total: number; log: string[] } | null>(null);

  const muda = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));

  function salvar() {
    setErro(null);
    startSalvar(async () => {
      const r = await salvarRequisitosDaVaga(vagaId, { itens: linhas, ...cortes });
      if ("error" in r) setErro(r.error);
      else {
        setEditando(false);
        router.refresh();
      }
    });
  }

  async function rodar(modo: "pendentes" | "todas") {
    const pular: string[] = [];
    const feitas: string[] = [];
    const log: string[] = [];
    let total = modo === "pendentes" ? pendentes : emAndamento;
    setLote({ rodando: true, feitas: 0, total, log });
    for (;;) {
      const r = await pontuarPassoDoLote(vagaId, modo, pular, modo === "todas" ? feitas : []);
      if ("error" in r) {
        log.push(r.error);
        break;
      }
      for (const p of r.processadas) {
        feitas.push(p.id);
        log.push(`${p.nome}: ${p.score} · ${ROTULO_DA_FAIXA[p.faixa as Faixa]}`);
      }
      for (const f of r.falhas) {
        pular.push(f.id);
        log.push(`${f.nome}: não pontuado — ${f.erro}`);
      }
      total = feitas.length + pular.length + r.restantes;
      setLote({ rodando: true, feitas: feitas.length + pular.length, total, log: [...log] });
      if (r.restantes === 0 || (r.processadas.length === 0 && r.falhas.length === 0)) break;
    }
    setLote({ rodando: false, feitas: feitas.length + pular.length, total, log: [...log] });
    router.refresh();
  }

  return (
    <div className="bg-surface border border-border rounded-lg p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Triagem de currículos</h2>
          <p className="text-[12px] text-fg-muted mt-0.5 max-w-[640px]">
            A IA confere o currículo contra cada requisito e aponta a evidência; a nota sai da tabela abaixo. Ela
            <strong className="font-medium text-fg-secondary"> só ordena os candidatos — nunca reprova ninguém</strong>. Nome, idade, cidade e
            foto não chegam ao pontuador.
          </p>
        </div>
        {requisitos && !editando && podeEditar && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            Editar requisitos
          </Button>
        )}
      </div>

      {editando ? (
        <div className="space-y-2">
          {linhas.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <Select compact value={l.tipo} onChange={(e) => muda(i, { tipo: e.target.value as Linha["tipo"] })} className="w-36">
                <option value="OBRIGATORIO">Obrigatório</option>
                <option value="DESEJAVEL">Desejável</option>
              </Select>
              <Input
                compact
                value={l.texto}
                maxLength={300}
                onChange={(e) => muda(i, { texto: e.target.value })}
                placeholder="Ex.: Experiência com contas a pagar · Excel intermediário · CNH B"
                className="flex-1 min-w-[240px]"
              />
              <Select compact value={String(l.peso)} onChange={(e) => muda(i, { peso: Number(e.target.value) as Linha["peso"] })} className="w-28">
                <option value="1">Peso 1</option>
                <option value="2">Peso 2</option>
                <option value="3">Peso 3</option>
              </Select>
              <Button variant="ghost" size="xs" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Remover requisito">
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
          <Button variant="linkMuted" size="xs" onClick={() => setLinhas((ls) => [...ls, { tipo: "DESEJAVEL", texto: "", peso: 2 }])}>
            <Plus size={12} /> Adicionar requisito
          </Button>
          <div className="flex flex-wrap items-end gap-3 pt-2">
            <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
              <span className="font-medium">Compatível a partir de</span>
              <Input compact inputMode="numeric" value={cortes.corteCompativel} onChange={(e) => setCortes({ ...cortes, corteCompativel: e.target.value })} className="w-24" />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
              <span className="font-medium">Parcial a partir de</span>
              <Input compact inputMode="numeric" value={cortes.corteParcial} onChange={(e) => setCortes({ ...cortes, corteParcial: e.target.value })} className="w-24" />
            </label>
            <p className="text-[11px] text-fg-muted max-w-[420px] pb-1.5">
              Obrigatório pesa o dobro. Localidade não entra aqui: cidade não é avaliada pela IA, o recrutador confere.
            </p>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={salvar} loading={salvando} disabled={salvando}>
              Salvar requisitos
            </Button>
            {requisitos && (
              <Button variant="linkMuted" size="xs" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            )}
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
          </div>
          {requisitos && (
            <p className="text-[11px] text-fg-muted">
              Salvar cria a versão {requisitos.versao + 1}. As notas já dadas continuam no histórico, marcadas como de versão anterior.
            </p>
          )}
        </div>
      ) : requisitos ? (
        <>
          <ul className="space-y-1 text-[13px] mb-3">
            {requisitos.itens.map((r) => (
              <li key={r.id} className="flex gap-2">
                <span className={`shrink-0 text-[11px] font-medium px-1.5 py-0.5 rounded ${r.tipo === "OBRIGATORIO" ? "bg-warning-bg text-warning" : "bg-surface-2 text-fg-muted"}`}>
                  {r.tipo === "OBRIGATORIO" ? "Obrigatório" : "Desejável"}
                </span>
                <span className="text-fg">{r.texto}</span>
                <span className="text-fg-muted text-[11px] tnum">peso {r.peso}</span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] text-fg-muted mb-3">
            Versão {requisitos.versao} · Compatível ≥ {requisitos.corteCompativel} · Parcial ≥ {requisitos.corteParcial}
          </p>
          {podePontuar &&
            (iaConfigurada ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" disabled={!!lote?.rodando || pendentes === 0} onClick={() => rodar("pendentes")}>
                  <Sparkles size={13} /> Pontuar pendentes ({pendentes})
                </Button>
                <Button variant="secondary" size="sm" disabled={!!lote?.rodando || emAndamento === 0} onClick={() => rodar("todas")}>
                  Reprocessar todas ({emAndamento})
                </Button>
              </div>
            ) : (
              <p className="text-[12px] text-fg-muted">Configure a IA em Integrações para pontuar.</p>
            ))}
        </>
      ) : (
        <p className="text-[13px] text-fg-muted">Sem requisitos cadastrados — peça a quem gerencia a vaga.</p>
      )}

      {lote && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 p-3">
          <p className="text-[12px] font-medium text-fg">
            {lote.rodando ? "Pontuando…" : "Lote concluído"} {lote.feitas}/{lote.total}
          </p>
          <div className="h-1 rounded-full bg-border mt-1.5 overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${lote.total ? (lote.feitas / lote.total) * 100 : 100}%` }} />
          </div>
          {lote.log.length > 0 && (
            <ul className="mt-2 max-h-40 overflow-y-auto text-[11px] text-fg-muted space-y-0.5">
              {lote.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
