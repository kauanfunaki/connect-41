import { notFound } from "next/navigation";
import { Activity, CircleHelp, Wallet } from "lucide-react";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { AbasDeLink } from "@/components/ui/AbasDeLink";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Selo } from "@/components/ui/Selo";
import { Button } from "@/components/ui/Button";
import { AgenteCard } from "@/components/admin/AgenteCard";
import { ChamadasDeIA } from "@/components/admin/ChamadasDeIA";
import { listarAgentes, ultimasChamadas } from "@/lib/ia/data";
import { PRECOS_ESCRITOS_EM } from "@/lib/ia/custo";
import { moeda } from "@/lib/ia/tela";
import { formatInstantDate, formatarNumero } from "@/lib/format";
import { PublicoDoChat } from "@/components/admin/PublicoDoChat";
import { audienciaDoChat } from "@/lib/ia/chat/agentes";
import { painelDoOrquestrador } from "@/lib/ia/chat/painel";
import { PainelDoOrquestrador } from "@/components/admin/PainelDoOrquestrador";
import { AvaliacoesDoChat } from "@/components/admin/AvaliacoesDoChat";
import { AGENTES_DO_CHAT } from "@/lib/ia/chat/regras";
import { getSectorMaps } from "@/lib/sectors";
import type { LinhaDeAgente } from "@/lib/ia/data";
import { Aviso } from "@/components/ui/Aviso";

// Teto de gasto e chave de IA são configuração do tenant inteiro, não de setor
// — mesmo critério da tela de Integrações.
/** O provedor da chave, para a situação no topo. */
const PROVEDOR: Record<string, string> = { ANTHROPIC: "Anthropic", OPENAI: "OpenAI" };

