"use client";

import { useActionState, useState } from "react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import type { ConferenciaState } from "@/app/(app)/pessoas/[id]/desligamento/[terminationId]/conferencia/actions";
import type { RescisaoCheckItem } from "@/lib/rescisaoChecklist";
import { Button } from "@/components/ui/Button";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { CornerDownLeft } from "lucide-react";
import { Selo } from "@/components/ui/Selo";
import { FormFooter } from "@/components/ui/FormFooter";
import { brl } from "@/lib/valora/formato";

export type CheckState = {
  status: "PENDENTE" | "CONFERIDO" | "DIVERGENTE" | "NAO_APLICAVEL";
  informedValue: string | null;
  note: string | null;
  checkedByName: string | null;
  checkedAtLabel: string | null;
};

/** Referência calculada pelo motor — opcional: itens de prazo/doc não têm. */
export type ReferenciaProps = {
  situacao: "CALCULADO" | "NAO_DEVIDA" | "NAO_CALCULAVEL" | "DESABILITADA_CONFIG";
  valor: number | null;
  valorLabel: string | null;
  formula: string | null;
  fundamento: string | null;
  motivo: string | null;
  premissas: string[];
  confianca: "ALTA" | "MEDIA" | "BAIXA";
  /** Diferença informado − calculado, quando os dois existem. */
  delta: number | null;
  deltaLabel: string | null;
  divergente: boolean;
};

type Props = {
  item: RescisaoCheckItem;
  current: CheckState | null;
  referencia?: ReferenciaProps;
  action: (prev: ConferenciaState, form: FormData) => Promise<ConferenciaState>;
  canEdit: boolean;
};

const CONFIANCA_LABEL = {
  ALTA: "confiança alta",
  MEDIA: "confiança média",
  BAIXA: "confiança baixa",
} as const;

const STATUS_OPTIONS = [
  { value: "PENDENTE", label: "Pendente" },
  { value: "CONFERIDO", label: "Conferido" },
  { value: "DIVERGENTE", label: "Divergente" },
  { value: "NAO_APLICAVEL", label: "Não se aplica" },
] as const;

const STATUS_STYLE: Record<CheckState["status"], string> = {
  PENDENTE: "bg-surface-2 text-fg-muted border-border",
  CONFERIDO: "bg-success/10 text-success border-success/25",
  DIVERGENTE: "bg-danger/10 text-danger border-danger/25",
  NAO_APLICAVEL: "bg-surface-2 text-fg-secondary border-border",
};

/**
 * O valor informado chega como o campo o edita ("1234,56"); na linha e na nota
 * ele aparecia assim, sem milhar, ao lado da referência "R$ 1.234,56"
 * (auditoria DRG-01, 07/10/2026). Troca por `formatarReais` de lib/format.ts
 * quando a base o criar.
 */
function reaisDoInformado(v: string): string {
  return brl(Number(v.replace(/\./g, "").replace(",", ".")));
}

const STATUS_LABEL: Record<CheckState["status"], string> = {
  PENDENTE: "Pendente",
  CONFERIDO: "Conferido",
  DIVERGENTE: "Divergente",
  NAO_APLICAVEL: "Não se aplica",
};

