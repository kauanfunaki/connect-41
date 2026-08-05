"use client";

// Rádio nativo com aparência de pílula. O rádio cru tem ~13px de alvo — no
// DISC são 48 escolhas, quase todas feitas no celular, então errar o alvo era
// regra e não exceção. O input continua sendo um <input type="radio"> real
// (semântica de radiogroup, navegação por setas, leitor de tela); só o visual
// é substituído pelo <label>.
type Props = {
  name: string;
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  label: string;
  /** Texto lido por leitor de tela — o visual é curto ("Mais"), o rótulo não. */
  ariaLabel: string;
  tone?: "brand" | "neutral";
};

export function ChoicePill({ name, checked, disabled, onSelect, label, ariaLabel, tone = "brand" }: Props) {
  const activeTone =
    tone === "brand"
      ? "bg-brand text-on-brand border-brand"
      : "bg-fg-secondary text-surface border-fg-secondary";

  return (
    <label
      className={`relative inline-flex items-center justify-center h-9 min-w-[68px] px-3 rounded-md border text-[13px] font-medium select-none transition-colors ${
        disabled
          ? "border-border text-fg-muted opacity-50 cursor-not-allowed"
          : checked
            ? `${activeTone} cursor-pointer`
            : "border-border-strong text-fg-secondary hover:border-brand hover:text-fg cursor-pointer bg-surface"
      } has-[:focus-visible]:shadow-[0_0_0_3px_var(--c41-focus-ring)]`}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        aria-label={ariaLabel}
        className="absolute inset-0 w-full h-full opacity-0 cursor-[inherit] disabled:cursor-not-allowed"
      />
      {label}
    </label>
  );
}
