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

// Indicador de progresso multi-step. `onStepClick` só deve ser chamado pra
// etapas concluídas (o caller decide — aqui só repassamos o índice).
export function Stepper({ steps, onStepClick }: Props) {
  return (
    <div className="flex items-center px-6 py-5 border-b border-border overflow-x-auto scroll-x">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center flex-shrink-0">
          <button
            type="button"
            disabled={step.status === "upcoming"}
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
              className={`w-14 h-[1.5px] mx-2.5 flex-shrink-0 ${
                step.status === "done" ? "bg-success" : "bg-border-strong"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
