import { Briefcase, Building2, Gift, Clock, Wallet, FileCheck, Scale, Users } from "lucide-react";
import { OperationsLinkList, type OperationLink } from "@/components/shared/OperationsLinkList";
import { rotaDosEnvios } from "@/lib/envios/regras";

type Props = {
  companyId: string;
};

// Os caminhos vão inteiros (sem o `/` do começo, que a lista acrescenta) desde
// que "Envios ao cliente" passou a levar para fora da ficha (08/10/2026): o
// antigo "Documentos para cliente" era uma tela solta aqui dentro, e agora é a
// aba "Envios" da central de Solicitações, já filtrada nesta empresa.
function links(companyId: string): OperationLink[] {
  const daFicha = (resto: string) => `empresas/${companyId}/${resto}`;
  return [
    { href: daFicha("socios"), label: "Sócios", description: "Quadro societário e endereço de cada sócio", icon: <Users size={16} /> },
    { href: daFicha("cargos"), label: "Cargos", description: "Catálogo de cargos da empresa", icon: <Briefcase size={16} /> },
    { href: daFicha("departamentos"), label: "Departamentos", description: "Estrutura organizacional", icon: <Building2 size={16} /> },
    { href: daFicha("beneficios"), label: "Benefícios", description: "Catálogo de benefícios oferecidos", icon: <Gift size={16} /> },
    { href: daFicha("turnos"), label: "Turnos", description: "Turnos de trabalho cadastrados", icon: <Clock size={16} /> },
    { href: daFicha("folha"), label: "Folha de pagamento", description: "Competências e fechamentos", icon: <Wallet size={16} /> },
    {
      href: rotaDosEnvios(companyId).slice(1),
      label: "Envios ao cliente",
      description: "Documentos para o cliente ler e aceitar, no portal ou por e-mail",
      icon: <FileCheck size={16} />,
    },
    { href: daFicha("rescisao-config"), label: "Cálculo de rescisão", description: "Parâmetros de conferência do TRCT desta empresa", icon: <Scale size={16} /> },
  ];
}

export function CompanyOperationsSection({ companyId }: Props) {
  return <OperationsLinkList basePath="" links={links(companyId)} />;
}
