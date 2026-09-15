import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { PageContainer } from "@/components/shared/PageContainer";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { isModuleEnabled, setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { saoPauloParts, addDaysToKey } from "@/lib/agenda";
import { AVISO_EM_DIAS } from "@/lib/societario/licencas";
import { agruparPorFaixa, fimDoDia, FAIXAS, FAIXA_LABEL } from "@/lib/societario/prazos";
import { itensDePrazo } from "@/lib/societario/painel-data";
import { ListaDePrazos } from "@/components/societario/ListaDePrazos";

const MODULE = "societario_minha_area";
// Derivado do catálogo, não cravado: o módulo pode mudar de setor.
// `SECTOR` é o setor de origem, usado só como padrão: acesso e equipe seguem o
// setor que opera o módulo neste tenant — ver `setorDoModulo`.
const SECTOR = getModuleDef(MODULE)!.sectorCode;

export const dynamic = "force-dynamic";

export default async function MinhaAreaPage() {
  const ctx = await getAuthContext();
  if (!ctx.tenantId || !ctx.userId || !canActOnSector(ctx, (await setorDoModulo(ctx.tenantId, MODULE)) ?? SECTOR)) notFound();
  if (!(await isModuleEnabled(ctx.tenantId, MODULE))) notFound();

  const agora = new Date();
  const hojeChave = saoPauloParts(agora).dateKey;

  // A licença entra com a mesma antecedência da fila de renovação: avisar aqui
  // antes de ela aparecer em /licencas faria as duas telas discordarem.
  const itens = await itensDePrazo(ctx.tenantId, {
    responsavelId: ctx.userId,
    incluirSemData: true,
    licencasAte: fimDoDia(addDaysToKey(hojeChave, AVISO_EM_DIAS)),
  });

  const comData = itens.filter((i) => i.data !== null);
  const semData = itens.filter((i) => i.data === null);
  const grupos = agruparPorFaixa(comData, (i) => i.data!, agora);
  const meusProcessos = itens.filter((i) => i.tipo === "processo").length;

  return (
    <PageContainer>
      <PageHeader
        title="Minha área"
        subtitle="O que está na sua mão, por prazo: processos de que você é responsável, as exigências e taxas deles, e licenças vencendo nessas empresas."
        action={
          <Link href={`/processos/kanban?responsavel=${ctx.userId}`} className="text-[13px] text-brand hover:underline">
            Meus processos no kanban
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <MetricCard label="Vencidos" value={grupos.vencido.length} highlight={grupos.vencido.length > 0} />
        <MetricCard label="Hoje" value={grupos.hoje.length} highlight={grupos.hoje.length > 0} />
        <MetricCard label="Próximos 7 dias" value={grupos.semana.length} />
        <MetricCard label="Processos abertos" value={meusProcessos} href={`/processos?responsavel=${ctx.userId}`} />
      </div>

      {itens.length === 0 ? (
        <EmptyState
          title="Nada na sua mão"
          description="Quando um processo for distribuído para você, ele e o que pende dele aparecem aqui."
          icon={<CheckCircle2 />}
        />
      ) : (
        <div className="flex flex-col gap-6">
          {FAIXAS.map((faixa) =>
            grupos[faixa].length === 0 ? null : (
              <section key={faixa}>
                <h2
                  className={`text-[13px] font-semibold mb-1 ${faixa === "vencido" ? "text-danger" : "text-fg-secondary"}`}
                >
                  {FAIXA_LABEL[faixa]} <span className="tabular-nums text-fg-muted font-normal">{grupos[faixa].length}</span>
                </h2>
                <ListaDePrazos itens={grupos[faixa]} hoje={agora} />
              </section>
            )
          )}
          {semData.length > 0 && (
            <section>
              <h2 className="text-[13px] font-semibold mb-1 text-fg-secondary">
                Sem data <span className="tabular-nums text-fg-muted font-normal">{semData.length}</span>
              </h2>
              <ListaDePrazos itens={semData} hoje={agora} />
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}
