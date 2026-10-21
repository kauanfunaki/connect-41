import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/Button";
import { notFound } from "next/navigation";
import { Activity, Building2, FileStack, FlaskConical, Leaf, MessageCircle, MessageSquareText, ShieldCheck, Sparkles, Video } from "lucide-react";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { canManageMeetings } from "@/lib/integrations/oauth";
import { getMeetingIntegrationHealth } from "@/lib/integrations/health";
import { isGoogleConfigured } from "@/lib/integrations/google";
import { isMicrosoftConfigured } from "@/lib/integrations/microsoft";
import { formatInstantDate, formatCnpj } from "@/lib/format";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DisconnectButton } from "@/components/admin/DisconnectButton";
import { AiConfigForm } from "@/components/admin/AiConfigForm";
import { ChatwootConfigForm } from "@/components/admin/ChatwootConfigForm";
import { PapeisDosAtendentes } from "@/components/admin/PapeisDosAtendentes";
import { PainelDeCadastro } from "@/components/admin/PainelDeCadastro";
import { CatalogoDeIntegracoes, type BlocoDeIntegracao, type EstadoDaIntegracao } from "@/components/admin/CatalogoDeIntegracoes";
import { ConfiguracaoDaIntegracao, SAUDE_LABEL, SAUDE_VARIANTE } from "@/components/admin/ConfiguracaoDaIntegracao";
import { canWriteEntity } from "@/lib/auth/policy";
import { listarIntegracoes, type IntegracaoNaTela } from "@/lib/integracoes/data";
import { ContasOmie } from "@/components/admin/ContasOmie";
import { listarContasOmie } from "@/lib/integracoes/omie/contas";
import { empresasDoSeletor } from "@/lib/financeiro/consultas";
import { getSectorMaps } from "@/lib/sectors";
import { desconectarIntegracao } from "./actions";
import { ServicoDoSerpro } from "@/components/admin/ServicoDoSerpro";
import { configuracaoDoSerpro, prontidaoDoSerpro } from "@/lib/serpro/cliente";
import { Aviso } from "@/components/ui/Aviso";
import { Selo, tomDaVariante, type TomDoSelo } from "@/components/ui/Selo";
import { OpsCredentialForm } from "@/components/admin/OpsCredentialForm";
import { podeNoModulo } from "@/lib/auth/modulo";
import { MODULO_OPS } from "@/lib/ops/regras";

const ERROR_LABEL: Record<string, string> = {
  "sem-permissao": "Sem permissão para conectar integrações.",
  "google-nao-configurado": "Integração com Google ainda não foi configurada pela 41 Tech (faltam credenciais no servidor).",
  "microsoft-nao-configurado": "Integração com Microsoft ainda não foi configurada pela 41 Tech (faltam credenciais no servidor).",
  "google-cancelado": "Conexão com Google cancelada.",
  "microsoft-cancelado": "Conexão com Microsoft cancelada.",
  "google-estado-invalido": "Sessão de conexão expirou. Tente novamente.",
  "microsoft-estado-invalido": "Sessão de conexão expirou. Tente novamente.",
  "google-falha-conexao": "Falha ao conectar com o Google. Tente novamente.",
  "microsoft-falha-conexao": "Falha ao conectar com a Microsoft. Tente novamente.",
};

type Filtro = "todas" | "ligadas" | "problema";

/** O ícone de cada integração no catálogo. */
const ICONE_DO_CODIGO: Record<string, React.ReactNode> = {
  chatwoot: <MessageCircle />,
  sped: <FileStack />,
  whatsapp_recrutamento: <MessageSquareText />,
  whatsapp_recrutamento_evolution: <FlaskConical />,
  sima_curitiba: <Leaf />,
  serpro_integra_contador: <ShieldCheck />,
};

/** A situação de uma integração do catálogo, no selo e no filtro. */
function situacaoDoCatalogo(i: IntegracaoNaTela): { selo: { tom: TomDoSelo; rotulo: string }; estado: EstadoDaIntegracao } {
  if (!i.conectada) return { selo: { tom: "neutro", rotulo: "Não conectada" }, estado: "desligada" };
  if (i.faltando.length > 0) return { selo: { tom: "atencao", rotulo: "Falta configurar" }, estado: "problema" };
  const estado: EstadoDaIntegracao =
    i.saude === "com_erro" || i.saude === "parada" ? "problema" : i.saude === "desligada" ? "desligada" : "ligada";
  return { selo: { tom: tomDaVariante(SAUDE_VARIANTE[i.saude]), rotulo: SAUDE_LABEL[i.saude] }, estado };
}

