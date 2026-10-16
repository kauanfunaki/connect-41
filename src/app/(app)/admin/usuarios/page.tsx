import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite, podeExcluir } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";
import { UsuariosTable } from "@/components/admin/UsuariosTable";
import { PageContainer } from "@/components/shared/PageContainer";
import { canAddUser } from "@/lib/subscriptions";
import { alternarAtivoUsuario, alternarAtivoEmMassa, atribuirSetorEmMassa } from "./actions";
import { Aviso } from "@/components/ui/Aviso";

export default async function UsuariosPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

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

  return (
    <PageContainer>
      <PageHeader
        title="Usuários"
        subtitle={<>{users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}</>}
        action={<>{seatCheck.allowed ? (
          <Button
            href="/admin/usuarios/novo"
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
    </PageContainer>
  );
}
