import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { formatCnpj, formatCpf } from "@/lib/format";
import { algumSocioResideNoEndereco, somaDasParticipacoes } from "@/lib/societario/socios";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Breadcrumb } from "@/components/shared/Breadcrumb";
import { BackButton } from "@/components/shared/BackButton";
import { DeleteFieldButton } from "@/components/admin/DeleteFieldButton";
import { excluirSocio } from "./actions";

const PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

const SELECT_DO_ENDERECO = {
  zipCode: true,
  addressStreet: true,
  addressNumber: true,
  addressComplement: true,
  neighborhood: true,
  city: true,
  stateCode: true,
} as const;

function documento(d: string | null): string {
  if (!d) return "sem documento";
  return d.length === 11 ? formatCpf(d) : formatCnpj(d);
}

function endereco(s: {
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  city: string | null;
  stateCode: string | null;
}): string {
  const partes = [
    [s.addressStreet, s.addressNumber].filter(Boolean).join(", "),
    s.addressComplement,
    [s.city, s.stateCode].filter(Boolean).join("/"),
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : "sem endereço";
}

export default async function SociosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: companyId } = await params;
  const ctx = await getAuthContext();
  const podeEditar = canWrite(ctx.role);

  const prisma = getPrisma();
  const company = await prisma.company.findFirst({
    where: { id: companyId, ...(await scopedCompanyWhere(ctx)) },
    select: { id: true, name: true, ...SELECT_DO_ENDERECO },
  });
  if (!company) notFound();

  const socios = await prisma.companyPartner.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: [{ administrator: "desc" }, { name: "asc" }],
  });

  const participacoes = socios.map((s) => ({ sharePercent: s.sharePercent === null ? null : Number(s.sharePercent) }));
  const soma = somaDasParticipacoes(participacoes);
  const resideNoLocal = algumSocioResideNoEndereco(company, socios);

  const novoHref = `/empresas/${companyId}/socios/novo`;

  return (
    <PageContainer>
      <Breadcrumb
        items={[
          { label: "Cadastros", href: "/empresas" },
          { label: "Empresas", href: "/empresas" },
          { label: company.name, href: `/empresas/${companyId}`, truncate: true },
          { label: "Sócios" },
        ]}
      />
      <BackButton className="mb-3" />

      <PageHeader
        title="Sócios"
        subtitle={`${socios.length} sócio${socios.length !== 1 ? "s" : ""} no quadro societário desta empresa`}
        action={
          podeEditar && (
            <Button href={novoHref} variant="primary" className="font-medium">
              + Novo Sócio
            </Button>
          )
        }
      />

      {socios.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="Nenhum sócio cadastrado"
            description="O quadro societário alimenta a viabilidade no Empresa Fácil: é do endereço do sócio que sai a resposta de “Reside no local?”."
            action={
              podeEditar && (
                <Button href={novoHref} variant="primary" className="font-medium">
                  + Cadastrar sócio
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <>
          <div className="bg-surface border border-border rounded-lg divide-y divide-border mb-4">
            {socios.map((s) => (
              <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13px] text-fg font-medium break-words">{s.name}</p>
                    {s.administrator && <Badge variant="info">Administrador</Badge>}
                    {s.sharePercent !== null && (
                      <span className="text-[11.5px] text-fg-muted tabular-nums">{Number(s.sharePercent)}%</span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-fg-muted tabular-nums mt-0.5">{documento(s.document)}</p>
                  <p className="text-[11.5px] text-fg-muted break-words">{endereco(s)}</p>
                </div>
                {podeEditar && (
                  <div className="flex items-center gap-3 shrink-0">
                    <Link
                      href={`/empresas/${companyId}/socios/${s.id}/editar`}
                      className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                    >
                      Editar
                    </Link>
                    <DeleteFieldButton action={excluirSocio.bind(null, s.id, companyId)} nome={s.name} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* O que o cadastro responde, dito na tela — senão ele vira uma lista
              que ninguém sabe para que serve. */}
          <Card className="p-4">
            <h2 className="text-[13px] font-semibold text-fg mb-2">O que isto responde na viabilidade</h2>
            <p className="text-[12.5px] text-fg-secondary">
              <strong>Reside no local?</strong>{" "}
              {resideNoLocal === true ? (
                <Badge variant="success">Sim</Badge>
              ) : resideNoLocal === false ? (
                <Badge variant="info">Não</Badge>
              ) : (
                <Badge variant="warning">Não dá para afirmar</Badge>
              )}
            </p>
            {resideNoLocal === null && (
              <p className="text-[12px] text-fg-muted mt-1">
                Falta CEP ou número em algum endereço, ou só um dos lados tem complemento. Enquanto for assim, quem
                preenche o Empresa Fácil responde essa pergunta à mão.
              </p>
            )}
            <p className="text-[12px] text-fg-muted mt-2 tabular-nums">
              Participações somam {PERCENTUAL.format(soma)}%
              {participacoes.some((p) => p.sharePercent === null) && " — há sócio sem participação preenchida"}.
            </p>
          </Card>
        </>
      )}
    </PageContainer>
  );
}