/**
 * Integrações como catálogo (escolha 6A dos Ajustes de 15/10, 20/10/2026).
 *
 * Todas em blocos iguais, cada uma **uma vez**: o Chatwoot (a conexão com as
 * credenciais, o ligar e os papéis dos atendentes) e o Serpro (o formulário e
 * o teste) eram duas seções cada; o Omie por empresa, as reuniões e a chave de
 * IA viram blocos como os outros. O filtro do topo separa as ligadas e as com
 * problema; "Configurar" abre o painel ao lado (2B), no endereço
 * (`?integracao=<chave>`). O setor aparece pelo nome. O e-mail de envio continua
 * na tela Empresa.
 *
 * Quem não administra o escritório (o coordenador) vê só as reuniões, que são
 * da conta pessoal de cada um.
 */
export default async function IntegracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; connected?: string; integracao?: string; ver?: string }>;
}) {
  const { error, connected, integracao: aberta, ver } = await searchParams;
  const ctx = await getAuthContext();
  if (!canManageMeetings(ctx)) notFound();
  const agora = new Date();

  const prisma = getPrisma();
  const accounts = await prisma.oAuthAccount.findMany({ where: { tenantId: ctx.tenantId, userId: ctx.userId } });
  const google = accounts.find((a) => a.provider === "GOOGLE");
  const microsoft = accounts.find((a) => a.provider === "MICROSOFT");

  // "Conectado" era otimista: bastava a linha existir. Uma conta com o token
  // vencido e renovação recusada aparecia verde e só falhava na hora de criar
  // a reunião — que é justamente o que este aviso evita.
  const [googleHealth, microsoftHealth] = await Promise.all([
    getMeetingIntegrationHealth(ctx.tenantId, ctx.userId, "GOOGLE"),
    getMeetingIntegrationHealth(ctx.tenantId, ctx.userId, "MICROSOFT"),
  ]);

  // Credencial de sistema de terceiro, a chave da IA e o Chatwoot são
  // configuração do escritório inteiro — só quem o administra vê e mexe.
  const podeConfigurar = isFullWrite(ctx.role);
  const podeGerirOps = podeConfigurar && await podeNoModulo(ctx, MODULO_OPS, "gerir");
  const [integracoes, contasOmie, empresasParaOmie, serpro, aiConfig, chatwootConnection, { labels: nomesDosSetores }, credencialOps] = podeConfigurar
    ? await Promise.all([
        listarIntegracoes(ctx.tenantId!, agora),
        listarContasOmie(ctx.tenantId!, agora),
        empresasDoSeletor(ctx.tenantId!),
        configuracaoDoSerpro(ctx.tenantId!),
        prisma.tenantAiConfig.findUnique({ where: { tenantId: ctx.tenantId } }),
        prisma.chatwootConnection.findFirst({ where: { tenantId: ctx.tenantId }, orderBy: { createdAt: "asc" } }),
        getSectorMaps(ctx.tenantId),
        podeGerirOps ? prisma.opsApiCredential.findUnique({ where: { tenantId: ctx.tenantId }, select: { tokenHash: true, version: true } }) : Promise.resolve(null),
      ])
    : [[], [], [], null, null, null, { labels: {} as Record<string, string> }, null];
  const prontidaoSerpro = serpro ? prontidaoDoSerpro(serpro) : null;
  const chatwootWebhookUrl =
    chatwootConnection && process.env.APP_PUBLIC_URL
      ? `${process.env.APP_PUBLIC_URL}/api/integrations/chatwoot/webhook/${chatwootConnection.id}`
      : null;
  const doCodigo = new Map(integracoes.map((i) => [i.code, i]));
  const setorDe = (i: IntegracaoNaTela) => (i.sectorCode ? (nomesDosSetores[i.sectorCode] ?? i.sectorCode) : null);

  // ─── Os blocos ───────────────────────────────────────────────────────────
  const blocos: BlocoDeIntegracao[] = [];
  if (podeConfigurar) {
    // As do catálogo, uma por código. O Omie tem bloco próprio (a conta é por
    // empresa); o Serpro ganha a prontidão na situação.
    for (const i of integracoes) {
      if (i.code === "omie") continue;
      let { selo, estado } = situacaoDoCatalogo(i);
      let detalhe: string | null = i.lastError ? `Último erro: ${i.lastError}` : setorDe(i) ? `Setor ${setorDe(i)}` : null;
      if (i.code === "serpro_integra_contador" && i.conectada && prontidaoSerpro && !prontidaoSerpro.pronta && estado !== "problema") {
        selo = { tom: "atencao", rotulo: "Com pendência" };
        estado = "problema";
        detalhe = prontidaoSerpro.motivo;
      }
      if (i.code === "chatwoot" && chatwootConnection?.lastSyncAt && estado === "ligada") {
        detalhe = `Última sincronização ${formatInstantDate(chatwootConnection.lastSyncAt)}`;
      }
      blocos.push({
        chave: i.code,
        nome: i.label,
        icone: ICONE_DO_CODIGO[i.code] ?? <ShieldCheck />,
        descricao: i.description,
        selo,
        estado,
        detalhe,
      });
    }

    const comErro = contasOmie.filter((c) => c.saude === "com_erro").length;
    blocos.push({
      chave: "omie",
      nome: "Omie por empresa",
      icone: <Building2 />,
      descricao: "Contas e notas das empresas do BPO que usam o Omie — uma conta para cada empresa.",
      selo:
        contasOmie.length === 0
          ? { tom: "neutro", rotulo: "Nenhuma empresa" }
          : comErro > 0
            ? { tom: "perigo", rotulo: comErro === 1 ? "1 com erro" : `${comErro} com erro` }
            : { tom: "marca", rotulo: contasOmie.length === 1 ? "1 empresa" : `${contasOmie.length} empresas` },
      estado: contasOmie.length === 0 ? "desligada" : comErro > 0 ? "problema" : "ligada",
    });

    blocos.push({
      chave: "ia",
      nome: "Chave de IA",
      icone: <Sparkles />,
      descricao: "O provedor e a chave usados por todos os agentes de IA do Connect.",
      selo: aiConfig ? { tom: "sucesso", rotulo: aiConfig.provider === "OPENAI" ? "OpenAI" : "Anthropic" } : { tom: "neutro", rotulo: "Sem chave" },
      estado: aiConfig ? "ligada" : "desligada",
      detalhe: aiConfig ? `Modelo ${aiConfig.model}` : "Sem chave, a IA fica desligada.",
    });

    if (podeGerirOps) blocos.push({
      chave: "ops_center",
      nome: "Ops Center — bots",
      icone: <Activity />,
      descricao: "Uma chave compartilhada pelo escritório para todas as automações do Ops Center.",
      selo: credencialOps?.tokenHash ? { tom: "sucesso", rotulo: "Chave configurada" } : { tom: "neutro", rotulo: "Sem chave" },
      estado: credencialOps?.tokenHash ? "ligada" : "desligada",
      detalhe: "Os bots continuam identificados pelo próprio slug.",
    });
  }

  // As reuniões são da conta de cada um: o bloco vale para quem olha.
  const expirada = (Boolean(google) && googleHealth === "NEEDS_RECONNECT") || (Boolean(microsoft) && microsoftHealth === "NEEDS_RECONNECT");
  const contasConectadas = [google && "Google", microsoft && "Microsoft"].filter(Boolean) as string[];
  blocos.push({
    chave: "reunioes",
    nome: "Reuniões (Google e Microsoft)",
    icone: <Video />,
    descricao: "Sua conta pessoal, para agendar reuniões direto das atividades dos Quadros.",
    selo: expirada
      ? { tom: "perigo", rotulo: "Conexão expirada" }
      : contasConectadas.length > 0
        ? { tom: "sucesso", rotulo: "Conectada" }
        : { tom: "neutro", rotulo: "Não conectada" },
    estado: expirada ? "problema" : contasConectadas.length > 0 ? "ligada" : "desligada",
    detalhe: contasConectadas.length > 0 ? contasConectadas.join(" e ") : null,
  });

  const filtro: Filtro = ver === "ligadas" || ver === "problema" ? ver : "todas";
  const visiveis = blocos.filter((b) => filtro === "todas" || (filtro === "ligadas" ? b.estado === "ligada" : b.estado === "problema"));
  const comFiltro = (base: string) => (filtro === "todas" ? base : `${base}${base.includes("?") ? "&" : "?"}ver=${filtro}`);
  const aqui = comFiltro("/admin/integracoes");
  const bloco = blocos.find((b) => b.chave === aberta);
  const urlPublica = process.env.APP_PUBLIC_URL ?? null;

  return (
    <PageContainer>
      <PageHeader title="Integrações" subtitle="Os sistemas que o Connect opera e as contas ligadas a ele." />

      {/* O retorno do Google/Microsoft cai aqui: o aviso vem logo abaixo do
          título, e não no meio da tela, onde ficava fora da vista. */}
      {error && <Aviso className="mb-4">{ERROR_LABEL[error] ?? "Erro ao conectar integração."}</Aviso>}
      {connected && (
        <Aviso tom="sucesso" className="mb-4">
          Conta {connected === "google" ? "Google" : "Microsoft"} conectada com sucesso.
        </Aviso>
      )}

      {blocos.length > 1 && (
        <SegmentedControl
          label="Quais integrações"
          active={filtro}
          className="mb-4"
          items={[
            { key: "todas", label: "Todas", href: "/admin/integracoes", contagem: blocos.length },
            { key: "ligadas", label: "Ligadas", href: "/admin/integracoes?ver=ligadas", contagem: blocos.filter((b) => b.estado === "ligada").length },
            { key: "problema", label: "Com problema", href: "/admin/integracoes?ver=problema", contagem: blocos.filter((b) => b.estado === "problema").length },
          ]}
        />
      )}

      {visiveis.length === 0 ? (
        <Card className="p-6 text-center text-fs-3 text-fg-muted">
          {filtro === "problema" ? "Nenhuma integração com problema." : "Nenhuma integração ligada ainda."}
        </Card>
      ) : (
        <CatalogoDeIntegracoes blocos={visiveis} hrefDe={(chave) => comFiltro(`/admin/integracoes?integracao=${chave}`)} />
      )}

      {bloco && (
        <PainelDeCadastro titulo={bloco.nome} voltarPara={aqui} largo={bloco.chave === "omie" || bloco.chave === "chatwoot"}>
          {bloco.chave === "reunioes" ? (
            <ContasDeReuniao
              google={{ conectada: Boolean(google), expirada: Boolean(google) && googleHealth === "NEEDS_RECONNECT", email: google?.accountEmail ?? null }}
              microsoft={{
                conectada: Boolean(microsoft),
                expirada: Boolean(microsoft) && microsoftHealth === "NEEDS_RECONNECT",
                email: microsoft?.accountEmail ?? null,
              }}
            />
          ) : bloco.chave === "ia" ? (
            <div className="flex flex-col gap-3">
              <p className="text-fs-3 text-fg-secondary">
                Chave usada por todos os agentes de IA do Connect (triagem de currículo, atendimento do WhatsApp, resumos).
                Cada escritório usa a própria conta — sem configurar aqui, a IA fica desligada. Os agentes, os tetos e o gasto
                ficam em Configurações › Inteligência artificial.
              </p>
              <AiConfigForm
                hasConfig={Boolean(aiConfig)}
                defaultValues={aiConfig ? { provider: aiConfig.provider, model: aiConfig.model } : undefined}
              />
            </div>
          ) : bloco.chave === "omie" ? (
            <ContasOmie contas={contasOmie} empresas={empresasParaOmie} podeDesfazerVirada={ctx.role === "SUPER_ADMIN"} />
          ) : bloco.chave === "ops_center" ? (
            <OpsCredentialForm hasToken={Boolean(credencialOps?.tokenHash)} version={credencialOps?.version ?? 0} />
          ) : bloco.chave === "chatwoot" ? (
            <div className="flex flex-col gap-5">
              <p className="text-fs-3 text-fg-secondary">
                Histórico de conversas vinculado às empresas e pessoas cadastradas, somente leitura por enquanto. As conversas
                ficam em Conversas, no menu lateral.
              </p>
              <ChatwootConfigForm
                hasConfig={Boolean(chatwootConnection)}
                defaultValues={chatwootConnection ? { baseUrl: chatwootConnection.baseUrl, accountId: chatwootConnection.accountId } : undefined}
                webhookUrl={chatwootWebhookUrl}
                lastSyncAtLabel={chatwootConnection?.lastSyncAt ? formatInstantDate(chatwootConnection.lastSyncAt) : null}
              />
              {/* O ligar e desligar, que era o cartão do Chatwoot na vitrine
                  (a credencial é a do formulário acima). */}
              {doCodigo.get("chatwoot")?.conectada && (
                <ConfiguracaoDaIntegracao integracao={doCodigo.get("chatwoot")!} urlPublica={urlPublica} setor={setorDe(doCodigo.get("chatwoot")!)} soLigar />
              )}
              {/* Os papéis dos atendentes moram aqui desde 20/10/2026 (escolha 3A). */}
              {chatwootConnection && <PapeisDosAtendentes tenantId={ctx.tenantId} canEdit={canWriteEntity(ctx)} />}
            </div>
          ) : doCodigo.get(bloco.chave) ? (
            <div className="flex flex-col gap-5">
              {/* O Serpro: o certificado lido e o teste, antes do formulário. */}
              {bloco.chave === "serpro_integra_contador" && serpro && (
                <ServicoDoSerpro
                  certificado={
                    serpro.certificado?.ok
                      ? {
                          titular: serpro.certificado.titular,
                          cnpj: serpro.certificado.cnpj ? formatCnpj(serpro.certificado.cnpj) : null,
                          validoAte: serpro.certificado.validoAte,
                        }
                      : null
                  }
                  motivo={prontidaoSerpro && !prontidaoSerpro.pronta ? prontidaoSerpro.motivo : null}
                  demonstracao={serpro.ambiente === "demonstracao"}
                />
              )}
              <ConfiguracaoDaIntegracao integracao={doCodigo.get(bloco.chave)!} urlPublica={urlPublica} setor={setorDe(doCodigo.get(bloco.chave)!)} />
            </div>
          ) : null}
        </PainelDeCadastro>
      )}
    </PageContainer>
  );
}

