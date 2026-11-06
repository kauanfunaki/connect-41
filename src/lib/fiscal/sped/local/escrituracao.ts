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
import type { BaseLocal, TelaLocal } from "./servidor";

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export async function montarEscrituracao(tela: TelaLocal, base: BaseLocal, estabelecimentoId: string): Promise<Escrituracao> {
  const c = tela.contexto!;
  const prisma = getPrisma();
  const doXml = base.documentos.filter((d) => d.fonte === "xml");
  const fontes = doXml.length
    ? await prisma.spedFiscalDocument.findMany({ where: { tenantId: c.tenantId, id: { in: [...new Set(doXml.map((d) => d.id))] } }, select: { id: true, sourcePath: true } })
    : [];
  const caminhoDe = new Map(fontes.map((f) => [f.id, f.sourcePath]));

  const documentos: DocumentoDaEscrituracao[] = [];
  const participantes: ParticipanteDaEscrituracao[] = [];
  // O mesmo documento escriturado em duas empresas do grupo aparece duas vezes no pacote: lê uma.
  const lidos = new Map<string, ReturnType<typeof lerEscrituracaoXml>>();
  for (const d of doXml) {
    if (!lidos.has(d.id)) {
      const relativo = caminhoDe.get(d.id);
      let lido: ReturnType<typeof lerEscrituracaoXml> = null;
      if (relativo && /\.xml$/i.test(relativo)) {
        try {
          lido = lerEscrituracaoXml(await readFile(caminhoPrivado(relativo), "utf8"));
        } catch (err) {
          console.warn("[sped] escrituração sem o XML", d.id, err instanceof Error ? err.name : "erro");
        }
      }
      lidos.set(d.id, lido);
      if (lido) {
        documentos.push({ id: d.id, ...lido.documento });
        participantes.push(...lido.participantes);
      }
    }
  }
  const todos = juntarParticipantes(participantes);

  const empresa = await prisma.company.findFirst({ where: { id: estabelecimentoId, tenantId: c.tenantId }, select: { cnpj: true, name: true, tradeName: true, zipCode: true, addressStreet: true, addressNumber: true, addressComplement: true, neighborhood: true, phone: true, email: true } });
  const perfil = base.perfis.find((p) => p.companyId === estabelecimentoId);
  const proprio = todos.find((p) => p.documento === digitos(empresa?.cnpj));
  const dia = Number(perfil?.icmsDiaVencimento);
  return {
    estabelecimento: {
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
    },
    participantes: todos,
    documentos,
  };
}
