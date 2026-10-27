"use client";

export type StepStatus = "done" | "current" | "error" | "upcoming";

export type StepDef = {
  label: string;
  status: StepStatus;
  /** Disponibilidade independente da conclusão, para fluxos de consulta. */
  disabled?: boolean;
};

type Props = {
  steps: StepDef[];
  onStepClick?: (index: number) => void;
};

const STATUS_LABEL: Record<StepStatus, string> = {
  done: "concluída",
  current: "etapa atual",
  error: "com erro",
  upcoming: "pendente",
};

// Indicador de progresso multi-step. `onStepClick` só deve ser chamado pra
// etapas concluídas (o caller decide — aqui só repassamos o índice).
//
// `flex-wrap` em vez do antigo `overflow-x-auto`: um wizard com várias etapas
// (ex: Empresa, 6 passos) não cabia numa linha só dentro de um formulário de
// largura contida, forçando scroll horizontal dentro do próprio card — na
// prática, a última etapa ficava fora da área visível sem indicação clara de
// que dava pra rolar. Com wrap, etapas extras descem pra uma segunda linha em
// vez de vazar/cortar.
//
// No celular (26/10/2026) as etapas empilham com a ligação vertical: com o
// wrap, a linha de ligação ficava solta no fim e no começo de cada linha.
// Do `sm` para cima, segue a fileira horizontal.
//
// Lista ordenada com `aria-current="step"`, e não `tablist`/`tab` (07/10/2026):
// não há `tabpanel` do outro lado, e o leitor de tela anunciava "aba 1 de 6"
// num assistente — o mesmo erro que o `SegmentedControl` descreve.
export function Stepper({ steps, onStepClick }: Props) {
  return (
    <ol className="flex flex-col items-start sm:flex-row sm:items-center sm:justify-center sm:flex-wrap sm:gap-y-3 px-6 py-5 border-b border-border">
      {steps.map((step, i) => (
        <li key={step.label} className="flex flex-col items-start sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={step.disabled ?? step.status === "upcoming"}
            aria-current={step.status === "current" ? "step" : undefined}
            aria-invalid={step.status === "error" ? true : undefined}
            aria-label={`${i + 1}. ${step.label} — ${step.status === "upcoming" && step.disabled === false ? "disponível" : STATUS_LABEL[step.status]}`}
            onClick={() => onStepClick?.(i)}
            className={`flex items-center gap-2.5 ${(step.disabled ?? step.status === "upcoming") ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              // Concluída e atual em tom fixo nos dois temas (07/10/2026): o
              // verde e o azul do escuro com branco davam 2,05 e 3,28:1.
              className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-ui font-semibold flex-shrink-0 border-[1.5px] ${
                step.status === "done"
                  ? "bg-success-solid border-success-solid text-white"
                  : step.status === "current"
                    ? "bg-brand-solid border-brand-solid text-on-brand"
                    : step.status === "error"
                      ? "bg-danger-bg border-danger text-danger"
                      : step.disabled === false ? "bg-surface-hover border-border-strong text-fg-secondary" : "bg-surface-hover border-border-strong text-fg-muted opacity-50"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-ui font-semibold whitespace-nowrap ${
                step.status === "current" || step.status === "done"
                  ? "text-fg"
                  : step.status === "error"
                    ? "text-danger"
                    : "text-fg-muted"
              }`}
            >
              {step.label}
            </span>
          </button>
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={`ml-[14px] my-1 h-4 w-[1.5px] sm:ml-2.5 sm:mr-2.5 sm:my-0 sm:h-[1.5px] sm:w-14 flex-shrink-0 ${
                step.status === "done" ? "bg-success" : "bg-border-strong"
              }`}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
