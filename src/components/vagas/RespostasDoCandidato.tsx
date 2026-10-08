"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { Input } from "@/components/ui/Input";
import { salvarRespostasDoCandidato } from "@/app/(app)/vagas/[id]/candidaturas/[candidaturaId]/respostas-actions";
import { CAMPOS_DE_RESPOSTA, ROTULO_DA_RESPOSTA, type CampoDeResposta, type FonteDasRespostas, type Respostas } from "@/lib/recrutamento/respostas";
import { FormFooter } from "@/components/ui/FormFooter";
import { formatarReais } from "@/lib/format";

function mostrar(campo: CampoDeResposta, r: Respostas): string {
  const v = r[campo];
  if (v === null) return "—";
  if (campo === "pretensaoSalarial") return formatarReais(v as number);
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
          <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg">Respostas do candidato</h2>
          <p className="text-[length:var(--fs-2)] text-fg-muted mt-0.5">
            Respondidas na inscrição pelo portal, coletadas pelo atendente do WhatsApp ou preenchidas aqui. Não entram na nota da triagem.
          </p>
        </div>
        {podeEditar && !editando && (
          <Button variant="secondary" size="sm" onClick={() => setEditando(true)}>
            <Pencil size={13} /> Corrigir
          </Button>
        )}
      </div>

      {editando ? (
        <form
          className="space-y-4"
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
          {/* Mesmas três colunas da leitura, para o campo cair onde estava o
              valor que ele corrige. Rótulo curto aqui: os da leitura têm ~30
              letras e quebravam em duas linhas na coluna de um terço, descendo
              o campo; a unidade já vem no R$ e no "min". */}
          <FieldGrid columns="sm:grid-cols-3">
            <CampoForm label="Pretensão salarial" htmlFor="resposta-pretensao" helper="Por mês.">
              <Input id="resposta-pretensao" prefix="R$" inputMode="decimal" value={form.pretensaoSalarial} onChange={(e) => setForm({ ...form, pretensaoSalarial: e.target.value })} />
            </CampoForm>
            <CampoForm label="Disponibilidade" htmlFor="resposta-disponibilidade">
              <Input id="resposta-disponibilidade" maxLength={120} value={form.disponibilidade} onChange={(e) => setForm({ ...form, disponibilidade: e.target.value })} placeholder="Ex.: imediata, em 15 dias" />
            </CampoForm>
            <CampoForm label="Tempo até o local" htmlFor="resposta-deslocamento">
              <Input id="resposta-deslocamento" suffix="min" inputMode="numeric" value={form.deslocamentoMinutos} onChange={(e) => setForm({ ...form, deslocamentoMinutos: e.target.value })} />
            </CampoForm>
          </FieldGrid>
          {erro && <p className="text-[length:var(--fs-ui)] text-danger">{erro}</p>}
          <FormFooter
            pending={pendente}
            onCancel={() => setEditando(false)}
            nota="O que você salvar aqui o atendente não sobrescreve."
          />
        </form>
      ) : (
        <dl className="grid gap-4 sm:grid-cols-3">
          {CAMPOS_DE_RESPOSTA.map((c) => (
            <div key={c}>
              <dt className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">{ROTULO_DA_RESPOSTA[c]}</dt>
              <dd className="text-[length:var(--fs-ui)] text-fg tnum">{mostrar(c, respostas)}</dd>
              {fonte[c] && (
                <dd className="text-[length:var(--fs-micro)] text-fg-muted">
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