/** As contas de reunião de quem olha, no painel do bloco "Reuniões". */
function ContasDeReuniao({
  google,
  microsoft,
}: {
  google: { conectada: boolean; expirada: boolean; email: string | null };
  microsoft: { conectada: boolean; expirada: boolean; email: string | null };
}) {
  const linhas = [
    {
      nome: "Google Calendar / Meet",
      provedor: "GOOGLE" as const,
      conta: google,
      configurado: isGoogleConfigured(),
      indisponivel: "o Google ainda não foi configurado no servidor do Connect; fale com o suporte",
      conectar: "/api/integrations/google/connect",
    },
    {
      nome: "Microsoft Teams / Outlook",
      provedor: "MICROSOFT" as const,
      conta: microsoft,
      configurado: isMicrosoftConfigured(),
      indisponivel: "a Microsoft ainda não foi configurada no servidor do Connect; fale com o suporte",
      conectar: "/api/integrations/microsoft/connect",
    },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="text-fs-3 text-fg-secondary">
        Conecte sua conta pessoal para agendar reuniões (Google Meet ou Microsoft Teams) direto das atividades dos Quadros.
        Vale só para você.
      </p>
      {linhas.map((l) => (
        <Card key={l.provedor} className={`flex items-center justify-between gap-4 p-4 ${!l.configurado ? "opacity-60" : ""}`}>
          <div className="min-w-0">
            <p className="text-fs-3 font-medium text-fg">{l.nome}</p>
            <SituacaoDaConta
              configurado={l.configurado}
              indisponivel={l.indisponivel}
              conectada={l.conta.conectada}
              expirada={l.conta.expirada}
              email={l.conta.email}
            />
          </div>
          {l.configurado &&
            (l.conta.conectada ? (
              <DisconnectButton action={desconectarIntegracao.bind(null, l.provedor)} />
            ) : (
              // `nativo`: a rota de API redireciona para o provedor, e o <Link>
              // do Button com href tentaria navegar pelo roteador.
              <Button href={l.conectar} nativo className="flex-shrink-0">
                Conectar
              </Button>
            ))}
        </Card>
      ))}
    </div>
  );
}

