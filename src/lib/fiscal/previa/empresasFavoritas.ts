import { normalizar } from "@/lib/buscaDeTelas";
import type { Cenario } from "./cenario";

type Empresa = Cenario["empresas"][number];
export function chaveDasEmpresasFavoritas(tenantId: string, userId: string) {
  return `connect41:fiscal:empresas-favoritas:v1:${encodeURIComponent(tenantId)}:${encodeURIComponent(userId)}`;
}

export function lerEmpresasFavoritas(bruto: string | null): string[] {
  try {
    const valor: unknown = JSON.parse(bruto ?? "null");
    return Array.isArray(valor) ? [...new Set(valor.filter((id): id is string => typeof id === "string" && id.length > 0))].slice(0, 1000) : [];
  } catch { return []; }
}

/** Normalização e ordenação ocorrem uma vez quando os cadastros mudam. */
export function indexarEmpresas(empresas: readonly Empresa[]) {
  return empresas.map((empresa) => ({ empresa, nome: normalizar(empresa.nome), texto: normalizar(`${empresa.nome} ${empresa.regime} ${empresa.estabelecimentos.map((e) => e.cnpj.replace(/\D/g, "")).join(" ")}`) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Limita os elementos renderizados, sem excluir favoritos no fim da lista. */
export function buscarEmpresas(indice: ReturnType<typeof indexarEmpresas>, busca: string, favoritas: readonly string[], limite = 50) {
  const texto = normalizar(busca);
  const termos = (/^[\d\s./-]+$/.test(texto) ? texto.replace(/\D/g, "") : texto).split(/\s+/).filter(Boolean);
  const ids = new Set(favoritas);
  const fixadas: Empresa[] = [];
  const outras: Empresa[] = [];
  let total = 0;
  for (const item of indice) {
    if (!termos.every((termo) => item.texto.includes(termo))) continue;
    total += 1;
    const lista = ids.has(item.empresa.id) ? fixadas : outras;
    if (lista.length < limite) lista.push(item.empresa);
  }
  return { empresas: [...fixadas, ...outras].slice(0, limite), total };
}
