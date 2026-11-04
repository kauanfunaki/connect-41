"use client";

import { useState } from "react";
import { Phone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { RegistrarContato } from "./RegistrarContato";

/**
 * "Registrar contato" na linha da fila (Cobrança A, 04/11/2026): o mesmo
 * registro da ficha, numa janela — ligar e anotar sem sair da fila.
 */
export function RegistrarContatoNaLinha({
  entryId,
  sacadoNome,
  valor,
  hojeISO,
}: {
  entryId: string;
  sacadoNome: string;
  valor: string;
  hojeISO: string;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" size="xs" onClick={() => setAberto(true)} aria-label={`Registrar contato com ${sacadoNome}`}>
        <Phone size={12} /> Registrar contato
      </Button>
      <Modal open={aberto} onClose={() => setAberto(false)} title={`Contato com ${sacadoNome} · ${valor}`} maxWidth="max-w-lg">
        <RegistrarContato entryId={entryId} hojeISO={hojeISO} />
      </Modal>
    </>
  );
}