export default async function AgentesDeIAPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();
  const { aba } = await searchParams;

  const agora = new Date();
  const prisma = getPrisma();
  const config = await prisma.tenantAiConfig.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { provider: true, model: true },
  });

  // Sem config de tenant não há IA (a chave pelo ambiente saiu em 23/09). É o
  // que faz o aviso abaixo aparecer para quem precisa cadastrar a sua.
  const [linhas, chamadas, audiencia, painel, { labels: nomesDosSetores, colors: coresDosSetores }] = await Promise.all([
    listarAgentes(ctx.tenantId, config?.provider ?? null, config?.model ?? null, agora),
    ultimasChamadas(ctx.tenantId, 30),
    audienciaDoChat(ctx.tenantId),
    painelDoOrquestrador(ctx.tenantId, agora),
    getSectorMaps(ctx.tenantId),
  ]);

  // Duas coisas diferentes que a tela listava juntas: os agentes, que
  // conversam no chat do canto da tela, e as funções de IA que rodam dentro de
  // uma tela (triagem de currículo, resumo, WhatsApp). Misturadas, ninguém
  // sabia qual liga o chat.
  const doChat = linhas.filter((l) => AGENTES_DO_CHAT.has(l.def.code));
  const outras = linhas.filter((l) => !AGENTES_DO_CHAT.has(l.def.code));
  const porSetor = new Map<string, LinhaDeAgente[]>();
  for (const l of outras) {
    const setor = l.def.sectorCode ? (nomesDosSetores[l.def.sectorCode] ?? l.def.sectorCode) : "Geral";
    porSetor.set(setor, [...(porSetor.get(setor) ?? []), l]);
  }
  const gastoDe = (ls: LinhaDeAgente[]) => ls.reduce((n, l) => n + l.gasto.centavos, 0);

  const totalCentavos = linhas.reduce((n, l) => n + l.gasto.centavos, 0);
  const totalChamadas = linhas.reduce((n, l) => n + l.gasto.chamadas, 0);
  const totalSemCusto = linhas.reduce((n, l) => n + l.gasto.semCusto, 0);

  const quantasChamadas = chamadas.length;
  const abas = [
    { chave: "agentes", rotulo: "Agentes", href: "/admin/ia", contagem: linhas.length },
    ...(painel ? [{ chave: "respostas", rotulo: "Respostas do chat", href: "/admin/ia?aba=respostas" }] : []),
    { chave: "chamadas", rotulo: "Últimas chamadas", href: "/admin/ia?aba=chamadas", contagem: quantasChamadas },
    { chave: "publico", rotulo: "Quem usa o chat", href: "/admin/ia?aba=publico" },
  ];
  const ativa = aba && abas.some((a) => a.chave === aba) ? aba : "agentes";
  const corDo = (l: LinhaDeAgente) => (l.def.sectorCode ? coresDosSetores[l.def.sectorCode] : undefined);

  return (
    <PageContainer>
      <PageHeader
        title="Inteligência artificial"
        subtitle="Quanto a IA fez e gastou neste mês, e até onde cada agente pode ir."
        // A situação da chave no topo (7A): sem ela, nenhum agente roda.
        action={
          config ? (
            <Selo tom="sucesso">Chave {PROVEDOR[config.provider] ?? config.provider} ativa</Selo>
          ) : (
            <Selo tom="atencao">Sem chave de IA</Selo>
          )
        }
      />

      {!config && (
        // Revisão de 05/10: botão não é link — o "Cadastrar em Integrações" era texto azul.
        <Aviso tom="atencao" className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-fg">Nenhuma chave de IA cadastrada para esta empresa — nenhum agente roda sem ela.</p>
          <Button href="/admin/integracoes?integracao=ia" variant="secondary" size="sm">
            Cadastrar em Integrações
          </Button>
        </Aviso>
      )}

      {/* Os números do mês em cartão, como nas outras telas (polimento de
          30/09). "Sem custo apurado" fica ao lado do total, e não num rodapé:
          o total só significa alguma coisa quando esse cartão está em zero. */}
      <FaixaDeTotais
        className=""
        itens={[
          { rotulo: "Gasto no mês", valor: moeda(totalCentavos), icone: <Wallet /> },
          { rotulo: "Chamadas", valor: formatarNumero(totalChamadas, 0), icone: <Activity /> },
          {
            rotulo: "Sem custo apurado",
            valor: formatarNumero(totalSemCusto, 0),
            icone: <CircleHelp />,
            tom: totalSemCusto > 0 ? "text-warning-fg" : "text-fg-muted",
          },
        ]}
      />

      {/* As explicações longas num "Como funciona" que abre e fecha (7A,
          20/10/2026): eram parágrafos em cada seção e uma nota de 11px. Começa
          fechado, como os outros recolhíveis. */}
      <BlocoRecolhivel titulo="Como funciona" className="mt-4 mb-5 bg-surface">
        <div className="space-y-2 text-fs-3 text-fg-secondary">
          <p>
            <span className="font-medium text-fg">Agentes do chat.</span> A Ceci, assistente do Connect, no chat do canto
            inferior direito: um agente por setor e a Ajuda do Connect, todos com o mesmo nome e o mesmo jeito de falar.
            Ligar um agente aqui é o que o faz aparecer no chat para quem opera aquele setor. O do Societário também
            atende o cartão de perguntas da fila de processos.
          </p>
          <p>
            <span className="font-medium text-fg">Outras utilizações.</span> Funções que usam IA dentro de uma tela ou em
            segundo plano — ler currículo, pontuar candidato, resumir empresa, atender no WhatsApp. Não aparecem no chat.
          </p>
          <p>
            <span className="font-medium text-fg">Os valores.</span> O mês começa à meia-noite de São Paulo. Os valores
            usam a tabela de preço escrita em {formatInstantDate(new Date(PRECOS_ESCRITOS_EM))} — enquanto ela não for
            conferida contra a página de preços do provedor, quem protege de verdade é o teto de chamadas.
          </p>
        </div>
      </BlocoRecolhivel>

      {/* Cada assunto na sua aba (escolha 7A dos Ajustes de 15/10, 20/10/2026):
          era uma página só, com os agentes em cartões largos empilhados, o
          orquestrador, as avaliações e as chamadas um embaixo do outro. */}
      <AbasDeLink abas={abas} ativa={ativa} />

      {ativa === "agentes" && (
        <div className="space-y-8">
          <section className="flex flex-col gap-3" aria-labelledby="agentes-do-chat">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="agentes-do-chat" className="text-section font-semibold text-fg">
                Chat da Ceci
              </h2>
              <p className="text-fs-3 tabular-nums text-fg-secondary">{moeda(gastoDe(doChat))} no mês</p>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {doChat.map((linha) => (
                <AgenteCard key={linha.def.code} linha={linha} podeEditar cor={corDo(linha)} />
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3" aria-labelledby="outras-funcoes">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="outras-funcoes" className="text-section font-semibold text-fg">
                Outras utilizações de IA
              </h2>
              <p className="text-fs-3 tabular-nums text-fg-secondary">{moeda(gastoDe(outras))} no mês</p>
            </div>
            {[...porSetor.entries()].map(([setor, ls]) => (
              <div key={setor} className="flex flex-col gap-2">
                <p className="c41-rotulo pt-1">{setor}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {ls.map((linha) => (
                    <AgenteCard key={linha.def.code} linha={linha} podeEditar cor={corDo(linha)} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </div>
      )}

      {ativa === "respostas" && painel && (
        <div className="flex flex-col gap-3">
          <PainelDoOrquestrador dados={painel} />
          <AvaliacoesDoChat dados={painel} />
        </div>
      )}

      {ativa === "chamadas" && (
        <section className="flex flex-col gap-3" aria-label="Últimas chamadas">
          <p className="text-fs-3 text-fg-secondary">
            Quem pediu, sobre o quê e como terminou. É a resposta para “por que esse texto apareceu nesta ficha”.
          </p>
          <ChamadasDeIA chamadas={chamadas} agora={agora} />
        </section>
      )}

      {ativa === "publico" && <PublicoDoChat todos={audiencia === "TODOS"} disponivel={audiencia !== null} />}
    </PageContainer>
  );
}
