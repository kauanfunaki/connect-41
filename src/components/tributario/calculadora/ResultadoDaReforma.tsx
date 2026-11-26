"use client";

// O resultado da Calculadora da reforma. Desde 26/11/2026 (melhoria-808,
// alternativa A) ele mora na tabela de itens: os valores de cada item entram
// na própria linha, e este arquivo tem as duas peças de fora da linha —
//   • `ResumoDoResultado`: os avisos da operação (desatualizado, simulado,
//     operação recusada) e a faixa de totais, acima da tabela;
//   • `DetalheDoItem`: o que abre embaixo da linha — a memória de cálculo como
//     conta (base × alíquota × (1 − redução) = valor), os erros da Receita por
//     inteiro e o texto oficial num recolhível que começa fechado (regra de
//     08/10/2026).

import { Coins, Landmark, ReceiptText, Scale } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { FaixaDeTotais, type ItemDeTotal } from "@/components/ui/FaixaDeTotais";
import { formatarReais } from "@/lib/format";
import {
  ROTULO_DO_ESTADO,
  anoDaData,
  contaDoTributo,
  memoriaFormatada,
  oQueFazerNoPortal,
  percentual,
  resumoDaClassificacao,
  soDigitos,
  tipoDoCodigo,
  type ClassificacaoParaEscolher,
  type ItemCalculado,
  type ItemDigitado,
  type ParcelaDoTributo,
  type ResultadoDaCalculadora,
} from "@/lib/tributario/calculadora/regras";

type Variante = "equipe" | "portal";

