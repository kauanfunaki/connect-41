import { Fragment, type ReactNode } from "react";
import { lerMarkdown, type Bloco, type Trecho } from "@/lib/ia/chat/markdown";

// A descrição que o recrutador escreveu (um campo de texto simples, às vezes
// com marcação leve: "## Atividades", "- item", "**negrito**"), formatada com o
// mesmo leitor de Markdown do chat do Connect (`lib/ia/chat/markdown.ts`):
// puro, testado, e que nunca desenha HTML — o React monta os elementos e
// escapa o texto. Diferente do chat, aqui nada vira link nem botão: o portal
// é público e não leva a telas do Connect; o rótulo fica como texto.

function trechos(ts: Trecho[]): ReactNode {
  return ts.map((t, i) => {
    switch (t.t) {
      case "texto":
        return <Fragment key={i}>{t.v}</Fragment>;
      case "negrito":
        return <strong key={i}>{trechos(t.filhos)}</strong>;
      case "italico":
        return <em key={i}>{trechos(t.filhos)}</em>;
      case "codigo":
        return <code key={i}>{t.v}</code>;
      case "link":
        return <Fragment key={i}>{t.rotulo}</Fragment>;
      case "citacao":
        return <Fragment key={i}>{t.nome}</Fragment>;
    }
  });
}

function bloco(b: Bloco, i: number): ReactNode {
  switch (b.t) {
    case "paragrafo":
      return <p key={i}>{trechos(b.filhos)}</p>;
    case "titulo":
      return <h3 key={i}>{trechos(b.filhos)}</h3>;
    case "lista": {
      const itens = b.itens.map((it, j) => (
        <li key={j}>
          {trechos(it.filhos)}
          {it.sub.length > 0 && (
            <ul>
              {it.sub.map((s, k) => (
                <li key={k}>{trechos(s)}</li>
              ))}
            </ul>
          )}
        </li>
      ));
      return b.ordenada ? (
        <ol key={i} start={b.inicio}>
          {itens}
        </ol>
      ) : (
        <ul key={i}>{itens}</ul>
      );
    }
    case "tabela":
      return (
        <div key={i} style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                {b.cabecalho.map((c, j) => (
                  <th key={j}>{trechos(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.linhas.map((l, j) => (
                <tr key={j}>
                  {l.map((c, k) => (
                    <td key={k}>{trechos(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "botoes":
      return <p key={i}>{b.links.map((l) => l.rotulo).join(" · ")}</p>;
    case "codigo":
      return (
        <p key={i}>
          <code>{b.v}</code>
        </p>
      );
    case "divisor":
      return <hr key={i} />;
  }
}

export function DescricaoDaVaga({ texto }: { texto: string }) {
  const blocos = lerMarkdown(texto);
  if (blocos.length === 0) return null;
  return <div className="t41-texto-vaga">{blocos.map(bloco)}</div>;
}
