import { Selo } from "@/components/ui/Selo";
import { CartoesNoCelular, TabelaNoDesktop, Cartao, TopoDoCartao, InfoDoCartao, PeDoCartao } from "@/components/shared/ListaResponsiva";
import { formatInstantDateTime } from "@/lib/format";
import { ROTULO_DO_TIPO, rotuloDoMotivo, rotuloDoMunicipio } from "@/lib/fiscal/recusas";
import type { ResumoDoMunicipio } from "@/lib/fiscal/recusas";
import type { RecusaNaLista } from "@/lib/fiscal/recusasServidor";

const INTEIRO = new Intl.NumberFormat("pt-BR");
const ORIGEM: Record<string, string> = { entrada: "Entrada de XML", sped_local: "Importação do SPED" };

/**
 * As NFS-e recusadas, uma linha por município (06/11/2026). É a tabela que
 * decide por onde começar a leitura do resíduo: o município com mais arquivos
 * primeiro, e o motivo que o leitor mais deu para ele.
 */
export function RecusasPorMunicipio({ linhas }: { linhas: ResumoDoMunicipio[] }) {
  return (
    <>
      <CartoesNoCelular>
        {linhas.map((m) => (
          <Cartao key={m.municipio ?? "sem"}>
            <TopoDoCartao nome={rotuloDoMunicipio(m.municipio)} valor={<span className="tnum">{INTEIRO.format(m.arquivos)}</span>} />
            <InfoDoCartao>{rotuloDoMotivo(m.motivoPrincipal)}</InfoDoCartao>
            <InfoDoCartao>Última em {formatInstantDateTime(m.ultima)}</InfoDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[720px]">
          <colgroup>
            <col />
            <col className="w-[120px]" />
            <col className="w-[240px]" />
            <col className="w-[168px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-3">Município (IBGE)</th>
              <th className="px-4 py-3 text-right">Arquivos</th>
              <th className="px-4 py-3">Motivo mais comum</th>
              <th className="px-4 py-3">Última recusa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((m) => (
              <tr key={m.municipio ?? "sem"} className="border-b border-border">
                <td className={`px-4 py-3 tnum ${m.municipio ? "text-fg" : "text-fg-muted"}`}>{rotuloDoMunicipio(m.municipio)}</td>
                <td className="px-4 py-3 tnum text-right text-fg font-semibold">{INTEIRO.format(m.arquivos)}</td>
                <td className="px-4 py-3 text-fg-secondary truncate">{rotuloDoMotivo(m.motivoPrincipal)}</td>
                <td className="px-4 py-3 tnum text-fg-secondary whitespace-nowrap">{formatInstantDateTime(m.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
    </>
  );
}

/** As recusas mais novas, de qualquer tipo, com o detalhe que o leitor devolveu. */
export function UltimasRecusas({ linhas }: { linhas: RecusaNaLista[] }) {
  const vezes = (n: number) => (n > 1 ? `${INTEIRO.format(n)} envios` : "1 envio");
  return (
    <>
      <CartoesNoCelular>
        {linhas.map((r) => (
          <Cartao key={r.id}>
            <TopoDoCartao nome={<span className="break-all">{r.arquivo}</span>} />
            <InfoDoCartao>
              {rotuloDoMotivo(r.motivo)} · {r.detalhe}
            </InfoDoCartao>
            <InfoDoCartao>
              {rotuloDoMunicipio(r.municipio)} · {formatInstantDateTime(r.ultima)} · {vezes(r.vezes)}
            </InfoDoCartao>
            <PeDoCartao>
              <Selo tom={r.tipo === "nfse" ? "marca" : "neutro"}>{ROTULO_DO_TIPO[r.tipo]}</Selo>
            </PeDoCartao>
          </Cartao>
        ))}
      </CartoesNoCelular>

      <TabelaNoDesktop padrao>
        <table className="w-full table-fixed min-w-[1000px]">
          <colgroup>
            <col />
            <col className="w-[132px]" />
            <col className="w-[132px]" />
            <col className="w-[300px]" />
            <col className="w-[168px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border text-micro font-semibold uppercase tracking-wide text-fg-muted">
              <th className="px-4 py-3">Arquivo</th>
              <th className="px-4 py-3">Tipo provável</th>
              <th className="px-4 py-3">Município</th>
              <th className="px-4 py-3">Motivo</th>
              <th className="px-4 py-3">Última recusa</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.id} className="border-b border-border align-top">
                <td className="px-4 py-3 min-w-0">
                  <span className="block text-fg truncate" title={r.arquivo}>{r.arquivo}</span>
                  <span className="block text-micro text-fg-muted truncate">
                    {[r.empresa, ORIGEM[r.origem] ?? r.origem].filter(Boolean).join(" · ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Selo tom={r.tipo === "nfse" ? "marca" : "neutro"}>{ROTULO_DO_TIPO[r.tipo]}</Selo>
                </td>
                <td className={`px-4 py-3 tnum ${r.municipio ? "text-fg-secondary" : "text-fg-muted"}`}>{r.municipio ? rotuloDoMunicipio(r.municipio) : "—"}</td>
                <td className="px-4 py-3 min-w-0">
                  <span className="block text-fg-secondary">{rotuloDoMotivo(r.motivo)}</span>
                  <span className="block text-micro text-fg-muted line-clamp-2" title={r.detalhe}>{r.detalhe}</span>
                </td>
                <td className="px-4 py-3 tnum text-fg-secondary whitespace-nowrap">
                  <span className="block">{formatInstantDateTime(r.ultima)}</span>
                  <span className="block text-micro text-fg-muted">{vezes(r.vezes)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TabelaNoDesktop>
    </>
  );
}
