// "Editar plano" (14/10/2026) — o que a janela manda e o que se aceita. Até
// aqui o plano ficava como nasceu: nome, valor e implantação só no banco.
//
// O modo de gestão e o tipo de cobrança não se editam: mudam o sentido das
// assinaturas que já usam o plano (o limite de usuários, a mensalidade). Para
// isso, um plano novo.
//
// Puro: a server action (admin/planos/actions) e os testes usam o mesmo.

import type { BillingType } from "@/generated/prisma/enums";
import { centavosDeTexto, decimalDeCentavos } from "@/lib/financeiro/manual";

export const MAX_NOME_DO_PLANO = 80;
/** `Decimal(10, 2)`: até 99.999.999,99. */
const MAX_CENTAVOS = 9_999_999_999;

export type EdicaoDoPlano = {
  name: string;
  /** Texto para o `Decimal` do Prisma ("1200.00"); só o campo da cobrança do plano. */
  basePrice?: string;
  pricePerUser?: string;
  setupFee: string;
};

function lerValor(texto: FormDataEntryValue | null, rotulo: string, obrigatorio: boolean): { centavos: number } | { erro: string } {
  const bruto = String(texto ?? "").trim();
  if (bruto === "") return obrigatorio ? { erro: `Informe ${rotulo}.` } : { centavos: 0 };
  const centavos = centavosDeTexto(bruto);
  if (centavos === null || centavos > MAX_CENTAVOS) return { erro: `${rotulo[0]!.toUpperCase()}${rotulo.slice(1)} não é um valor válido.` };
  return { centavos };
}

/**
 * Os campos do plano enviados pela janela "Editar plano". O valor vale para o
 * campo da cobrança do plano: valor mensal no de valor fixo, valor por usuário
 * no de cobrança por usuário (como na criação, que exige o valor por usuário).
 */
export function lerEdicaoDoPlano(form: FormData, cobranca: BillingType): { dados: EdicaoDoPlano } | { erro: string } {
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { erro: "O nome do plano é obrigatório." };
  if (name.length > MAX_NOME_DO_PLANO) return { erro: `O nome do plano tem no máximo ${MAX_NOME_DO_PLANO} letras.` };

  const porUsuario = cobranca === "PER_USER_MONTHLY";
  const valor = lerValor(form.get("valor"), porUsuario ? "o valor por usuário" : "o valor mensal", true);
  if ("erro" in valor) return valor;
  if (porUsuario && valor.centavos === 0) return { erro: "O valor por usuário precisa ser maior que zero." };

  const implantacao = lerValor(form.get("setupFee"), "a taxa de implantação", false);
  if ("erro" in implantacao) return implantacao;

  const preco = decimalDeCentavos(valor.centavos);
  return {
    dados: {
      name,
      ...(porUsuario ? { pricePerUser: preco } : { basePrice: preco }),
      setupFee: decimalDeCentavos(implantacao.centavos),
    },
  };
}

/** O valor guardado como texto de formulário pt-BR ("1200,50"), para começar a janela preenchida. */
export function valorParaOCampo(v: unknown): string {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

/** O que mudou entre o plano guardado e o editado — vazio, nada a gravar nem a auditar. */
export function mudancasDoPlano(
  atual: { name: string; basePrice: unknown; pricePerUser: unknown; setupFee: unknown },
  novo: EdicaoDoPlano,
): Partial<Record<keyof EdicaoDoPlano, { de: string; para: string }>> {
  const texto = (v: unknown) => (v == null ? "" : Number(v).toFixed(2));
  const mudou: Partial<Record<keyof EdicaoDoPlano, { de: string; para: string }>> = {};
  if (novo.name !== atual.name) mudou.name = { de: atual.name, para: novo.name };
  if (novo.basePrice !== undefined && texto(atual.basePrice) !== novo.basePrice) mudou.basePrice = { de: texto(atual.basePrice), para: novo.basePrice };
  if (novo.pricePerUser !== undefined && texto(atual.pricePerUser) !== novo.pricePerUser) {
    mudou.pricePerUser = { de: texto(atual.pricePerUser), para: novo.pricePerUser };
  }
  if (texto(atual.setupFee) !== novo.setupFee) mudou.setupFee = { de: texto(atual.setupFee), para: novo.setupFee };
  return mudou;
}
