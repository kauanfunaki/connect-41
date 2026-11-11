"use client";

import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { dataHora, moeda } from "@/lib/honorarios/rotulos";
import type { EnvioNoHistorico } from "@/lib/honorarios/servidor/acessoriasService";

/** Os últimos envios ao Acessórias — fechado de início, com a contagem na linha. */
export function HistoricoDeEnvios({ envios }: { envios: EnvioNoHistorico[] }) {
  const comProblema = envios.filter((e) => e.status !== "ok" || e.outrosCampos?.length).length;
  return (
    <BlocoRecolhivel
      titulo="Histórico de envios ao Acessórias"
      resumo={envios.length ? `${envios.length} mais recente(s)${comProblema ? ` · ${comProblema} com problema` : ""}` : "nenhum envio ainda"}
      abertoInicial={false}
      className="mt-6"
    >
      {envios.length === 0 ? (
        <p className="text-label text-fg-muted">Nenhum envio ainda.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-label">
            <thead>
              <tr className="text-micro uppercase tracking-wide text-fg-muted border-b border-border text-left">
                <th className="py-2 pr-3 font-medium">Quando</th>
                <th className="py-2 pr-3 font-medium">Empresa</th>
                <th className="py-2 pr-3 font-medium text-right">De</th>
                <th className="py-2 pr-3 font-medium text-right">Para</th>
                <th className="py-2 pr-3 font-medium">Quem</th>
                <th className="py-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id} className="border-b border-border-soft align-top">
                  <td className="py-2 pr-3 whitespace-nowrap tabular-nums">{dataHora(e.enviadoEm)}</td>
                  <td className="py-2 pr-3">{e.razaoSocial}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(e.valorAnterior)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{moeda(e.valorEnviado)}</td>
                  <td className="py-2 pr-3 text-fg-secondary">{e.conta}</td>
                  <td className="py-2">
                    {e.status === "ok" && !e.outrosCampos?.length ? (
                      <span className="text-success-fg">Atualizado</span>
                    ) : (
                      <span className="text-danger">{e.outrosCampos?.length ? `Outros campos mudaram: ${e.outrosCampos.join(", ")}` : (e.erro ?? "Falhou")}</span>
                    )}
                    {e.conferidoPor && <span className="block text-micro text-fg-muted">conferido por {e.conferidoPor}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </BlocoRecolhivel>
  );
}
