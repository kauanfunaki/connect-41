// "Ler do PDF" na licença (04/11/2026) — o alvará, a licença sanitária, a do
// Bombeiros, de qualquer cidade. Funções puras: o schema que a IA preenche, o
// prompt e a conferência do que voltou. A chamada mora em
// `src/app/(app)/licencas/actions.ts`, e o mesmo desenho é o da leitura do
// boleto (`financeiro/leituraDoBoleto.ts`).
//
// Nasceu do captcha do alvará de Curitiba: o robô não passa da caixa "Não sou
// um robô", então a pessoa consulta à mão e sobe o PDF, e o Connect preenche a
// licença. Serve igual para qualquer município, que robô nenhum alcança.
//
// A IA lê; o código confere. A pessoa revisa no formulário antes de salvar — o
// "Salvar" é a confirmação, e o PDF só vai para os Arquivos junto com ele.

import { lerDocumentoFiscal } from "@/lib/companyTaxId";
import { arquivar } from "./arquivamento";
import { MAX_NUMERO, MAX_TIPO } from "./licenca-form";

export const AGENTE_DA_LICENCA = "leitor_de_licenca";

/** Campos que o formulário marca com "confira". */
export type CampoDaLicencaAConferir = "numero" | "emissao" | "validade";

export type LeituraDaLicenca = {
  ehLicenca: boolean;
  /** Como o documento se chama ("Alvará de Licença de Localização"), para sugerir o tipo. */
  tipo: string | null;
  numero: string | null;
  emissaoKey: string | null;
  validadeKey: string | null;
  /** O documento diz que não vence (inscrição, "validade indeterminada"). */
  semValidade: boolean;
  orgao: string | null;
  conferir: CampoDaLicencaAConferir[];
  /** Escritos pelo código, para a pessoa ler antes de salvar. */
  avisos: string[];
};

const campo = (descricao: string) => ({ type: "string", description: descricao });

export const SCHEMA_DA_LICENCA: Record<string, unknown> = {
  type: "object",
  properties: {
    tipoDoDocumento: {
      type: "string",
      enum: ["licenca", "outro"],
      description:
        "licenca: alvará, licença ou autorização emitida por um órgão para o estabelecimento funcionar (alvará de funcionamento ou de localização, licença sanitária, licença ambiental, certificado do Corpo de Bombeiros, inscrição municipal). outro: qualquer outra coisa",
    },
    nomeDoDocumento: campo("O título do documento como está impresso (ex.: 'Alvará de Licença de Localização'). Vazio se não houver"),
    orgao: campo("O órgão que emitiu (prefeitura, secretaria, Corpo de Bombeiros), como impresso. Vazio se não houver"),
    titular: campo("Razão social ou nome do titular da licença. Vazio se não houver"),
    documentoDoTitular: campo("CNPJ ou CPF do titular, só números. Vazio se não houver"),
    numero: campo("O número do alvará ou da licença, como impresso. Não o protocolo nem a inscrição municipal, a não ser que o documento seja a própria inscrição. Vazio se não houver"),
    emissao: campo("Data de emissão ou de expedição, AAAA-MM-DD. Vazio se não houver"),
    validade: campo("Data em que a licença deixa de valer (válido até, vencimento), AAAA-MM-DD. Vazio se não houver ou se for indeterminada"),
    validadeIndeterminada: { type: "boolean", description: "true se o documento disser que não tem prazo (validade indeterminada, sem vencimento)" },
  },
  required: ["tipoDoDocumento", "nomeDoDocumento", "orgao", "titular", "documentoDoTitular", "numero", "emissao", "validade", "validadeIndeterminada"],
  additionalProperties: false,
};

export const SISTEMA_DA_LICENCA =
  "Você lê alvarás e licenças de funcionamento brasileiros para o setor Societário de um escritório de contabilidade, " +
  "que vai registrar a licença do cliente. Copie nomes, números e datas exatamente como estão impressos — " +
  "não calcule, não corrija e não invente: campo que o documento não traz fica vazio. " +
  "A validade é a data impressa como 'válido até' ou 'vencimento'; não a calcule a partir da emissão. " +
  "Se o arquivo não for uma licença, diga no tipo do documento e deixe o resto vazio.";

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

function data(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[0]}T12:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== m[0] ? null : m[0];
}

const dataBr = (key: string) => key.split("-").reverse().join("/");

/**
 * Confere o que a IA devolveu e monta o que preenche o formulário.
 *
 * `documentoDaEmpresa` é o CNPJ/CPF da empresa da licença: documento de outro
 * titular ganha aviso — guardar o alvará de um cliente na ficha de outro é o
 * erro que mais custa achar depois. A filial do mesmo grupo (mesma raiz) não
 * conta.
 */
export function lerRespostaDaLicenca(bruto: unknown, hojeKey: string, documentoDaEmpresa: string | null): LeituraDaLicenca {
  const o = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  const conferir = new Set<CampoDaLicencaAConferir>();

  const ehLicenca = o.tipoDoDocumento === "licenca";
  if (!ehLicenca) avisos.push("A IA não reconheceu este arquivo como alvará ou licença. Confira tudo antes de salvar.");

  const titular = lerDocumentoFiscal(texto(o.documentoDoTitular, 30) ?? "");
  const mesmaEmpresa = (a: string, b: string) => a === b || (a.length === 14 && b.length === 14 && a.slice(0, 8) === b.slice(0, 8));
  if (titular && documentoDaEmpresa && !mesmaEmpresa(titular.digitos, documentoDaEmpresa)) {
    const nome = texto(o.titular, 120);
    avisos.push(`O titular deste documento é ${nome ? `${nome} (${titular.digitos})` : titular.digitos}, não a empresa desta licença. Confira a empresa.`);
  }

  const numero = texto(o.numero, MAX_NUMERO);
  if (!numero) conferir.add("numero");

  // Emissão no futuro é leitura errada.
  let emissaoKey = data(o.emissao);
  if (emissaoKey && emissaoKey > hojeKey) {
    avisos.push(`A IA leu a emissão ${dataBr(emissaoKey)}, que ainda não chegou. Ficou em branco.`);
    emissaoKey = null;
  }
  if (!emissaoKey) conferir.add("emissao");

  const semValidade = o.validadeIndeterminada === true;
  let validadeKey = semValidade ? null : data(o.validade);
  if (validadeKey && emissaoKey && validadeKey < emissaoKey) {
    avisos.push(`A IA leu a validade ${dataBr(validadeKey)}, antes da emissão. Ficou em branco.`);
    validadeKey = null;
  }
  if (!validadeKey && !semValidade) conferir.add("validade");
  if (validadeKey && validadeKey < hojeKey) avisos.push(`Pelo documento, a licença venceu em ${dataBr(validadeKey)}.`);

  return {
    ehLicenca,
    tipo: texto(o.nomeDoDocumento, MAX_TIPO),
    numero,
    emissaoKey,
    validadeKey,
    semValidade,
    orgao: texto(o.orgao, 120),
    conferir: [...conferir],
    avisos,
  };
}

/** O nome do PDF nos Arquivos, pela convenção do setor: `<EMPRESA> - <tipo> <ano>.pdf`. */
export function nomeDoPdfDaLicenca(empresaNome: string, tipo: string, ano: number): string {
  return `${arquivar({ empresaNome, ano, tipo, orgao: "Licenças" }).nome}.pdf`;
}
