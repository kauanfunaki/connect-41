import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { ROLE_LABELS } from "@/lib/roles";
import { getSectorMaps } from "@/lib/sectors";
import { ToggleActiveButton } from "@/components/admin/ToggleActiveButton";
import { alternarAtivoUsuario } from "./actions";

export default async function UsuariosPage() {
  const ctx = await getAuthContext();
  if (!isFullWrite(ctx.role)) notFound();

  const { labels: sectorLabels, colors: sectorColors } = await getSectorMaps(ctx.tenantId);
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

      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        {users.length === 0 ? (
          <div className="py-16 text-center text-[13px] text-fg-muted">
            Nenhum usuário cadastrado ainda.
          </div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Nome</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">E-mail</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Papel</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Setores</th>
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-fg-muted">Status</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === ctx.userId;
                const toggleAction = alternarAtivoUsuario.bind(null, u.id, !u.active);
                return (
                  <tr
                    key={u.id}
                    className="border-b border-border last:border-0 hover:bg-surface-2 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/usuarios/${u.id}/editar`}
                        className="font-medium text-fg hover:text-brand transition-colors"
                      >
                        {u.name}
                      </Link>
                      {isSelf && <span className="text-[11px] text-fg-muted ml-1.5">(você)</span>}
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{u.email}</td>
                    <td className="px-4 py-2.5 text-fg-muted">{ROLE_LABELS[u.role]}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {u.sectors.length === 0 ? (
                          <span className="text-fg-muted">—</span>
                        ) : (
                          u.sectors.map((s) => (
                            <span
                              key={s.sectorCode}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-surface-2 text-fg-secondary border border-border"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                style={{ background: sectorColors[s.sectorCode] ?? "#586577" }}
                              />
                              {sectorLabels[s.sectorCode] ?? s.sectorCode}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                          u.active
                            ? "bg-success/10 text-success border-success/25"
                            : "bg-surface-2 text-fg-muted border-border"
                        }`}
                      >
                        {u.active ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/usuarios/${u.id}/editar`}
                          className="text-[12px] text-fg-muted hover:text-fg transition-colors"
                        >
                          Editar
                        </Link>
                        {!isSelf && (
                          <ToggleActiveButton action={toggleAction} ativo={u.active} nome={u.name} />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
