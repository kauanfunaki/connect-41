import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { SensitiveGrantToggle } from "@/components/admin/SensitiveGrantToggle";
import { alternarPermissaoSensivel } from "./actions";
import type { UserRole, SensitiveFieldGroup } from "@/generated/prisma/enums";

// SUPER_ADMIN fica de fora da matriz — tem bypass hardcoded em
// canViewSensitiveField e nunca consulta FieldPermission.
const ROLES: { code: UserRole; label: string; hint: string }[] = [
  { code: "ADMIN", label: "Admin", hint: "Administra o tenant" },
  { code: "SECTOR_ADMIN", label: "Admin de Setor", hint: "CRUD no(s) próprio(s) setor(es)" },
  { code: "SECTOR_USER", label: "Usuário de Setor", hint: "Leitura + atividades no setor" },
  { code: "READONLY", label: "Somente Leitura", hint: "Diretoria — leitura geral" },
];

const FIELD_GROUPS: { code: SensitiveFieldGroup; label: string }[] = [
  { code: "SALARIO", label: "Salário" },
  { code: "DADOS_BANCARIOS", label: "Dados Bancários" },
  { code: "DADOS_MEDICOS", label: "Dados Médicos" },
  { code: "DOCUMENTOS_PESSOAIS", label: "Documentos Pessoais" },
];

export default async function PermissoesSensiveisPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const prisma = getPrisma();
  const grants = await prisma.fieldPermission.findMany({ where: { tenantId: ctx.tenantId } });
  const granted = new Set(grants.filter((g) => g.canView).map((g) => `${g.role}:${g.fieldGroup}`));

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Permissões de Campos Sensíveis</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">
          Quem pode ver salário, dados bancários, dados médicos e documentos pessoais.
          Sem concessão explícita, o acesso é negado — inclusive para Admin. Toda mudança fica na auditoria.
        </p>
      </div>

      <div className="bg-surface border border-border rounded-lg overflow-x-auto">
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-[11px] font-medium text-fg-muted uppercase tracking-wide">Papel</th>
              {FIELD_GROUPS.map((f) => (
                <th key={f.code} className="text-center px-4 py-3 text-[11px] font-medium text-fg-muted uppercase tracking-wide">
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {ROLES.map((r) => (
              <tr key={r.code}>
                <td className="px-4 py-3">
                  <p className="text-[13px] text-fg font-medium">{r.label}</p>
                  <p className="text-[11px] text-fg-muted">{r.hint}</p>
                </td>
                {FIELD_GROUPS.map((f) => (
                  <td key={f.code} className="px-4 py-3 text-center">
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

      <p className="text-[12px] text-fg-muted mt-3">
        Suporte (SUPER_ADMIN) sempre tem acesso — não aparece na matriz.
      </p>
    </PageContainer>
  );
}
