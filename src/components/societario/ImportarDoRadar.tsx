"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { importarDoRadarAction } from "@/app/(app)/licencas/radar/actions";

/** "Trazer N licenças": grava o que a prévia mostrou. Pode levar alguns minutos com anexos. */
export function ImportarDoRadar({ url, quantas }: { url: string; quantas: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pendente, startTransition] = useTransition();
  return (
    <Button
      loading={pendente}
      disabled={quantas === 0}
      onClick={() =>
        startTransition(async () => {
          const r = await importarDoRadarAction(url);
          if (r.ok) toast.success(r.texto);
          else toast.error(r.erro);
          router.refresh();
        })
      }
    >
      <Download size={14} /> Trazer {quantas} licença{quantas === 1 ? "" : "s"}
    </Button>
  );
}
