"use server";

// A busca da contraparte pelo CNPJ (19/10, pedido 2 do BPO): o setor digita o
// CNPJ ao cadastrar um fornecedor — em Fornecedores e sacados, no lançamento
// manual ou na conciliação — e o resto da ficha vem da Receita.
//
// No servidor, e não no navegador como o cadastro de empresa: assim a mesma
// consulta serve as três telas, e a resposta já volta dizendo se o CNPJ é de
// uma ficha que a empresa tem, para a tela escolher a ficha em vez de criar
// outra igual.

import { getPrisma } from "@/lib/prisma";
import { getAuthContext, canActOnSector } from "@/lib/auth/context";
import { setorDoModulo } from "@/lib/modules";
import { getModuleDef } from "@/lib/module-catalog";
import { lerFichaDaReceita, type FichaDaReceita } from "./fichaDaContraparte";

/** As telas que cadastram contraparte. Quem atua no setor de qualquer uma delas consulta. */
const MODULOS = ["bpo_cadastros", "bpo_lancamentos", "bpo_conciliacao"];

export type ResultadoDaConsultaDeCnpj =
  | {
      ok: true;
      ficha: FichaDaReceita;
      /** A ficha que a empresa já tem com este CNPJ. */
      existente: { id: string; nome: string } | null;
    }
  | { ok: false; erro: string };

export async function consultarCnpjDaContraparte(documento: string, companyId: string | null): Promise<ResultadoDaConsultaDeCnpj> {
  const ctx = await getAuthContext();
  if (!ctx.tenantId) return { ok: false, erro: "Não autenticado." };
  const tenantId = ctx.tenantId;
  const setores = await Promise.all(MODULOS.map(async (m) => (await setorDoModulo(tenantId, m)) ?? getModuleDef(m)?.sectorCode ?? "bpo"));
  if (!setores.some((s) => canActOnSector(ctx, s))) return { ok: false, erro: "Sem permissão." };

  const cnpj = (documento ?? "").replace(/\D/g, "");
  if (cnpj.length === 11) return { ok: false, erro: "CPF não tem consulta pública — preencha o nome à mão." };
  if (cnpj.length !== 14) return { ok: false, erro: "CNPJ precisa de 14 dígitos." };

  let corpo: unknown;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      cache: "no-store",
      // Sem User-Agent a BrasilAPI responde 403 ao fetch do Node — o mesmo
      // cuidado da importação de sócios (25/09).
      headers: { "User-Agent": "Connect41/1.0", Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) return { ok: false, erro: "A Receita não encontrou este CNPJ — confira os dígitos." };
    if (!res.ok) return { ok: false, erro: `A consulta à Receita falhou (HTTP ${res.status}). Preencha à mão ou tente de novo.` };
    corpo = await res.json();
  } catch {
    return { ok: false, erro: "A consulta à Receita não respondeu. Preencha à mão ou tente de novo." };
  }

  const ficha = lerFichaDaReceita(corpo);
  if (!ficha) return { ok: false, erro: "A resposta da Receita veio sem os dados da empresa." };

  const existente = companyId
    ? await getPrisma().financeCounterparty.findFirst({
        where: { tenantId, companyId, document: cnpj },
        select: { id: true, name: true },
      })
    : null;
  return { ok: true, ficha, existente: existente ? { id: existente.id, nome: existente.name } : null };
}
