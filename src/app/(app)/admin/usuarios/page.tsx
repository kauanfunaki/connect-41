import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir } from "@/lib/auth/context";
import { assignableRoles, ROLE_OPTIONS } from "@/lib/roles";
import { PersonType } from "@/generated/prisma/enums";
import { ROLE_LABELS } from "@/lib/roles";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { UsuarioForm } from "@/components/admin/UsuarioForm";
import { AtendimentoDoUsuario } from "@/components/admin/AtendimentoDoUsuario";
import { vincularUsuarioPessoa } from "@/app/(app)/pessoas/actions";
import { vincularAgenteChatwoot } from "./atendimento-actions";
import { getSectorMaps } from "@/lib/sectors";
import { UsuariosTable } from "@/components/admin/UsuariosTable";
import { PageContainer } from "@/components/shared/PageContainer";
import { canAddUser } from "@/lib/subscriptions";
import { alternarAtivoUsuario, alternarAtivoEmMassa, atribuirSetorEmMassa, atualizarUsuario, criarUsuario } from "./actions";
import { Aviso } from "@/components/ui/Aviso";

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ novo?: string; editar?: string }> }) {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();
  // Criar e editar no painel ao lado da tabela (escolha 3A dos Ajustes de
  // 15/10, 20/10/2026): era uma página de 720px encostada à esquerda, e o
  // atendente do Chatwoot se escolhia noutra tela, Atendentes e vínculos.
  const { novo, editar } = await searchParams;

  const { labels: sectorLabels, colors: sectorColors, options: sectorOptions } = await getSectorMaps(ctx.tenantId);
  const prisma = getPrisma();
  const users = await prisma.user.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { name: "asc" },
    include: { sectors: true },
  });

  // Checado aqui, não só no submit: antes o limite de seats só aparecia depois
  // de preencher o formulário inteiro e tentar salvar.
  const seatCheck = await canAddUser(ctx.tenantId);

  const allowed = assignableRoles(ctx.role);
  // Super Admin só se edita por outro Super Admin (era o 404 da página de edição).
  const pedido = editar ? users.find((u) => u.id === editar) : undefined;
  const emEdicao = pedido && !(pedido.role === "SUPER_ADMIN" && ctx.role !== "SUPER_ADMIN") ? pedido : undefined;

  // O atendimento da conta em edição: os colaboradores internos e os
  // atendentes do Chatwoot ainda sem conta, mais os desta. O Chatwoot só
  // aparece com a integração ligada.
  const atendimento = emEdicao
    ? await (async () => {
        const [pessoas, agentes, conexao] = await Promise.all([
          prisma.person.findMany({
            where: { tenantId: ctx.tenantId, type: PersonType.COLABORADOR, isInternal: true, OR: [{ linkedUserId: null }, { linkedUserId: emEdicao.id }] },
            orderBy: { name: "asc" },
            select: { id: true, name: true, linkedUserId: true },
          }),
          prisma.chatwootAgentLink.findMany({
            where: { tenantId: ctx.tenantId, OR: [{ linkedUserId: null }, { linkedUserId: emEdicao.id }] },
            orderBy: { chatwootAgentName: "asc" },
            select: { id: true, chatwootAgentName: true, linkedUserId: true },
          }),
          prisma.chatwootConnection.findFirst({ where: { tenantId: ctx.tenantId }, select: { id: true } }),
        ]);
        return {
          pessoas: pessoas.map((p) => ({ id: p.id, nome: p.name })),
          pessoaAtual: pessoas.find((p) => p.linkedUserId === emEdicao.id)?.id ?? null,
          agentes: conexao ? agentes.map((a) => ({ id: a.id, nome: a.chatwootAgentName })) : null,
          agenteAtual: agentes.find((a) => a.linkedUserId === emEdicao.id)?.id ?? null,
        };
      })()
    : null;

  return (
    <PageContainer>
      <PageHeader
        title="Usuários"
        subtitle={<>{users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}</>}
        action={<>{seatCheck.allowed ? (
          <Button
            href="/admin/usuarios?novo=1"
            scroll={false}
            variant="primary" className="font-medium"
          >
            + Novo usuário
          </Button>
        ) : (
          // O `Button` desabilitado (15/10/2026), e não um `<span>` com cara de
          // botão; o motivo está no aviso logo abaixo.
          <Button variant="primary" disabled>
            + Novo usuário
          </Button>
        )}</>}
      />
      {!seatCheck.allowed && (
        <Aviso tom="atencao" className="mb-4">
          <p className="text-fg">{seatCheck.reason}</p>
        </Aviso>
      )}

      <UsuariosTable
        users={users.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          roleLabel: ROLE_LABELS[u.role],
          active: u.active,
          sectors: u.sectors.map((s) => ({
            code: s.sectorCode,
            label: sectorLabels[s.sectorCode] ?? s.sectorCode,
            color: sectorColors[s.sectorCode] ?? "#586577",
          })),
        }))}
        currentUserId={ctx.userId}
        podeExcluir={podeExcluir(ctx)}
        sectorOptions={sectorOptions}
        alternarAtivoUsuario={alternarAtivoUsuario}
        alternarAtivoEmMassa={alternarAtivoEmMassa}
        atribuirSetorEmMassa={atribuirSetorEmMassa}
      />

      {novo === "1" && (
        <PainelDeCadastro titulo="Novo usuário" voltarPara="/admin/usuarios" largo>
          {seatCheck.allowed ? (
            <UsuarioForm
              action={criarUsuario}
              cancelHref="/admin/usuarios"
              roleOptions={ROLE_OPTIONS.filter((r) => allowed.includes(r.value))}
              sectorOptions={sectorOptions}
            />
          ) : (
            <Aviso tom="atencao">
              <p className="text-fg">{seatCheck.reason}</p>
            </Aviso>
          )}
        </PainelDeCadastro>
      )}
      {emEdicao && (
        <PainelDeCadastro titulo="Editar usuário" voltarPara="/admin/usuarios" largo>
          <UsuarioForm
            key={emEdicao.id}
            action={atualizarUsuario}
            cancelHref="/admin/usuarios"
            roleOptions={ROLE_OPTIONS.filter((r) => allowed.includes(r.value) || r.value === emEdicao.role)}
            sectorOptions={sectorOptions}
            isSelf={emEdicao.id === ctx.userId}
            defaultValues={{
              id: emEdicao.id,
              name: emEdicao.name,
              email: emEdicao.email,
              role: emEdicao.role,
              active: emEdicao.active,
              sectors: emEdicao.sectors.map((s) => s.sectorCode),
            }}
          />
          {atendimento && (
            <AtendimentoDoUsuario
              key={emEdicao.id}
              userId={emEdicao.id}
              pessoas={atendimento.pessoas}
              pessoaAtual={atendimento.pessoaAtual}
              agentes={atendimento.agentes}
              agenteAtual={atendimento.agenteAtual}
              vincularPessoa={vincularUsuarioPessoa}
              vincularAgente={vincularAgenteChatwoot}
            />
          )}
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}
