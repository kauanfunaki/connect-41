import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

type PersonEntry = {
  id: string;
  name: string;
  type: "COLABORADOR" | "CANDIDATO";
};

type Props = {
  companyId: string;
  people: PersonEntry[];
};

export function CompanyPeopleSection({ companyId, people }: Props) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">Pessoas vinculadas</h2>
        {/* Era link de texto (30/09): ação de cabeçalho de seção é botão. */}
        <Button href={`/colaboradores-clientes?companyId=${companyId}`} variant="secondary" size="xs">
          Ver todas <ArrowRight size={11} />
        </Button>
      </div>

      {people.length === 0 ? (
        <EmptyState icon={<Users />} title="Nenhuma pessoa vinculada" description="Colaboradores e candidatos desta empresa aparecem aqui." />
      ) : (
        <div className="divide-y divide-border">
          {people.map((p) => (
            <Link
              key={p.id}
              href={`/pessoas/${p.id}`}
              className="flex items-center justify-between px-1 py-2.5 hover:bg-surface-hover rounded-md transition-colors"
            >
              <span className="text-[length:var(--fs-body)] text-fg">{p.name}</span>
              <span className="text-[length:var(--fs-helper)] text-fg-muted">
                {p.type === "COLABORADOR" ? "Colaborador" : "Candidato"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
