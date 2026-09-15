import Link from "next/link";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

type Props = {
  /** Rota do próprio formulário. */
  acao: string;
  empresas?: { id: string; nome: string }[];
  empresaId?: string | null;
  /** Oferece "Todas as empresas" — telas de consolidado. */
  permitirTodas?: boolean;
  /** "AAAA-MM". Sem valor, o seletor de mês não aparece. */
  mes?: string;
  /** Parâmetros que o filtro precisa carregar (aba, modo…). */
  extras?: Record<string, string | undefined>;
};

/**
 * Empresa e mês por GET.
 *
 * Formulário comum com botão, e não select que navega sozinho: com quase
 * quatrocentas empresas, quem troca empresa e mês de uma vez não quer duas
 * navegações — e o GET deixa a URL copiável, que é como relatório é mandado
 * para outra pessoa.
 */
export function FiltroDePeriodo({ acao, empresas, empresaId, permitirTodas, mes, extras }: Props) {
  return (
    <form method="get" action={acao} className="flex flex-wrap items-center gap-2 mb-4">
      {Object.entries(extras ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      {empresas && (
        <Select compact name="empresa" defaultValue={empresaId ?? ""} className="w-72 max-w-full" aria-label="Empresa">
          {permitirTodas && <option value="">Todas as empresas</option>}
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </Select>
      )}
      {mes !== undefined && (
        <Input compact type="month" name="mes" defaultValue={mes} className="w-40" aria-label="Mês" />
      )}
      <Button type="submit" variant="secondary" size="sm">
        Aplicar
      </Button>
    </form>
  );
}

const ABA =
  "h-8 px-3 inline-flex items-center rounded-md border border-border text-fg-secondary text-[12px] hover:bg-surface-hover transition-colors";
const ABA_ATIVA =
  "h-8 px-3 inline-flex items-center rounded-md border border-brand/40 bg-brand/8 text-brand text-[12px] font-medium";

/** Abas por link — a mesma pílula de `/dre` e dos recortes de `/pagar`. */
export function AbasDeLink({ abas, ativa }: { abas: { chave: string; rotulo: string; href: string }[]; ativa: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-1.5 mb-4" aria-label="Abas">
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          aria-current={a.chave === ativa ? "page" : undefined}
          className={a.chave === ativa ? ABA_ATIVA : ABA}
        >
          {a.rotulo}
        </Link>
      ))}
    </nav>
  );
}

/** A faixa de números do topo, como a de `/pagar`. */
export function FaixaDeTotais({ itens }: { itens: { rotulo: string; valor: string; tom?: string }[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded-md overflow-hidden mb-4">
      {itens.map((i) => (
        <div key={i.rotulo} className="bg-surface px-3.5 py-3">
          <span className="block text-[11px] uppercase tracking-wide text-fg-muted">{i.rotulo}</span>
          <span className={`block text-[17px] font-semibold tabular-nums mt-0.5 ${i.tom ?? ""}`}>{i.valor}</span>
        </div>
      ))}
    </div>
  );
}
