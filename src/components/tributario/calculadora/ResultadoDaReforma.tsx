"use client";

// O resultado da Calculadora da reforma: os totais da Receita, e um cartão por
// item com o estado, CBS, IBS estadual, IBS municipal e Imposto Seletivo
// (alíquota, redução, alíquota efetiva e valor), o erro traduzido quando a
// Receita recusou, e a memória de cálculo num bloco recolhível que começa
// fechado (regra de 08/10/2026).

import { Coins, Landmark, ReceiptText, Scale } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Card } from "@/components/ui/Card";
import { FaixaDeTotais, type ItemDeTotal } from "@/components/ui/FaixaDeTotais";
import { Selo } from "@/components/ui/Selo";
import { NotaDeFonte } from "@/components/shared/NotaDeFonte";
import { formatarReais } from "@/lib/format";
import {
  ROTULO_DO_ESTADO,
  anoDaData,
  memoriaFormatada,
  oQueFazerNoPortal,
  percentual,
  resumoDaClassificacao,
  soDigitos,
  tipoDoCodigo,
  type ClassificacaoParaEscolher,
  type EntradaDaCalculadora,
  type ItemCalculado,
  type ParcelaDoTributo,
  type ResultadoDaCalculadora,
} from "@/lib/tributario/calculadora/regras";

type Props = {
  ref?: React.Ref<HTMLElement>;
  resultado: ResultadoDaCalculadora;
  entrada: EntradaDaCalculadora;
  classificacoes: ClassificacaoParaEscolher[];
  desatualizado: boolean;
  fonte: string;
  variante: "equipe" | "portal";
};

