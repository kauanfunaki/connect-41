import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";
import { PageContainer } from "@/components/shared/PageContainer";
import { PerfilForm } from "@/components/configuracoes/PerfilForm";
import { AlterarSenhaForm } from "@/components/configuracoes/AlterarSenhaForm";
import { TemaSelector } from "@/components/configuracoes/TemaSelector";
import { PushNotificationToggle } from "@/components/notificacoes/PushNotificationToggle";
import { getVapidPublicKey } from "@/lib/vapid";
import { atualizarMeuPerfil, alterarMinhaSenha } from "./actions";

// Configurações da conta do próprio usuário — o que antes era só um botão
// desabilitado ("Em breve") no rodapé da sidebar pra quem não é admin. Nada
// aqui gerencia o workspace: papel e setores aparecem como leitura, e mudar
// qualquer um dos dois continua sendo /admin/usuarios.
export default async function ConfiguracoesPage() {
  const ctx = await getAuthContext();
  if (!ctx.userId) notFound();

  const prisma = getPrisma();
  const [me, { labels: sectorLabels }] = await Promise.all([
    prisma.user.findFirst({
      where: { id: ctx.userId, tenantId: ctx.tenantId },
      select: { name: true, email: true, photoUrl: true },
    }),
    getSectorMaps(ctx.tenantId),
  ]);
  if (!me) notFound();

  const roleLabel = ROLE_LABELS[ctx.role as keyof typeof ROLE_LABELS] ?? ctx.role;

  return (
    <PageContainer variant="narrow">
      <div className="mb-6">
        <h1 className="text-[length:var(--fs-display)] font-semibold text-fg tracking-[-0.01em]">Configurações</h1>
        <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1">
          Sua conta e suas preferências neste workspace.
        </p>
      </div>

      <Secao titulo="Perfil">
        <PerfilForm
          action={atualizarMeuPerfil}
          defaultName={me.name}
          email={me.email}
          photoUrl={me.photoUrl}
        />
      </Secao>

      <Secao titulo="Acesso" descricao="Definido por um administrador do workspace.">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <dt className="text-[length:var(--fs-helper)] text-fg-muted">Papel</dt>
            <dd className="text-[length:var(--fs-body)] text-fg mt-0.5">{roleLabel}</dd>
          </div>
          <div>
            <dt className="text-[length:var(--fs-helper)] text-fg-muted">Setores</dt>
            <dd className="text-[length:var(--fs-body)] text-fg mt-0.5">
              {ctx.sectors.length > 0
                ? ctx.sectors.map((code) => sectorLabel(sectorLabels, code)).join(", ")
                : "Nenhum setor atribuído"}
            </dd>
          </div>
        </dl>
      </Secao>

      <Secao titulo="Segurança">
        <AlterarSenhaForm action={alterarMinhaSenha} />
      </Secao>

      <Secao titulo="Aparência">
        <TemaSelector />
      </Secao>

      <Secao titulo="Notificações">
        <PushNotificationToggle publicKey={getVapidPublicKey()} />
        <Link
          href="/notificacoes"
          className="group flex items-center justify-between gap-2 bg-surface-hover border border-border rounded-lg px-3.5 py-2.5 hover:border-border-strong transition-colors"
        >
          <span className="text-[13px] text-fg">Ver todas as notificações</span>
          <ChevronRight size={15} className="text-fg-muted group-hover:text-fg transition-colors" />
        </Link>
      </Secao>

      {isFullWrite(ctx.role) && (
        <p className="text-[length:var(--fs-helper)] text-fg-muted">
          Procurando as configurações do workspace (usuários, setores, integrações)?{" "}
          <Link href="/admin" className="text-brand hover:underline">
            Abrir administração
          </Link>
          .
        </p>
      )}
    </PageContainer>
  );
}

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-[length:var(--fs-section)] font-semibold text-fg mb-1">{titulo}</h2>
      {descricao && <p className="text-[length:var(--fs-helper)] text-fg-muted mb-3">{descricao}</p>}
      <div className={`bg-surface border border-border rounded-lg p-5 space-y-3 ${descricao ? "" : "mt-3"}`}>
        {children}
      </div>
    </section>
  );
}
