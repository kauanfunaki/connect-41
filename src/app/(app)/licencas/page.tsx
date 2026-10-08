import { AlertTriangle, CalendarClock, ShieldCheck, ListChecks } from "lucide-react";
import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getPrisma } from "@/lib/prisma";
import { nomeExibicao } from "@/lib/companyName";
import { CAMPOS_DA_EMPRESA_NO_SELETOR, opcoesDeEmpresa } from "@/lib/empresas/opcoesDoSeletor";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { LicencasFila } from "@/components/societario/LicencasFila";
import { NovaLicenca } from "@/components/societario/LicencaForm";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { FiltrosDaTela } from "@/components/shared/FiltrosDaTela";
import { resumoDasLicencas } from "@/lib/societario/licencas-data";
import { situacaoDaLicenca, AVISO_EM_DIAS, type SituacaoDaLicenca } from "@/lib/societario/licencas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { formatarNumero } from "@/lib/format";

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
      select: CAMPOS_DA_EMPRESA_NO_SELETOR,
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
    <PageContainer>
      {/* O botão vai no `action` do cabeçalho, como nas outras telas: numa div
          ao lado, ele ficava alinhado ao traço do setor, acima do título. */}
      <PageHeader
        title="Licenças"
        subtitle={`Alvará, sanitária, ambiental, bombeiros — o que fica valendo, e o que precisa ser renovado. Entram na fila com ${AVISO_EM_DIAS} dias de antecedência.`}
        action={
          <NovaLicenca
            empresas={opcoesDeEmpresa(empresas.map((e) => ({ ...e, nome: nomeExibicao(e) })))}
            orgaos={orgaosDoForm}
          />
        }
      />

      {/* Quatro números em cartão, cada um abrindo o seu recorte — eram uma
          frase-resumo e cinco pílulas (conferência de 30/09). */}
      <FaixaDeTotais
        itens={[
          {
            rotulo: "Precisa de ação",
            valor: formatarNumero(vencidas + aRenovar, 0),
            icone: <ListChecks />,
            tom: vencidas + aRenovar > 0 ? "text-warning-fg" : undefined,
            detalhe: chave === "atencao" ? "mostrando agora" : undefined,
            ativo: chave === "atencao",
            href: "/licencas",
          },
          {
            rotulo: "Vencidas",
            valor: formatarNumero(vencidas, 0),
            icone: <AlertTriangle />,
            tom: vencidas > 0 ? "text-danger" : undefined,
            detalhe: chave === "vencida" ? "mostrando agora" : undefined,
            ativo: chave === "vencida",
            href: "/licencas?recorte=vencida",
          },
          {
            rotulo: "A renovar",
            valor: formatarNumero(aRenovar, 0),
            icone: <CalendarClock />,
            tom: aRenovar > 0 ? "text-warning-fg" : undefined,
            detalhe: chave === "renovar" ? "mostrando agora" : undefined,
            ativo: chave === "renovar",
            href: "/licencas?recorte=renovar",
          },
          {
            rotulo: "Vigentes",
            valor: formatarNumero(linhas.filter((l) => situacaoDaLicenca(l, hoje) === "vigente").length, 0),
            icone: <ShieldCheck />,
            tom: "text-success-fg",
            detalhe: chave === "vigente" ? "mostrando agora" : undefined,
            ativo: chave === "vigente",
            href: "/licencas?recorte=vigente",
          },
        ]}
      />
      <CascoDaTabela
        contagem={contarItens(filtradas.length, "licença", "licenças")}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "recorte",
                rotulo: "Situação",
                vazioLabel: "Precisa de ação",
                opcoes: RECORTES.filter((r) => r.chave !== "atencao").map((r) => ({ value: r.chave, label: r.rotulo })),
              },
            ]}
          />
        }
      >
        <LicencasFila
          linhas={filtradas}
          hoje={hoje}
          filtrado={linhas.length > 0 && filtradas.length === 0}
          orgaos={orgaosDoForm}
        />
      </CascoDaTabela>
    </PageContainer>
  );
}
