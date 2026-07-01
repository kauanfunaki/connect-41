export function AuthShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-[400px]">
        {/* Marca */}
        <div className="mb-8 flex flex-col items-center text-center">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-[8px] text-on-brand text-[15px] font-semibold mb-3"
            style={{ background: "var(--c41-brand-600)" }}
          >
            41
          </span>
          <span className="text-fg font-semibold text-[16px] tracking-[-0.01em]">
            Connect 41
          </span>
          <p className="text-fg-muted text-[13px] mt-1">{subtitle}</p>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">{children}</div>

        <p className="text-center text-[10px] text-fg-muted mt-6">
          Connect 41 · Uso interno 41 Tech
        </p>
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
