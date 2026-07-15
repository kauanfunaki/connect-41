import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  ShieldCheck,
  Layers,
  Blocks,
  Building,
  Globe,
  Puzzle,
  Tag,
  CalendarDays,
  Target,
  ScrollText,
  Video,
  CreditCard,
  Receipt,
  Settings2,
} from "lucide-react";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";

type Card = { href: string; icon: React.ReactNode; title: string; description: string };

export default async function AdminPage() {
  const ctx = await getAuthContext();
  const isAdmin = isFullWrite(ctx.role);
  const canManageFields = isAdmin || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!isAdmin && !canManageFields) notFound();

  const cards: Card[] = [];

  if (isAdmin) {
    cards.push(
      { href: "/admin/usuarios", icon: <ShieldCheck size={20} />, title: "Usuários", description: "Contas, papéis e acesso a setores" },
      { href: "/admin/setores", icon: <Layers size={20} />, title: "Setores", description: "Catálogo de setores/cargos do tenant" },
      { href: "/admin/modulos", icon: <Blocks size={20} />, title: "Módulos", description: "Ativação de módulos plugáveis por setor" },
      { href: "/admin/filiais", icon: <Building size={20} />, title: "Filiais", description: "Etiqueta organizacional para Empresas" },
      { href: "/admin/tenant", icon: <Settings2 size={20} />, title: "Empresa (Tenant)", description: "Dados do workspace e configuração de e-mail (SMTP)" }
    );
  }

  if (ctx.role === "SUPER_ADMIN") {
    cards.push(
      {
        href: "/admin/workspaces",
        icon: <Globe size={20} />,
        title: "Workspaces",
        description: "Clientes (tenants) e acesso entre eles",
      },
      {
        href: "/admin/auditoria",
        icon: <ScrollText size={20} />,
        title: "Auditoria",
        description: "Trilha de quem fez o quê no workspace",
      },
      {
        href: "/admin/assinaturas",
        icon: <CreditCard size={20} />,
        title: "Assinaturas",
        description: "Plano, modo de gestão e cobrança de cada cliente",
      },
      {
        href: "/admin/planos",
        icon: <Receipt size={20} />,
        title: "Planos",
        description: "Catálogo comercial — gerenciado vs. autoatendimento",
      }
    );
  }

  if (isAdmin && ctx.role !== "SUPER_ADMIN") {
    const prisma = getPrisma();
    const tenant = await prisma.tenant.findUnique({ where: { id: ctx.tenantId }, select: { managementMode: true } });
    if (tenant?.managementMode === "SELF_SERVICE") {
      cards.push({
        href: "/assinatura",
        icon: <CreditCard size={20} />,
        title: "Minha Assinatura",
        description: "Plano contratado, usuários ativos e limite do plano",
      });
    }
  }

  cards.push(
    { href: "/admin/campos", icon: <Puzzle size={20} />, title: "Campos Customizados", description: "Campos extras por setor e entidade" },
    { href: "/admin/tags", icon: <Tag size={20} />, title: "Tags", description: "Tags coloridas reaproveitáveis no Kanban" }
  );

  if (canManageMeetings(ctx)) {
    cards.push({
      href: "/admin/integracoes",
      icon: <Video size={20} />,
      title: "Integrações",
      description: "Conectar Google Meet / Microsoft Teams para reuniões",
    });
  }

  if (isAdmin) {
    cards.push(
      { href: "/admin/feriados", icon: <CalendarDays size={20} />, title: "Feriados", description: "Catálogo de feriados usado na Escala de Trabalho" },
      { href: "/admin/competencias", icon: <Target size={20} />, title: "Competências", description: "Catálogo usado nas avaliações de desempenho" }
    );
  }

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="text-[16px] font-semibold text-fg tracking-[-0.01em]">Administração</h1>
        <p className="text-[13px] text-fg-muted mt-0.5">Configurações do tenant e catálogos compartilhados.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="group bg-surface border border-border rounded-2xl p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
          >
            <span className="inline-flex w-10 h-10 rounded-xl items-center justify-center mb-4 bg-brand-subtle text-brand">
              {c.icon}
            </span>

            <div className="flex items-center justify-between gap-2">
              <p className="text-[14px] font-semibold text-fg">{c.title}</p>
              <ArrowRight
                size={15}
                className="text-fg-muted flex-shrink-0 -translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-100 transition-all"
              />
            </div>
            <p className="text-[12.5px] text-fg-muted mt-1 leading-relaxed">{c.description}</p>
          </Link>
        ))}
      </div>
    </PageContainer>
  );
}
