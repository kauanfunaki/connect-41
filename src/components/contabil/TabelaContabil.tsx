"use client";
import { isValidElement, useState } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TabelaFiscal } from "@/components/fiscal/previa/Compartilhados";

export function hrefContabil(params: URLSearchParams, mudar: Record<string, string | undefined>) {
  const q = new URLSearchParams(params);
  for (const [k, v] of Object.entries(mudar)) { if (v) q.set(k, v); else q.delete(k); }
  return "/contabil/sped?" + q;
}
export function FiltrosContabeis({ filtros = [], children }: { filtros?: { chave: string; nome: string; opcoes: readonly (readonly [string, string])[] }[]; children?: React.ReactNode }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  return <form className="flex flex-wrap items-end gap-2 mb-4" onSubmit={(e) => {
    e.preventDefault();
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of new FormData(e.currentTarget)) { if (String(v)) q.set(k, String(v)); else q.delete(k); }
    q.delete("pagina"); router.push(pathname + "?" + q);
  }}>
    <label className="grid gap-1 text-helper text-fg-secondary flex-1 min-w-40">Buscar<Input compact name="q" defaultValue={params.get("q") ?? ""} placeholder="Fornecedor, documento ou conta" /></label>
    {filtros.map((f) => <label key={f.chave} className="grid gap-1 text-helper text-fg-secondary min-w-32">{f.nome}<Select compact name={f.chave} defaultValue={params.get(f.chave) ?? ""}><option value="">Todos</option>{f.opcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</Select></label>)}
    <Button size="sm" type="submit" variant="secondary">Filtrar</Button>{children}
  </form>;
}
function textoDaCelula(v: React.ReactNode): string {
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return v.map(textoDaCelula).join(" ");
  if (isValidElement<{ children?: React.ReactNode }>(v)) return textoDaCelula(v.props.children);
  return "";
}
type PropsTabela = { colunas: string[]; linhas: { id: string; celulas: React.ReactNode[] }[]; vazio?: string; descricaoVazio?: string; pesquisar?: boolean; local?: boolean };
export function TabelaContabil({ colunas, linhas, vazio = "Nenhum registro neste filtro.", pesquisar = false, local = false }: PropsTabela) {
  const params = useSearchParams();
  const [busca, setBusca] = useState("");
  const [paginaLocal, setPaginaLocal] = useState(1);
  const filtradas = pesquisar && busca.trim() ? linhas.filter((l) => l.celulas.map(textoDaCelula).join(" ").toLowerCase().includes(busca.trim().toLowerCase())) : linhas;
  const paginas = Math.max(1, Math.ceil(filtradas.length / 50));
  const pagina = Math.min(paginas, local ? paginaLocal : Math.max(1, Math.trunc(Number(params.get("pagina"))) || 1));
  return <div className="space-y-3">
    {pesquisar && <label className="grid gap-1 text-helper text-fg-secondary max-w-sm">Buscar nos registros carregados<Input compact value={busca} onChange={(e) => { setBusca(e.target.value); setPaginaLocal(1); }} placeholder="Digite para filtrar esta lista" /></label>}
    <div className="overflow-x-auto rounded-lg border border-border bg-surface"><TabelaFiscal colunas={colunas} linhas={filtradas.slice((pagina - 1) * 50, pagina * 50)} vazio={vazio} descricaoVazio="" /></div>
    <div className="flex flex-wrap justify-between items-center gap-2 text-helper text-fg-secondary">
      <span>{filtradas.length} registro(s) · Página {pagina} de {paginas}</span>
      {paginas > 1 && <span className="flex gap-2"><Button variant="secondary" size="sm" disabled={pagina <= 1} onClick={local ? () => setPaginaLocal(pagina - 1) : undefined} href={!local && pagina > 1 ? hrefContabil(new URLSearchParams(params.toString()), { pagina: String(pagina - 1) }) : undefined}>Anterior</Button><Button variant="secondary" size="sm" disabled={pagina >= paginas} onClick={local ? () => setPaginaLocal(pagina + 1) : undefined} href={!local && pagina < paginas ? hrefContabil(new URLSearchParams(params.toString()), { pagina: String(pagina + 1) }) : undefined}>Próxima</Button></span>}
    </div>
  </div>;
}

export function TabelaContabilDoMotor(props: PropsTabela) {
  return <TabelaContabil {...props} pesquisar local />;
}
