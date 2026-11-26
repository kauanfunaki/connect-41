// A prévia da "Nova NFS-e" (melhoria-855, 26/11/2026): a janela mostra a nota
// ao lado do formulário, atualizada a cada campo, e a confirmação de ação real
// fica embaixo dela — no lugar do diálogo que repetia tudo depois.
//
// Regras puras, sem servidor: o componente monta a prévia, a sugestão dos
// códigos fiscais e o que falta preencher por aqui, e o teste confere sem tela.
// A validação que vale continua sendo a do servidor (`validarPedido`).

import { formatCnpj, formatCpf, formatarCompetenciaNumerica, formatarNumero } from "@/lib/format";
import { centavosDeTexto } from "@/lib/financeiro/manual";
import type { ClienteDoOmie, ServicoDoOmie } from "@/lib/integracoes/omie/emissao";

/** Os campos do formulário como a pessoa digitou. */
export type CamposDaNfse = {
  tomador: string;
  servico: string;
  valor: string;
  descricao: string;
  categoria: string;
  codigoMunicipal: string;
  codigoLC116: string;
};

export const CAMPOS_VAZIOS: CamposDaNfse = {
  tomador: "",
  servico: "",
  valor: "",
  descricao: "",
  categoria: "",
  codigoMunicipal: "",
  codigoLC116: "",
};

/** A categoria sugerida pelas OS da empresa (a mais recente não cancelada). */
export type CategoriaSugerida = { codigo: string; numeroOS: string } | null;

/** CNPJ ou CPF formatado; só dígitos no cadastro do Omie. */
export function documentoFormatado(doc: string | null | undefined): string | null {
  if (!doc) return null;
  return doc.length === 11 ? formatCpf(doc) : formatCnpj(doc);
}

/** 1234.5 → "1.234,50", para o campo de valor. */
export function valorParaCampo(n: number): string {
  return formatarNumero(n, 2);
}

/** O serviço não tem código municipal nem LC 116 no cadastro do Omie: a prefeitura pode recusar. */
export function servicoSemCodigoFiscal(servico: ServicoDoOmie | null): boolean {
  return Boolean(servico && !servico.codigoMunicipal && !servico.codigoLC116);
}

/**
 * Os códigos que entram já preenchidos ao escolher o serviço: os da OS mais
 * recente com ele, quando o cadastro do Omie não tem nenhum. Antes era preciso
 * clicar em "Usar o da OS" em cada campo; agora a sugestão já vem, e a pessoa
 * troca ou limpa. Serviço com código no cadastro não leva código nesta nota.
 */
export function codigosSugeridos(servico: ServicoDoOmie | null): { codigoMunicipal: string; codigoLC116: string } {
  if (!servicoSemCodigoFiscal(servico) || !servico?.naUltimaOS) return { codigoMunicipal: "", codigoLC116: "" };
  return { codigoMunicipal: servico.naUltimaOS.codigoMunicipal ?? "", codigoLC116: servico.naUltimaOS.codigoLC116 ?? "" };
}

/** A categoria ao escolher o serviço: a do cadastro dele, senão a sugerida pelas OS. */
export function categoriaInicial(servico: ServicoDoOmie | null, sugerida: CategoriaSugerida): string {
  if (!servico) return "";
  return servico.categoria ?? sugerida?.codigo ?? "";
}

/** De onde veio a categoria no campo — para o selo "sugerida" e a dica. */
export type OrigemDaCategoria = "servico" | "sugerida" | "digitada" | "vazia";

export function origemDaCategoria(servico: ServicoDoOmie | null, sugerida: CategoriaSugerida, categoria: string): OrigemDaCategoria {
  const c = categoria.trim();
  if (!c) return "vazia";
  if (servico?.categoria && c === servico.categoria) return "servico";
  if (!servico?.categoria && sugerida && c === sugerida.codigo) return "sugerida";
  return "digitada";
}

/**
 * O resumo na linha do recolhível "Códigos fiscais desta nota" (só aparece
 * para o serviço sem código no cadastro): o que vai sem precisar abrir. A tela
 * põe "sem código no Omie · " na frente quando cabe.
 */
export function resumoDosCodigos(servico: ServicoDoOmie | null, codigoMunicipal: string, codigoLC116: string): string {
  const municipal = codigoMunicipal.trim();
  const lc116 = codigoLC116.trim();
  if (!municipal && !lc116) return "nenhum informado";
  const os = servico?.naUltimaOS;
  if (os && municipal === (os.codigoMunicipal ?? "") && lc116 === (os.codigoLC116 ?? "")) {
    return `sugeridos os da OS ${os.numeroOS}`;
  }
  return "informados para esta nota";
}

