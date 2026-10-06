import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getPortalSession } from "@/lib/auth/portal";
import { alcanceDoCliente } from "@/app/(portal)/alcance";
import { getEnabledModuleCodes } from "@/lib/modules";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { saoPauloParts } from "@/lib/agenda";
import { formatInstantDate } from "@/lib/format";
import { telasVisiveis } from "@/lib/portal/telas";
import { blocosDoInicio, destinoDosDocumentos, primeiroNome, saudacaoDaHora } from "@/lib/portal/inicio";
import type { AlcanceFiscal } from "@/lib/fiscal/alcance";
import { PageContainer } from "@/components/shared/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { FiltroDePeriodo } from "@/components/financeiro/FiltroDePeriodo";
import {
  AtalhosDoInicio,
  BlocoCarregando,
  ContagemDosDocumentos,
  DESCRICAO_DOS_DOCUMENTOS,
  FinanceiroDoInicio,
  PrecisaDeVoce,
  ProcessosDoInicio,
} from "@/components/portal/BlocosDoInicio";
import { PushNotificationToggle } from "@/components/notificacoes/PushNotificationToggle";
import { getVapidPublicKey } from "@/lib/vapid";
import { salvarPushDoPortal, removerPushDoPortal } from "@/app/(portal)/portal/actions";

export const dynamic = "force-dynamic";

/**
 * O Início do portal (05/10) — a primeira tela do cliente, parecida com a Home
 * do Connect: saudação, o que espera por ele, os números do financeiro e do
 * Societário, e atalhos.
 *
 * Até 05/10 `/portal` era a lista de documentos fiscais, que mudou para
 * `/portal/documentos`. Link salvo com os filtros dela (competência, página)
 * ainda chega aqui — e segue para lá com tudo o que trazia.
 *
 * Só aparece o que o cliente tem: o critério é o do menu (`telasVisiveis`), e
 * os números saem das empresas do grupo dele (`alcanceDoCliente`) — ou só da
 * escolhida, quando ele tem mais de uma e escolhe.
 */
export default async function InicioDoPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await getPortalSession();
  if (!sessao) redirect("/portal/login");

  const params = await searchParams;
  const antigo = destinoDosDocumentos(params);
  if (antigo) redirect(antigo);

  const prisma = getPrisma();
  const [alcance, modulos, usuario, grupo] = await Promise.all([
    alcanceDoCliente(sessao),
    getEnabledModuleCodes(sessao.tenantId),
    prisma.portalUser.findFirst({
      where: { id: sessao.sub, tenantId: sessao.tenantId, clientGroupId: sessao.clientGroupId },
      select: { name: true },
    }),
    prisma.clientGroup.findUnique({ where: { id: sessao.clientGroupId }, select: { name: true } }),
  ]);
  const companyIds = alcance.tipo === "EMPRESAS" ? alcance.companyIds : [];
  const empresas = companyIds.length > 0 ? await empresasDoSeletor(sessao.tenantId, companyIds) : [];

  // A empresa da URL só vale se for do grupo — senão o Início olha todas as
  // dele, nunca a de outro cliente (a mesma regra do fluxo de caixa).
  const pedida = typeof params.empresa === "string" ? params.empresa : null;
  const empresaId = pedida && companyIds.includes(pedida) ? pedida : null;
  const escopo = { tenantId: sessao.tenantId, companyIds: empresaId ? [empresaId] : companyIds };
  const alcanceDosDocumentos: AlcanceFiscal = empresaId
    ? { tipo: "EMPRESAS", tenantId: sessao.tenantId, companyIds: [empresaId] }
    : alcance;

  const blocos = blocosDoInicio(new Set(telasVisiveis(modulos).map((t) => t.href)));
  const agora = new Date();
  const nome = primeiroNome(usuario?.name);
  const saudacao = saudacaoDaHora(saoPauloParts(agora).hour);
  const data = formatInstantDate(agora, { weekday: "long", day: "numeric", month: "long" });
  const cliente = grupo?.name ?? empresas[0]?.nome ?? null;
  const variasEmpresas = empresas.length > 1 && !empresaId;

  return (
    <PageContainer>
      <PageHeader
        title={nome ? `${saudacao}, ${nome}` : saudacao}
        subtitle={
          <>
            {cliente && <span className="font-medium text-fg">{cliente}</span>}
            {cliente && " · "}
            {data.charAt(0).toUpperCase() + data.slice(1)}
          </>
        }
      />

      {/* Só para quem tem mais de uma empresa: o Início olha todas, ou a escolhida. */}
      {empresas.length > 1 && <FiltroDePeriodo acao="/portal" empresas={empresas} empresaId={empresaId} permitirTodas />}

      <Suspense fallback={<BlocoCarregando baixo className="mb-4" />}>
        <PrecisaDeVoce escopo={escopo} portalUserId={sessao.sub} clientGroupId={sessao.clientGroupId} atencao={blocos.atencao} />
      </Suspense>

      {/* Lado a lado só a partir de `lg` e só com os dois: no celular tudo
          empilha, e um bloco sozinho ocupa a largura toda. */}
      {(blocos.financeiro || blocos.societario) && (
        <div className={`mb-4 grid grid-cols-1 items-stretch gap-4 ${blocos.financeiro && blocos.societario ? "lg:grid-cols-2" : ""}`}>
          {blocos.financeiro && (
            <Suspense fallback={<BlocoCarregando />}>
              <FinanceiroDoInicio escopo={escopo} financeiro={blocos.financeiro} empresaId={empresaId} />
            </Suspense>
          )}
          {blocos.societario && (
            <Suspense fallback={<BlocoCarregando />}>
              <ProcessosDoInicio escopo={escopo} variasEmpresas={variasEmpresas} />
            </Suspense>
          )}
        </div>
      )}

      <AtalhosDoInicio
        pedir={blocos.pedir}
        empresaId={empresaId}
        documentos={
          <Suspense fallback={DESCRICAO_DOS_DOCUMENTOS}>
            <ContagemDosDocumentos alcance={alcanceDosDocumentos} />
          </Suspense>
        }
      />

      {/* Só aqui, no Início (era na lista de documentos, a home antiga): o
          cliente entra por aqui, e um botão de ativar aviso repetido em toda
          tela viraria paisagem. Some sozinho quando o navegador não suporta push. */}
      <PushNotificationToggle
        publicKey={getVapidPublicKey()}
        acoes={{ salvar: salvarPushDoPortal, remover: removerPushDoPortal }}
        descricao="Avisamos no celular quando houver pendência, mensagem ou conta a aprovar. O que é avisado fica só aqui dentro."
        semChaves="esconder"
      />
    </PageContainer>
  );
}
