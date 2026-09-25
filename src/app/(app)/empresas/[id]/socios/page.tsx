import Link from "next/link";
import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canWrite } from "@/lib/auth/context";
import { scopedCompanyWhere } from "@/lib/auth/scope";
import { formatCnpj, formatCpf, formatInstantDate } from "@/lib/format";
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
import { BuscarSociosNaReceita } from "@/components/empresas/BuscarSociosNaReceita";
import { RegistrarSaidaDoSocio } from "@/components/empresas/RegistrarSaidaDoSocio";
import { moeda } from "@/lib/financeiro/formato";
import { excluirSocio, importarDaReceita, previaDaReceita, registrarSaida } from "./actions";

const PERCENTUAL = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });
const INTEIRO = new Intl.NumberFormat("pt-BR");

const SELECT_DO_ENDERECO = {
  zipCode: true,
  addressStreet: true,
  addressNumber: true,
  addressComplement: true,
  neighborhood: true,
  city: true,
  stateCode: true,
} as const;

function documento(d: string | null, mascarado: string | null): string {
  if (!d) return mascarado ? `CPF ${mascarado} (Receita)` : "sem documento";
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

  const todos = await prisma.companyPartner.findMany({
    where: { tenantId: ctx.tenantId, companyId },
    orderBy: [{ administrator: "desc" }, { name: "asc" }],
  });
  // Ex-sócio é histórico: fica na tela, mas fora da viabilidade e da soma.
  const socios = todos.filter((s) => s.exitDate === null);
  const exSocios = todos.filter((s) => s.exitDate !== null).sort((a, b) => b.exitDate!.getTime() - a.exitDate!.getTime());

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
            <div className="flex flex-wrap items-center gap-2">
              <BuscarSociosNaReceita companyId={companyId} previa={previaDaReceita} importar={importarDaReceita} />
              <Button href={novoHref} variant="primary" className="font-medium">
                + Novo Sócio
              </Button>
            </div>
          )
        }
      />

      {todos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="Nenhum sócio cadastrado"
            description="O quadro societário alimenta a viabilidade no Empresa Fácil: é do endereço do sócio que sai a resposta de “Reside no local?”. “Buscar na Receita” traz quem é sócio e desde quando."
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
                  <p className="text-[11.5px] text-fg-muted tabular-nums mt-0.5">
                    {[
                      s.qualification,
                      documento(s.document, s.documentMasked),
                      s.entryDate ? `desde ${formatInstantDate(s.entryDate)}` : null,
                      s.quotas !== null ? `${INTEIRO.format(s.quotas)} quotas` : null,
                      s.capitalAmount !== null ? moeda(Math.round(Number(s.capitalAmount) * 100)) : null,
                      s.origin === "RECEITA" ? "importado da Receita" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
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
                    <RegistrarSaidaDoSocio socioId={s.id} companyId={companyId} nome={s.name} action={registrarSaida} />
                    <DeleteFieldButton action={excluirSocio.bind(null, s.id, companyId)} nome={s.name} />
                  </div>
                )}
              </div>
            ))}
          </div>

          {exSocios.length > 0 && (
            <section className="mb-4" aria-labelledby="ex-socios">
              <h2 id="ex-socios" className="text-[13px] font-semibold text-fg mb-2">
                Ex-sócios
              </h2>
              <div className="bg-surface border border-border rounded-lg divide-y divide-border">
                {exSocios.map((s) => (
                  <div key={s.id} className="flex items-start justify-between gap-4 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] text-fg-secondary break-words">{s.name}</p>
                      <p className="text-[11.5px] text-fg-muted tabular-nums">
                        {s.entryDate ? `${formatInstantDate(s.entryDate)} a ` : "até "}
                        {formatInstantDate(s.exitDate!)}
                        {s.qualification ? ` · ${s.qualification}` : ""}
                      </p>
                    </div>
                    {podeEditar && (
                      <Link
                        href={`/empresas/${companyId}/socios/${s.id}/editar`}
                        className="text-[12px] text-fg-muted hover:text-fg transition-colors shrink-0"
                      >
                        Editar
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

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
