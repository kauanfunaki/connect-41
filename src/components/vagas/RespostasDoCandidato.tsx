"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { salvarRespostasDoCandidato } from "@/app/(app)/vagas/[id]/candidaturas/[candidaturaId]/respostas-actions";
import { CAMPOS_DE_RESPOSTA, ROTULO_DA_RESPOSTA, type CampoDeResposta, type FonteDasRespostas, type Respostas } from "@/lib/recrutamento/respostas";

const REAIS = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function mostrar(campo: CampoDeResposta, r: Respostas): string {
  const v = r[campo];
  if (v === null) return "—";
  if (campo === "pretensaoSalarial") return REAIS.format(v as number);
  if (campo === "deslocamentoMinutos") return `${v} min`;
  return String(v);
}

/**
 * O que o candidato respondeu no WhatsApp — pretensão, disponibilidade e tempo
 * até o local. Informação para o recrutador: não entra na nota da triagem.
 */
export function RespostasDoCandidato({
  vagaId,
  candidaturaId,
  respostas,
  fonte,
  podeEditar,
}: {
  vagaId: string;
  candidaturaId: string;
  respostas: Respostas;
  fonte: FonteDasRespostas;
  podeEditar: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const [form, setForm] = useState({
    pretensaoSalarial: respostas.pretensaoSalarial === null ? "" : String(respostas.pretensaoSalarial).replace(".", ","),
    disponibilidade: respostas.disponibilidade ?? "",
    deslocamentoMinutos: respostas.deslocamentoMinutos === null ? "" : String(respostas.deslocamentoMinutos),
  });

  return (
    <Card className="p-5 mb-4">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">Respostas do candidato</h2>
          <p className="text-[12px] text-fg-muted mt-0.5">
            Respondidas na inscrição pelo portal, coletadas pelo atendente do WhatsApp ou preenchidas aqui. Não entram na nota da triagem.
          </p>
        </div>
        {podeEditar && !editando && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            Corrigir
          </Button>
        )}
      </div>

      {editando ? (
        <form
          className="grid gap-3 sm:grid-cols-3 items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setErro(null);
            startTransition(async () => {
              const r = await salvarRespostasDoCandidato(vagaId, candidaturaId, form);
              if ("error" in r) setErro(r.error);
              else setEditando(false);
            });
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
            <span className="font-medium">{ROTULO_DA_RESPOSTA.pretensaoSalarial}</span>
            <Input prefix="R$" inputMode="decimal" value={form.pretensaoSalarial} onChange={(e) => setForm({ ...form, pretensaoSalarial: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
            <span className="font-medium">{ROTULO_DA_RESPOSTA.disponibilidade}</span>
            <Input maxLength={120} value={form.disponibilidade} onChange={(e) => setForm({ ...form, disponibilidade: e.target.value })} placeholder="Ex.: imediata, em 15 dias" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
            <span className="font-medium">{ROTULO_DA_RESPOSTA.deslocamentoMinutos}</span>
            <Input suffix="min" inputMode="numeric" value={form.deslocamentoMinutos} onChange={(e) => setForm({ ...form, deslocamentoMinutos: e.target.value })} />
          </label>
          <div className="sm:col-span-3 flex items-center gap-2">
            <Button type="submit" size="sm" loading={pendente} disabled={pendente}>
              Salvar
            </Button>
            <Button variant="linkMuted" size="xs" onClick={() => setEditando(false)}>
              Cancelar
            </Button>
            {erro && <span className="text-[12px] text-danger">{erro}</span>}
            <span className="text-[11px] text-fg-muted ml-auto">O que você salvar aqui o atendente não sobrescreve.</span>
          </div>
        </form>
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          {CAMPOS_DE_RESPOSTA.map((c) => (
            <div key={c}>
              <dt className="text-[length:var(--fs-micro)] text-fg-muted mb-0.5">{ROTULO_DA_RESPOSTA[c]}</dt>
              <dd className="text-[13px] text-fg tnum">{mostrar(c, respostas)}</dd>
              {fonte[c] && (
                <dd className="text-[11px] text-fg-muted">
                  {fonte[c]!.origem === "WHATSAPP" ? "pelo WhatsApp" : fonte[c]!.origem === "PORTAL" ? "no portal de vagas" : "pelo recrutador"}
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}
