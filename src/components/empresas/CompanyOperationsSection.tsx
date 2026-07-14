import { Briefcase, Building2, Gift, Clock, Wallet, FileCheck } from "lucide-react";
import { OperationsLinkList, type OperationLink } from "@/components/shared/OperationsLinkList";

type Props = {
  companyId: string;
};

const LINKS: OperationLink[] = [
  { href: "cargos", label: "Cargos", description: "Catálogo de cargos da empresa", icon: <Briefcase size={16} /> },
  { href: "departamentos", label: "Departamentos", description: "Estrutura organizacional", icon: <Building2 size={16} /> },
  { href: "beneficios", label: "Benefícios", description: "Catálogo de benefícios oferecidos", icon: <Gift size={16} /> },
  { href: "turnos", label: "Turnos", description: "Turnos de trabalho cadastrados", icon: <Clock size={16} /> },
  { href: "folha", label: "Folha de Pagamento", description: "Competências e fechamentos", icon: <Wallet size={16} /> },
  { href: "documentos-cliente", label: "Documentos para Cliente", description: "Envio por e-mail com prova de recebimento", icon: <FileCheck size={16} /> },
];

export function CompanyOperationsSection({ companyId }: Props) {
  return <OperationsLinkList basePath={`/empresas/${companyId}`} links={LINKS} />;
}
