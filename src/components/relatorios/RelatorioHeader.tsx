import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";

type Props = {
  title: string;
  subtitle: React.ReactNode;
  /** Rótulo do último item da trilha (o pai é sempre Indicadores de RH). */
  breadcrumb: string;
};

export function RelatorioHeader({ title, subtitle, breadcrumb }: Props) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <Link href="/indicadores-rh" className="text-[13px] text-fg-muted hover:text-fg transition-colors">
          Indicadores de RH
        </Link>
        <span className="text-fg-muted">/</span>
        <span className="text-[13px] text-fg">{breadcrumb}</span>
      </div>
      <PageHeader title={title} subtitle={subtitle} />
    </>
  );
}
