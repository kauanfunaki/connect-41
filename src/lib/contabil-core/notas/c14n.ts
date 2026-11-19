// A canonicalização XML que a conferência da assinatura usa (Bloco C, Fase C1, 18/11/2026): a C14N 1.0
// inclusiva (a da NF-e e da NFS-e) e a exclusiva, com e sem comentários, como o `signxml` as pede ao
// lxml (`etree.tostring(no, method="c14n", exclusive=..., with_comments=...)`).
//
// O lxml canonicaliza um elemento do meio do documento como se ele fosse a raiz, com as declarações de
// namespace de todos os ancestrais copiadas para ele (`_copyParentNamespaces`), e sem herdar `xml:lang`
// e `xml:space` dos ancestrais. Aqui é igual: o elemento é o ápice, o escopo dele vem dos ancestrais, e
// `ignorar` tira do resultado a assinatura (a transformação `enveloped-signature`).
//
// A C14N 1.1 do `signxml` também sai como 1.0 inclusiva: é o único método `c14n` do lxml.

import type { ElementoXml, NoXml } from "./xmlArvore";

export type OpcoesC14n = {
  exclusiva: boolean;
  comentarios: boolean;
  /** `InclusiveNamespaces/@PrefixList` da exclusiva. */
  prefixosInclusivos?: readonly string[] | null;
  /** Nós que não entram (a assinatura removida pela `enveloped-signature`). */
  ignorar?: ReadonlySet<NoXml>;
  /**
   * O elemento NÃO é a raiz do documento (o `SignedInfo`): o lxml o põe numa "raiz falsa"
   * (`_plainFakeRootDoc`) e a libxml2 erra o namespace padrão dos netos — ver `padraoNaCadeia`.
   */
  raizFalsa?: boolean;
};

/**
 * A libxml2 recusa canonicalizar elemento com declaração de namespace relativa (sem esquema, como
 * `xmlns="nfe"`): o lxml levanta `C14NError`. No ápice valem também as declarações copiadas dos
 * ancestrais.
 */
export class ErroC14n extends Error {}
const ABSOLUTA = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Compara por code point (o `xmlStrcmp` da libxml2 compara os bytes UTF-8). */
function porCodePoint(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}

function escaparTexto(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#xD;");
}

function escaparAtributo(t: string): string {
  return t
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, "&#x9;")
    .replace(/\n/g, "&#xA;")
    .replace(/\r/g, "&#xD;");
}

/** Os namespaces em escopo no elemento (prefixo "" = padrão), do mais próximo para o mais longe. */
export function namespacesEmEscopo(el: ElementoXml): Map<string, string> {
  const escopo = new Map<string, string>();
  for (let atual: ElementoXml | null = el; atual; atual = atual.pai) {
    for (const d of atual.declaracoes) {
      const p = d.prefixo ?? "";
      if (!escopo.has(p)) escopo.set(p, d.uri);
    }
  }
  return escopo;
}

/**
 * O namespace `prefixo` entra na conta da libxml2 para este elemento? (`tmp == ns` em
 * `xmlC14NProcessNamespacesAxis`.)
 *
 * A libxml2 só considera uma declaração da cadeia se o `xmlSearchNs` do elemento devolver o MESMO
 * objeto. Na raiz falsa do lxml, as declarações do ápice e de cima dele são cópias, mas os elementos de
 * baixo continuam apontando para os objetos originais, e o `xmlSearchNs` devolve o namespace em uso
 * pelo primeiro ancestral que usa o prefixo. Daí, do neto do ápice para baixo, o namespace declarado no
 * ápice ou acima dele "some" quando um ancestral o usa: o padrão sai como `xmlns=""` e o próximo que o
 * redeclara volta a declará-lo. É o que o `signxml` assina e confere, e por isso entra aqui igual.
 */
function naCadeia(el: ElementoXml, apice: ElementoXml, prefixo: string): boolean {
  const declara = (e: ElementoXml) => e.declaracoes.some((d) => (d.prefixo ?? "") === prefixo);
  if (el === apice || el.pai === apice || declara(el)) return true;
  for (let p = el.pai; p && p !== apice; p = p.pai) {
    if (declara(p)) return true;
    if ((p.prefixo ?? "") === prefixo && p.ns !== null) {
      // O objeto em uso por `p` é o da declaração mais próxima: dentro do ápice, ou a original perdida.
      for (let dono = p.pai; dono; dono = dono.pai) {
        if (!declara(dono)) continue;
        for (let q: ElementoXml | null = apice; q; q = q.pai) if (q === dono) return false;
        return true;
      }
      return false;
    }
  }
  return true;
}

/** Os prefixos que o elemento usa de fato (o próprio e os dos atributos; "" = padrão). */
function prefixosUsados(el: ElementoXml): Set<string> {
  const usados = new Set<string>([el.prefixo ?? ""]);
  for (const a of el.atributos) if (a.prefixo && a.prefixo !== "xml") usados.add(a.prefixo);
  return usados;
}

