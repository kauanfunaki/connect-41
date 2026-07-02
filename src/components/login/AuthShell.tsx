export function AuthShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex bg-canvas">
      {/* Coluna do formulário */}
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px]">
          <div className="mb-9 flex items-center gap-2.5">
            <span
              className="inline-flex items-center justify-center w-8 h-8 rounded-[7px] text-on-brand text-[13px] font-semibold flex-shrink-0"
              style={{ background: "var(--c41-brand-600)" }}
            >
              41
            </span>
            <span className="text-fg font-semibold text-[14px] tracking-[-0.01em]">
              41 Tech
            </span>
          </div>

          <h1 className="text-fg font-semibold text-[20px] tracking-[-0.01em] mb-1.5">
            Connect 41
          </h1>
          <p className="text-fg-muted text-[13px] mb-7">{subtitle}</p>

          {children}

          <p className="text-[10px] text-fg-muted mt-8">
            Connect 41 · Uso interno 41 Tech
          </p>
        </div>
      </div>

      {/* Painel de marca */}
      <div
        className="hidden lg:flex flex-1 relative overflow-hidden items-center justify-center p-14"
        style={{ background: "var(--c41-brand-900)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="relative max-w-[360px]">
          <div
            className="w-9 h-9 rounded-[7px] mb-7 flex items-center justify-center text-[13px] font-semibold"
            style={{ background: "rgba(255,255,255,0.12)", color: "#fff" }}
          >
            41
          </div>
          <h2 className="text-[23px] font-semibold text-white tracking-[-0.01em] mb-3 leading-snug">
            Tudo o que a 41 Tech acompanha, num só lugar.
          </h2>
          <p className="text-[13px] leading-relaxed" style={{ color: "rgba(255,255,255,0.62)" }}>
            Contábil, Fiscal, Societário, DP/RH, Recrutamento e mais — o Connect 41
            centraliza empresas, pessoas e o fluxo de trabalho de todos os setores da 41 Tech.
          </p>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  label,
  htmlFor,
  icon,
  children,
}: {
  label: string;
  htmlFor: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[12px] font-medium text-fg">
        {label}
      </label>
      <div className="flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-canvas focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 transition-colors">
        <span className="text-fg-muted flex-shrink-0 [&>svg]:w-4 [&>svg]:h-4">{icon}</span>
        {children}
      </div>
    </div>
  );
}

export const AUTH_INPUT =
  "w-full h-full bg-transparent text-[12px] text-fg placeholder:text-fg-muted outline-none border-none";
