import { AlertTriangle, Bot, CalendarClock, ShieldCheck, ListChecks } from "lucide-react";
import { ImportarLicencas } from "@/components/societario/ImportarLicencas";
import { AvisoPorEmail } from "@/components/societario/AvisoPorEmail";
import { lerConfiguracaoDoAviso, MODULO_DAS_CERTIDOES } from "@/lib/societario/avisoDeVencimentoServidor";
import { temSmtpConfigurado } from "@/lib/email/sendMail";
import { Button } from "@/components/ui/Button";
import { DebouncedSearchInput } from "@/components/shared/DebouncedSearchInput";
import { notFound } from "next/navigation";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setoresDoModulo } from "@/lib/modules";
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
import { situacaoDaLicenca, buscarLicencas, AVISO_EM_DIAS, type SituacaoDaLicenca } from "@/lib/societario/licencas";
import { CascoDaTabela, contarItens } from "@/components/shared/CascoDaTabela";
import { Pagination } from "@/components/shared/Pagination";

/** Licenças por página (lote B de 03/11/2026: a tela inteira pesava ao abrir). */
const POR_PAGINA = 50;
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
  searchParams: Promise<{ recorte?: string; busca?: string; pagina?: string }>;
}) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) notFound();
  // Setor que opera o módulo neste tenant, não o de origem — ver `setorDoModulo`.
  // As duas conferências saem juntas (05/11/2026); antes iam uma depois da outra.
  const [setoresDaTela, ligado] = await Promise.all([
    setoresDoModulo(ctx.tenantId, "societario_licencas"),
    isModuleEnabled(ctx.tenantId, "societario_licencas"),
  ]);
  if (!canActOnSector(ctx, setoresDaTela ?? "societario") || !ligado) notFound();

  const { recorte, busca, pagina: paginaDaUrl } = await searchParams;
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(paginaDaUrl ?? "1", 10) || 1));
  // Quem busca uma empresa quer achar a licença dela, vença ou não: sem recorte
  // escolhido, a busca olha todas (03/11/2026). O padrão "Precisa de ação"
  // escondia o alvará sem validade, que é o que o robô imprime.
  const padrao = busca?.trim() ? "todas" : "atencao";
  const chave = RECORTES.some((r) => r.chave === recorte) ? recorte! : padrao;

  const hoje = new Date();
  const prisma = getPrisma();
  const [{ linhas, vencidas, aRenovar }, empresas, orgaos, roboLigado, avisoPorEmail, smtp, comCertidoes] = await Promise.all([
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
    isModuleEnabled(ctx.tenantId, "societario_robo"),
    lerConfiguracaoDoAviso(ctx.tenantId),
    temSmtpConfigurado(ctx.tenantId),
    isModuleEnabled(ctx.tenantId, MODULO_DAS_CERTIDOES),
  ]);
  const orgaosDoForm = orgaos.map((o) => ({ id: o.id, nome: o.name }));

  const filtradas = buscarLicencas(linhas, busca).filter((l) => {
    const s = situacaoDaLicenca(l, hoje);
    if (chave === "todas") return true;
    // O recorte padrão é o que pede ação — é para isso que a tela existe, e
    // abrir em "todas" faria a renovação atrasada se perder no meio das
    // vigentes.
    if (chave === "atencao") return s === "vencida" || s === "a_renovar";
    return s === RECORTES.find((r) => r.chave === chave)!.situacao;
  });

  // A contagem e os totais são da lista inteira; só a tabela vem por página.
  const totalDePaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaVista = Math.min(pagina, totalDePaginas);
  const daPagina = filtradas.slice((paginaVista - 1) * POR_PAGINA, paginaVista * POR_PAGINA);
  const hrefDaPagina = (p: number) => {
    const q = new URLSearchParams();
    if (recorte) q.set("recorte", recorte);
    if (busca?.trim()) q.set("busca", busca.trim());
    if (p > 1) q.set("pagina", String(p));
    const t = q.toString();
    return t ? `/licencas?${t}` : "/licencas";
  };

  return (
    <PageContainer>
      {/* O botão vai no `action` do cabeçalho, como nas outras telas: numa div
          ao lado, ele ficava alinhado ao traço do setor, acima do título. */}
      <PageHeader
        title="Licenças"
        subtitle={`Alvará, sanitária, ambiental, bombeiros — o que fica valendo, e o que precisa ser renovado. Entram na fila com ${AVISO_EM_DIAS} dias de antecedência.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* A fila do robô (30/10/2026): o alvará pedido no ⋯ da licença.
                Botão, e não link de texto, desde 03/11/2026 — e também no menu. */}
            {roboLigado && (
              <Button href="/robo" variant="secondary" size="sm">
                <Bot size={14} /> Hub de robôs
              </Button>
            )}
            {/* Importar de planilha (lote B de 03/11/2026), com o modelo do Connect. */}
            {/* O e-mail diário de vencimentos (12/11/2026), o que o Radar Societário mandava. */}
            <AvisoPorEmail
              ligado={avisoPorEmail?.ligado ?? false}
              emails={avisoPorEmail?.emails ?? []}
              smtp={smtp}
              comCertidoes={comCertidoes}
            />
            <ImportarLicencas />
            <NovaLicenca
              empresas={opcoesDeEmpresa(empresas.map((e) => ({ ...e, nome: nomeExibicao(e) })))}
              orgaos={orgaosDoForm}
            />
          </div>
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
        busca={<DebouncedSearchInput paramName="busca" placeholder="Buscar empresa, cidade ou CNPJ" />}
        filtros={
          <FiltrosDaTela
            naBarra
            campos={[
              {
                chave: "recorte",
                rotulo: "Situação",
                vazioLabel: padrao === "todas" ? "Todas" : "Precisa de ação",
                opcoes: RECORTES.filter((r) => r.chave !== "atencao").map((r) => ({ value: r.chave, label: r.rotulo })),
              },
            ]}
          />
        }
      >
        <LicencasFila
          linhas={daPagina}
          hoje={hoje}
          filtrado={linhas.length > 0 && filtradas.length === 0}
          orgaos={orgaosDoForm}
          roboLigado={roboLigado}
        />
      </CascoDaTabela>
      <Pagination page={paginaVista} totalPages={totalDePaginas} buildHref={hrefDaPagina} total={filtradas.length} rotulo="licenças" />
    </PageContainer>
  );
}
