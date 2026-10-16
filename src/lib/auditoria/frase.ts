// A frase de cada ação da linha do tempo: "Carla Mendes editou o documento
// fiscal NF-e 4.512 da Padaria Pão de Mel Ltda" — com o nome do cadastro e o
// da empresa como link quando o cadastro ainda existe.
//
// Devolve pedaços, não HTML: a tela desenha cada pedaço (negrito, link, cinza).
// Puro, sem banco.

import { ACOES, descricaoDaAcao, nomeDoTipo } from "./acoes";
import { nomeNosDetalhes } from "./metadados";

export type PedacoDaFrase =
  | { tipo: "texto"; texto: string }
  | { tipo: "forte"; texto: string }
  | { tipo: "link"; texto: string; href: string }
  | { tipo: "mudo"; texto: string };

/** O cadastro da ação, como o banco o encontrou — `null` quando não existe mais (ou o tipo não tem tela). */
export type AlvoEncontrado = { nome: string | null; href: string | null };

export type EmpresaDoEvento = { nome: string; href: string | null };

export type EventoParaFrase = {
  acao: string;
  entityType: string | null;
  metadata: unknown;
  /** Nome de quem agiu: o atual do usuário, ou o guardado na linha (`actorName`). */
  ator: string | null;
  /** O usuário foi excluído: a linha ficou sem o vínculo e mostra o nome guardado. */
  atorExcluido: boolean;
  alvo: AlvoEncontrado | null;
  empresa: EmpresaDoEvento | null;
};

function nomeOuLink(nome: string, href: string | null): PedacoDaFrase {
  return href ? { tipo: "link", texto: nome, href } : { tipo: "forte", texto: nome };
}

/**
 * Monta a frase. O nome do cadastro vem do banco (se ainda existe) ou do que
 * a linha guardou; a empresa só entra quando o cadastro não é a própria
 * empresa e a frase ainda não termina falando dela.
 */
export function fraseDoEvento(ev: EventoParaFrase): PedacoDaFrase[] {
  const d = descricaoDaAcao(ev.acao);
  const pedacos: PedacoDaFrase[] = [{ tipo: "forte", texto: ev.ator?.trim() || "Usuário sem nome" }];
  if (ev.atorExcluido) pedacos.push({ tipo: "mudo", texto: " (excluído)" });
  pedacos.push({ tipo: "texto", texto: ` ${d.frase}` });

  if (d.comNome !== false) {
    const nome = ev.alvo?.nome ?? nomeNosDetalhes(ev.metadata, d.chaveDoNome);
    if (nome) {
      pedacos.push({ tipo: "texto", texto: " " }, nomeOuLink(nome, ev.alvo?.href ?? null));
    } else if (!(ev.acao in ACOES)) {
      // Código antigo, sem frase: diz ao menos o tipo do cadastro.
      pedacos.push({ tipo: "texto", texto: ` ${nomeDoTipo(ev.entityType) ?? "um cadastro"}` });
    }
  }

  const frasesDaEmpresa = /\b(da|para a|na) empresa$/.test(d.frase);
  if (ev.empresa && ev.entityType !== "Company" && !frasesDaEmpresa) {
    pedacos.push({ tipo: "texto", texto: " da " }, nomeOuLink(ev.empresa.nome, ev.empresa.href));
  }
  return pedacos;
}

/** A frase em texto corrido — para a dica e para os testes. */
export function fraseEmTexto(pedacos: readonly PedacoDaFrase[]): string {
  return pedacos.map((p) => p.texto).join("");
}
