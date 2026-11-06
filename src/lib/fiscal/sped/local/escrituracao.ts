// O bloco `escrituracao` do pacote do Gerar SPED (06/11/2026): o que o EFD
// ICMS/IPI exige e o pacote v1 não trazia. Sem ele, o agente do motor recusa a
// geração (sped_generator#59, `docs/CONNECT-PACOTE-ICMS.md`).
//
// - Documentos e participantes: relidos do XML que o Connect guardou na
//   importação (`SpedFiscalDocument.sourcePath`), pelo leitor puro
//   `escrituracaoXml.ts`. Documento sem XML guardado (veio do TXT, ou o arquivo
//   saiu do disco) fica fora do bloco, e o motor diz qual falta.
// - Estabelecimento: o cadastro da empresa (endereço, telefone, e-mail) com o
//   perfil fiscal (município IBGE, perfil, atividade, contador, ICMS). O que o
//   cadastro não tem e o XML da própria empresa tem (endereço, município) entra
//   pelo XML. Uma fonte só: o Connect.

import "server-only";
import { readFile } from "node:fs/promises";
import { getPrisma } from "@/lib/prisma";
import { caminhoPrivado } from "./fila";
import { juntarParticipantes, lerEscrituracaoXml, type DocumentoDaEscrituracao, type Escrituracao, type ParticipanteDaEscrituracao } from "./escrituracaoXml";
import { faltasDoEstabelecimento, type GrupoDeFaltas } from "./conferenciaDoArquivo";
import type { BaseLocal, TelaLocal } from "./servidor";

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
type Lido = ReturnType<typeof lerEscrituracaoXml>;

/** Os XMLs guardados dos documentos do pacote, um por documento, na ordem do pacote. `parar` encerra a leitura cedo. */
async function lerXmlsGuardados(tela: TelaLocal, base: BaseLocal, parar?: (lido: NonNullable<Lido>) => boolean): Promise<Map<string, Lido>> {
  const c = tela.contexto!;
  const doXml = base.documentos.filter((d) => d.fonte === "xml");
  const fontes = doXml.length
    ? await getPrisma().spedFiscalDocument.findMany({ where: { tenantId: c.tenantId, id: { in: [...new Set(doXml.map((d) => d.id))] } }, select: { id: true, sourcePath: true } })
    : [];
  const caminhoDe = new Map(fontes.map((f) => [f.id, f.sourcePath]));
  // O mesmo documento escriturado em duas empresas do grupo aparece duas vezes no pacote: lê uma.
  const lidos = new Map<string, Lido>();
  for (const d of doXml) {
    if (lidos.has(d.id)) continue;
    const relativo = caminhoDe.get(d.id);
    let lido: Lido = null;
    if (relativo && /\.xml$/i.test(relativo)) {
      try {
        lido = lerEscrituracaoXml(await readFile(caminhoPrivado(relativo), "utf8"));
      } catch (err) {
        console.warn("[sped] escrituração sem o XML", d.id, err instanceof Error ? err.name : "erro");
      }
    }
    lidos.set(d.id, lido);
    if (lido && parar?.(lido)) break;
  }
  return lidos;
}

async function montarEstabelecimento(tela: TelaLocal, base: BaseLocal, estabelecimentoId: string, participantes: readonly ParticipanteDaEscrituracao[]): Promise<Escrituracao["estabelecimento"]> {
  const empresa = await getPrisma().company.findFirst({ where: { id: estabelecimentoId, tenantId: tela.contexto!.tenantId }, select: { cnpj: true, name: true, tradeName: true, zipCode: true, addressStreet: true, addressNumber: true, addressComplement: true, neighborhood: true, phone: true, email: true } });
  const perfil = base.perfis.find((p) => p.companyId === estabelecimentoId);
  const proprio = participantes.find((p) => p.documento === digitos(empresa?.cnpj));
  const dia = Number(perfil?.icmsDiaVencimento);
  return {
    razaoSocial: empresa?.name ?? "",
    nomeFantasia: empresa?.tradeName ?? "",
    codMun: perfil?.codigoMunicipio || proprio?.codMun || "",
    cep: digitos(empresa?.zipCode),
    endereco: empresa?.addressStreet || proprio?.endereco || "",
    numero: empresa?.addressNumber || proprio?.numero || "",
    complemento: empresa?.addressComplement || proprio?.complemento || "",
    bairro: empresa?.neighborhood || proprio?.bairro || "",
    telefone: digitos(empresa?.phone),
    email: empresa?.email ?? "",
    indPerfil: perfil?.indPerfil ?? "",
    indAtiv: perfil?.indAtiv ?? "",
    contador: { nome: perfil?.contadorNome ?? "", cpf: perfil?.contadorCpf ?? "", crc: perfil?.contadorCrc ?? "" },
    icms: { codReceita: perfil?.icmsCodReceita ?? "", diaVencimento: Number.isInteger(dia) && dia >= 1 && dia <= 31 ? dia : null },
    codCta: perfil?.codCta ?? "",
    codInf: perfil?.codInf ?? "",
  };
}

export async function montarEscrituracao(tela: TelaLocal, base: BaseLocal, estabelecimentoId: string): Promise<Escrituracao> {
  const lidos = await lerXmlsGuardados(tela, base);
  const documentos: DocumentoDaEscrituracao[] = [];
  const participantes: ParticipanteDaEscrituracao[] = [];
  for (const [id, lido] of lidos) {
    if (!lido) continue;
    documentos.push({ id, ...lido.documento });
    participantes.push(...lido.participantes);
  }
  const todos = juntarParticipantes(participantes);
  return { estabelecimento: await montarEstabelecimento(tela, base, estabelecimentoId, todos), participantes: todos, documentos };
}

/**
 * O que falta no cadastro do estabelecimento para o arquivo, para a tela do
 * Gerar avisar antes do pedido. Leve: lê XML guardado só até achar um em que a
 * própria empresa aparece (o endereço e o município que o cadastro não tem vêm
 * de lá), e não confere os documentos — isso fica para o pedido.
 */
export async function faltasDoCadastroParaGerar(tela: TelaLocal, base: BaseLocal, estabelecimentoId: string, cnpj: string): Promise<GrupoDeFaltas[]> {
  const lidos = await lerXmlsGuardados(tela, base, (lido) => lido.participantes.some((p) => p.documento === cnpj));
  const participantes = [...lidos.values()].flatMap((l) => l?.participantes ?? []);
  const est = await montarEstabelecimento(tela, base, estabelecimentoId, juntarParticipantes(participantes));
  const perfil = base.perfis.find((p) => p.companyId === estabelecimentoId);
  return faltasDoEstabelecimento(est, perfil?.inscricaoEstadual ?? "");
}
