import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { SensitiveGrantToggle } from "@/components/admin/SensitiveGrantToggle";
import { alternarPermissaoSensivel } from "./actions";
import type { UserRole, SensitiveFieldGroup } from "@/generated/prisma/enums";

// SUPER_ADMIN fica de fora da matriz — tem bypass hardcoded em
// canViewSensitiveField e nunca consulta FieldPermission.
const ROLES: { code: UserRole; label: string; hint: string }[] = [
  { code: "ADMIN", label: "Administrador", hint: "Administra o tenant" },
  { code: "SECTOR_ADMIN", label: "Gestor de setor", hint: "CRUD no(s) próprio(s) setor(es)" },
  { code: "SECTOR_USER", label: "Colaborador", hint: "Leitura + atividades no setor" },
  { code: "READONLY", label: "Somente leitura", hint: "Diretoria — leitura geral" },
];

const FIELD_GROUPS: { code: SensitiveFieldGroup; label: string }[] = [
  { code: "SALARIO", label: "Salário" },
  { code: "DADOS_BANCARIOS", label: "Dados bancários" },
  { code: "DADOS_MEDICOS", label: "Dados médicos" },
  { code: "DOCUMENTOS_PESSOAIS", label: "Documentos pessoais" },
];

export default async function PermissoesSensiveisPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const grants = await prisma.fieldPermission.findMany({ where: { tenantId: ctx.tenantId } });
  const granted = new Set(grants.filter((g) => g.canView).map((g) => `${g.role}:${g.fieldGroup}`));

  return (
    <PageContainer>
      <PageHeader
        title="Permissões de campos sensíveis"
        subtitle="Quem pode ver salário, dados bancários, dados médicos e documentos pessoais.
          Sem concessão explícita, o acesso é negado — inclusive para o administrador. Toda mudança fica na auditoria."
      />

      {/* Casco padrão (polimento de 30/09). Sem funil: é uma matriz fixa de
          quatro papéis por quatro grupos, não uma lista. */}
      <div className="c41-tabela overflow-x-auto bg-surface border border-border rounded-lg">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-border text-fs-1 text-fg-muted uppercase tracking-wide">
              <th className="px-4 py-3">Papel</th>
              {FIELD_GROUPS.map((f) => (
                <th key={f.code} className="px-4 py-3">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROLES.map((r) => (
              <tr key={r.code} className="border-b border-border">
                <td className="px-4 py-3">
                  <p className="text-fs-3 text-fg font-medium">{r.label}</p>
                  <p className="text-fs-1 text-fg-muted">{r.hint}</p>
                </td>
                {FIELD_GROUPS.map((f) => (
                  <td key={f.code} className="px-4 py-3">
                    <SensitiveGrantToggle
                      action={alternarPermissaoSensivel.bind(null, r.code, f.code)}
                      granted={granted.has(`${r.code}:${f.code}`)}
                      label={`${r.label} × ${f.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-fs-2 text-fg-muted mt-3">
        Suporte (SUPER_ADMIN) sempre tem acesso — não aparece na matriz.
      </p>
    </PageContainer>
  );
}
