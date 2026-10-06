import { PageHeader } from "@/components/ui/PageHeader";
import { getAuthContext } from "@/lib/auth/context";
import { PushNotificationToggle } from "@/components/notificacoes/PushNotificationToggle";
import { CentralDeNotificacoes } from "@/components/notificacoes/CentralDeNotificacoes";
import { salvarPushSubscription, removerPushSubscription } from "@/app/(app)/notificacoes/actions";
import { getVapidPublicKey } from "@/lib/vapid";
import { PageContainer } from "@/components/shared/PageContainer";
import { ehAba } from "@/lib/notificacoes/catalogo";
import { consultarNotificacoes, naoLidasPorAba, tiposOcultos } from "@/lib/notificacoes/consultas";

// A central de notificações (redesenho de 02/10/2026). Desenho e decisões em
// Projects/Connect-41/Central-de-Notificacoes-2026-10-01, no vault.
export default async function NotificacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; status?: string; q?: string; arquivadas?: string; preferencias?: string }>;
}) {
  const ctx = await getAuthContext();
  const sp = await searchParams;
  // `arquivadas=1`: a caixa das arquivadas; `preferencias=abrir`: o atalho
  // "Ajustar" do sino e das configurações (05/10/2026).
  const arquivadas = sp.arquivadas === "1";
  const filtros = {
    aba: ehAba(sp.aba) && !arquivadas ? sp.aba : "todas",
    status: sp.status === "nao_lidas" && !arquivadas ? "nao_lidas" : "todas",
    q: (sp.q ?? "").slice(0, 100),
    arquivadas,
  } as const;

  const dono = { tenantId: ctx.tenantId, userId: ctx.userId };
  const ocultos = ctx.userId ? await tiposOcultos(dono) : [];
  const [pagina, contagens] = ctx.userId
    ? await Promise.all([consultarNotificacoes(dono, filtros, ocultos), naoLidasPorAba(dono, ocultos)])
    : [{ itens: [], proximoCursor: null }, { todas: 0, para_mim: 0, clientes: 0, alertas: 0 }];

  return (
    <PageContainer>
      <PageHeader
        title="Notificações"
        subtitle={contagens.todas > 0 ? `${contagens.todas} não lida${contagens.todas !== 1 ? "s" : ""}` : "Tudo em dia"}
      />
      <CentralDeNotificacoes
        // Filtro novo, lista nova: a seleção e o "carregar mais" não atravessam abas.
        // O atalho das preferências entra na chave para abrir mesmo já estando aqui.
        key={`${filtros.aba}|${filtros.status}|${filtros.q}|${filtros.arquivadas}|${sp.preferencias === "abrir"}`}
        filtros={filtros}
        inicial={pagina}
        contagens={contagens}
        ocultos={ocultos}
        abrirPreferencias={sp.preferencias === "abrir"}
        preferencias={
          <PushNotificationToggle
            publicKey={getVapidPublicKey()}
            acoes={{ salvar: salvarPushSubscription, remover: removerPushSubscription }}
          />
        }
      />
    </PageContainer>
  );
}
