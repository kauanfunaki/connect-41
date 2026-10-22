"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Aviso } from "@/components/ui/Aviso";
import { Modal } from "@/components/ui/Modal";
import { CampoFiscal } from "@/components/fiscal/previa/Compartilhados";
import { atualizarEstabelecimentoNoMotor } from "@/app/(app)/fiscal/motor-actions";
import { useChaveDeIdempotencia } from "./useChaveDeIdempotencia";

/** Os campos que o motor aceita no `PUT /empresas/{id}` (§3.3); CNPJ, UF e situação ficam de fora. */
const CAMPOS: [string, string, number][] = [
  ["razao_social", "Razão social", 255], ["nome_fantasia", "Nome fantasia", 255], ["apelido", "Apelido", 100],
  ["codigo_externo", "Código externo", 20], ["codigo_dominio", "Código na Domínio", 20], ["ie", "Inscrição estadual", 20],
  ["cod_mun", "Código do município", 7], ["cod_ver", "Versão do leiaute", 3], ["ind_perfil", "Perfil (A/B/C)", 1], ["ind_ativ", "Atividade (0/1)", 1],
  ["cep", "CEP", 8], ["endereco", "Endereço", 60], ["numero", "Número", 10], ["complemento", "Complemento", 60], ["bairro", "Bairro", 60],
  ["telefone", "Telefone", 11], ["email", "E-mail", 115], ["resp_nome", "Responsável", 100], ["resp_cpf", "CPF do responsável", 11],
  ["resp_crc", "CRC do responsável", 15], ["cod_cta", "Conta contábil", 60], ["cod_inf", "Informação complementar", 6],
  ["cod_receita_icms", "Código de receita do ICMS", 10], ["dia_vcto_icms", "Dia de vencimento do ICMS", 2],
];

export function EditarEstabelecimento({ raiz, id, rotulo, valores, atualizadoEm }: { raiz: string; id: number; rotulo: string; valores: Record<string, string>; atualizadoEm: string | null }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [atuais, setAtuais] = useState(valores);
  const [chave, , depoisDe] = useChaveDeIdempotencia();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const salvar = () => startTransition(async () => {
    // Parcial: só o que mudou (os ausentes ficam como estão no motor).
    const campos: Record<string, string | number> = {};
    for (const [nome] of CAMPOS) if ((atuais[nome] ?? "") !== (valores[nome] ?? "")) campos[nome] = nome === "dia_vcto_icms" ? Number(atuais[nome] || 0) : atuais[nome] ?? "";
    const r = await atualizarEstabelecimentoNoMotor({ raiz, id, chave, atualizadoEmEsperado: atualizadoEm, campos });
    depoisDe(r);
    if (!r.ok) { setErro(r.campos ? `${r.mensagem} ${Object.entries(r.campos).map(([k, v]) => `${k}: ${v}`).join("; ")}` : r.mensagem); return; }
    setAberto(false);
    router.refresh();
  });
  return <>
    <Button size="xs" variant="secondary" onClick={() => { setAtuais(valores); setErro(null); setAberto(true); }}>Editar</Button>
    <Modal open={aberto} title={`Cadastro no motor · ${rotulo}`} onClose={() => setAberto(false)} maxWidth="max-w-3xl">
      <p className="mb-4 text-helper text-fg-secondary">Vai para o registro 0000/0005/0100 dos próximos SPEDs e deixa os já gerados defasados. CNPJ, UF e situação só mudam no painel do motor.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {CAMPOS.map(([nome, label, max]) => <CampoFiscal key={nome} nome={label}><Input maxLength={max} inputMode={nome === "dia_vcto_icms" ? "numeric" : undefined} value={atuais[nome] ?? ""} onChange={(e) => setAtuais((a) => ({ ...a, [nome]: e.target.value }))} /></CampoFiscal>)}
      </div>
      {erro && <Aviso tom="atencao" className="mt-4">{erro}</Aviso>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button loading={pendente} onClick={salvar}>Salvar no motor</Button>
        <Button variant="secondary" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </Modal>
  </>;
}
