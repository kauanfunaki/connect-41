"use client";

import { useState, useTransition } from "react";
import { FileCheck2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Aviso } from "@/components/ui/Aviso";
import { Selo } from "@/components/ui/Selo";
import { testarConexaoSped } from "@/app/(app)/admin/integracoes/sped-actions";

/**
 * O motor SPED na vitrine (22/10/2026): qual credencial está guardada — nunca
 * o valor — e o teste, um `GET /saude` que não grava nada.
 */
export function ServicoDoSped({ leitura, escrita }: { leitura: boolean; escrita: boolean }) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-fs-4 font-medium text-fg flex flex-wrap items-center gap-1.5">
            <FileCheck2 size={16} className="text-brand" /> Motor SPED: credenciais e teste
          </h3>
          <p className="text-ui text-fg-secondary mt-1 flex flex-wrap items-center gap-2">
            <span>Token de leitura</span>
            <Selo tom={leitura ? "sucesso" : "neutro"}>{leitura ? "configurado" : "não configurado"}</Selo>
            <span>Token de escrita</span>
            <Selo tom={escrita ? "sucesso" : "neutro"}>{escrita ? "configurado" : "não configurado"}</Selo>
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={pendente}
          loadingLabel="Testando…"
          disabled={!leitura}
          onClick={() =>
            startTransition(async () => {
              const r = await testarConexaoSped();
              setResultado(r.ok ? { ok: true, texto: r.texto } : { ok: false, texto: r.erro });
            })
          }
        >
          Testar conexão
        </Button>
      </div>
      {resultado && <Aviso tom={resultado.ok ? "sucesso" : "perigo"}>{resultado.texto}</Aviso>}
      <p className="text-micro text-fg-muted">
        Sem o token de escrita, o Connect só consulta o motor: execuções, arquivos e decisões aparecem, e as ações ficam desabilitadas.
      </p>
    </Card>
  );
}
