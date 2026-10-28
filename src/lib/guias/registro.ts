// O registro de uma guia emitida pelo Serpro (Guias pelo Connect, 28/10/2026):
// do pedido e da resposta lida para as colunas da `Guia`. Função pura.

import { ROTULO_DA_GUIA, type GuiaEmitida, type PedidoDeGuia } from "@/lib/serpro/guias";

export type RegistroDaGuia = {
  tipo: PedidoDeGuia["tipo"];
  descricao: string;
  competencia: string | null;
  vencimento: string | null;
  validoAte: string | null;
  valorCentavos: number | null;
  numeroDocumento: string | null;
};

const mesBr = (aaaaMm: string) => `${aaaaMm.slice(5, 7)}/${aaaaMm.slice(0, 4)}`;
const ehData = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function registroDaGuia(p: PedidoDeGuia, g: GuiaEmitida): RegistroDaGuia {
  const rotulo = ROTULO_DA_GUIA[p.tipo];
  let descricao: string;
  let competencia: string | null;
  switch (p.tipo) {
    case "PARCELA":
      descricao = `${rotulo} ${p.modalidade} · ${mesBr(p.parcela)}`;
      competencia = p.parcela;
      break;
    case "DCTFWEB":
      descricao = p.decimoTerceiro ? `${rotulo} · 13º de ${p.periodo.slice(0, 4)}` : `${rotulo} · ${mesBr(p.periodo)}`;
      competencia = p.periodo;
      break;
    case "DARF":
      descricao = `DARF ${p.codigoReceita}-${p.extensao} · ${mesBr(p.periodo)}`;
      competencia = p.periodo;
      break;
    default:
      descricao = `${rotulo} · ${mesBr(p.periodo)}`;
      competencia = p.periodo;
  }
  return {
    tipo: p.tipo,
    descricao: descricao.slice(0, 160),
    competencia,
    vencimento: ehData(g.vencimento) ? g.vencimento : null,
    validoAte: ehData(g.validoAte) ? g.validoAte : null,
    valorCentavos: g.total,
    numeroDocumento: g.numeroDocumento ? g.numeroDocumento.slice(0, 60) : null,
  };
}
