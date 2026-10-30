import { ArrowDownLeft, ArrowUpRight, Landmark, PiggyBank } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BlocoRecolhivel } from "@/components/ui/BlocoRecolhivel";
import { Card } from "@/components/ui/Card";
import { FaixaDeTotais } from "@/components/ui/FaixaDeTotais";
import { CAMPOS_E110, type Conferencia, type LeituraDaApuracao, type LinhaDoLivro, type LivroFiscal, type VerbaDoLivro } from "@/lib/fiscal/sped/arquivoIcms";
import { aliquotaDeCentesimos, reaisDeCentavos } from "@/lib/fiscal/sped/formato";
import { QuadroDeCfop } from "./QuadroDeCfop";

/**
 * O resumo da apuração (29/10/2026): os quatro números que o fiscal confere
 * primeiro e, logo abaixo, as conferências. Batendo todas, uma linha só; com
 * divergência, só as que não batem, com o esperado e o que está no arquivo.
 */
export function ResumoDaApuracao({ apuracao, livro }: { apuracao: LeituraDaApuracao; livro: LivroFiscal }) {
  const total = (lista: VerbaDoLivro[]) => lista.find((v) => v.total)?.valor ?? 0;
  const e110 = apuracao.e110;
  const divergentes = apuracao.conferencias.filter((c) => !c.bate);
  return <div className="space-y-4">
    {!e110 && <Aviso tom="atencao">O arquivo não tem o registro E110: a apuração do ICMS não foi escriturada nele.</Aviso>}
    {/* O resultado primeiro: é o número em destaque (o primeiro da faixa). */}
    <FaixaDeTotais itens={[
      { rotulo: "ICMS a recolher", valor: reaisDeCentavos(e110?.VL_ICMS_RECOLHER ?? 0), icone: <Landmark /> },
      { rotulo: "Débitos", valor: reaisDeCentavos(total(livro.debitos)), icone: <ArrowUpRight />, detalhe: "Saídas, ajustes e estornos" },
      { rotulo: "Créditos", valor: reaisDeCentavos(total(livro.creditos)), icone: <ArrowDownLeft />, detalhe: "Entradas, ajustes e estornos" },
      { rotulo: "Saldo credor para o mês seguinte", valor: reaisDeCentavos(e110?.VL_SLD_CREDOR_TRANSPORTAR ?? 0), icone: <PiggyBank />, detalhe: e110?.VL_SLD_CREDOR_ANT ? `Veio ${reaisDeCentavos(e110.VL_SLD_CREDOR_ANT)} do mês anterior` : undefined },
    ]} />
    {divergentes.length === 0
      ? <Aviso tom="sucesso">As {apuracao.conferencias.length} conferências do arquivo batem: débitos e créditos do E110 com os documentos, saldo e ajustes.</Aviso>
      : <Aviso tom="atencao">
        <span className="block font-semibold">{divergentes.length} conferência(s) não batem</span>
        <ul className="mt-1.5 space-y-1">{divergentes.map((c) => <li key={c.regra}><Divergencia c={c} /></li>)}</ul>
      </Aviso>}
  </div>;
}

function Divergencia({ c }: { c: Conferencia }) {
  return <span>{c.regra}: esperado <strong className="tabular-nums">{reaisDeCentavos(c.esperado)}</strong>, no arquivo <strong className="tabular-nums">{reaisDeCentavos(c.obtido)}</strong>.</span>;
}

/** A vista "Apuração": as operações por CFOP, os ajustes do arquivo e o E110 inteiro, recolhido. */
export function VistaDaApuracao({ apuracao }: { apuracao: LeituraDaApuracao }) {
  return <div className="space-y-5">
    <section aria-labelledby="sped-cfop" className="space-y-3">
      <h2 id="sped-cfop" className="text-card-title font-semibold text-fg">Operações por CFOP</h2>
      <QuadroDeCfop grupos={apuracao.grupos} />
    </section>
    {apuracao.ajustes.length > 0 && <Tabelinha titulo="Ajustes no arquivo (E111)" colunas={["Código", "Descrição", "Valor"]} linhas={apuracao.ajustes.map((a, i) => ({ id: `${a.codigo}-${i}`, celulas: [a.codigo, a.descricao, reaisDeCentavos(a.valor)] }))} />}
    {apuracao.e110 && <BlocoRecolhivel titulo="Registro E110 completo" abertoInicial={false}>
      <div><Tabelinha colunas={["Campo", "Descrição", "Valor"]} linhas={CAMPOS_E110.map(([campo, rotulo]) => ({ id: campo, celulas: [campo, rotulo, reaisDeCentavos(apuracao.e110![campo])] }))} /></div>
    </BlocoRecolhivel>}
  </div>;
}