/**
 * A situação da conta de reunião no `Selo` (15/10/2026): era texto colorido
 * com ícone — "Conectado como…" em verde e "Conexão expirada" em vermelho. O
 * e-mail e o que fazer vão ao lado, em cinza.
 */
function SituacaoDaConta({
  configurado,
  indisponivel,
  conectada,
  expirada,
  email,
}: {
  configurado: boolean;
  /** Por que não dá para conectar, sem o nome das variáveis do servidor
   *  (15/10/2026): quem lê aqui não as configura. */
  indisponivel: string;
  conectada: boolean;
  expirada: boolean;
  email: string | null;
}) {
  const [selo, texto] = !configurado
    ? [
        <Selo key="s" tom="neutro">Indisponível</Selo>,
        `${indisponivel}${conectada ? ". Uma conexão salva existe, mas não pode ser usada até isso ser configurado." : ""}`,
      ]
    : expirada
      ? [<Selo key="s" tom="perigo">Conexão expirada</Selo>, `${email ? `${email} — ` : ""}reconecte para voltar a agendar`]
      : conectada
        ? [<Selo key="s" tom="sucesso">Conectado</Selo>, email ? `como ${email}` : null]
        : [<Selo key="s" tom="neutro">Não conectado</Selo>, null];
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-fs-2 text-fg-muted">
      {selo}
      {texto && <span className="min-w-0 break-words">{texto}</span>}
    </p>
  );
}
