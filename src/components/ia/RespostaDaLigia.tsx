"use client";

import { Fragment } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { AvatarImage } from "@/components/shared/AvatarImage";
import type { Citado } from "@/lib/ia/chat/citacoes";
import { lerMarkdown, type Bloco, type Trecho } from "@/lib/ia/chat/markdown";

/**
 * O texto de uma resposta da Lígia, com negrito, listas, títulos pequenos e
 * tabela simples (13/10/2026 — pedido do Kauan: respostas longas sem destaque
 * nem estrutura eram difíceis de ler). Quem lê o Markdown é
 * `src/lib/ia/chat/markdown.ts`; aqui só se desenha, sempre com elementos do
 * React — HTML que viesse do modelo sai como texto, nunca como marcação.
 *
 * Link só para dentro do Connect, pelo roteador do app: sozinho na linha vira
 * botão ("Abrir as pendências aguardando o cliente"), no meio da frase vira
 * texto azul. `aoNavegar` fecha o chat para a tela aparecer (no celular o
 * painel cobre tudo).
 */
export function RespostaDaLigia({
  texto,
  citados = {},
  aoNavegar,
}: {
  texto: string;
  citados?: Record<string, Citado>;
  aoNavegar?: () => void;
}) {
  const blocos = lerMarkdown(texto);
  return (
    <div className="flex flex-col gap-1.5">
      {blocos.map((b, i) => (
        <BlocoDaResposta key={i} bloco={b} citados={citados} aoNavegar={aoNavegar} />
      ))}
    </div>
  );
}

function BlocoDaResposta({ bloco: b, citados, aoNavegar }: { bloco: Bloco; citados: Record<string, Citado>; aoNavegar?: () => void }) {
  const trechos = (ts: Trecho[]) => <Trechos trechos={ts} citados={citados} aoNavegar={aoNavegar} />;
  switch (b.t) {
    case "paragrafo":
      return <p>{trechos(b.filhos)}</p>;
    case "titulo":
      return <h3 className="mt-1.5 text-ui font-semibold text-fg first:mt-0">{trechos(b.filhos)}</h3>;
    case "lista": {
      const Tag = b.ordenada ? "ol" : "ul";
      return (
        <Tag className="flex flex-col gap-1" start={b.ordenada && b.inicio !== 1 ? b.inicio : undefined}>
          {b.itens.map((it, n) => (
            <li key={n} className={`relative ${b.ordenada ? "pl-5" : "pl-3.5"}`}>
              {/* O marcador é desenho: o leitor de tela já anuncia a lista. */}
              <span aria-hidden className="absolute left-0 text-fg-muted tabular-nums">
                {b.ordenada ? `${b.inicio + n}.` : "•"}
              </span>
              {trechos(it.filhos)}
              {it.sub.length > 0 && (
                <ul className="mt-1 flex flex-col gap-1">
                  {it.sub.map((s, k) => (
                    <li key={k} className="relative pl-3.5">
                      <span aria-hidden className="absolute left-0.5 text-fg-muted">
                        ◦
                      </span>
                      {trechos(s)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </Tag>
      );
    }
    case "tabela":
      return (
        // A tabela rola de lado dentro do balão — no celular ela não cabe inteira.
        <div className="-mx-0.5 max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-fs-2">
            <thead>
              <tr>
                {b.cabecalho.map((c, k) => (
                  <th key={k} scope="col" className="border-b border-border px-2 py-1 text-left font-semibold text-fg-secondary whitespace-nowrap">
                    {trechos(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.linhas.map((l, n) => (
                <tr key={n} className="border-b border-border/60 last:border-0">
                  {l.map((c, k) => (
                    <td key={k} className="px-2 py-1 align-top">
                      {trechos(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "botoes":
      return (
        <div className="mt-1 flex flex-wrap gap-2">
          {b.links.map((l, k) => (
            <Button
              key={`${l.href}-${k}`}
              href={l.href}
              prefetch={false}
              variant="secondary"
              size="xs"
              onClick={aoNavegar}
              className="h-auto! min-h-7 max-w-full py-1 text-left whitespace-normal text-brand"
            >
              <span className="min-w-0">{l.rotulo}</span>
              <ArrowRight size={13} aria-hidden className="flex-shrink-0" />
            </Button>
          ))}
        </div>
      );
    case "codigo":
      return <pre className="whitespace-pre-wrap break-words rounded-md bg-surface-2 px-2.5 py-2 font-mono text-fs-2 text-fg">{b.v}</pre>;
    case "divisor":
      return <hr className="my-1 border-border" />;
  }
}

function Trechos({ trechos, citados, aoNavegar }: { trechos: Trecho[]; citados: Record<string, Citado>; aoNavegar?: () => void }) {
  return (
    <>
      {trechos.map((t, i) => {
        switch (t.t) {
          case "texto":
            return <Fragment key={i}>{t.v}</Fragment>;
          case "negrito":
            return (
              <strong key={i} className="font-semibold text-fg">
                <Trechos trechos={t.filhos} citados={citados} aoNavegar={aoNavegar} />
              </strong>
            );
          case "italico":
            return (
              <em key={i}>
                <Trechos trechos={t.filhos} citados={citados} aoNavegar={aoNavegar} />
              </em>
            );
          case "codigo":
            return (
              <code key={i} className="rounded-sm bg-surface-2 px-1 font-mono text-[0.92em]">
                {t.v}
              </code>
            );
          case "link":
            return (
              <Link
                key={i}
                href={t.href}
                prefetch={false}
                onClick={aoNavegar}
                className="font-medium text-brand underline decoration-brand/40 underline-offset-2 hover:decoration-brand"
              >
                {t.rotulo}
              </Link>
            );
          case "citacao": {
            const citado = citados[`${t.tipo}:${t.id}`];
            // Sem cadastro achado (outro escritório, apagado): só o nome.
            return citado ? <CartaoDoCitado key={i} citado={citado} aoNavegar={aoNavegar} /> : <Fragment key={i}>{t.nome}</Fragment>;
          }
        }
      })}
    </>
  );
}

/** A pessoa ou empresa citada: foto (ou iniciais) e nome; com ficha, leva a ela. */
function CartaoDoCitado({ citado, aoNavegar }: { citado: Citado; aoNavegar?: () => void }) {
  const conteudo = (
    <>
      <AvatarImage src={citado.foto} name={citado.nome} size={18} shape={citado.tipo === "empresa" ? "lg" : "circle"} fontSize={8} bordered={false} />
      <span className="truncate">{citado.nome}</span>
    </>
  );
  const classe = "inline-flex max-w-full items-center gap-1 align-middle rounded-full border border-border bg-surface pl-0.5 pr-2 py-0.5 text-fs-2 font-medium text-fg";
  return citado.href ? (
    <Link href={citado.href} prefetch={false} onClick={aoNavegar} className={`${classe} hover:border-brand hover:text-brand`}>
      {conteudo}
    </Link>
  ) : (
    <span className={classe}>{conteudo}</span>
  );
}