/** A vista "Livro fiscal": o demonstrativo no formato da Domínio, para conferir linha a linha contra o papel. */
export function VistaDoLivro({ livro }: { livro: LivroFiscal }) {
  return <div className="space-y-5">
    <QuadroDoLivro titulo="Saídas" linhas={livro.saidas} total={livro.totalSaidas} />
    <QuadroDoLivro titulo="Entradas" linhas={livro.entradas} total={livro.totalEntradas} />
    <div className="grid gap-5 lg:grid-cols-3">
      <Verbas titulo="Débitos" verbas={livro.debitos} />
      <Verbas titulo="Créditos" verbas={livro.creditos} />
      <Verbas titulo="Apuração" verbas={livro.apuracao} />
    </div>
  </div>;
}

function QuadroDoLivro({ titulo, linhas, total }: { titulo: string; linhas: LinhaDoLivro[]; total: LinhaDoLivro }) {
  const celulas = (l: LinhaDoLivro) => [reaisDeCentavos(l.valorContabil), reaisDeCentavos(l.baseCalculo), reaisDeCentavos(l.imposto), reaisDeCentavos(l.isentas), reaisDeCentavos(l.outras)];
  return <Tabelinha titulo={titulo} colunas={["CFOP", "Alíquota", "Valor contábil", "Base de cálculo", "Imposto", "Isentas", "Outras"]}
    linhas={linhas.map((l) => ({ id: `${l.cfop}-${l.aliquota}`, celulas: [l.cfop, aliquotaDeCentesimos(l.aliquota), ...celulas(l)] }))}
    rodape={linhas.length ? ["Total", "", ...celulas(total)] : undefined} />;
}

function Verbas({ titulo, verbas }: { titulo: string; verbas: VerbaDoLivro[] }) {
  return <Card className="p-4">
    <h3 className="mb-3 text-label font-semibold text-fg">{titulo}</h3>
    <dl className="space-y-1.5 text-ui">
      {verbas.map((v, i) => <div key={`${v.descricao}-${i}`} className={`flex items-baseline justify-between gap-3 ${v.total ? "border-t border-border pt-1.5 font-semibold text-fg" : v.detalhe ? "pl-3 text-helper text-fg-muted" : "text-fg-secondary"}`}>
        <dt className="min-w-0 break-words">{v.descricao}</dt>
        <dd className="flex-shrink-0 tabular-nums">{reaisDeCentavos(v.valor)}</dd>
      </div>)}
    </dl>
  </Card>;
}

/** Tabela pequena no padrão `.c41-tabela`, com rodapé de total. */
function Tabelinha({ titulo, colunas, linhas, rodape }: { titulo?: string; colunas: string[]; linhas: { id: string; celulas: string[] }[]; rodape?: string[] }) {
  return <section className="space-y-2">
    {titulo && <h3 className="text-label font-semibold text-fg">{titulo}</h3>}
    <div className="c41-tabela overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full">
        <thead><tr>{colunas.map((c) => <th key={c} className="px-3">{c}</th>)}</tr></thead>
        <tbody className="tabular-nums">
          {linhas.length === 0 && <tr><td colSpan={colunas.length} className="px-3 text-fg-muted">Sem operações.</td></tr>}
          {linhas.map((l) => <tr key={l.id} className="border-b border-border-soft">{l.celulas.map((c, i) => <td key={i} className="px-3 text-fg">{c}</td>)}</tr>)}
        </tbody>
        {rodape && <tfoot className="tabular-nums"><tr className="border-t border-border-strong font-semibold text-fg">{rodape.map((c, i) => <td key={i} className="px-3 py-3">{c}</td>)}</tr></tfoot>}
      </table>
    </div>
  </section>;
}
