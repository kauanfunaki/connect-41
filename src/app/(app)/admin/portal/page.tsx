import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Aviso } from "@/components/ui/Aviso";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir } from "@/lib/auth/context";
import { getEnabledModuleCodes } from "@/lib/modules";
import { formatInstantDate } from "@/lib/format";
import { lerTelasBloqueadas } from "@/lib/portal/telasBloqueadas";
import { FALTA_ATUALIZAR_O_BANCO, resumoDasLiberadas, telasParaLiberar } from "@/lib/portal/telasLiberadas";
import { empresasLigadasDasContas } from "@/lib/portal/empresasDaContaDb";
import { opcoesDeEmpresaDoPortal } from "@/lib/portal/opcoesDeEmpresa";
import { NovoAcessoDoPortal, PortalAcessosList } from "@/components/portal/PortalAcessosList";
import { TelasLiberadasDoPortal } from "@/components/portal/TelasLiberadasDoPortal";
import {
  criarAcessoDoPortal,
  enviarLinkDeSenha,
  alternarAcessoDoPortal,
  editarAcessoDoPortal,
  resumoDoAcessoParaExcluir,
  excluirAcessoDoPortal,
} from "./actions";
import { definirTelaDoPortal } from "./telas-actions";
import { definirCeciDaEmpresa } from "./ceci-actions";
import { CeciDoPortalAdmin } from "@/components/portal/CeciDoPortalAdmin";
import { FALTA_ATUALIZAR_O_BANCO_DA_CECI, LIMITE_DE_PERGUNTAS_DO_PORTAL_POR_DIA, empresasDoPortalParaACeci, situacaoDaCeci } from "@/lib/portal/ceci";
import { formatarReaisDeCentavos } from "@/lib/format";
import Link from "next/link";

const ABAS = [
  { chave: "acessos", rotulo: "Acessos", href: "/admin/portal" },
  { chave: "telas", rotulo: "Telas liberadas", href: "/admin/portal?aba=telas" },
  { chave: "ceci", rotulo: "Ceci", href: "/admin/portal?aba=ceci" },
];

// O portal do cliente, do lado do escritório. Tela de administração do tenant,
// não de setor: dar acesso a alguém de fora da 41 não é operação de fiscal nem
// de BPO.
//
// Duas abas desde 14/10/2026: os acessos (quem entra) e as telas liberadas
// (o que os clientes já podem abrir — ver `TelasLiberadasDoPortal`). Era
// "Acessos do portal", só com a lista.
//
// Também desde 14/10/2026 o acesso é ligado direto às empresas (era a um
// Cliente): a coluna "Cliente" virou "Empresas", e o mesmo acesso se cria e se
// liga na ficha de cada empresa, em "Acesso ao portal".
export default async function AdminPortalPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const { aba } = await searchParams;
  if (aba === "telas") return <AbaDasTelas tenantId={ctx.tenantId} somenteLeitura={ctx.subscriptionReadOnly} />;
  if (aba === "ceci") return <AbaDaCeci tenantId={ctx.tenantId} somenteLeitura={ctx.subscriptionReadOnly} />;

  const prisma = getPrisma();
  const [acessos, empresas] = await Promise.all([
    prisma.portalUser.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, active: true, lastLoginAt: true },
    }),
    opcoesDeEmpresaDoPortal(ctx.tenantId),
  ]);
  const ligadas = await empresasLigadasDasContas(ctx.tenantId, acessos);

  return (
    <PageContainer>
      {/* A explicação era um parágrafo solto depois do cabeçalho; é o subtítulo dele. */}
      <PageHeader
        title="Portal do cliente"
        subtitle="Contas de clientes que entram no portal. Cada conta enxerga as empresas ligadas a ela — e, com “incluir
          filiais”, as filiais delas. Também dá para criar e ligar acessos na ficha de cada empresa."
        action={<NovoAcessoDoPortal empresas={empresas} criarAction={criarAcessoDoPortal} />}
      />
      <AbasDeLink abas={ABAS} ativa="acessos" />

      <PortalAcessosList
        acessos={acessos.map((a) => ({
          id: a.id,
          nome: a.name,
          email: a.email,
          ativo: a.active,
          empresas: (ligadas.get(a.id) ?? []).map((e) => ({ id: e.id, nome: e.nome, incluiFiliais: e.incluiFiliais, filiais: e.filiais })),
          ultimoAcesso: a.lastLoginAt ? formatInstantDate(a.lastLoginAt) : null,
        }))}
        empresas={empresas}
        enviarLinkAction={enviarLinkDeSenha}
        alternarAction={alternarAcessoDoPortal}
        editarAction={editarAcessoDoPortal}
        resumoParaExcluirAction={resumoDoAcessoParaExcluir}
        excluirAction={excluirAcessoDoPortal}
        podeExcluir={podeExcluir(ctx)}
      />
    </PageContainer>
  );
}

/**
 * Telas liberadas no portal (14/10/2026): o que os clientes do escritório já
 * podem abrir. Os módulos entram para avisar a tela que já não aparece por
 * outro motivo — bloquear ou não, ela não está no menu.
 */
