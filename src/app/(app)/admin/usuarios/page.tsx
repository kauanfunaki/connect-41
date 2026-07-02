import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";
import { UsuariosTable } from "@/components/admin/UsuariosTable";
import { alternarAtivoUsuario, alternarAtivoEmMassa, atribuirSetorEmMassa } from "./actions";

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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Usuários</h1>
          <p className="text-[13px] text-fg-muted mt-0.5">
            {users.length} usuário{users.length !== 1 ? "s" : ""} cadastrado{users.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/admin/usuarios/novo"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-brand text-on-brand text-[13px] font-medium hover:bg-brand-hover transition-colors"
        >
          + Novo Usuário
        </Link>
      </div>

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
        sectorOptions={sectorOptions}
        alternarAtivoUsuario={alternarAtivoUsuario}
        alternarAtivoEmMassa={alternarAtivoEmMassa}
        atribuirSetorEmMassa={atribuirSetorEmMassa}
      />
    </div>
  );
}
