import { Fragment } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageContainer } from "@/components/shared/PageContainer";
import { SensitiveGrantToggle } from "@/components/admin/SensitiveGrantToggle";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao } from "@/components/shared/ListaResponsiva";
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

      {/* No celular, um cartão por papel, com os quatro grupos embaixo
          (15/10/2026): a matriz de 560px rolava de lado. */}
      <CartoesNoCelular>
        {ROLES.map((r) => (
          <Cartao key={r.code}>
            <TopoDoCartao nome={r.label} />
            <InfoDoCartao>{r.hint}</InfoDoCartao>
            <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 text-ui">
              {FIELD_GROUPS.map((f) => (
                <Fragment key={f.code}>
                  <span className="text-fg-secondary">{f.label}</span>
                  <SensitiveGrantToggle
                    action={alternarPermissaoSensivel.bind(null, r.code, f.code)}
                    granted={granted.has(`${r.code}:${f.code}`)}
                    label={`${r.label} × ${f.label}`}
                  />
                </Fragment>
              ))}
            </div>
          </Cartao>
        ))}
      </CartoesNoCelular>

      {/* Casco padrão (polimento de 30/09). Sem funil: é uma matriz fixa de
          quatro papéis por quatro grupos, não uma lista. */}
      <TabelaNoDesktop padrao>
        <table className="w-full min-w-[560px]">
          <thead>
            <tr className="border-b border-border">
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
      </TabelaNoDesktop>

      <p className="text-fs-2 text-fg-muted mt-3">
        O Super Admin (o suporte do Connect) sempre tem acesso — não aparece na matriz.
      </p>
    </PageContainer>
  );
}
