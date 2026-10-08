import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { BackButton } from "@/components/shared/BackButton";
import { Selo, tomDaVariante } from "@/components/ui/Selo";
import { getAuthContext, canManageSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { formatInstantDate, formatarReais } from "@/lib/format";
import { getPrisma } from "@/lib/prisma";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { propostaDoSetor } from "@/lib/ia/propostas";
import { planejarContrato } from "@/lib/societario/contratoSocial";
import { AGENTE_CONTRATO, AGENTE_VARREDURA, type PayloadDaVarredura, type PayloadDoContrato } from "@/lib/societario/iaDoSetor";
import { RevisarVarredura } from "@/components/societario/ia/RevisarVarredura";
import { RevisarContrato } from "@/components/societario/ia/RevisarContrato";
import { aplicarContrato, aplicarVarredura, previaDoContrato, rejeitarProposta } from "../actions";

const SECTOR = "societario";
const MODULE = "societario_processos";

export const dynamic = "force-dynamic";

const STATUS = {
  PENDENTE: { rotulo: "Esperando revisão", variante: "info" },
  APROVADA: { rotulo: "Aprovada", variante: "success" },
  EDITADA: { rotulo: "Aprovada com ajuste", variante: "warning" },
  REJEITADA: { rotulo: "Rejeitada", variante: "neutral" },
} as const;
const CONFIANCA = { ALTA: "alta", MEDIA: "média", BAIXA: "baixa" } as const;

export default async function RevisarPropostaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();
  const setor = (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR;
  if (!canManageSector(ctx, setor)) notFound();

  const proposta = await propostaDoSetor(id, ctx.tenantId, setor);
  if (!proposta) notFound();
  const pendente = proposta.status === "PENDENTE";
  const s = STATUS[proposta.status];

  const cabecalho = (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-fs-2 text-fg-muted">
      <Selo tom={tomDaVariante(s.variante)}>{s.rotulo}</Selo>
      <span>{agenteDoCatalogo(proposta.agentCode)?.label ?? proposta.agentCode}</span>
      <span>· pedido por {proposta.createdBy?.name ?? "—"} em {formatInstantDate(proposta.createdAt)}</span>
      {proposta.confidence && <span>· confiança declarada pela IA: {CONFIANCA[proposta.confidence]}</span>}
      {!pendente && proposta.reviewedBy && (
        <span>
          · revisada por {proposta.reviewedBy.name} em {proposta.reviewedAt ? formatInstantDate(proposta.reviewedAt) : ""}
        </span>
      )}
    </div>
  );
  const motivo = proposta.status === "REJEITADA" && proposta.notes && (
    <p className="mb-4 rounded-lg border border-border bg-surface-2 px-4 py-3 text-fs-3 text-fg">
      <span className="font-medium">Motivo da rejeição:</span> {proposta.notes}
    </p>
  );

  if (proposta.agentCode === AGENTE_VARREDURA) {
    const payload = proposta.payload as unknown as PayloadDaVarredura;
    const aplicadas = new Set(((proposta.appliedPayload as { chaves?: string[] } | null)?.chaves ?? []) as string[]);
    const itens = pendente ? payload.avaliacao.itens : payload.avaliacao.itens.filter((i) => proposta.status === "REJEITADA" || aplicadas.has(i.chave));
    return (
      <PageContainer>
        <BackButton className="mb-3" />
        <PageHeader
          title={proposta.title}
          subtitle={
            pendente
              ? "Desmarque o que não quer encaminhar. Encaminhar sobe a prioridade de cada processo para alta e avisa o responsável com o próximo passo."
              : proposta.status === "REJEITADA"
                ? "Proposta rejeitada: nada foi encaminhado."
                : "O que foi encaminhado."
          }
        />
        {cabecalho}
        {motivo}
        <RevisarVarredura
          propostaId={proposta.id}
          itens={itens}
          sinais={payload.sinais}
          podeAplicar={pendente}
          acoes={{ aplicar: aplicarVarredura, rejeitar: rejeitarProposta }}
        />
      </PageContainer>
    );
  }

  if (proposta.agentCode === AGENTE_CONTRATO && proposta.entityId) {
    const payload = proposta.payload as unknown as PayloadDoContrato;
    const empresa = await getPrisma().company.findFirst({
      where: { id: proposta.entityId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!empresa) notFound();
    const cadastrados = await getPrisma().companyPartner.findMany({
      where: { tenantId: ctx.tenantId, companyId: empresa.id },
      select: {
        id: true,
        name: true,
        document: true,
        documentMasked: true,
        exitDate: true,
        sharePercent: true,
        quotas: true,
        capitalAmount: true,
        administrator: true,
        qualification: true,
        entryDate: true,
      },
    });
    const socios = pendente
      ? payload.leitura.socios
      : ((proposta.appliedPayload as { socios?: typeof payload.leitura.socios } | null)?.socios ?? payload.leitura.socios);
    const plano = planejarContrato(
      cadastrados.map((c) => ({
        ...c,
        sharePercent: c.sharePercent === null ? null : Number(c.sharePercent),
        capitalAmount: c.capitalAmount === null ? null : Number(c.capitalAmount),
      })),
      socios
    );
    const l = payload.leitura;
    return (
      <PageContainer>
        <BackButton className="mb-3" />
        <PageHeader
          title={proposta.title}
          subtitle={
            pendente
              ? "Confira cada sócio com o contrato ao lado. Corrija o que a IA leu errado e desmarque quem não deve entrar."
              : "O que foi gravado a partir deste contrato."
          }
        />
        {cabecalho}
        {motivo}
        <p className="mb-4 text-fs-3 text-fg-secondary">
          Arquivo: {payload.arquivo}
          {l.tipoDoDocumento && ` · ${l.tipoDoDocumento}`}
          {l.dataDoDocumento && ` de ${l.dataDoDocumento.split("-").reverse().join("/")}`}
          {l.capitalSocial !== null && ` · capital social de ${formatarReais(l.capitalSocial)}`}
          {" · "}
          <Link href={`/empresas/${empresa.id}/socios`} className="text-brand hover:underline">
            Sócios de {empresa.name}
          </Link>
        </p>
        <RevisarContrato
          propostaId={proposta.id}
          companyId={empresa.id}
          lidos={socios}
          planoInicial={plano}
          avisosIniciais={pendente ? l.avisos : []}
          podeAplicar={pendente}
          acoes={{ aplicar: aplicarContrato, rejeitar: rejeitarProposta, previa: previaDoContrato }}
        />
      </PageContainer>
    );
  }

  notFound();
}
