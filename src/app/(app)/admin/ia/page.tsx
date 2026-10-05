import { notFound } from "next/navigation";
import { Activity, CircleHelp, Wallet } from "lucide-react";
import { FaixaDeTotais } from "@/components/financeiro/FiltroDePeriodo";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AgenteCard } from "@/components/admin/AgenteCard";
import { ChamadasDeIA } from "@/components/admin/ChamadasDeIA";
import { listarAgentes, ultimasChamadas } from "@/lib/ia/data";
import { PRECOS_ESCRITOS_EM } from "@/lib/ia/custo";
import { moeda } from "@/lib/ia/tela";
import { formatInstantDate } from "@/lib/format";
import { PublicoDoChat } from "@/components/admin/PublicoDoChat";
import { audienciaDoChat } from "@/lib/ia/chat/agentes";
import { painelDoOrquestrador } from "@/lib/ia/chat/painel";
import { PainelDoOrquestrador } from "@/components/admin/PainelDoOrquestrador";
import { AvaliacoesDoChat } from "@/components/admin/AvaliacoesDoChat";
import { AGENTES_DO_CHAT } from "@/lib/ia/chat/regras";
import { getSectorMaps } from "@/lib/sectors";
import type { LinhaDeAgente } from "@/lib/ia/data";

// Teto de gasto e chave de IA são configuração do tenant inteiro, não de setor
// — mesmo critério da tela de Integrações.
export default async function AgentesDeIAPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !isFullWrite(ctx.role)) notFound();

  const agora = new Date();
  const prisma = getPrisma();
  const config = await prisma.tenantAiConfig.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { provider: true, model: true },
  });

  // Sem config de tenant não há IA (a chave pelo ambiente saiu em 23/09). É o
  // que faz o aviso abaixo aparecer para quem precisa cadastrar a sua.
  const [linhas, chamadas, audiencia, painel, { labels: nomesDosSetores }] = await Promise.all([
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

  return (
    <PageContainer>
      <PageHeader
        title="Inteligência Artificial"
        subtitle="Os agentes do chat e as demais funções de IA: o que fizeram neste mês, quanto custou e até onde podem ir. Só administradores veem esta tela."
      />

      {!config && (
        // Revisão de 05/10: botão não é link — o "Cadastrar em Integrações" era texto azul.
        <Card className="p-4 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-warning/40 bg-warning-bg">
          <p className="text-[13px] text-fg">Nenhuma chave de IA cadastrada para esta empresa — nenhum agente roda sem ela.</p>
          <Button href="/admin/integracoes" variant="secondary" size="sm">
            Cadastrar em Integrações
          </Button>
        </Card>
      )}

      {/* Os números do mês em cartão, como nas outras telas (polimento de
          30/09) — era um bloco com o total e as chamadas numa linha só. "Sem
          custo apurado" continua ao lado do total, e não num rodapé: o total só
          significa alguma coisa quando esse cartão está em zero. */}
      <FaixaDeTotais
        itens={[
          { rotulo: "Gasto no mês", valor: moeda(totalCentavos), icone: <Wallet /> },
          { rotulo: "Chamadas", valor: String(totalChamadas), icone: <Activity /> },
          {
            rotulo: "Sem custo apurado",
            valor: String(totalSemCusto),
            icone: <CircleHelp />,
            tom: totalSemCusto > 0 ? "text-warning" : "text-fg-muted",
          },
        ]}
      />
      <p className="text-[12px] text-fg-muted -mt-2 mb-5">
        O mês começa à meia-noite de São Paulo. Os valores usam a tabela de preço escrita em{" "}
        {formatInstantDate(new Date(PRECOS_ESCRITOS_EM))} — enquanto ela não for conferida contra a
        página de preços do provedor, quem protege de verdade é o teto de chamadas.
      </p>

      <section className="flex flex-col gap-3 mb-8" aria-labelledby="agentes-do-chat">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <div>
            <h2 id="agentes-do-chat" className="text-[length:var(--fs-section)] font-semibold text-fg">
              Agentes — chat de IA
            </h2>
            <p className="text-[13px] text-fg-secondary max-w-[70ch]">
              As IAs que conversam no chat do canto inferior direito, uma por setor, e a Ajuda do Connect. Ligar um
              agente aqui é o que o faz aparecer no chat para quem opera aquele setor. O do Societário também atende o
              cartão de perguntas da fila de processos.
            </p>
          </div>
          <p className="text-[13px] tabular-nums text-fg-secondary">{moeda(gastoDe(doChat))} no mês</p>
        </div>
        <PublicoDoChat todos={audiencia === "TODOS"} disponivel={audiencia !== null} />
        {painel && <PainelDoOrquestrador dados={painel} />}
        {painel && <AvaliacoesDoChat dados={painel} />}
        {doChat.map((linha) => (
          <AgenteCard key={linha.def.code} linha={linha} podeEditar />
        ))}
      </section>

      <section className="flex flex-col gap-3 mb-8" aria-labelledby="outras-funcoes">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <div>
            <h2 id="outras-funcoes" className="text-[length:var(--fs-section)] font-semibold text-fg">
              Outras utilizações de IA
            </h2>
            <p className="text-[13px] text-fg-secondary max-w-[70ch]">
              Funções que usam IA dentro de uma tela ou em segundo plano — ler currículo, pontuar candidato, resumir
              empresa, atender no WhatsApp. Não aparecem no chat.
            </p>
          </div>
          <p className="text-[13px] tabular-nums text-fg-secondary">{moeda(gastoDe(outras))} no mês</p>
        </div>
        {[...porSetor.entries()].map(([setor, ls]) => (
          <div key={setor} className="flex flex-col gap-3">
            <p className="text-[11px] uppercase tracking-wide text-fg-muted pt-1">{setor}</p>
            {ls.map((linha) => (
              <AgenteCard key={linha.def.code} linha={linha} podeEditar />
            ))}
          </div>
        ))}
      </section>

      {/* Mesmo cabeçalho das duas seções de cima (era 15px contra 17px). */}
      <section className="flex flex-col gap-3">
        <div className="border-b border-border pb-2">
          <h2 className="text-[length:var(--fs-section)] font-semibold text-fg">Últimas chamadas</h2>
          <p className="text-[13px] text-fg-secondary">
            Quem pediu, sobre o quê e como terminou. É a resposta para “por que esse texto apareceu
            nesta ficha”.
          </p>
        </div>
        <ChamadasDeIA chamadas={chamadas} agora={agora} />
      </section>
    </PageContainer>
  );
}
