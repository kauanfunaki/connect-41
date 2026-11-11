import { Aviso } from "@/components/ui/Aviso";
import { TD, TD_NUM, TH, TH_NUM, TR } from "./Secao";
import { brl } from "@/lib/dp2/tela";

export type LinhaDeRecibo = { nome: string; referencia?: string; valor: number; tipo: "PROVENTO" | "DESCONTO" | "INFORMATIVA"; memoria: string; motivo?: string | null };

/** O recibo das calculadoras do DP 2 (férias, rescisão): linhas com a conta de cada uma e os totais. */
export function Recibo({ linhas, proventos, descontos, liquido, alertas = [] }: { linhas: LinhaDeRecibo[]; proventos: number; descontos: number; liquido: number; alertas?: string[] }) {
  return (
    <>
      {alertas.length > 0 && (
        <Aviso tom="atencao" className="mb-4">
          <ul className="list-disc pl-4">
            {alertas.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-fs-3">
          <thead>
            <tr>
              <th className={TH}>Verba</th>
              <th className={TH}>Ref.</th>
              <th className={TH_NUM}>Proventos</th>
              <th className={TH_NUM}>Descontos</th>
              <th className={TH}>Como foi calculado</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={`${l.nome}-${i}`} className={`${TR} ${l.tipo === "INFORMATIVA" ? "text-fg-muted" : ""}`}>
                <td className={TD}>
                  {l.nome}
                  {l.tipo === "INFORMATIVA" && <span className="text-fs-1"> (não entra no líquido)</span>}
                </td>
                <td className={`${TD} whitespace-nowrap`}>{l.referencia ?? ""}</td>
                <td className={TD_NUM}>{l.tipo === "PROVENTO" ? brl(l.valor) : l.tipo === "INFORMATIVA" ? brl(l.valor) : ""}</td>
                <td className={TD_NUM}>{l.tipo === "DESCONTO" ? brl(l.valor) : ""}</td>
                <td className={`${TD} text-fs-2 text-fg-muted max-w-[46ch]`}>{l.motivo ?? l.memoria}</td>
              </tr>
            ))}
            <tr className={`${TR} font-semibold`}>
              <td className={TD}>Totais</td>
              <td className={TD} />
              <td className={TD_NUM}>{brl(proventos)}</td>
              <td className={TD_NUM}>{brl(descontos)}</td>
              <td className={TD}>Líquido {brl(liquido)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
