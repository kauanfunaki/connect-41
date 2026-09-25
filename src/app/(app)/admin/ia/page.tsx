import Link from "next/link";
import { notFound } from "next/navigation";
import { getPrisma } from "@/lib/prisma";
import { getAuthContext, isFullWrite } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { Card } from "@/components/ui/Card";
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
        <Card className="p-4 mb-5 border-warning/40 bg-warning-bg">
          <p className="text-[13px] text-fg">
            Nenhuma chave de IA cadastrada para esta empresa — nenhum agente roda sem ela.{" "}
            <Link href="/admin/integracoes" className="text-brand hover:underline">
              Cadastrar em Integrações
            </Link>
            .
          </p>
        </Card>
      )}

      <Card className="p-4 mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-fg-muted">Gasto no mês</p>
            <p className="text-[22px] font-semibold tabular-nums text-fg">{moeda(totalCentavos)}</p>
          </div>
          <p className="text-[13px] text-fg-secondary tabular-nums">
            {totalChamadas} {totalChamadas === 1 ? "chamada" : "chamadas"}
            {totalSemCusto > 0 && (
              // O total só significa alguma coisa quando esta parte é zero, e
              // por isso ela fica ao lado do número, não num rodapé.
              <span className="text-warning"> · {totalSemCusto} sem custo apurado</span>
            )}
          </p>
        </div>
        <p className="text-[12px] text-fg-muted mt-2">
          O mês começa à meia-noite de São Paulo. Os valores usam a tabela de preço escrita em{" "}
          {formatInstantDate(new Date(PRECOS_ESCRITOS_EM))} — enquanto ela não for conferida contra a
          página de preços do provedor, quem protege de verdade é o teto de chamadas.
        </p>
      </Card>

      <section className="flex flex-col gap-3 mb-8" aria-labelledby="agentes-do-chat">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <div>
            <h2 id="agentes-do-chat" className="text-[17px] font-semibold text-fg">
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
        {doChat.map((linha) => (
          <AgenteCard key={linha.def.code} linha={linha} podeEditar />
        ))}
      </section>

      <section className="flex flex-col gap-3 mb-8" aria-labelledby="outras-funcoes">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
          <div>
            <h2 id="outras-funcoes" className="text-[17px] font-semibold text-fg">
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

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">Últimas chamadas</h2>
          <p className="text-[13px] text-fg-secondary">
            Quem pediu, sobre o quê e como terminou. É a resposta para “por que esse texto apareceu
            nesta ficha”.
          </p>
        </div>
        <Card className="p-4">
          <ChamadasDeIA chamadas={chamadas} agora={agora} />
        </Card>
      </section>
    </PageContainer>
  );
}
