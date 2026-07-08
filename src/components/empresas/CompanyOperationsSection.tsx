import Link from "next/link";
import { Briefcase, Building2, Gift, Clock, Wallet, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";

type Props = {
  companyId: string;
};

const LINKS = [
  { href: "cargos", label: "Cargos", description: "Catálogo de cargos da empresa", icon: <Briefcase size={16} /> },
  { href: "departamentos", label: "Departamentos", description: "Estrutura organizacional", icon: <Building2 size={16} /> },
  { href: "beneficios", label: "Benefícios", description: "Catálogo de benefícios oferecidos", icon: <Gift size={16} /> },
  { href: "turnos", label: "Turnos", description: "Turnos de trabalho cadastrados", icon: <Clock size={16} /> },
  { href: "folha", label: "Folha de Pagamento", description: "Competências e fechamentos", icon: <Wallet size={16} /> },
];

export function CompanyOperationsSection({ companyId }: Props) {
  return (
    <Card className="p-2">
      <div className="divide-y divide-border">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={`/empresas/${companyId}/${l.href}`}
            className="flex items-center justify-between gap-3 px-3.5 py-3.5 hover:bg-surface-hover rounded-lg transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-surface-hover border border-border flex items-center justify-center text-fg-secondary flex-shrink-0">
                {l.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--fs-body)] font-medium text-fg">{l.label}</p>
                <p className="text-[length:var(--fs-helper)] text-fg-muted truncate">{l.description}</p>
              </div>
            </div>
            <ChevronRight size={16} className="text-fg-muted flex-shrink-0" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