async function AbaDasTelas({ tenantId, somenteLeitura }: { tenantId: string; somenteLeitura: boolean }) {
  const [modulos, leitura] = await Promise.all([getEnabledModuleCodes(tenantId), lerTelasBloqueadas(tenantId)]);
  const grupos = telasParaLiberar(modulos, leitura.bloqueadas);
  const { liberadas, total } = resumoDasLiberadas(grupos);

  return (
    <PageContainer>
      <PageHeader
        title="Portal do cliente"
        subtitle="As telas que os clientes do escritório já podem abrir. Libere cada uma depois de testar."
      />
      <AbasDeLink abas={ABAS} ativa="telas" />

      <div className="mb-5 max-w-3xl space-y-2 text-fs-2 text-fg-secondary leading-relaxed">
        <p>
          Uma tela <span className="font-medium text-fg">bloqueada</span> some do menu, do Início, da ajuda e do tutorial do
          portal. Quem abrir pelo endereço ou pelo link de um e-mail vê “Esta tela ainda não está disponível”, com o botão
          para voltar ao início.
        </p>
        <p>
          Vale na hora e para todos os clientes do escritório. Telas novas que entrarem no portal chegam liberadas. Início,
          Minha conta e Ajuda ficam sempre liberadas.
        </p>
        <p className="font-medium text-fg tabular-nums">
          {liberadas} de {total} {total === 1 ? "tela liberada" : "telas liberadas"}
        </p>
      </div>

      {leitura.situacao === "sem-tabela" && (
        <Aviso tom="atencao" className="mb-4 max-w-3xl">
          {FALTA_ATUALIZAR_O_BANCO}
        </Aviso>
      )}
      {leitura.situacao === "erro" && (
        <Aviso tom="perigo" className="mb-4 max-w-3xl">
          Não foi possível ler as telas bloqueadas agora. Atualize a página em instantes.
        </Aviso>
      )}
      {somenteLeitura && (
        <Aviso tom="atencao" className="mb-4 max-w-3xl">
          A assinatura está em somente leitura: dá para ver, mas não para mudar.
        </Aviso>
      )}

      <TelasLiberadasDoPortal
        grupos={grupos}
        definirAction={definirTelaDoPortal}
        somenteLeitura={leitura.situacao !== "ok" || somenteLeitura}
      />
    </PageContainer>
  );
}

/**
 * A Ceci no portal (21/10/2026): o piloto da IA para os clientes, ligado
 * empresa a empresa. O agente, a chave e o teto do mês são da tela de
 * Inteligência artificial; aqui ficam as empresas, e o resumo do agente para
 * quem liga uma empresa saber se a Ceci vai mesmo aparecer.
 */
async function AbaDaCeci({ tenantId, somenteLeitura }: { tenantId: string; somenteLeitura: boolean }) {
  const [empresas, situacao] = await Promise.all([empresasDoPortalParaACeci(tenantId), situacaoDaCeci(tenantId, new Date())]);
  const ligadas = empresas?.filter((e) => e.ligada).length ?? 0;
  const pronta = situacao.ligado && situacao.temChave;

  return (
    <PageContainer>
      <PageHeader
        title="Portal do cliente"
        subtitle="A Ceci no portal responde ao cliente sobre as empresas dele: pendências, contas, processos, notas e solicitações."
      />
      <AbasDeLink abas={ABAS} ativa="ceci" />

      <div className="mb-5 max-w-3xl space-y-2 text-fs-2 text-fg-secondary leading-relaxed">
        <p>
          Ela só consulta o que o portal já mostra ao cliente, e só das empresas ligadas aqui que estão no acesso dele. Não
          faz nada sozinha: quando o cliente precisa da equipe, ela prepara uma solicitação, que ele mesmo revisa e envia.
        </p>
        <p>
          Ligada na matriz, vale também para as filiais que o acesso vê por ela. Cada cliente faz até{" "}
          {LIMITE_DE_PERGUNTAS_DO_PORTAL_POR_DIA} perguntas por dia.
        </p>
        <p className="font-medium text-fg tabular-nums">
          {ligadas} {ligadas === 1 ? "empresa ligada" : "empresas ligadas"} · {formatarReaisDeCentavos(situacao.gastoCentavos)} de{" "}
          {formatarReaisDeCentavos(situacao.tetoCentavos)} no mês · {situacao.chamadas} de {situacao.tetoChamadas} perguntas
        </p>
      </div>

      {!pronta && (
        <Aviso tom="atencao" className="mb-4 max-w-3xl">
          {!situacao.temChave
            ? "O escritório ainda não tem chave de IA: sem ela, a Ceci não aparece no portal."
            : "O agente “Ceci · Portal do cliente” está desligado: com ele desligado, a Ceci não aparece no portal, mesmo nas empresas ligadas."}{" "}
          <Link href="/admin/ia" className="font-medium underline">
            Abrir Inteligência artificial
          </Link>
        </Aviso>
      )}
      {empresas === null && (
        <Aviso tom="atencao" className="mb-4 max-w-3xl">
          {FALTA_ATUALIZAR_O_BANCO_DA_CECI}
        </Aviso>
      )}
      {somenteLeitura && (
        <Aviso tom="atencao" className="mb-4 max-w-3xl">
          A assinatura está em somente leitura: dá para ver, mas não para mudar.
        </Aviso>
      )}

      <CeciDoPortalAdmin empresas={empresas ?? []} definirAction={definirCeciDaEmpresa} somenteLeitura={empresas === null || somenteLeitura} />
    </PageContainer>
  );
}
