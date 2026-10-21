// O formulário da Aparência do portal (21/10/2026), fora da leitura do banco
// para o teste não depender do Prisma. A action refaz a validação: o
// formulário não é garantia de nada.

import { GRUPOS_DE_COR, corCanonica, lerCoresDosGrupos, type Aparencia } from "./cores";

/**
 * O formulário da Aparência do portal, lido e validado. A cor principal vazia
 * é o azul do Connect; uma cor de grupo vazia, ou igual à de fábrica, é o padrão.
 */
export function aparenciaDoFormulario(form: { get(nome: string): FormDataEntryValue | null }): Aparencia | { erro: string } {
  const bruta = String(form.get("corPrincipal") ?? "").trim();
  const corPrincipal = bruta ? corCanonica(bruta) : null;
  if (bruta && !corPrincipal) return { erro: "A cor principal não é uma cor válida. Use o formato #RRGGBB." };

  const grupos: Record<string, string> = {};
  for (const grupo of GRUPOS_DE_COR) {
    const texto = String(form.get(`cor_${grupo}`) ?? "").trim();
    if (!texto) continue;
    if (!corCanonica(texto)) return { erro: "Uma das cores dos grupos não é válida. Use o formato #RRGGBB." };
    grupos[grupo] = texto;
  }

  return {
    corPrincipal,
    coresDosGrupos: lerCoresDosGrupos(grupos),
    coresPorGrupo: form.get("coresPorGrupo") === "on",
    logoNoPortal: form.get("logoNoPortal") === "on",
    noConnect: form.get("noConnect") === "on",
  };
}
