"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { CampoForm } from "@/components/ui/CampoForm";
import { FieldGrid } from "@/components/ui/FieldGrid";
import { FormFooter } from "@/components/ui/FormFooter";
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
    <CampoForm label={rotulo} htmlFor={`parametro-${chave}`} helper={ajuda}>
      <Input
        id={`parametro-${chave}`}
        inputMode="decimal"
        prefix={prefixo}
        suffix={sufixo}
        value={p[chave]}
        disabled={!podeEditar}
        onChange={(e) => setP({ ...p, [chave]: e.target.value })}
      />
    </CampoForm>
  );

  return (
    <form
      className="space-y-5"
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
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-1">Custo de cada setor</h2>
        <p className="text-[length:var(--fs-2)] text-fg-muted mb-3">
          Custo mensal da equipe: salários, encargos e benefícios de quem atende cliente. A capacidade e o fator vêm dos
          questionários — o fator encolhe os tempos declarados até a carteira caber nas horas da equipe.
        </p>
        {/* Casco padrão dentro do cartão (30/09). Sem funil: é uma linha por
            setor, para preencher. */}
        <div className="c41-tabela overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-border text-[length:var(--fs-micro)] font-semibold uppercase tracking-wide text-fg-muted">
                <th className="px-3">Setor</th>
                <th className="px-3">Custo mensal da equipe</th>
                <th className="px-3">Capacidade (h/mês)</th>
                <th className="px-3">Fator</th>
                <th className="px-3">Custo por hora</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l, i) => {
                const porHora =
                  custoPorMinuto({ codigo: l.codigo, nome: l.nome, custoMensal: numero(l.custoMensal) || 0, capacidadeHorasMes: numero(l.capacidadeHorasMes) || 0, fatorCalibracao: 1 }) * 60;
                return (
                  <tr key={l.codigo} className="border-b border-border">
                    <td className="px-3 font-medium">{l.nome}</td>
                    {/* Largura pelo conteúdo: dinheiro mais largo, horas e fator
                        estreitos — eram as três do tamanho da coluna. O rótulo
                        de cada um é o cabeçalho, repetido para o leitor de tela. */}
                    <td className="px-3">
                      <Input
                        compact
                        prefix="R$"
                        inputMode="decimal"
                        aria-label={`Custo mensal da equipe — ${l.nome}`}
                        value={l.custoMensal}
                        disabled={!podeEditar}
                        onChange={(e) => muda(i, "custoMensal", e.target.value)}
                        className="w-44 mx-auto"
                      />
                    </td>
                    <td className="px-3">
                      <Input
                        compact
                        inputMode="decimal"
                        aria-label={`Capacidade em horas por mês — ${l.nome}`}
                        value={l.capacidadeHorasMes}
                        disabled={!podeEditar}
                        onChange={(e) => muda(i, "capacidadeHorasMes", e.target.value)}
                        className="w-24 mx-auto text-right"
                      />
                    </td>
                    <td className="px-3">
                      <Input
                        compact
                        inputMode="decimal"
                        aria-label={`Fator — ${l.nome}`}
                        value={l.fatorCalibracao}
                        disabled={!podeEditar}
                        onChange={(e) => muda(i, "fatorCalibracao", e.target.value)}
                        className="w-20 mx-auto text-right"
                      />
                    </td>
                    <td className="px-3 tabular-nums whitespace-nowrap">{porHora > 0 ? brl(porHora) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-[length:var(--fs-card-title)] font-semibold text-fg mb-4">Preço</h2>
        <FieldGrid columns="sm:grid-cols-2 lg:grid-cols-3">
          {campoPreco("despesasFixasMes", "Despesas fixas do escritório", "Aluguel, sistemas, gestão e áreas de apoio. Rateadas por hora produtiva.", undefined, "R$")}
          {campoPreco("variaveisPct", "Custos variáveis", "Impostos, inadimplência e taxas — % sobre o preço.", "%")}
          {campoPreco("margemAlvoPct", "Margem alvo", "Lucro que o preço alvo entrega depois dos variáveis.", "%")}
          {campoPreco("margemPisoPct", "Margem mínima", "Define o piso. 0 = o piso só empata.", "%")}
          {campoPreco("descontoMaximoPct", "Desconto máximo", "A tabela é o alvo com essa gordura por cima.", "%")}
        </FieldGrid>
      </Card>

      {/* Rodapé padrão da página de formulário: Cancelar volta às propostas,
          "Salvar parâmetros" (36px) por último. O erro fica acima dele. */}
      {podeEditar && (
        <div>
          {erro && <p className="mb-3 text-right text-[length:var(--fs-helper)] font-medium text-danger">{erro}</p>}
          <FormFooter cancelHref="/valora" pending={pendente} submitLabel="Salvar parâmetros" />
        </div>
      )}
    </form>
  );
}
