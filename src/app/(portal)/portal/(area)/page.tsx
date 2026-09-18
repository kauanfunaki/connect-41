import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { getPortalSession } from "@/lib/auth/portal";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { listarDocumentos, competenciasDisponiveis } from "@/lib/fiscal/data";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PortalDocumentosTable } from "@/components/portal/PortalDocumentosTable";
import { PortalCompetenciaFiltro } from "@/components/portal/PortalCompetenciaFiltro";
import { PortalCabecalho } from "@/components/portal/PortalCabecalho";
import { getEnabledModuleCodes } from "@/lib/modules";
import { AvisosDaHome } from "@/components/portal/AvisosDaHome";
import { PushNotificationToggle } from "@/components/notificacoes/PushNotificationToggle";
import { getVapidPublicKey } from "@/lib/vapid";
import { salvarPushDoPortal, removerPushDoPortal } from "@/app/(portal)/portal/actions";

// Acervo fiscal visto pelo cliente. **Só leitura**, e por construção: não há
// entrada de XML nem decisão de destino aqui, e as actions que fazem essas
// coisas exigem setor interno — que nenhuma sessão de portal tem.
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const params = await searchParams;
  const alcance = await alcanceDoCliente(sessao);
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const filtro = { competencia: params.competencia || undefined };

  const [{ documentos, total, totalLimitado, temProxima, porPagina }, competencias, modulos] = await Promise.all([
    listarDocumentos(alcance, filtro, pagina),
    competenciasDisponiveis(alcance),
    getEnabledModuleCodes(sessao.tenantId),
  ]);

  return (
    <PageContainer>
      <PortalCabecalho
        titulo="Documentos Fiscais"
        descricao="Notas emitidas e recebidas pelas suas empresas."
        somenteLeitura={false}
      />
      <AvisosDaHome
        tenantId={sessao.tenantId}
        companyIds={alcance.tipo === "EMPRESAS" ? alcance.companyIds : []}
        portalUserId={sessao.sub}
        modulos={modulos}
      />
      {/* Só na home: o cliente entra por aqui, e um botão de ativar aviso
          repetido em toda tela viraria paisagem. Some sozinho quando o
          navegador não suporta push. */}
      <PushNotificationToggle
        publicKey={getVapidPublicKey()}
        acoes={{ salvar: salvarPushDoPortal, remover: removerPushDoPortal }}
        descricao="Avisamos no celular quando houver pendência, mensagem ou conta a aprovar. O que é avisado fica só aqui dentro."
        semChaves="esconder"
      />

      {total === 0 && !params.competencia ? (
        <Card>
          <EmptyState
            icon={<FileText />}
            title="Nenhum documento ainda"
            description="Assim que houver notas das suas empresas, elas aparecem aqui. Se você espera ver algo, fale com o seu contato na 41."
          />
        </Card>
      ) : (
        <>
          <PortalCompetenciaFiltro competencias={competencias} />
          {documentos.length === 0 ? (
            <Card className="mt-4">
              <EmptyState
                icon={<FileText />}
                title="Nenhum documento nesta competência"
                description="Escolha outro mês."
              />
            </Card>
          ) : (
            <PortalDocumentosTable
              documentos={documentos}
              total={total}
              totalLimitado={totalLimitado}
              temProxima={temProxima}
              pagina={pagina}
              porPagina={porPagina}
              filtrosDaUrl={params}
            />
          )}
        </>
      )}
    </PageContainer>
  );
}
