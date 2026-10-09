"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";

export function NovoItemModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const fechar = useCallback(() => router.back(), [router]);
  return <Modal open onClose={fechar} title="Nova tarefa" maxWidth="max-w-3xl">{children}</Modal>;
}
