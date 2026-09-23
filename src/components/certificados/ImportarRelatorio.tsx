"use client";

import { useRef, useState, useTransition } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { parseCsv } from "@/lib/csv";
import { extrairDoRelatorio } from "@/lib/certificados/certificados";
import { importarRelatorio } from "@/app/(app)/certificados/actions";

/**
 * Importa o `certificados.csv` do script de conferência.
 *
 * O arquivo é lido **aqui, no navegador**, e só documento, titular, vencimento,
 * entrada do cofre e aviso seguem para o servidor. A coluna "Arquivo" fica para
 * trás: na pasta da 41 o nome do `.pfx` traz a senha.
 */
export function ImportarRelatorio() {
  const input = useRef<HTMLInputElement>(null);
  const [mensagem, setMensagem] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  async function ler(arquivo: File) {
    setMensagem(null);
    const { headers, rows } = parseCsv(await arquivo.text());
    const { linhas, faltando } = extrairDoRelatorio(headers, rows);
    if (faltando.length) {
      setMensagem({ tom: "erro", texto: `Não parece o relatório do script: faltam as colunas ${faltando.join(", ")}.` });
      return;
    }
    startTransition(async () => {
      const r = await importarRelatorio(linhas);
      if ("error" in r) setMensagem({ tom: "erro", texto: r.error });
      else {
        const s = r.resumo;
        setMensagem({
          tom: "ok",
          texto:
            `${s.novos} novo(s), ${s.atualizados} atualizado(s)` +
            (s.descartadas ? `, ${s.descartadas} linha(s) inválida(s) ignorada(s)` : "") +
            (s.semEmpresa ? ` · ${s.semEmpresa} titular(es) sem empresa no Connect` : "") +
            ". Certificados que o script não abriu ficam de fora.",
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        ref={input}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void ler(f);
        }}
      />
      <Button size="sm" loading={pendente} disabled={pendente} onClick={() => input.current?.click()}>
        <Upload size={13} /> Importar relatório
      </Button>
      {mensagem && (
        <span className={`text-[11px] max-w-[420px] text-right ${mensagem.tom === "erro" ? "text-danger" : "text-fg-muted"}`}>{mensagem.texto}</span>
      )}
    </div>
  );
}
