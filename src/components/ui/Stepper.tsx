"use client";

export type StepStatus = "done" | "current" | "error" | "upcoming";

export type StepDef = {
  label: string;
  status: StepStatus;
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
export function Stepper({ steps, onStepClick }: Props) {
  return (
    <div className="flex items-center flex-wrap gap-y-3 px-6 py-5 border-b border-border" role="tablist">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <button
            type="button"
            role="tab"
            disabled={step.status === "upcoming"}
            aria-current={step.status === "current" ? "step" : undefined}
            aria-invalid={step.status === "error" ? true : undefined}
            aria-label={`${i + 1}. ${step.label} — ${STATUS_LABEL[step.status]}`}
            onClick={() => onStepClick?.(i)}
            className={`flex items-center gap-2.5 ${step.status === "upcoming" ? "cursor-not-allowed" : "cursor-pointer"}`}
          >
            <span
              className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[13px] font-semibold flex-shrink-0 border-[1.5px] ${
                step.status === "done"
                  ? "bg-success border-success text-white"
                  : step.status === "current"
                    ? "bg-brand border-brand text-on-brand"
                    : step.status === "error"
                      ? "bg-danger-bg border-danger text-danger"
                      : "bg-surface-hover border-border-strong text-fg-muted opacity-50"
              }`}
            >
              {i + 1}
            </span>
            <span
              className={`text-[13px] font-semibold whitespace-nowrap ${
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
              className={`w-8 sm:w-14 h-[1.5px] mx-2.5 flex-shrink-0 ${
                step.status === "done" ? "bg-success" : "bg-border-strong"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
