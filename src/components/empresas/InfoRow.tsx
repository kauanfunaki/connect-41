type Props = {
  label: string;
  value?: string | null | undefined;
  mono?: boolean;
  href?: string;
  /** Classes do bloco — para ocupar colunas na grade (`sm:col-span-2`). */
  className?: string;
  /** Valor montado (um link interno, um selo) no lugar do texto de `value`. */
  children?: React.ReactNode;
};

// Par rótulo/valor da ficha — rótulo em cima, valor embaixo. Usado nos cards
// de informação da ficha de empresa e, desde a revisão de alinhamento de
// 30/09, também na de pessoa, que tinha uma cópia própria com outros tamanhos
// (11px/13px contra 13px/15px daqui) — a mesma informação parecia menor numa
// ficha que na outra.
export function InfoRow({ label, value, mono, href, className = "", children }: Props) {
  return (
    <div className={`min-w-0 ${className}`.trim()}>
      <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">{label}</p>
      {children ? (
        <div className="text-[length:var(--fs-body)] text-fg break-words">{children}</div>
      ) : href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[length:var(--fs-body)] text-brand hover:underline break-words ${mono ? "tnum" : ""}`}
        >
          {value ?? "—"}
        </a>
      ) : (
        <p className={`text-[length:var(--fs-body)] text-fg break-words ${mono ? "tnum" : ""}`}>{value || "—"}</p>
      )}
    </div>
  );
}
