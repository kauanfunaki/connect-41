import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type OperationLink = {
  href: string;
  label: string;
  description: string;
  icon: React.ReactNode;
};

type Props = {
  basePath: string;
  links: OperationLink[];
};

// Lista de botões que levam a telas dedicadas (ex: /empresas/{id}/cargos,
// /pessoas/{id}/ferias) — evita empilhar seções grandes com formulários no
// detalhe principal da entidade. Extraído de CompanyOperationsSection pra
// ser reaproveitado também no detalhe de pessoa.
export function OperationsLinkList({ basePath, links }: Props) {
  return (
    <Card className="p-2">
      <div className="divide-y divide-border">
        {links.map((l) => (
          <Link
            key={l.href}
            href={`${basePath}/${l.href}`}
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
