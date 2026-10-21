"use client";

import { useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { consultarCnpjDaContraparte, type ResultadoDaConsultaDeCnpj } from "@/lib/financeiro/consultaCnpj";

// A busca da contraparte pelo CNPJ, para os três lugares que cadastram uma:
// Fornecedores e sacados, o lançamento manual e a conciliação (pedido 2 do
// BPO, 19/10). Dispara sozinha quando o campo chega a 14 dígitos — como o
// cadastro de empresa — e quem usa decide o que preencher com a resposta.

export type AchadoNaReceita = Extract<ResultadoDaConsultaDeCnpj, { ok: true }>;

export type EstadoDaBusca =
  | { tipo: "ocioso" }
  | { tipo: "buscando" }
  | { tipo: "achou"; achado: AchadoNaReceita }
  | { tipo: "erro"; erro: string };

export function useBuscaDoCnpj(companyId: string | null, aoAchar: (achado: AchadoNaReceita) => void) {
  const [estado, setEstado] = useState<EstadoDaBusca>({ tipo: "ocioso" });
  // O último CNPJ pedido: a resposta de um CNPJ que a pessoa já trocou chega
  // depois e não pode preencher a ficha do novo.
  const pedido = useRef<string | null>(null);

  async function buscar(cnpj: string) {
    pedido.current = cnpj;
    setEstado({ tipo: "buscando" });
    const r = await consultarCnpjDaContraparte(cnpj, companyId);
    if (pedido.current !== cnpj) return;
    if (!r.ok) {
      setEstado({ tipo: "erro", erro: r.erro });
      return;
    }
    setEstado({ tipo: "achou", achado: r });
    aoAchar(r);
  }

  /** Chamar no `onChange` do campo de documento. */
  function aoDigitar(valor: string) {
    const d = valor.replace(/\D/g, "");
    if (d.length !== 14) {
      pedido.current = null;
      if (estado.tipo !== "ocioso") setEstado({ tipo: "ocioso" });
      return;
    }
    if (d === pedido.current) return;
    void buscar(d);
  }

  /** Busca de novo, mesmo que seja o CNPJ da última vez — o "Completar pela Receita" da ficha que já tem CNPJ. */
  function buscarAgora(valor: string) {
    const d = valor.replace(/\D/g, "");
    if (d.length === 14) void buscar(d);
  }

  return { estado, aoDigitar, buscarAgora };
}

/**
 * O texto de apoio do campo de documento, conforme a busca. `escolheExistente`:
 * quem grava reaproveita a ficha que já tem o CNPJ (lançamento, conciliação —
 * ver `criarLancamentoManual`); sem ele (o cadastro), é erro — salvar a
 * segunda ficha seria recusado.
 */
export function ajudaDaBusca(
  estado: EstadoDaBusca,
  {
    padrao,
    escolheExistente = false,
    proprioId,
  }: {
    padrao?: string;
    escolheExistente?: boolean;
    /** A ficha que está sendo editada: achar a si mesma não é conflito. */
    proprioId?: string;
  } = {}
): { helper?: string; error?: string } {
  if (estado.tipo === "buscando") return { helper: "Buscando na Receita…" };
  if (estado.tipo === "erro") return { error: estado.erro };
  if (estado.tipo === "achou") {
    const existente = estado.achado.existente?.id === proprioId ? null : estado.achado.existente;
    if (existente && escolheExistente) return { helper: `Já cadastrado nesta empresa como "${existente.nome}" — o lançamento usa essa ficha.` };
    if (existente) return { error: `Este CNPJ já é de "${existente.nome}" nesta empresa.` };
    return { helper: "Dados da Receita preenchidos. Confira antes de salvar." };
  }
  return { helper: padrao };
}

/**
 * O aviso de empresa que não está ativa na Receita. Fica fora do campo, em
 * destaque: pagar fornecedor baixado ou inapto é o tipo de coisa que o BPO
 * precisa ver antes, não depois.
 */
export function AvisoDaSituacao({ estado }: { estado: EstadoDaBusca }) {
  if (estado.tipo !== "achou" || estado.achado.ficha.ativa) return null;
  return (
    <Aviso tom="atencao" icone={<AlertTriangle />}>
      A Receita diz que esta empresa está <strong>{estado.achado.ficha.situacao}</strong>. Confira antes de lançar ou pagar.
    </Aviso>
  );
}
