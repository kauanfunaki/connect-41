"use client";

import { createContext, useContext, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Contador } from "@/components/ui/Contador";
import { SlideOver } from "@/components/ui/SlideOver";
import { FilaDeClassificacao } from "@/components/dre/FilaDeClassificacao";
import { totalForaDasLinhas, type Desconsiderada, type ItemDaFila } from "@/lib/dre/fila";
import { formatarReaisDeCentavos as moeda } from "@/lib/format";

// A classificação da DRE num painel lateral (13/10/2026, do teste da Amanda,
// do BPO). Primeiro foi uma fila no meio do relatório, que fazia rolar; depois
// uma aba "Classificação", que punha uma segunda fileira de abas embaixo de
// "Por mês / Ano inteiro". Agora o relatório fica sozinho na tela, o botão
// "Classificar" no topo abre a gaveta à direita (o `SlideOver` do app) e o
// relatório atrás atualiza a cada categoria classificada — as ações revalidam
// `/dre`, e este componente, que fica montado, mantém o painel aberto.
//
// Fecha pelo X, pelo Esc e pelo clique fora; o clique fora cai no fundo do
// painel e para ali, sem acionar o que está embaixo — o cuidado do chat da IA
// no PR #163.

type Dados = {
  companyId: string;
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

/** "Classificar", com o que falta no contador, ao lado dos controles do topo. */
export function BotaoDeClassificar() {
  const ctx = useContext(Ctx);
  if (!ctx?.temOQueVer) return null;
  return (
    <Button variant="secondary" size="sm" onClick={ctx.abrir} aria-haspopup="dialog">
      <ListChecks size={14} />
      Classificar
      {ctx.faltam > 0 && (
        <>
          <span className="sr-only">: {ctx.faltam === 1 ? "1 categoria sem grupo" : `${ctx.faltam} categorias sem grupo`}</span>
          <span aria-hidden className="inline-flex">
            <Contador valor={ctx.faltam} tom="marca" teto={Number.MAX_SAFE_INTEGER} className="ml-0.5" />
          </span>
        </>
      )}
    </Button>
  );
}

/** No relatório, o que falta classificar em uma linha, que abre o painel. */
export function AvisoDeSemGrupo({ className = "mb-4" }: { className?: string }) {
  const ctx = useContext(Ctx);
  if (!ctx || ctx.faltam === 0) return null;
  return (
    <Aviso tom="atencao" icone={<AlertTriangle />} className={className}>
      <span className="text-fg">
        <strong>{moeda(ctx.total)}</strong> sem grupo no DRE, fora das linhas abaixo —{" "}
        <Button variant="link" onClick={ctx.abrir} className="font-semibold" aria-haspopup="dialog">
          Classificar
        </Button>
      </span>
    </Aviso>
  );
}
