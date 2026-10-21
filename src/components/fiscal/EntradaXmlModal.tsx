"use client";

import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { EntradaXmlForm } from "@/components/fiscal/EntradaXmlForm";
import type { EstadoDaEntrada } from "@/app/(app)/documentos-fiscais/entrada/actions";

type Empresa = {
  id: string;
  name: string;
  displayName: string | null;
  logoUrl: string | null;
  cnpj: string | null;
  parentCompanyId: string | null;
};

type Props = {
  empresas: Empresa[];
  action: (anterior: EstadoDaEntrada, form: FormData) => Promise<EstadoDaEntrada>;
};

/** Entrada manual de XML aberta como diálogo de navegação. */
export function EntradaXmlModal({ empresas, action }: Props) {
  const router = useRouter();

  return (
    <Modal open onClose={() => router.push("/documentos-fiscais")} title="Entrada de XML" maxWidth="max-w-3xl">
      <EntradaXmlForm empresas={empresas} action={action} />
    </Modal>
  );
}
