"use client";

import { createContext, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { SlideOver } from "@/components/ui/SlideOver";
import { FilaDeClassificacao } from "@/components/dre/FilaDeClassificacao";
import { totalForaDasLinhas, type Desconsiderada, type ItemDaFila } from "@/lib/dre/fila";
import type { CodigoDoModelo } from "@/lib/dre/estrutura";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";

// A classificação da DRE num painel lateral (13/10/2026, do teste da Amanda,
// do BPO). Primeiro foi uma fila no meio do relatório, que fazia rolar; depois
// uma aba "Classificação", que punha uma segunda fileira de abas embaixo de
// "Por mês / Ano inteiro". Agora o relatório fica sozinho na tela, o
// "Classificar" do aviso abre a gaveta à direita (o `SlideOver` do app) e o
// relatório atrás atualiza a cada categoria classificada — as ações revalidam
// `/dre`, e este componente, que fica montado, mantém o painel aberto.
//
// Fecha pelo X, pelo Esc e pelo clique fora; o clique fora cai no fundo do
// painel e para ali, sem acionar o que está embaixo — o cuidado do chat da IA
// no PR #163.

type Dados = {
  companyId: string;
  /** O modelo do DRE da empresa: os grupos do "Classificar em…" são os dele. */
  modelo: CodigoDoModelo;
  itens: ItemDaFila[];
  contas: { pagamento: string | null; recebimento: string | null };
  excecoes: { categoryId: string; nome: string; grupo: string }[];
  desconsideradas: Desconsiderada[];
};

type Contexto = { abrir: () => void; faltam: number; total: number; temOQueVer: boolean };

const Ctx = createContext<Contexto | null>(null);

export function PainelDeClassificacao({ children, ...dados }: Dados & { children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const contexto: Contexto = {
    abrir: () => setAberto(true),
    faltam: dados.itens.length,
    total: totalForaDasLinhas(dados.itens),
    // Sem nada a classificar, o painel ainda é a porta do "Voltar ao padrão"
    // das exceções e das desconsideradas — o botão só some quando não há nada.
    temOQueVer: dados.itens.length + dados.excecoes.length + dados.desconsideradas.length > 0,
  };

  return (
    <Ctx.Provider value={contexto}>
      {children}
      <SlideOver open={aberto} onClose={() => setAberto(false)} title="Classificar no DRE" width="max-w-xl" fundo="leve">
        <FilaDeClassificacao {...dados} />
      </SlideOver>
    </Ctx.Provider>
  );
}

/**
 * O painel desta tela, para quem abre a fila de outro lugar — o "⋯" do topo,
 * quando não falta nada a classificar mas há exceções a rever. `null` fora do
 * painel (a aba "Como o cliente vê").
 */
export function usePainelDeClassificacao(): Contexto | null {
  return useContext(Ctx);
}

/**
 * No relatório, o que falta classificar em uma linha, que abre o painel. Desde
 * 05/11/2026 (escolha 5A do Kauan) é a única porta da fila no topo: o botão
 * "Classificar N", fixo na fileira dos filtros, saiu, e o aviso só aparece
 * quando há o que classificar.
 */
export function AvisoDeSemGrupo({ className = "mb-4" }: { className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.faltam === 0) return null;
  return (
    // "Classificar" é botão, não link no meio da frase (15/10/2026): abre o
    // painel, é ação.
    <Aviso tom="atencao" icone={<AlertTriangle />} className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-fg">
          <strong>{ctx.faltam}</strong> {ctx.faltam === 1 ? "item sem grupo" : "itens sem grupo"} no DRE:{" "}
          <strong>{moeda(ctx.total)}</strong> fora das linhas abaixo.
        </p>
        <Button variant="secondary" size="xs" onClick={ctx.abrir} aria-haspopup="dialog">
          Classificar
        </Button>
      </div>
    </Aviso>
  );
}