/** A forma canônica do elemento, em UTF-8. */
export function canonicalizar(apice: ElementoXml, opcoes: OpcoesC14n): Uint8Array {
  const partes: string[] = [];
  // O lxml repassa a lista à libxml2 sem tratar `#default`: o padrão nunca entra por ela.
  const inclusivos = new Set(opcoes.prefixosInclusivos ?? []);

  // Pilha explícita: o documento pode ser fundo. Na inclusiva, `segmentoPai` é o que o pai pôs na pilha
  // de namespaces da libxml2 (o "já declarado" compara com ele) e `padraoPilha`, o último padrão da pilha.
  type Quadro = {
    no: NoXml;
    escopoPai: Map<string, string>;
    renderizadoPai: Map<string, string>;
    segmentoPai: Map<string, string>;
    padraoPilha: string | undefined;
    fechar?: string;
  };
  const pilha: Quadro[] = [{ no: apice, escopoPai: new Map(), renderizadoPai: new Map(), segmentoPai: new Map(), padraoPilha: undefined }];
  while (pilha.length) {
    const q = pilha.pop()!;
    if (q.fechar !== undefined) {
      partes.push(q.fechar);
      continue;
    }
    const no = q.no;
    if (opcoes.ignorar?.has(no)) continue;
    if (no.tipo === "texto") {
      partes.push(escaparTexto(no.valor));
      continue;
    }
    if (no.tipo === "comentario") {
      if (opcoes.comentarios) partes.push(`<!--${no.valor}-->`);
      continue;
    }
    if (no.tipo === "instrucao") {
      partes.push(no.dados ? `<?${no.alvo} ${no.dados}?>` : `<?${no.alvo}?>`);
      continue;
    }
    const el = no;
    const declaradas = el === apice ? [...namespacesEmEscopo(el).values()] : el.declaracoes.map((d) => d.uri);
    if (declaradas.some((uri) => uri !== "" && !ABSOLUTA.test(uri))) throw new ErroC14n("C14N failed");
    const escopo = el === apice ? namespacesEmEscopo(el) : new Map(q.escopoPai);
    if (el !== apice) for (const d of el.declaracoes) escopo.set(d.prefixo ?? "", d.uri);
    escopo.delete("xml");

    const renderizado = new Map(q.renderizadoPai);
    const declarar: [string, string][] = [];
    let segmento = q.segmentoPai;
    let padraoPilha = q.padraoPilha;
    if (opcoes.exclusiva) {
      const candidatos = [...new Set([...prefixosUsados(el), ...[...inclusivos].filter((p) => escopo.has(p))])];
      for (const p of candidatos) {
        const uri = escopo.get(p) ?? "";
        const anterior = q.renderizadoPai.get(p);
        if (p === "") {
          // `xmlns=""` só quando desfaz um padrão que um ancestral de saída declarou.
          if (uri === "" && (anterior === undefined || anterior === "")) continue;
        } else if (uri === "") continue;
        if (anterior === uri) continue;
        declarar.push([p, uri]);
        renderizado.set(p, uri);
      }
    } else {
      // `xmlC14NProcessNamespacesAxis`.
      segmento = new Map();
      for (const [p, uri] of escopo) if (!opcoes.raizFalsa || naCadeia(el, apice, p)) segmento.set(p, uri);
      for (const [p, uri] of segmento) {
        if (p === "" && uri === "") {
          if ((q.padraoPilha ?? "") !== "") declarar.push(["", ""]);
        } else if (uri !== "" && q.segmentoPai.get(p) !== uri) declarar.push([p, uri]);
      }
      if (!segmento.has("") && (q.padraoPilha ?? "") !== "") declarar.push(["", ""]);
      if (segmento.has("")) padraoPilha = segmento.get("");
    }
    declarar.sort((a, b) => porCodePoint(a[0], b[0]));

    const atributos = [...el.atributos].sort(
      (a, b) => porCodePoint(a.ns ?? "", b.ns ?? "") || porCodePoint(a.local, b.local),
    );
    let abre = `<${el.qname}`;
    for (const [p, uri] of declarar) abre += p ? ` xmlns:${p}="${escaparAtributo(uri)}"` : ` xmlns="${escaparAtributo(uri)}"`;
    for (const a of atributos) abre += ` ${a.qname}="${escaparAtributo(a.valor)}"`;
    partes.push(abre + ">");

    const quadro = { escopoPai: escopo, renderizadoPai: renderizado, segmentoPai: segmento, padraoPilha };
    pilha.push({ no: el, ...quadro, fechar: `</${el.qname}>` });
    for (let k = el.filhos.length - 1; k >= 0; k--) pilha.push({ no: el.filhos[k], ...quadro });
  }
  return new TextEncoder().encode(partes.join(""));
}
