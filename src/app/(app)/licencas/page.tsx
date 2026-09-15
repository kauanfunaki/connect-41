import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { LicencasFila } from "@/components/societario/LicencasFila";
import { NovaLicenca } from "@/components/societario/LicencaForm";
import { resumoDasLicencas } from "@/lib/societario/licencas-data";
import { situacaoDaLicenca, AVISO_EM_DIAS, type SituacaoDaLicenca } from "@/lib/societario/licencas";

const RECORTES: { chave: string; rotulo: string; situacao: SituacaoDaLicenca | null }[] = [
  { chave: "atencao", rotulo: "Precisa de ação", situacao: null },
  { chave: "vencida", rotulo: "Vencidas", situacao: "vencida" },
  { chave: "renovar", rotulo: "A renovar", situacao: "a_renovar" },
  { chave: "vigente", rotulo: "Vigentes", situacao: "vigente" },
  { chave: "todas", rotulo: "Todas", situacao: null },
];

export default async function LicencasPage({
  searchParams,
}: {
  searchParams: Promise<{ recorte?: string }>;
}) {
  const ctx = await getAuthContext();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  if (!ctx.tenantId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, "societario_licencas")) ?? "societario")) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, "societario_licencas"))) notFound();

  const { recorte } = await searchParams;
  const chave = RECORTES.some((r) => r.chave === recorte) ? recorte! : "atencao";

  const hoje = new Date();
  const prisma = getPrisma();
  const [{ linhas, vencidas, aRenovar }, empresas, orgaos] = await Promise.all([
    resumoDasLicencas(ctx.tenantId, hoje),
    prisma.company.findMany({
      where: { tenantId: ctx.tenantId, status: { in: ["ACTIVE", "PROSPECT"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, displayName: true },
    }),
    prisma.processOrgan.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const orgaosDoForm = orgaos.map((o) => ({ id: o.id, nome: o.name }));

  const filtradas = linhas.filter((l) => {
    const s = situacaoDaLicenca(l, hoje);
    if (chave === "todas") return true;
    // O recorte padrão é o que pede ação — é para isso que a tela existe, e
    // abrir em "todas" faria a renovação atrasada se perder no meio das
    // vigentes.
    if (chave === "atencao") return s === "vencida" || s === "a_renovar";
    return s === RECORTES.find((r) => r.chave === chave)!.situacao;
  });

  return (
    <PageContainer variant="narrow">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Licenças"
          subtitle={`Alvará, sanitária, ambiental, bombeiros — o que fica valendo, e o que precisa ser renovado. Entram na fila com ${AVISO_EM_DIAS} dias de antecedência.`}
        />
        <NovaLicenca
          empresas={empresas.map((e) => ({ value: e.id, label: nomeExibicao(e) }))}
          orgaos={orgaosDoForm}
        />
      </div>

      {(vencidas > 0 || aRenovar > 0) && (
        <p className="text-[13px] text-fg mb-4">
          {vencidas > 0 && (
            <span className="text-danger font-medium">
              {vencidas} {vencidas === 1 ? "licença vencida" : "licenças vencidas"}
            </span>
          )}
          {vencidas > 0 && aRenovar > 0 && <span className="text-fg-muted"> · </span>}
          {aRenovar > 0 && (
            <span className="text-warning font-medium">
              {aRenovar} {aRenovar === 1 ? "a renovar" : "a renovar"}
            </span>
          )}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {RECORTES.map((r) => {
          const ativo = r.chave === chave;
          const total =
            r.chave === "todas"
              ? linhas.length
              : r.chave === "atencao"
                ? vencidas + aRenovar
                : linhas.filter((l) => situacaoDaLicenca(l, hoje) === r.situacao).length;
          return (
            <Link
              key={r.chave}
              href={r.chave === "atencao" ? "/licencas" : `/licencas?recorte=${r.chave}`}
              aria-current={ativo ? "page" : undefined}
              className={
                ativo
                  ? "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium"
                  : "h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors"
              }
            >
              {r.rotulo}
              <span className="tabular-nums text-fg-muted">{total}</span>
            </Link>
          );
        })}
      </div>

      <LicencasFila
        linhas={filtradas}
        hoje={hoje}
        filtrado={linhas.length > 0 && filtradas.length === 0}
        orgaos={orgaosDoForm}
      />
    </PageContainer>
  );
}
