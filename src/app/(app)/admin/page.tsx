import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { ArrowRight, Blocks, CalendarDays, CreditCard, EyeOff, Globe, Headset, Landmark, Layers, Puzzle, Receipt, Repeat, Scale, ScrollText, Settings2, ShieldCheck, Tag, Target, Users2, Video } from "lucide-react";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { getPrisma } from "@/lib/prisma";
import { PageContainer } from "@/components/shared/PageContainer";

// A tela tinha até 17 cards numa grade plana — tudo com o mesmo peso visual,
// então achar "Feriados" custava varrer a lista inteira. Cada card agora
// declara a que seção pertence e a página as renderiza agrupadas, na ordem de
// GROUP_ORDER. Preferi seções a criar sub-rotas (/admin/catalogos etc.): as 17
// rotas seguem onde estão, nenhum link salvo quebra, e a densidade cai do
// mesmo jeito.
type CardGroup = "workspace" | "catalogos" | "integracoes" | "assinatura" | "plataforma";

const GROUP_ORDER: CardGroup[] = ["workspace", "catalogos", "integracoes", "assinatura", "plataforma"];

const GROUP_LABEL: Record<CardGroup, string> = {
  workspace: "Workspace",
  catalogos: "Catálogos compartilhados",
  integracoes: "Integrações e acessos",
  assinatura: "Assinatura",
  plataforma: "Plataforma (41 Tech)",
};

const GROUP_HELPER: Record<CardGroup, string> = {
  workspace: "Quem entra, como o tenant é organizado e o que cada um enxerga.",
  catalogos: "Listas reaproveitadas pelos módulos — cadastre uma vez, use em todo lugar.",
  integracoes: "Contas externas conectadas ao workspace.",
  assinatura: "Plano contratado e uso.",
  plataforma: "Visível só para a 41 Tech: administração entre clientes.",
};

type Card = {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  group: CardGroup;
};

export default async function AdminPage() {
  const ctx = await getAuthContext();
  const isAdmin = isFullWrite(ctx.role);
  const canManageFields = isAdmin || (ctx.role === "SECTOR_ADMIN" && ctx.sectors.length > 0);
  if (!isAdmin && !canManageFields) notFound();

  const cards: Card[] = [];

  if (isAdmin) {
    cards.push(
      { group: "workspace", href: "/admin/usuarios", icon: <ShieldCheck size={20} />, title: "Usuários", description: "Contas, papéis e acesso a setores" },
      { group: "workspace", href: "/admin/setores", icon: <Layers size={20} />, title: "Setores", description: "Catálogo de setores/cargos do tenant" },
      { group: "workspace", href: "/admin/modulos", icon: <Blocks size={20} />, title: "Módulos", description: "Ativação de módulos plugáveis por setor" },
      { group: "workspace", href: "/admin/tenant", icon: <Settings2 size={20} />, title: "Empresa (Tenant)", description: "Dados do workspace e configuração de e-mail (SMTP)" },
      { group: "workspace", href: "/admin/permissoes-sensiveis", icon: <EyeOff size={20} />, title: "Campos Sensíveis", description: "Quem vê salário, dados bancários, médicos e documentos" },
      { group: "catalogos", href: "/admin/obrigacoes", icon: <Repeat size={20} />, title: "Obrigações Recorrentes", description: "DAS, DCTF, folha — itens de kanban gerados todo mês" }
    );
  }

  if (ctx.role === "SUPER_ADMIN") {
    cards.push(
      {
        group: "plataforma",
        href: "/admin/workspaces",
        icon: <Globe size={20} />,
        title: "Workspaces",
        description: "Clientes (tenants) e acesso entre eles",
      },
      {
        group: "plataforma",
        href: "/admin/auditoria",
        icon: <ScrollText size={20} />,
        title: "Auditoria",
        description: "Trilha de quem fez o quê no workspace",
      },
      {
        group: "plataforma",
        href: "/admin/assinaturas",
        icon: <CreditCard size={20} />,
        title: "Assinaturas",
        description: "Plano, modo de gestão e cobrança de cada cliente",
      },
      {
        group: "plataforma",
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
        group: "assinatura",
        href: "/assinatura",
        icon: <CreditCard size={20} />,
        title: "Minha Assinatura",
        description: "Plano contratado, usuários ativos e limite do plano",
      });
    }
  }

  cards.push(
    { group: "catalogos", href: "/admin/campos", icon: <Puzzle size={20} />, title: "Campos Customizados", description: "Campos extras por setor e entidade" },
    { group: "catalogos", href: "/admin/tags", icon: <Tag size={20} />, title: "Tags", description: "Tags coloridas reaproveitáveis no Kanban" },
    { group: "catalogos", href: "/admin/plano-de-contas", icon: <Landmark size={20} />, title: "Plano de Contas", description: "Categorias que classificam o lançamento do documento fiscal" }
  );

  if (canManageMeetings(ctx)) {
    cards.push({
      group: "integracoes",
      href: "/admin/integracoes",
      icon: <Video size={20} />,
      title: "Integrações",
      description: "Conectar Google Meet / Microsoft Teams para reuniões",
    });
  }

  if (isAdmin) {
    cards.push(
      { group: "catalogos", href: "/admin/feriados", icon: <CalendarDays size={20} />, title: "Feriados", description: "Catálogo de feriados usado na Escala de Trabalho" },
      { group: "catalogos", href: "/admin/competencias", icon: <Target size={20} />, title: "Competências", description: "Catálogo usado nas avaliações de desempenho" },
      { group: "catalogos", href: "/admin/rescisao", icon: <Scale size={20} />, title: "Cálculo de Rescisão", description: "Padrão do escritório para a conferência do TRCT" },
      { group: "integracoes", href: "/admin/atendentes", icon: <Headset size={20} />, title: "Atendentes e Vínculos", description: "Conta de acesso, atendente do Chatwoot e quem é da recepção/triagem" },
      { group: "workspace", href: "/admin/portal", icon: <Users2 size={20} />, title: "Acessos do Portal", description: "Contas de clientes que entram no portal para ver os próprios documentos" }
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Administração"
        subtitle="Configurações do tenant e catálogos compartilhados."
      />

      {/* Seção vazia não aparece: o conjunto de cards varia com o papel, e
          "Plataforma" só existe pra SUPER_ADMIN. */}
      <div className="space-y-8">
        {GROUP_ORDER.filter((g) => cards.some((c) => c.group === g)).map((groupKey) => (
          <section key={groupKey}>
            <div className="mb-3">
              <h2 className="text-[13px] font-semibold text-fg">{GROUP_LABEL[groupKey]}</h2>
              <p className="text-[12px] text-fg-muted mt-0.5">{GROUP_HELPER[groupKey]}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {cards
                .filter((c) => c.group === groupKey)
                .map((c) => (
                  <Link
                    key={c.href}
                    href={c.href}
                    className="group bg-surface border border-border rounded-lg p-5 hover:border-border-strong hover:bg-surface-hover hover:shadow-[var(--c41-shadow-sm)] transition-all"
                  >
                    <span className="inline-flex w-10 h-10 rounded-lg items-center justify-center mb-4 bg-brand-subtle text-brand">
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
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
