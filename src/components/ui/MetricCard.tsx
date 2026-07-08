import Link from "next/link";

type Props = {
  href?: string;
  label: string;
  value: number | string;
  highlight?: boolean;
  delay?: number;
};

export function MetricCard({ href, label, value, highlight = false, delay = 0 }: Props) {
  const content = (
    <>
      <p className="text-[length:var(--fs-helper)] text-fg-muted">{label}</p>
      <p
        className={`font-display text-[length:var(--fs-metric)] font-semibold tnum leading-none ${
          highlight ? "text-warning" : "text-fg"
        }`}
      >
        {value}
      </p>
    </>
  );

  const cls =
    "reveal-in bg-surface border border-border rounded-2xl px-[18px] py-4 hover:border-border-strong hover:-translate-y-0.5 transition-[border-color,transform] flex flex-col gap-2";

  if (href) {
    return (
      <Link href={href} style={{ animationDelay: `${delay}ms` }} className={`${cls} block`}>
        {content}
      </Link>
    );
  }
  return (
    <div style={{ animationDelay: `${delay}ms` }} className={cls}>
      {content}
    </div>
  );
}
