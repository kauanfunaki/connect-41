"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useToast } from "@/components/ui/Toast";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { Check, Pencil } from "lucide-react";
import { conferirContasEmLote } from "@/lib/financeiro/acoes";
import { FORM_DAS_CONTAS } from "@/lib/financeiro/contas";
import { JanelaDaBaixaEmLote } from "./JanelaDaBaixaEmLote";
import { JanelaDaAlteracaoEmLote } from "./JanelaDaAlteracaoEmLote";

type Empresa = { id: string; nome: string; centros: { id: string; nome: string }[] };

/**
 * As caixas que a pessoa está vendo. Cada conta tem duas: a da linha da tabela
 * e a do cartão do celular, e a que não serve à largura atual fica escondida
 * por CSS (`md:hidden` / `hidden md:block`), não sai do DOM. Contar as duas
 * dobrava o contador e fazia o "Marcar todas" pegar os cartões das contas que o
 * funil da coluna tirou da tabela — e o lote agia sobre elas (auditoria de UX,
 * 30/10/2026). Caixa sob `display: none` não tem retângulo; a linha que o funil
 * esconde nem está no DOM.
 */
function caixas(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][form="${FORM_DAS_CONTAS}"]`)).filter(
    (c) => c.getClientRects().length > 0
  );
}

/**
 * Marca ou desmarca todas as contas da tabela. Mudar `checked` por código não
 * dispara `change`, e é pelo `change` que a barra e o cabeçalho se atualizam.
 */
function marcarTodas(marcar: boolean) {
  for (const c of caixas()) {
    if (c.checked === marcar) continue;
    c.checked = marcar;
    c.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

/** Quantas contas estão marcadas, e de quantas — acompanha as caixas das linhas. */
function useContasMarcadas(): { marcadas: number; total: number } {
  const [estado, setEstado] = useState({ marcadas: 0, total: 0 });
  useEffect(() => {
    const ler = () => {
      const todas = caixas();
      setEstado({ marcadas: todas.filter((c) => c.checked).length, total: todas.length });
    };
    ler();
    // O funil da coluna tira e põe linhas sem disparar `change`, e passar da
    // largura do celular para a do desktop troca as caixas visíveis: as duas
    // coisas mudam a conta. Uma leitura por quadro basta.
    let quadro = 0;
    const lerNoProximoQuadro = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(ler);
    };
    const observador = new MutationObserver(lerNoProximoQuadro);
    observador.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("change", ler);
    window.addEventListener("resize", lerNoProximoQuadro);
    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      document.removeEventListener("change", ler);
      window.removeEventListener("resize", lerNoProximoQuadro);
    };
  }, []);
  return estado;
}

/** A caixa do cabeçalho da tabela: marca todas, ou desmarca quando já estão. */
export function MarcarTodasAsContas() {
  const { marcadas, total } = useContasMarcadas();
  const todas = total > 0 && marcadas === total;
  const algumas = marcadas > 0 && !todas;
  // `indeterminate` só existe como propriedade do DOM, não como atributo.
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = algumas;
  }, [algumas]);
  return <Checkbox ref={ref} checked={todas} onChange={() => marcarTodas(!todas)} aria-label="Marcar todas as contas" />;
}

/**
 * O que se faz com as contas marcadas na tabela: pagar (ou receber) todas de
 * uma vez — a baixa em lote da fila do BPO, 19/10 —, conferir as provisórias
 * (escolha 12A, 20/10: o "Conferir" saiu da linha) e alterar vencimento,
 * competência, categoria, centro, projeto e conta corrente prevista (lote D,
 * 20/10 — a janela que substituiu o seletor de centro que ficava na barra).
 *
 * As caixas ficam nas linhas da tabela (componente de servidor) e se associam a
 * este formulário pelo atributo `form` — assim a tabela não vira componente de
 * cliente inteira, com as trezentas linhas e as ações de cada uma, só para ter
 * seleção. Os centros vêm agrupados por empresa: a lista mistura empresas, e o
 * centro de uma empresa não vale na outra.
 *
 * Desde o redesign de 30/09 é a barra de seleção em massa do Connect: só
 * aparece com conta marcada. As janelas ficam fora do formulário: aberta
 * dentro dele, o envio de uma janela subiria (pelo React, mesmo no portal) até
 * o formulário das caixas.
 */
export function AcoesEmLoteDasContas({
  empresas,
  comCentro,
  aPagar,
  hojeISO,
}: {
  empresas: Empresa[];
  /** Mostra o centro de custo na janela de alterar — só quando a lista tem empresa com centro. */
  comCentro: boolean;
  aPagar: boolean;
  hojeISO: string;
}) {
  const [lote, setLote] = useState<string[] | null>(null);
  const [alterar, setAlterar] = useState<string[] | null>(null);
  const [conferindo, startConferir] = useTransition();
  const { marcadas } = useContasMarcadas();
  const toast = useToast();

  function conferirMarcadas() {
    const ids = caixas().filter((c) => c.checked).map((c) => c.value);
    if (ids.length === 0) return;
    startConferir(async () => {
      const r = await conferirContasEmLote(ids);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      marcarTodas(false);
      const feitas = `${r.conferidas} ${r.conferidas === 1 ? "conta conferida" : "contas conferidas"}`;
      const fora = r.puladas > 0 ? ` — ${r.puladas} não ${r.puladas === 1 ? "estava" : "estavam"} a conferir.` : ".";
      toast.success(feitas + fora);
    });
  }
  const marcadasAgora = () => caixas().filter((c) => c.checked).map((c) => c.value);

  return (
    <>
      {/* Só associa as caixas das linhas: nada se envia por ele. */}
      <form id={FORM_DAS_CONTAS} onSubmit={(e) => e.preventDefault()}>
        <BulkActionBar count={marcadas} onClear={() => marcarTodas(false)}>
          <Button type="button" size="sm" onClick={() => setLote(marcadasAgora())}>
            {aPagar ? "Pagar marcadas" : "Receber marcadas"}
          </Button>
          <Button type="button" size="sm" variant="secondary" loading={conferindo} loadingLabel="Conferindo…" onClick={conferirMarcadas}>
            <Check size={14} /> Conferir marcadas
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setAlterar(marcadasAgora())}>
            <Pencil size={14} /> Alterar marcadas
          </Button>
        </BulkActionBar>
      </form>
      {lote && (
        <JanelaDaBaixaEmLote
          ids={lote}
          hojeISO={hojeISO}
          aPagar={aPagar}
          onFechar={() => setLote(null)}
          onBaixadas={(resumo) => {
            setLote(null);
            marcarTodas(false);
            toast.success(resumo);
          }}
        />
      )}
      {alterar && (
        <JanelaDaAlteracaoEmLote
          ids={alterar}
          centros={comCentro ? empresas : null}
          onFechar={() => setAlterar(null)}
          onAlteradas={(resumo) => {
            setAlterar(null);
            marcarTodas(false);
            toast.success(resumo);
          }}
        />
      )}
    </>
  );
}
