import { CFOPS_IMOBILIZADO, type Modelos, type Pendencia } from "./lancamentos";

/** Também identifica a sugestão revista: uma mudança de conta exige nova revisão. */
export function sugestaoEmLote(p: Pendencia & { sugestao: { reduzido: string } | null }, cfops: { cfop: string; contaDebito: string }[], modelos: Modelos) {
  if (!p.cnpjFornecedor || !p.sugestao) return null;
  const debito = cfops.find((c) => c.cfop === p.cfop)?.contaDebito ?? "";
  if (!p.soCredito && !debito) return null;
  const fixas = p.tipos.map((tipo) => {
    const conta = CFOPS_IMOBILIZADO.has(p.cfop) && modelos.contaImobilizado ? modelos.contaImobilizado : tipo === "CT-e" ? modelos.debitoCte : tipo === "NFS-e" ? modelos.debitoNfse : "";
    return tipo + ": " + conta;
  }).sort().join(" · ");
  return {
    debito: p.soCredito ? "" : debito,
    referenciaDebito: p.soCredito ? "modelo:" + fixas : debito,
    rotuloDebito: p.soCredito ? fixas : debito,
    credito: p.sugestao.reduzido,
  };
}
