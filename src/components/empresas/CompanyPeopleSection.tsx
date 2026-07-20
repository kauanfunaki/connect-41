import Link from "next/link";
import { Users } from "lucide-react";
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
        <Link
          href={`/pessoas?companyId=${companyId}`}
          className="text-[length:var(--fs-helper)] text-brand hover:underline"
        >
          Ver todas
        </Link>
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
