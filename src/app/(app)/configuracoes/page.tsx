import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { ChevronRight, UserRound, ShieldCheck, KeyRound, Palette, Bell, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { getSectorMaps, sectorLabel } from "@/lib/sectors";
import { ROLE_LABELS } from "@/lib/roles";
import { PageContainer } from "@/components/shared/PageContainer";
import { PerfilForm } from "@/components/configuracoes/PerfilForm";
import { AlterarSenhaForm } from "@/components/configuracoes/AlterarSenhaForm";
import { TemaSelector } from "@/components/configuracoes/TemaSelector";
import { PushNotificationToggle } from "@/components/notificacoes/PushNotificationToggle";
import { salvarPushSubscription, removerPushSubscription } from "@/app/(app)/notificacoes/actions";
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
    <PageContainer>
      <PageHeader
        title="Configurações"
        subtitle="Sua conta e suas preferências neste workspace."
      />

      <Secao titulo="Perfil" descricao="Seu nome e sua foto, como aparecem para a equipe." icone={<UserRound />}>
        <PerfilForm
          action={atualizarMeuPerfil}
          defaultName={me.name}
          email={me.email}
          photoUrl={me.photoUrl}
        />
      </Secao>

      <Secao titulo="Acesso" descricao="Seu papel e os setores em que você atua. Quem define é um administrador do workspace." icone={<ShieldCheck />}>
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

      <Secao titulo="Segurança" descricao="Troque a sua senha de acesso ao Connect." icone={<KeyRound />}>
        <AlterarSenhaForm action={alterarMinhaSenha} />
      </Secao>

      <Secao titulo="Aparência" descricao="Escolha o tema claro, o escuro, ou siga o tema do seu aparelho." icone={<Palette />}>
        <TemaSelector />
      </Secao>

      <Secao titulo="Notificações" descricao="Avisos no celular e no navegador, e o histórico do que chegou." icone={<Bell />}>
        <PushNotificationToggle
          publicKey={getVapidPublicKey()}
          acoes={{ salvar: salvarPushSubscription, remover: removerPushSubscription }}
        />
        <Link
          href="/notificacoes"
          className="group flex items-center justify-between gap-2 bg-surface-hover border border-border rounded-lg px-3.5 py-2.5 hover:border-border-strong transition-colors"
        >
          <span className="text-[13px] text-fg">Ver todas as notificações</span>
          <ChevronRight size={16} className="text-fg-muted group-hover:text-fg transition-colors" />
        </Link>
      </Secao>

      {isFullWrite(ctx.role) && (
        <Secao
          titulo="Workspace"
          descricao="Usuários, setores, módulos, integrações e o resto do que vale para todo mundo."
          icone={<Settings2 />}
        >
          <Button href="/admin" variant="secondary">
            <Settings2 size={14} /> Abrir administração
          </Button>
        </Secao>
      )}
    </PageContainer>
  );
}

/**
 * Uma seção de configuração: o que é (ícone, título, descrição) à esquerda e
 * o controle à direita, com uma divisória entre as seções — o enquadramento
 * das configurações do HubStrom que o Kauan trouxe como referência em 30/09.
 * Era um título solto e um cartão por seção, empilhados.
 */
function Secao({
  titulo,
  descricao,
  icone,
  children,
}: {
  titulo: string;
  descricao?: string;
  icone: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)] gap-x-10 gap-y-4 py-8 border-t border-border first-of-type:border-t-0 first-of-type:pt-2">
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-10 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-surface-hover text-fg-secondary [&>svg]:w-[18px] [&>svg]:h-[18px]">
          {icone}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-[length:var(--fs-section)] font-semibold text-fg leading-tight">{titulo}</h2>
          {descricao && <p className="text-[length:var(--fs-helper)] text-fg-muted mt-1 leading-relaxed max-w-[42ch]">{descricao}</p>}
        </div>
      </div>
      <div className="min-w-0 space-y-3">{children}</div>
    </section>
  );
}
