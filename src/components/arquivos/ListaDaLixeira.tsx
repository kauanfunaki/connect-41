"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Folder, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { formatInstantDate, formatInstantDateTime } from "@/lib/format";
import type { ItemDaLixeira } from "@/lib/drive/servidor";
import { restaurar } from "@/app/(app)/arquivos/actions";
import { IconeDoArquivo } from "./IconeDoArquivo";

const QUANDO: Intl.DateTimeFormatOptions = { dateStyle: "short", timeStyle: "short" };

export function ListaDaLixeira({ itens }: { itens: ItemDaLixeira[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  const [emAndamento, setEmAndamento] = useState<string | null>(null);

  function restaurarItem(item: ItemDaLixeira) {
    setEmAndamento(item.id);
    startTransition(async () => {
      const r = await restaurar(item.tipo, item.id);
      setEmAndamento(null);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(item.tipo === "pasta" ? "Pasta restaurada." : "Arquivo restaurado.");
      router.refresh();
    });
  }

  return (
    <ul className="bg-surface border border-border rounded-lg divide-y divide-border">
      {itens.map((item) => (
        <li key={`${item.tipo}-${item.id}`} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
          {item.tipo === "pasta" ? (
            <Folder size={18} className="text-fg-muted shrink-0" aria-hidden />
          ) : (
            <IconeDoArquivo nome={item.nome} />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-fs-3 font-medium text-fg truncate">{item.nome}</p>
            <p className="text-micro text-fg-muted truncate">
              {item.onde} · excluído em {formatInstantDateTime(new Date(item.excluidoEm), QUANDO)} · some em{" "}
              {formatInstantDate(new Date(item.someEm), { dateStyle: "short" })}
            </p>
            {item.motivo && <p className="text-micro text-warning">{item.motivo}</p>}
          </div>
          {item.podeRestaurar && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => restaurarItem(item)}
              loading={pendente && emAndamento === item.id}
              disabled={pendente && emAndamento !== item.id}
            >
              <RotateCcw size={14} /> Restaurar
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
