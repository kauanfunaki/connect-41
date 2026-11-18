// A natureza jurídica da empresa (18/11/2026, funcionalidade-780): o código e a
// descrição da tabela da Receita, guardados juntos como o cartão CNPJ mostra —
// "206-2 - Sociedade Empresária Limitada". Regra pura, sem Prisma: usada pelo
// formulário (consulta do CNPJ) e pela action.
//
// Uma coluna só, e não código e descrição separados: é assim que a natureza
// aparece em todo documento da Receita e da Junta, é o que se copia e se
// confere, e o código continua legível no começo do texto. O CNAE principal
// também é um texto já formatado.

/** Tamanho da coluna `companies.naturezaJuridica`. */
export const NATUREZA_JURIDICA_MAX = 120;

/** "2062" (ou 2062) no formato da tabela da Receita: "206-2". Fora disso, null. */
export function formatarCodigoDaNatureza(codigo: string | number | null | undefined): string | null {
  const d = String(codigo ?? "").replace(/\D/g, "");
  if (d.length !== 4 || d === "0000") return null;
  return `${d.slice(0, 3)}-${d.slice(3)}`;
}

function textoLimpo(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t || null;
}

/**
 * A natureza jurídica da resposta da consulta do CNPJ (BrasilAPI:
 * `codigo_natureza_juridica` 2062 e `natureza_juridica` "Sociedade Empresária
 * Limitada") como o cadastro guarda: "206-2 - Sociedade Empresária Limitada".
 * Aceita também a descrição que já vem com o código na frente, como outras
 * consultas devolvem. Sem nenhum dos dois, null.
 */
export function naturezaJuridicaDaConsulta(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== "object") return null;
  const c = corpo as Record<string, unknown>;
  let descricao = textoLimpo(c.natureza_juridica);
  let codigo = formatarCodigoDaNatureza(c.codigo_natureza_juridica as string | number | null | undefined);

  // "206-2 - Sociedade Empresária Limitada" já pronto na descrição.
  const comCodigo = descricao ? /^(\d{3})-?(\d)\s*[-–—]\s*(.+)$/.exec(descricao) : null;
  if (comCodigo) {
    codigo ??= `${comCodigo[1]}-${comCodigo[2]}`;
    descricao = comCodigo[3].trim();
  }

  const texto = codigo && descricao ? `${codigo} - ${descricao}` : codigo ?? descricao;
  return texto ? texto.slice(0, NATUREZA_JURIDICA_MAX) : null;
}

/** O campo do formulário, sem espaços sobrando; vazio é null. */
export function naturezaJuridicaDoFormulario(form: FormData): string | null {
  return textoLimpo(form.get("naturezaJuridica"));
}

/** Confere o que veio preenchido; vazio é válido. */
export function erroDaNaturezaJuridica(natureza: string | null): string | null {
  if (natureza && natureza.length > NATUREZA_JURIDICA_MAX) {
    return `Natureza jurídica com mais de ${NATUREZA_JURIDICA_MAX} caracteres.`;
  }
  return null;
}
