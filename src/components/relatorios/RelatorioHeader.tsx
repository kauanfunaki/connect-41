import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { PageHeader } from "@/components/ui/PageHeader";

type Props = {
  title: string;
  /** Só dado que muda; a frase que explica o relatório fica no artigo de ajuda (17/11/2026, melhoria-707). */
  subtitle?: React.ReactNode;
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
