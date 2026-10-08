"use client";

import { useActionState, useState } from "react";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
import { Select } from "@/components/ui/Select";
import {
  descreverExpediente,
  duracaoEmHoras,
  erroDoExpediente,
  rotuloDaHora,
  type Expediente,
} from "@/lib/agendaExpediente";

type Estado = { error: string } | { success: true } | null;

type Props = {
  action: (prev: Estado, form: FormData) => Promise<Estado>;
  /** O horário que os seletores mostram ao abrir. */
  valor: Expediente;
  /**
   * Só na tela pessoal: o horário do escritório e se a pessoa segue ele hoje.
   * Sem isto, é o formulário do escritório — só os dois seletores.
   */
  doEscritorio?: { expediente: Expediente; seguindo: boolean };
};

const HORAS = Array.from({ length: 24 }, (_, h) => h);

function resumo(e: Expediente): string {
  const horas = duracaoEmHoras(e);
  return horas === 24
    ? `Cada dia da grade cobre 24 horas, a partir das ${rotuloDaHora(e.inicio)}.`
    : `Cada dia da grade vai das ${descreverExpediente(e)} — ${horas} horas.`;
}

/**
 * Horário da grade de dia e de semana da Agenda (05/10/2026) — o mesmo
 * formulário no escritório (/admin/tenant) e na pessoa (/configuracoes).
 * Horas cheias, de 4 a 24 horas, podendo passar da meia-noite; a regra é a de
 * src/lib/agendaExpediente.ts, que o servidor confere de novo.
 */
export function ExpedienteForm({ action, valor, doEscritorio }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [inicio, setInicio] = useState(valor.inicio);
  const [fim, setFim] = useState(valor.fim);
  const [proprio, setProprio] = useState(!doEscritorio || !doEscritorio.seguindo);
  // O resultado do último envio na hora em que a pessoa mexeu de novo: dali
  // em diante o "Salvo" (ou o erro) dele não fala mais do que está na tela.
  const [mexidoApos, setMexidoApos] = useState<Estado>(null);
  const resultado = mexidoApos === state ? null : state;

  const vigente = proprio || !doEscritorio ? { inicio, fim } : doEscritorio.expediente;
  const erroDoCampo = proprio ? erroDoExpediente(inicio, fim) : null;
  const nota = erroDoCampo
    ? undefined
    : resultado && "success" in resultado
      ? `Salvo. ${resumo(vigente)}`
      : resumo(vigente);

  return (
    <form action={formAction} className="space-y-5">
      {doEscritorio && (
        <div role="radiogroup" aria-label="Horário da Agenda" className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { valor: "escritorio", rotulo: "Usar o do escritório", dica: descreverExpediente(doEscritorio.expediente) },
            { valor: "proprio", rotulo: "Definir o meu", dica: "Para quem trabalha em outro turno — à noite ou de madrugada." },
          ].map((o) => {
            const marcado = (o.valor === "proprio") === proprio;
            return (
              <label
                key={o.valor}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 transition-colors ${
                  marcado ? "border-brand bg-brand-subtle shadow-[inset_0_0_0_1px_var(--c41-brand)]" : "border-border bg-surface hover:border-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name="modo"
                  value={o.valor}
                  checked={marcado}
                  onChange={() => {
                    setProprio(o.valor === "proprio");
                    setMexidoApos(state);
                  }}
                  className="mt-1 accent-[var(--c41-brand)]"
                />
                <span className="min-w-0">
                  <span className="block text-ui font-semibold text-fg">{o.rotulo}</span>
                  <span className="block text-fs-2 text-fg-muted leading-snug">{o.dica}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}

      {proprio && (
        <FieldGrid>
          <CampoForm label="Início" htmlFor="agenda-inicio" required>
            <Select
              id="agenda-inicio"
              name="inicio"
              value={String(inicio)}
              onChange={(e) => {
                setInicio(Number(e.target.value));
                setMexidoApos(state);
              }}
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>
                  {rotuloDaHora(h)}
                </option>
              ))}
            </Select>
          </CampoForm>
          <CampoForm
            label="Fim"
            htmlFor="agenda-fim"
            required
            helper="Antes do início, termina no dia seguinte; igual ao início, cobre 24 horas."
            error={erroDoCampo ?? undefined}
          >
            <Select
              id="agenda-fim"
              name="fim"
              value={String(fim)}
              error={!!erroDoCampo}
              onChange={(e) => {
                setFim(Number(e.target.value));
                setMexidoApos(state);
              }}
            >
              {HORAS.map((h) => (
                <option key={h} value={h}>
                  {rotuloDaHora(h)}
                </option>
              ))}
            </Select>
          </CampoForm>
        </FieldGrid>
      )}

      <FormFooter
        pending={isPending}
        erro={resultado && "error" in resultado ? resultado.error : undefined}
        nota={nota}
        submitDisabled={!!erroDoCampo}
      />
    </form>
  );
}
