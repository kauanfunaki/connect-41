import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";

type Card = { href: string; icon: string; title: string; description: string };

export default async function AdminPage() {
  const ctx = await getAuthContext();
  const isAdmin = isFullWrite(ctx.role);
  const canManageFields = isAdmin || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!isAdmin && !canManageFields) notFound();

  const cards: Card[] = [];

  if (isAdmin) {
    cards.push(
      { href: "/admin/usuarios", icon: "🔐", title: "Usuários", description: "Contas, papéis e acesso a setores" },
      { href: "/admin/setores", icon: "🏷️", title: "Setores", description: "Catálogo de setores/cargos do tenant" },
      { href: "/admin/modulos", icon: "🧱", title: "Módulos", description: "Ativação de módulos plugáveis por setor" },
      { href: "/admin/filiais", icon: "🏬", title: "Filiais", description: "Etiqueta organizacional para Empresas" }
    );
  }

  if (ctx.role === "SUPER_ADMIN") {
    cards.push({
      href: "/admin/workspaces",
      icon: "🌐",
      title: "Workspaces",
      description: "Clientes (tenants) e acesso entre eles",
    });
  }

  cards.push(
    { href: "/admin/campos", icon: "🧩", title: "Campos Customizados", description: "Campos extras por setor e entidade" },
    { href: "/admin/tags", icon: "🏷", title: "Tags", description: "Tags coloridas reaproveitáveis no Kanban" }
  );

  if (isAdmin) {
    cards.push(
      { href: "/admin/feriados", icon: "📅", title: "Feriados", description: "Catálogo de feriados usado na Escala de Trabalho" },
      { href: "/admin/competencias", icon: "🎯", title: "Competências", description: "Catálogo usado nas avaliações de desempenho" }
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Administração</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">Configurações do tenant e catálogos compartilhados.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="bg-surface border border-border rounded-lg p-4 hover:border-border-strong transition-colors flex items-start gap-3"
          >
            <span className="text-[20px] leading-none flex-shrink-0">{c.icon}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-medium text-fg">{c.title}</p>
              <p className="text-[12px] text-fg-muted mt-0.5">{c.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
