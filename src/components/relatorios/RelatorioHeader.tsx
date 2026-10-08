import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";

type Props = {
  title: string;
  subtitle: React.ReactNode;
  /** Rótulo do último item da trilha (o pai é sempre Indicadores de RH). */
  breadcrumb: string;
};

// A trilha pelo `Breadcrumb` compartilhado (07/10/2026, DRG-21): era montada
// à mão, com `mb-3` onde as outras telas têm o respiro do componente.
export function RelatorioHeader({ title, subtitle, breadcrumb }: Props) {
  return (
    <>
      <Breadcrumb items={[{ label: "Indicadores de RH", href: "/indicadores-rh" }, { label: breadcrumb }]} />
      <PageHeader title={title} subtitle={subtitle} />
    </>
  );
}
