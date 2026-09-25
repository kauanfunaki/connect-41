import { Card } from "@/components/ui/Card";
import { agenteDoCatalogo } from "@/lib/ia/catalogo";
import { DIAS_DO_PAINEL, type PainelDoOrquestrador as Dados } from "@/lib/ia/chat/painel";

const SETOR: Record<string, string> = {
  societario: "Societário",
  recrutamento: "Recrutamento",
  fiscal: "Fiscal",
  bpo: "BPO",
  contabil: "Contábil",
  dp: "DP",
  ajuda: "Ajuda do Connect",
  outro: "nenhum setor",
};

function nomeDaIa(code: string): string {
  return agenteDoCatalogo(code)?.label.replace(" (chat)", "") ?? code;
}

/**
 * O orquestrador em números: quem pergunta a qual IA, o que foi passado para
 * outro setor e o que não tinha IA. Só contagens — ver `src/lib/ia/chat/painel.ts`.
 */
export function PainelDoOrquestrador({ dados }: { dados: Dados }) {
  const semIa = Object.values(dados.semIa).reduce((n, v) => n + v, 0);
  return (
    <Card className="p-4 mb-5 flex flex-col gap-4">
      <div>
        <p className="text-[14px] font-semibold text-fg">Orquestrador do chat — últimos {DIAS_DO_PAINEL} dias</p>
        <p className="text-[12px] text-fg-secondary max-w-[70ch]">
          Cada IA reconhece pergunta de outro setor e a passa adiante: para a IA daquele setor, se a pessoa tiver acesso,
          ou como sugestão de transferência. Aqui só aparecem contagens — o que foi perguntado fica com quem perguntou.
        </p>
      </div>

      {dados.perguntas.length === 0 ? (
        <p className="text-[13px] text-fg-muted">Nenhuma pergunta no chat neste período.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Perguntas por IA</p>
          <ul className="flex flex-col">
            {dados.perguntas.map((p) => (
              <li key={p.agentCode} className="flex flex-wrap items-baseline gap-x-3 py-1.5 border-b border-border-soft last:border-0 text-[13px]">
                <span className="flex-1 min-w-[10rem] text-fg">{nomeDaIa(p.agentCode)}</span>
                <span className="tabular-nums text-fg">{p.perguntas} perguntas</span>
                <span className="tabular-nums text-fg-muted">{p.pessoas} {p.pessoas === 1 ? "pessoa" : "pessoas"}</span>
                {p.falhas > 0 && <span className="tabular-nums text-danger">{p.falhas} com falha</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dados.encaminhamentos.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Passadas para outro setor</p>
          <ul className="flex flex-col">
            {dados.encaminhamentos.map((e) => (
              <li key={`${e.de}-${e.para}`} className="flex flex-wrap items-baseline gap-x-3 py-1.5 border-b border-border-soft last:border-0 text-[13px]">
                <span className="flex-1 min-w-[12rem] text-fg">
                  {nomeDaIa(e.de)} → {SETOR[e.para] ?? e.para}
                </span>
                {e.respondidas > 0 && <span className="tabular-nums text-success">{e.respondidas} respondidas lá</span>}
                {e.transferencias > 0 && <span className="tabular-nums text-fg">{e.transferencias} viraram sugestão de transferência</span>}
                {e.semDestino > 0 && <span className="tabular-nums text-warning">{e.semDestino} sem destino</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {semIa > 0 && (
        <p className="text-[13px] text-warning">
          {semIa} {semIa === 1 ? "pergunta não era" : "perguntas não eram"} de nenhum setor com IA — é o sinal de qual
          IA construir a seguir.
        </p>
      )}
    </Card>
  );
}
