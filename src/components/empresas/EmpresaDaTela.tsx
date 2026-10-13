"use client";

import { createContext, useContext } from "react";
import { Building2 } from "lucide-react";
import { formatCnpj } from "@/lib/format";

/** A empresa em que a tela grava — nome e CNPJ, para mostrar ao lado do botão. */
export type EmpresaEmUso = { nome: string; cnpj?: string | null };

const Contexto = createContext<EmpresaEmUso | null>(null);

/**
 * Marca a tela inteira como "de uma empresa só" (13/10/2026): todo rodapé de
 * formulário dentro dela (`FormFooter`) mostra, ao lado do botão de gravar, em
 * que empresa o registro vai cair — o lançamento, a conta bancária, o
 * fornecedor, a versão do orçamento.
 *
 * Existe porque essas telas abriam na primeira empresa em ordem alfabética, e
 * o seletor ficava no topo, longe do botão: quem lançava sem olhar gravava na
 * empresa errada. Janela e painel lateral herdam o contexto (o React passa por
 * portal), então o "Novo lançamento" do cabeçalho também diz a empresa.
 */
export function EmpresaDaTela({ empresa, children }: { empresa: EmpresaEmUso; children: React.ReactNode }) {
  return <Contexto.Provider value={empresa}>{children}</Contexto.Provider>;
}

export function useEmpresaDaTela(): EmpresaEmUso | null {
  return useContext(Contexto);
}

/** "Empresa: NOME", ao lado do botão de gravar. Fora de tela de uma empresa só, não aparece. */
export function EmpresaDoRegistro({ className = "" }: { className?: string }) {
  const empresa = useEmpresaDaTela();
  if (!empresa) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 min-w-0 max-w-full text-helper text-fg-secondary ${className}`.trim()}
      title={empresa.cnpj ? `CNPJ ${formatCnpj(empresa.cnpj)}` : undefined}
    >
      <Building2 size={13} className="flex-shrink-0 text-fg-muted" aria-hidden />
      <span className="truncate">
        Empresa: <strong className="font-semibold text-fg">{empresa.nome}</strong>
      </span>
    </span>
  );
}