/** "10063021" → "1006.30.21"; "122011200" → "1.2201.12.00" — como a tabela da Receita escreve. */
export function codigoFormatado(codigo: string): string {
  const d = soDigitos(codigo);
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 1)}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}`;
  return d;
}

/** Calculou (com as alíquotas da Receita ou com as informadas). */
export function calculou(item: ItemCalculado): boolean {
  return item.estado === "CALCULADO" || item.estado === "CALCULO_SIMULADO";
}

/** Os avisos da operação e a faixa de totais, acima da tabela de itens. */
export function ResumoDoResultado({
  resultado,
  data,
  desatualizado,
  variante,
}: {
  resultado: ResultadoDaCalculadora;
  /** A data do cálculo, para o aviso de simulado dizer o ano. */
  data: string;
  desatualizado: boolean;
  variante: Variante;
}) {
  const { totais } = resultado;
  const ano = anoDaData(data);
  const totalDeItens = resultado.itens.length;
  const itensDeTotal: ItemDeTotal[] = [
    {
      rotulo: "Base de cálculo",
      valor: formatarReais(totais.base),
      icone: <Scale size={16} />,
      detalhe: `${resultado.calculados} de ${totalDeItens} ${totalDeItens === 1 ? "item calculado" : "itens calculados"}`,
    },
    { rotulo: "CBS", valor: formatarReais(totais.cbs), icone: <Landmark size={16} />, detalhe: "Federal" },
    {
      rotulo: "IBS",
      valor: formatarReais(totais.ibs),
      icone: <Landmark size={16} />,
      detalhe: `Estadual ${formatarReais(totais.ibsUf)} · municipal ${formatarReais(totais.ibsMun)}`,
    },
    ...(totais.impostoSeletivo > 0 ? [{ rotulo: "Imposto Seletivo", valor: formatarReais(totais.impostoSeletivo), icone: <ReceiptText size={16} /> }] : []),
    {
      rotulo: "Total de tributos",
      valor: formatarReais(totais.total),
      icone: <Coins size={16} />,
      tom: "text-brand",
      detalhe: totais.base > 0 ? `${percentual((totais.total / totais.base) * 100, "duasCasas")} da base` : undefined,
    },
  ];

  return (
    <section aria-label="Resultado" className="flex flex-col gap-3">
      {desatualizado && <Aviso tom="neutro">Os dados mudaram depois deste cálculo. Clique em “Calcular” para atualizar o resultado.</Aviso>}

      {resultado.simulado && (
        <Aviso tom="atencao">
          <strong className="font-semibold">Cálculo simulado.</strong> As alíquotas de {ano ?? "a partir de 2027"} ainda não são as definitivas: o
          resultado usa as alíquotas informadas no cálculo e serve para estimar, não para emitir a nota.
        </Aviso>
      )}

      {resultado.errosDaOperacao.map((e) => (
        <Aviso key={`${e.codigo}-${e.detalhe}`}>
          <strong className="font-semibold">{e.titulo}.</strong> {variante === "portal" ? oQueFazerNoPortal(e) : e.oQueFazer}
          {e.detalhe && <span className="mt-1 block text-helper opacity-90">{`${e.codigo}: ${e.detalhe}`}</span>}
        </Aviso>
      ))}

      {resultado.itens.length > 0 && <FaixaDeTotais itens={itensDeTotal} />}
    </section>
  );
}

type LinhaDaConta = { rotulo: string; base: number | null; parcela: ParcelaDoTributo };

/** Os tributos do item, na ordem da nota: CBS, IBS estadual, IBS municipal e Imposto Seletivo. */
function tributosDoItem(item: ItemCalculado): LinhaDaConta[] {
  return [
    ...(item.cbs ? [{ rotulo: "CBS", base: item.base, parcela: item.cbs }] : []),
    ...(item.ibsUf ? [{ rotulo: "IBS estadual", base: item.base, parcela: item.ibsUf }] : []),
    ...(item.ibsMun ? [{ rotulo: "IBS municipal", base: item.base, parcela: item.ibsMun }] : []),
    ...(item.impostoSeletivo
      ? [
          {
            rotulo: "Imposto Seletivo",
            base: item.impostoSeletivo.base,
            parcela: {
              aliquota: item.impostoSeletivo.aliquota,
              reducao: null,
              aliquotaEfetiva: item.impostoSeletivo.aliquota,
              valor: item.impostoSeletivo.valor,
              memoria: item.impostoSeletivo.memoria,
            },
          },
        ]
      : []),
  ];
}

/**
 * O detalhe que abre embaixo da linha do item. Antes do cálculo, a
 * classificação e a descrição do código; depois, a conta de cada tributo ou os
 * erros da Receita, e o texto oficial da memória.
 */
export function DetalheDoItem({
  numero,
  digitado,
  classificacao,
  descricaoDoCodigo,
  item,
  mudouDepois,
  variante,
}: {
  numero: number;
  digitado: ItemDigitado;
  classificacao: ClassificacaoParaEscolher | null;
  descricaoDoCodigo: string | null;
  /** O resultado deste item no último cálculo, se ele entrou nele. */
  item: ItemCalculado | null;
  /** O item mudou depois do cálculo: a conta é do cálculo anterior. */
  mudouDepois: boolean;
  variante: Variante;
}) {
  const tipo = tipoDoCodigo(digitado.codigo);
  const estado = item ? ROTULO_DO_ESTADO[item.estado] : null;
  const fezConta = item ? calculou(item) : false;
  const tributos = item ? tributosDoItem(item) : [];
  const memorias = tributos.filter((t) => t.parcela.memoria);
  const tomDoErro = item?.estado === "NAO_IMPLEMENTADO" ? "neutro" : "perigo";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="c41-rotulo">{fezConta ? "Memória de cálculo" : `Detalhe do item ${numero}`}</h3>
        {classificacao && (
          <p className="min-w-0 text-ui text-fg-muted">
            cClassTrib {classificacao.codigo}: {classificacao.descricao} · {resumoDaClassificacao(classificacao)}
          </p>
        )}
      </div>

      {tipo && descricaoDoCodigo && (
        <p className="text-ui text-fg-secondary">
          {tipo === "ncm" ? "NCM" : "NBS"} {codigoFormatado(digitado.codigo)}: {descricaoDoCodigo}
        </p>
      )}

      {!item && <p className="text-ui text-fg-muted">Clique em “Calcular” para ver a conta de cada tributo deste item.</p>}

      {item && mudouDepois && (
        <p className="text-ui text-fg-muted">Este item mudou depois do cálculo: o que aparece abaixo é do cálculo anterior.</p>
      )}

      {item && estado && !fezConta && (
        <div className="flex flex-col gap-2">
          {item.erros.length === 0 && <Aviso tom={tomDoErro}>{estado.explicacao}</Aviso>}
          {item.erros.map((e) => (
            <Aviso key={`${e.codigo}-${e.campo}-${e.detalhe}`} tom={tomDoErro}>
              <strong className="font-semibold">
                {e.campo ? `${e.campo}: ` : ""}
                {e.titulo}.
              </strong>{" "}
              {variante === "portal" ? oQueFazerNoPortal(e) : e.oQueFazer}
              {e.detalhe && <span className="mt-1 block text-helper opacity-90">{`${e.codigo}: ${e.detalhe}`}</span>}
            </Aviso>
          ))}
        </div>
      )}

      {item && fezConta && item.semTributo && (
        <p className="text-ui text-fg-secondary">Sem CBS e IBS nesta classificação: a Receita não calcula tributo para ela.</p>
      )}

      {item && fezConta && tributos.length > 0 && (
        <table className="w-full text-ui">
          <caption className="sr-only">Conta de cada tributo do item {numero}</caption>
          <thead>
            <tr className="text-left">
              <th scope="col" className="c41-rotulo w-32 pb-1 pr-3 font-semibold max-sm:w-24">
                Tributo
              </th>
              <th scope="col" className="c41-rotulo pb-1 pr-3 font-semibold">
                Conta
              </th>
              <th scope="col" className="c41-rotulo w-28 pb-1 text-right font-semibold">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {tributos.map(({ rotulo, base, parcela }) => {
              const c = contaDoTributo(base, parcela);
              return (
                <tr key={rotulo} className="border-t border-border align-baseline">
                  <th scope="row" className="py-1.5 pr-3 text-left font-medium text-fg">
                    {rotulo}
                  </th>
                  <td className="py-1.5 pr-3 tabular-nums text-fg-secondary">
                    {c.conta}
                    {c.efetiva && <span className="text-fg-muted"> = alíquota efetiva {c.efetiva}</span>}
                  </td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-fg">{c.valor}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {memorias.length > 0 && (
        <BlocoRecolhivel titulo="Texto da Receita" resumo={`${memorias.length} ${memorias.length === 1 ? "tributo" : "tributos"}`} className="bg-surface">
          <dl className="flex flex-col gap-3">
            {memorias.map(({ rotulo, parcela }) => (
              <div key={rotulo}>
                <dt className="text-label font-medium text-fg">{rotulo}</dt>
                <dd className="mt-0.5 text-ui leading-relaxed text-fg-secondary">{parcela.memoria && memoriaFormatada(parcela.memoria)}</dd>
              </div>
            ))}
          </dl>
          {variante === "equipe" && <p className="mt-3 text-helper text-fg-muted">Texto da calculadora da Receita, com os números no padrão brasileiro.</p>}
        </BlocoRecolhivel>
      )}
    </div>
  );
}
