"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { salvarParametros } from "@/app/(app)/valora/actions";
import { custoPorMinuto, type AjusteSetor, type Catalogo, type ParametrosPreco } from "@/lib/valora/motor";
import { brl } from "@/lib/valora/formato";

type Linha = { codigo: string; nome: string; custoMensal: string; capacidadeHorasMes: string; fatorCalibracao: string };

const texto = (n: number) => String(n).replace(".", ",");
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", "."));

/** Custos da equipe e margens. Confidencial: só administrador do setor chega aqui. */
export function FormParametros({ catalogo, parametros, podeEditar }: { catalogo: Catalogo; parametros: ParametrosPreco; podeEditar: boolean }) {
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    catalogo.setores.map((s) => ({
      codigo: s.codigo,
      nome: s.nome,
      custoMensal: texto(s.custoMensal),
      capacidadeHorasMes: texto(s.capacidadeHorasMes),
      fatorCalibracao: texto(s.fatorCalibracao),
    })),
  );
  const [p, setP] = useState(() => Object.fromEntries(Object.entries(parametros).map(([k, v]) => [k, texto(v)])) as Record<keyof ParametrosPreco, string>);

  const muda = (i: number, campo: keyof Linha, v: string) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));

  const campoPreco = (chave: keyof ParametrosPreco, rotulo: string, ajuda: string, sufixo?: string, prefixo?: string) => (
    <label className="flex flex-col gap-1 text-[12px] text-fg-secondary">
      <span className="font-medium">{rotulo}</span>
      <Input inputMode="decimal" prefix={prefixo} suffix={sufixo} value={p[chave]} disabled={!podeEditar} onChange={(e) => setP({ ...p, [chave]: e.target.value })} />
      <span className="text-[11px] text-fg-muted">{ajuda}</span>
    </label>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setErro(null);
        const ajustes: AjusteSetor[] = linhas.map((l) => ({
          codigo: l.codigo,
          custoMensal: numero(l.custoMensal),
          capacidadeHorasMes: numero(l.capacidadeHorasMes),
          fatorCalibracao: numero(l.fatorCalibracao),
        }));
        const parametrosNovos = Object.fromEntries(Object.entries(p).map(([k, v]) => [k, numero(v)]));
        startTransition(async () => {
          const r = await salvarParametros({ ajustes, parametros: parametrosNovos });
          if ("error" in r) setErro(r.error);
          else toast.success("Parâmetros salvos. As próximas simulações já usam os valores novos.");
        });
      }}
    >
      <Card className="p-4">
        <h2 className="text-[13px] font-semibold mb-1">Custo de cada setor</h2>
        <p className="text-[12px] text-fg-muted mb-3">
          Custo mensal da equipe: salários, encargos e benefícios de quem atende cliente. A capacidade e o fator vêm dos
          questionários — o fator encolhe os tempos declarados até a carteira caber nas horas da equipe.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-fg-muted border-b border-border">
                <th className="py-2 pr-3 font-medium">Setor</th>
                <th className="py-2 pr-3 font-medium">Custo mensal da equipe</th>
                <th className="py-2 pr-3 font-medium">Capacidade (h/mês)</th>
                <th className="py-2 pr-3 font-medium">Fator</th>
                <th className="py-2 font-medium text-right">Custo por hora</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const porHora =
                  custoPorMinuto({ codigo: l.codigo, nome: l.nome, custoMensal: numero(l.custoMensal) || 0, capacidadeHorasMes: numero(l.capacidadeHorasMes) || 0, fatorCalibracao: 1 }) * 60;
                return (
                  <tr key={l.codigo} className="border-b border-border-soft">
                    <td className="py-2 pr-3 font-medium">{l.nome}</td>
                    <td className="py-2 pr-3">
                      <Input compact prefix="R$" inputMode="decimal" value={l.custoMensal} disabled={!podeEditar} onChange={(e) => muda(i, "custoMensal", e.target.value)} />
                    </td>
                    <td className="py-2 pr-3">
                      <Input compact inputMode="decimal" value={l.capacidadeHorasMes} disabled={!podeEditar} onChange={(e) => muda(i, "capacidadeHorasMes", e.target.value)} />
                    </td>
                    <td className="py-2 pr-3">
                      <Input compact inputMode="decimal" value={l.fatorCalibracao} disabled={!podeEditar} onChange={(e) => muda(i, "fatorCalibracao", e.target.value)} />
                    </td>
                    <td className="py-2 text-right tabular-nums">{porHora > 0 ? brl(porHora) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-[13px] font-semibold mb-3">Preço</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {campoPreco("despesasFixasMes", "Despesas fixas do escritório", "Aluguel, sistemas, gestão e áreas de apoio. Rateadas por hora produtiva.", undefined, "R$")}
          {campoPreco("variaveisPct", "Custos variáveis", "Impostos, inadimplência e taxas — % sobre o preço.", "%")}
          {campoPreco("margemAlvoPct", "Margem alvo", "Lucro que o preço alvo entrega depois dos variáveis.", "%")}
          {campoPreco("margemPisoPct", "Margem mínima", "Define o piso. 0 = o piso só empata.", "%")}
          {campoPreco("descontoMaximoPct", "Desconto máximo", "A tabela é o alvo com essa gordura por cima.", "%")}
        </div>
      </Card>

      {podeEditar && (
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" loading={pendente} disabled={pendente}>
            Salvar parâmetros
          </Button>
          {erro && <span className="text-[12px] text-danger">{erro}</span>}
        </div>
      )}
    </form>
  );
}