export function ItemConferenciaRow({ item, current, referencia, action, canEdit }: Props) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [open, setOpen] = useState(false);

  // Divergência só existe quando já há valor informado (veio de um salvamento
  // anterior). A sugestão vale enquanto ninguém tiver decidido o status —
  // depois disso, respeita o que o humano escolheu. É sugestão, não gravação:
  // nada persiste sem submit.
  const statusAtual = current?.status ?? "PENDENTE";
  const sugereDivergente = referencia?.divergente === true && statusAtual === "PENDENTE";
  const [status, setStatus] = useState<CheckState["status"]>(
    sugereDivergente ? "DIVERGENTE" : statusAtual
  );
  const [valorInformado, setValorInformado] = useState(current?.informedValue ?? "");

  const efetivo = statusAtual;

  const notaSugerida =
    sugereDivergente && referencia?.valorLabel && current?.informedValue
      ? `Informado ${reaisDoInformado(current.informedValue)}; referência ${referencia.valorLabel}${
          referencia.deltaLabel ? ` (diferença de ${referencia.deltaLabel})` : ""
        }.`
      : "";

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[length:var(--fs-ui)] font-medium text-fg">{item.label}</p>
            <Selo cor={STATUS_STYLE[efetivo]}>
              {STATUS_LABEL[efetivo]}
            </Selo>
            {current?.informedValue && (
              <span className="text-[length:var(--fs-2)] text-fg-secondary tnum">{reaisDoInformado(current.informedValue)}</span>
            )}

            {/* Referência do motor — sempre em tom mudo, pra nunca competir
                visualmente com o valor que a contabilidade informou. */}
            {referencia?.situacao === "CALCULADO" && referencia.valorLabel && (
              <span className="text-[length:var(--fs-2)] text-fg-muted tnum" title={referencia.formula ?? undefined}>
                ref. {referencia.valorLabel}
              </span>
            )}
            {referencia?.divergente && referencia.deltaLabel && (
              <Selo tom="perigo" className="tnum">
                Δ {referencia.deltaLabel}
              </Selo>
            )}
            {referencia && referencia.situacao !== "CALCULADO" && (
              <Selo tom="neutro">
                {referencia.situacao === "NAO_DEVIDA"
                  ? "não devida"
                  : referencia.situacao === "DESABILITADA_CONFIG"
                    ? "desabilitada"
                    : "sem referência"}
              </Selo>
            )}
          </div>
          {item.hint && <p className="text-[length:var(--fs-2)] text-fg-muted mt-0.5">{item.hint}</p>}
          {current?.note && <p className="text-[length:var(--fs-2)] text-fg-secondary mt-1 whitespace-pre-wrap">{current.note}</p>}
          {current?.checkedByName && current.checkedAtLabel && (
            <p className="text-[length:var(--fs-micro)] text-fg-muted mt-1">
              Conferido por {current.checkedByName} em {current.checkedAtLabel}
            </p>
          )}
        </div>

        {canEdit && (
          <Button
            variant="secondary"
            size="sm"
            className="flex-shrink-0"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? "Fechar" : current ? "Editar" : "Conferir"}
          </Button>
        )}
      </div>

      {/* Base do cálculo: o número sozinho é inauditável — o conferente
          precisa ver COMO chegou ali antes de aceitar ou contestar. */}
      {open && canEdit && referencia && (
        <div className="mt-3 rounded-md border border-border bg-surface-2 px-4 py-3">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
            <p className="text-[length:var(--fs-2)] font-semibold text-fg">Base do cálculo de referência</p>
            <span className="text-[length:var(--fs-micro)] text-fg-muted">{CONFIANCA_LABEL[referencia.confianca]}</span>
          </div>

          {referencia.formula ? (
            <p className="text-[length:var(--fs-2)] text-fg-secondary tnum">{referencia.formula}</p>
          ) : (
            <p className="text-[length:var(--fs-2)] text-fg-secondary">{referencia.motivo}</p>
          )}

          {referencia.fundamento && (
            <p className="text-[length:var(--fs-micro)] text-fg-muted mt-1">Fundamento: {referencia.fundamento}</p>
          )}
          {referencia.premissas.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {referencia.premissas.map((p, i) => (
                <li key={i} className="text-[length:var(--fs-micro)] text-fg-muted">
                  · {p}
                </li>
              ))}
            </ul>
          )}

          {referencia.situacao === "CALCULADO" && referencia.valorLabel && referencia.valor != null && item.hasValue && (
            // Era um link azul (até 30/09): preenche o campo, é ação — botão.
            // Preenche pelo número, no formato do campo ("1234,56"): o rótulo
            // vem do Intl, com espaço fixo depois do "R$", e o recorte do texto
            // deixava de funcionar.
            <Button
              variant="secondary"
              size="xs"
              className="mt-2"
              onClick={() => setValorInformado(referencia.valor!.toFixed(2).replace(".", ","))}
            >
              <CornerDownLeft size={11} />
              Usar {referencia.valorLabel} como valor informado
            </Button>
          )}
        </div>
      )}

      {open && canEdit && (
        // Os rótulos eram 11px cinza montados à mão (até 30/09), e o "Salvar
        // item" ficava à esquerda; agora é o CampoForm, com o rodapé à direita.
        <form action={formAction} className="mt-3 space-y-4">
          <FieldGrid columns={item.hasValue ? "sm:grid-cols-[180px_180px_minmax(0,1fr)]" : "sm:grid-cols-[180px_minmax(0,1fr)]"}>
            <CampoForm label="Situação" htmlFor={`status-${item.key}`}>
              <Select
                id={`status-${item.key}`}
                name="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as CheckState["status"])}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </CampoForm>

            {item.hasValue && (
              <CampoForm label="Valor informado" htmlFor={`valor-${item.key}`}>
                <Input
                  id={`valor-${item.key}`}
                  name="informedValue"
                  type="text"
                  inputMode="decimal"
                  prefix="R$"
                  value={valorInformado}
                  onChange={(e) => setValorInformado(e.target.value)}
                  placeholder="0,00"
                />
              </CampoForm>
            )}

            {/* O "(obrigatória)" vermelho no rótulo virou o asterisco de campo
                obrigatório, com a regra no texto de ajuda. */}
            <CampoForm
              label="Observação"
              htmlFor={`note-${item.key}`}
              required={status === "DIVERGENTE"}
              helper={status === "DIVERGENTE" ? "Obrigatória quando o item diverge." : undefined}
            >
              <Textarea
                id={`note-${item.key}`}
                name="note"
                rows={2}
                defaultValue={current?.note ?? notaSugerida}
                maxLength={1000}
                placeholder={
                  status === "DIVERGENTE" ? "O que divergiu e qual o valor esperado…" : "Anotação da conferência (opcional)"
                }
              />
            </CampoForm>
          </FieldGrid>

          <FormFooter
            pending={isPending}
            submitLabel="Salvar item"
            onCancel={() => setOpen(false)}
            erro={state?.error}
            semDivisoria
          />
        </form>
      )}
    </div>
  );
}