/** O que falta para a nota poder sair, na ordem dos campos. */
export function pendenciasDoPedido(p: {
  cliente: ClienteDoOmie | null;
  servico: ServicoDoOmie | null;
  valor: string;
  categoria: string;
}): string[] {
  const falta: string[] = [];
  if (!p.cliente) falta.push("tomador");
  if (!p.servico) falta.push("serviço");
  const centavos = centavosDeTexto(p.valor);
  if (centavos === null || centavos <= 0) falta.push("valor");
  if (!p.categoria.trim()) falta.push("categoria no Omie");
  return falta;
}

/** "Falta preencher: tomador e valor." — `null` quando não falta nada. */
export function fraseDoQueFalta(falta: string[]): string | null {
  if (falta.length === 0) return null;
  const lista = falta.length === 1 ? falta[0] : `${falta.slice(0, -1).join(", ")} e ${falta[falta.length - 1]}`;
  return `Falta preencher: ${lista}.`;
}

/**
 * A "assinatura" do que vai na nota. A caixa "Entendo que isto emite…" vale
 * para a nota como estava quando foi marcada: mudou um campo, a caixa desmarca
 * e a pessoa confirma de novo, olhando a prévia nova. Espaço nas pontas não
 * conta — é o que o servidor também descarta.
 */
export function assinaturaDoPedido(campos: CamposDaNfse, competencia: string): string {
  return JSON.stringify([
    campos.tomador.trim(),
    campos.servico.trim(),
    centavosDeTexto(campos.valor),
    campos.descricao.trim(),
    campos.categoria.trim(),
    campos.codigoMunicipal.trim(),
    campos.codigoLC116.trim(),
    competencia,
  ]);
}

export type PreviaDaNfse = {
  prestador: { nome: string; documento: string | null };
  tomador: { nome: string; documento: string | null } | null;
  /** O texto da nota: o escrito aqui, senão a descrição do serviço no cadastro do Omie. */
  discriminacao: { texto: string; origem: "nota" | "cadastro" } | null;
  /** "Municipal 06475 · LC 116 23.01 · Categoria 1.01.02", ou `null` sem nada ainda. */
  codigos: string | null;
  /** Serviço escolhido sem código municipal nem LC 116 — nem no cadastro, nem informado. */
  semCodigo: boolean;
  valorCentavos: number | null;
  /** "11/2026". */
  competencia: string;
};

/** A nota como vai sair, a partir do que está no formulário. */
export function montarPrevia(p: {
  prestador: { nome: string; cnpj: string | null };
  cliente: ClienteDoOmie | null;
  servico: ServicoDoOmie | null;
  campos: CamposDaNfse;
  competencia: string;
}): PreviaDaNfse {
  const { servico, campos } = p;
  const descricao = campos.descricao.trim();
  // Com código no cadastro, vale o do cadastro; sem ele, o informado para esta nota.
  const semNoCadastro = servicoSemCodigoFiscal(servico);
  const municipal = servico ? (semNoCadastro ? campos.codigoMunicipal.trim() : (servico.codigoMunicipal ?? "")) : "";
  const lc116 = servico ? (semNoCadastro ? campos.codigoLC116.trim() : (servico.codigoLC116 ?? "")) : "";
  const categoria = campos.categoria.trim();
  const partes = [municipal && `Municipal ${municipal}`, lc116 && `LC 116 ${lc116}`, categoria && `Categoria ${categoria}`].filter(Boolean);
  const centavos = centavosDeTexto(campos.valor);
  return {
    prestador: { nome: p.prestador.nome, documento: documentoFormatado(p.prestador.cnpj) },
    tomador: p.cliente ? { nome: p.cliente.nome, documento: documentoFormatado(p.cliente.documento) } : null,
    discriminacao: descricao
      ? { texto: descricao, origem: "nota" }
      : servico
        ? { texto: servico.descricao, origem: "cadastro" }
        : null,
    codigos: partes.length > 0 ? partes.join(" · ") : null,
    semCodigo: Boolean(servico) && !municipal && !lc116,
    valorCentavos: centavos !== null && centavos > 0 ? centavos : null,
    competencia: formatarCompetenciaNumerica(p.competencia),
  };
}