/** "10063021" → "1006.30.21"; "122011200" → "1.2201.12.00" — como a tabela da Receita escreve. */
function codigoFormatado(codigo: string): string {
  const d = soDigitos(codigo);
  if (d.length === 8) return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 1)}.${d.slice(1, 5)}.${d.slice(5, 7)}.${d.slice(7)}`;
  return d;
}

export function ResultadoDaReforma({ ref, resultado, entrada, classificacoes, desatualizado, fonte, variante }: Props) {
  const { totais } = resultado;
  const ano = anoDaData(entrada.data);
  const totalDeItens = resultado.itens.length;
  const itensDeTotal: ItemDeTotal[] = [
    { rotulo: "Base de cálculo", valor: formatarReais(totais.base), icone: <Scale size={16} /> },
    { rotulo: "CBS", valor: formatarReais(totais.cbs), icone: <Landmark size={16} />, detalhe: "Federal" },
    {
      rotulo: "IBS",
      valor: formatarReais(totais.ibs),
      icone: <Landmark size={16} />,
      detalhe: `Estadual ${formatarReais(totais.ibsUf)} e municipal ${formatarReais(totais.ibsMun)}`,
    },
    ...(totais.impostoSeletivo > 0 ? [{ rotulo: "Imposto Seletivo", valor: formatarReais(totais.impostoSeletivo), icone: <ReceiptText size={16} /> }] : []),
    { rotulo: "Total de tributos", valor: formatarReais(totais.total), icone: <Coins size={16} />, tom: "text-brand" },
  ];

  return (
    <section ref={ref} tabIndex={-1} aria-labelledby="resultado-da-reforma" className="flex flex-col gap-4 outline-none">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="resultado-da-reforma" className="text-section font-semibold text-fg">
          Resultado
        </h2>
        <p className="text-ui text-fg-muted" role="status">
          {resultado.errosDaOperacao.length > 0
            ? "A calculadora recusou a operação."
            : `${resultado.calculados} de ${totalDeItens} ${totalDeItens === 1 ? "item calculado" : "itens calculados"}`}
        </p>
      </div>

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

      {resultado.itens.length > 0 && (
        <>
          <FaixaDeTotais itens={itensDeTotal} className="" />
          <ol className="flex flex-col gap-3">
            {resultado.itens.map((item) => (
              <CartaoDoItem
                key={item.numero}
                item={item}
                digitado={entrada.itens[item.numero - 1] ?? null}
                classificacoes={classificacoes}
                variante={variante}
              />
            ))}
          </ol>
        </>
      )}

      <NotaDeFonte className="mt-0">
        {resultado.itens.length > 0 ? "Os totais somam só os itens calculados. " : ""}
        {fonte}
      </NotaDeFonte>
    </section>
  );
}

function CartaoDoItem({
  item,
  digitado,
  classificacoes,
  variante,
}: {
  item: ItemCalculado;
  digitado: EntradaDaCalculadora["itens"][number] | null;
  classificacoes: ClassificacaoParaEscolher[];
  variante: "equipe" | "portal";
}) {
  const estado = ROTULO_DO_ESTADO[item.estado];
  const cClassTrib = item.cClassTrib ?? (digitado ? soDigitos(digitado.cClassTrib) : null);
  const classificacao = classificacoes.find((c) => c.codigo === cClassTrib) ?? null;
  const tipo = digitado ? tipoDoCodigo(digitado.codigo) : null;
  const calculou = item.estado === "CALCULADO" || item.estado === "CALCULO_SIMULADO";
  const linhas: { rotulo: string; parcela: ParcelaDoTributo }[] = [
    ...(item.cbs ? [{ rotulo: "CBS", parcela: item.cbs }] : []),
    ...(item.ibsUf ? [{ rotulo: "IBS estadual", parcela: item.ibsUf }] : []),
    ...(item.ibsMun ? [{ rotulo: "IBS municipal", parcela: item.ibsMun }] : []),
    ...(item.impostoSeletivo
      ? [
          {
            rotulo: "Imposto Seletivo",
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
  const memorias = linhas.filter((l) => l.parcela.memoria);
  const temReducao = linhas.some((l) => l.parcela.reducao !== null);

  return (
    <li>
      <Card as="section" aria-label={`Item ${item.numero}`} className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-card-title font-semibold text-fg">
              Item {item.numero}
              {digitado?.codigo && tipo && (
                <span className="font-normal text-fg-secondary">
                  {" "}
                  — {tipo === "ncm" ? "NCM" : "NBS"} {codigoFormatado(digitado.codigo)}
                </span>
              )}
            </h3>
            {cClassTrib && (
              <p className="mt-0.5 text-ui text-fg-muted">
                cClassTrib {cClassTrib}
                {classificacao ? `: ${classificacao.descricao}` : ""}
              </p>
            )}
          </div>
          <Selo tom={estado.tom}>{estado.rotulo}</Selo>
        </div>

        {calculou && (
          <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-helper text-fg-muted">Base de cálculo</dt>
              <dd className="text-body font-medium tabular-nums text-fg">{formatarReais(item.base ?? item.impostoSeletivo?.base)}</dd>
            </div>
            <div>
              <dt className="text-helper text-fg-muted">Tributos do item</dt>
              <dd className="text-body font-semibold tabular-nums text-fg">{formatarReais(item.total)}</dd>
            </div>
            {classificacao && (
              <div className="col-span-2 sm:col-span-1">
                <dt className="text-helper text-fg-muted">Tratamento</dt>
                <dd className="text-ui text-fg">{resumoDaClassificacao(classificacao)}</dd>
              </div>
            )}
          </dl>
        )}

        {calculou && item.semTributo && (
          <p className="mt-3 text-ui text-fg-secondary">Sem CBS e IBS nesta classificação: a Receita não calcula tributo para ela.</p>
        )}

        {linhas.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-md border border-border">
            <table className="w-full text-ui">
              <caption className="sr-only">Tributos do item {item.numero}</caption>
              <thead className="bg-surface-hover text-micro text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Tributo
                  </th>
                  {temReducao && (
                    <>
                      <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                        Alíquota
                      </th>
                      <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                        Redução
                      </th>
                    </>
                  )}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {temReducao ? "Alíquota efetiva" : "Alíquota"}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Valor
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ rotulo, parcela }) => (
                  <tr key={rotulo} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-medium text-fg">
                      {rotulo}
                    </th>
                    {temReducao && (
                      <>
                        <td className="hidden px-3 py-2 text-right tabular-nums text-fg-secondary sm:table-cell">{percentual(parcela.aliquota)}</td>
                        <td className="hidden px-3 py-2 text-right tabular-nums text-fg-secondary sm:table-cell">
                          {parcela.reducao !== null ? percentual(parcela.reducao) : "—"}
                        </td>
                      </>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums text-fg">{percentual(parcela.aliquotaEfetiva)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums text-fg">{formatarReais(parcela.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!calculou && (
          <div className="mt-3 flex flex-col gap-2">
            {item.erros.length === 0 && <Aviso tom={item.estado === "NAO_IMPLEMENTADO" ? "neutro" : "perigo"}>{estado.explicacao}</Aviso>}
            {item.erros.map((e) => (
              <Aviso key={`${e.codigo}-${e.campo}-${e.detalhe}`} tom={item.estado === "NAO_IMPLEMENTADO" ? "neutro" : "perigo"}>
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

        {memorias.length > 0 && (
          <BlocoRecolhivel
            className="mt-4"
            titulo="Memória de cálculo"
            resumo={`${memorias.length} ${memorias.length === 1 ? "tributo" : "tributos"}`}
          >
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
      </Card>
    </li>
  );
}
