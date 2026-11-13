"use client";

import { useState } from "react";
import { Accordion } from "@/components/ui/Accordion";
import { Button } from "@/components/ui/Button";
import { dataBr, moedaDoRelatorio as moeda } from "@/lib/contabil-core/conciliacao/telaDaConciliacao";
import { paginaDe } from "@/lib/contabil-core/conciliacao/telaDaRevisao";
import { TITULOS_POR_PAGINA } from "@/lib/contabil-core/conciliacao/telaDoFinanceiro";
import type { LinhaFinanceiroJson } from "@/lib/contabil-core/conciliacao/financeiroTipos";

// Os títulos em aberto das visões de contas a pagar e a receber (Bloco B, Fase B4, 12/11/2026): porte
// do `TitulosAbertos.tsx` do Contábil Core. Só apoio: não entram nos totais nem podem ser escolhidos
// para uma composição (a rota do vínculo recusa o id deles). A data é o vencimento, não o pagamento.

export function TitulosAbertos({ linhas }: { linhas: readonly LinhaFinanceiroJson[] }) {
  const [pagina, setPagina] = useState(0);
  if (linhas.length === 0) return null;
  const pag = paginaDe(linhas, pagina, TITULOS_POR_PAGINA);
  return (
    <div className="rounded-lg border border-border p-3">
      <Accordion classeDoCabecalho="w-full text-left text-sm font-semibold" titulo={`Títulos em aberto — só apoio (${linhas.length})`}>
        <div className="mt-3 flex flex-col gap-3">
          <p className="text-micro text-fg-muted">Não entram nos totais e não podem ser escolhidos para uma composição. A data abaixo é o vencimento, não o pagamento.</p>
          <ul className="flex flex-col gap-2">
            {pag.itens.map((l) => (
              <li key={l.id} className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
                <p className="flex flex-wrap justify-between gap-3">
                  <span>Em aberto · Vencimento: {dataBr(l.data)}</span>
                  <span className="tabular-nums whitespace-nowrap font-semibold">{moeda(l.valor)}</span>
                </p>
                <p className="break-words">{l.favorecido || l.historico}</p>
                {l.favorecido && l.historico !== l.favorecido && <p className="text-micro break-words">{l.historico}</p>}
                <p className="text-micro text-fg-muted break-words">
                  {l.documento || "Documento não informado"} · {l.categoria || "Categoria não informada"}
                </p>
                {l.banco && <p className="text-micro text-fg-muted break-words">Conta informada no arquivo: {l.banco}</p>}
              </li>
            ))}
          </ul>
          {linhas.length > TITULOS_POR_PAGINA && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-micro text-fg-muted">
              <span>
                Página {pag.pagina + 1} de {pag.paginas}
              </span>
              <div className="flex gap-1" role="group" aria-label="Páginas dos títulos em aberto">
                <Button type="button" size="xs" variant="secondary" disabled={pag.pagina === 0} onClick={() => setPagina(pag.pagina - 1)}>
                  Anterior
                </Button>
                <Button type="button" size="xs" variant="secondary" disabled={pag.pagina + 1 >= pag.paginas} onClick={() => setPagina(pag.pagina + 1)}>
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      </Accordion>
    </div>
  );
}
