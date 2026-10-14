import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { Plus, Users2 } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir } from "@/lib/auth/context";
import { getEnabledModuleCodes } from "@/lib/modules";
import { formatInstantDate } from "@/lib/format";
import { lerTelasBloqueadas } from "@/lib/portal/telasBloqueadas";
import { FALTA_ATUALIZAR_O_BANCO, resumoDasLiberadas, telasParaLiberar } from "@/lib/portal/telasLiberadas";
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

const ABAS = [
  { chave: "acessos", rotulo: "Acessos", href: "/admin/portal" },
  { chave: "telas", rotulo: "Telas liberadas", href: "/admin/portal?aba=telas" },
];

// O portal do cliente, do lado do escritório. Tela de administração do tenant,
// não de setor: dar acesso a alguém de fora da 41 não é operação de fiscal nem
// de BPO.
//
// Duas abas desde 14/10/2026: os acessos (quem entra) e as telas liberadas
// (o que os clientes já podem abrir — ver `TelasLiberadasDoPortal`). Era
// "Acessos do portal", só com a lista.
export default async function AdminPortalPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const { aba } = await searchParams;
  if (aba === "telas") return <AbaDasTelas tenantId={ctx.tenantId} somenteLeitura={ctx.subscriptionReadOnly} />;

  const prisma = getPrisma();
  const [acessos, grupos] = await Promise.all([
    prisma.portalUser.findMany({
      where: { tenantId: ctx.tenantId },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        lastLoginAt: true,
        clientGroupId: true,
        clientGroup: { select: { name: true } },
      },
    }),
    prisma.clientGroup.findMany({
      where: { tenantId: ctx.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { companies: true } } },
    }),
  ]);

  const clientes = grupos.map((g) => ({ id: g.id, nome: g.name, empresas: g._count.companies }));

  return (
    <PageContainer>
      {/* A explicação era um parágrafo solto depois do cabeçalho; é o subtítulo dele. */}
      <PageHeader
        title="Portal do cliente"
        subtitle="Contas de clientes que entram no portal para ver os próprios documentos fiscais. Cada conta
          enxerga as empresas de um cliente — e só elas."
        action={grupos.length > 0 && <NovoAcessoDoPortal clientes={clientes} criarAction={criarAcessoDoPortal} />}
      />
      <AbasDeLink abas={ABAS} ativa="acessos" />

      {/* Sem cliente ativo e sem acesso: o vazio aponta onde se cria cliente.
          Dizia "Crie um cliente em Empresas" — cliente se cria em Cadastros →
          Clientes (13/10/2026). Com acessos de clientes inativos, a lista
          continua aparecendo: é nela que se edita ou exclui. */}
      {grupos.length === 0 && acessos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users2 />}
            title="Nenhum cliente cadastrado"
            description="O acesso do portal é dado a um cliente, que agrupa as empresas. Crie um cliente em Cadastros → Clientes e vincule as empresas dele antes."
            action={
              <Button href="/clientes/novo">
                <Plus size={14} /> Novo cliente
              </Button>
            }
          />
        </Card>
      ) : (
        <PortalAcessosList
          acessos={acessos.map((a) => ({
            id: a.id,
            nome: a.name,
            email: a.email,
            ativo: a.active,
            clienteId: a.clientGroupId,
            cliente: a.clientGroup.name,
            ultimoAcesso: a.lastLoginAt ? formatInstantDate(a.lastLoginAt) : null,
          }))}
          clientes={clientes}
          enviarLinkAction={enviarLinkDeSenha}
          alternarAction={alternarAcessoDoPortal}
          editarAction={editarAcessoDoPortal}
          resumoParaExcluirAction={resumoDoAcessoParaExcluir}
          excluirAction={excluirAcessoDoPortal}
          podeExcluir={podeExcluir(ctx)}
        />
      )}
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
