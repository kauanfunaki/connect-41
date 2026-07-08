type Props = {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  href?: string;
};

// Par label/valor compacto — usado nos cards de informação da ficha de empresa.
export function InfoRow({ label, value, mono, href }: Props) {
  return (
    <div>
      <p className="text-[length:var(--fs-helper)] text-fg-muted mb-0.5">{label}</p>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[length:var(--fs-body)] text-brand hover:underline ${mono ? "tnum" : ""}`}
        >
          {value ?? "—"}
        </a>
      ) : (
        <p className={`text-[length:var(--fs-body)] text-fg ${mono ? "tnum" : ""}`}>{value ?? "—"}</p>
      )}
    </div>
  );
}
