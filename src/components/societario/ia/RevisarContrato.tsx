"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { RejeitarProposta } from "./RejeitarProposta";
import type { AcaoDaIa } from "@/app/(app)/societario/ia/actions";
import type { PlanoDoContrato, SocioLido } from "@/lib/societario/contratoSocial";

const INTEIRO = new Intl.NumberFormat("pt-BR");
const DUAS_CASAS = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Linha = {
  incluir: boolean;
  nome: string;
  documento: string;
  participacao: string;
  quotas: string;
  capital: string;
  administrador: boolean;
  qualificacao: string;
  entrada: string;
};

const paraLinha = (s: SocioLido): Linha => ({
  incluir: true,
  nome: s.nome,
  documento: s.documento ?? "",
  participacao: s.participacao === null ? "" : String(s.participacao).replace(".", ","),
  quotas: s.quotas === null ? "" : INTEIRO.format(s.quotas),
  capital: s.capital === null ? "" : DUAS_CASAS.format(s.capital),
  administrador: s.administrador,
  qualificacao: s.qualificacao ?? "",
  entrada: s.entrada ?? "",
});

/**
 * Número como a pessoa digita: "5.000,00", "33,33" ou "33.33". Com vírgula, o
 * ponto é milhar; sem vírgula, um ponto só seguido de 3 dígitos também é milhar
 * ("5.000"), e qualquer outro ponto é a casa decimal.
 */
function numeroBr(v: string): number | null {
  const t = v.trim().replace(/\s/g, "");
  if (!t) return null;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

const paraSocio = (l: Linha): SocioLido => ({
  nome: l.nome.trim(),
  documento: l.documento.replace(/\D/g, "") || null,
  participacao: numeroBr(l.participacao),
  quotas: numeroBr(l.quotas),
  capital: numeroBr(l.capital),
  administrador: l.administrador,
  qualificacao: l.qualificacao.trim() || null,
  entrada: l.entrada || null,
});

/**
 * A revisão da leitura do contrato social. Cada linha é um sócio como a IA
 * leu; o coordenador corrige, desmarca o que não deve entrar, confere a prévia
 * contra o cadastro e grava.
 */
export function RevisarContrato({
  propostaId,
  companyId,
  lidos,
  planoInicial,
  avisosIniciais,
  podeAplicar,
  acoes,
}: {
  propostaId: string;
  companyId: string;
  lidos: SocioLido[];
  planoInicial: PlanoDoContrato;
  avisosIniciais: string[];
  podeAplicar: boolean;
  acoes: {
    aplicar: (id: string, linhas: SocioLido[]) => Promise<AcaoDaIa>;
    rejeitar: (id: string, motivo: string) => Promise<AcaoDaIa>;
    previa: (id: string, linhas: SocioLido[]) => Promise<{ error: string } | { plano: PlanoDoContrato; avisos: string[] }>;
  };
}) {
  const router = useRouter();
  const [linhas, setLinhas] = useState<Linha[]>(lidos.map(paraLinha));
  const [plano, setPlano] = useState(planoInicial);
  const [avisos, setAvisos] = useState(avisosIniciais);
  const [previaVelha, setPreviaVelha] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, startTransition] = useTransition();

  const mudar = (i: number, campo: keyof Linha, valor: string | boolean) => {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
    setPreviaVelha(true);
  };
  const marcadas = () => linhas.filter((l) => l.incluir).map(paraSocio);

  const atualizarPrevia = () =>
    startTransition(async () => {
      const r = await acoes.previa(propostaId, marcadas());
      if ("error" in r) setMsg({ tipo: "erro", texto: r.error });
      else {
        setPlano(r.plano);
        setAvisos(r.avisos);
        setPreviaVelha(false);
      }
    });

  const TH = "py-2 pr-2 text-left font-semibold text-[length:var(--fs-micro)] uppercase tracking-wide text-fg-muted whitespace-nowrap";
  // Tudo centralizado na altura da linha: as caixas de marcar tinham `pt-3`
  // chutado para acompanhar o Input, e ficavam 4px acima do centro dele.
  const TD = "py-2 pr-2 align-middle";

  return (
    <div className="flex flex-col gap-4">
      {avisos.length > 0 && (
        <ul className="rounded-lg border border-warning/40 bg-warning-bg px-4 py-3 text-[13px] text-fg flex flex-col gap-1">
          {avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[980px] text-[13px]">
          <thead className="border-b border-border">
            <tr>
              <th className={`${TH} pl-3`}>Gravar</th>
              <th className={TH}>Nome</th>
              <th className={TH}>CPF / CNPJ</th>
              <th className={TH}>Participação</th>
              <th className={TH}>Quotas</th>
              <th className={TH}>Capital</th>
              <th className={TH}>Administra</th>
              <th className={TH}>Qualificação</th>
              <th className={TH}>Entrada</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {linhas.map((l, i) => (
              <tr key={i} className={l.incluir ? "" : "opacity-50"}>
                <td className={`${TD} pl-3`}>
                  <Checkbox id={`inc-${i}`} aria-label={`Gravar ${l.nome}`} checked={l.incluir} disabled={!podeAplicar} onChange={(e) => mudar(i, "incluir", e.target.checked)} />
                </td>
                <td className={TD}>
                  <Input aria-label="Nome" value={l.nome} disabled={!podeAplicar} onChange={(e) => mudar(i, "nome", e.target.value)} className="min-w-52" />
                </td>
                <td className={TD}>
                  <Input aria-label="CPF ou CNPJ" value={l.documento} disabled={!podeAplicar} onChange={(e) => mudar(i, "documento", e.target.value)} className="w-40 tabular-nums" />
                </td>
                <td className={TD}>
                  <Input aria-label="Participação" inputMode="decimal" suffix="%" value={l.participacao} disabled={!podeAplicar} onChange={(e) => mudar(i, "participacao", e.target.value)} className="w-28 tabular-nums" />
                </td>
                <td className={TD}>
                  <Input aria-label="Quotas" inputMode="numeric" value={l.quotas} disabled={!podeAplicar} onChange={(e) => mudar(i, "quotas", e.target.value)} className="w-28 tabular-nums" />
                </td>
                <td className={TD}>
                  <Input aria-label="Capital" inputMode="decimal" prefix="R$" value={l.capital} disabled={!podeAplicar} onChange={(e) => mudar(i, "capital", e.target.value)} className="w-40 tabular-nums" />
                </td>
                <td className={TD}>
                  <Checkbox id={`adm-${i}`} aria-label="Administra" checked={l.administrador} disabled={!podeAplicar} onChange={(e) => mudar(i, "administrador", e.target.checked)} />
                </td>
                <td className={TD}>
                  <Input aria-label="Qualificação" value={l.qualificacao} disabled={!podeAplicar} onChange={(e) => mudar(i, "qualificacao", e.target.value)} className="w-40" />
                </td>
                <td className={TD}>
                  <Input aria-label="Data de entrada" type="date" value={l.entrada} disabled={!podeAplicar} onChange={(e) => mudar(i, "entrada", e.target.value)} className="w-40" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section aria-labelledby="previa" className="rounded-lg border border-border bg-surface p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="previa" className="text-[length:var(--fs-card-title)] font-semibold text-fg">
            O que vai mudar no cadastro de sócios
          </h3>
          {podeAplicar && previaVelha && (
            <Button variant="secondary" size="sm" disabled={pendente} onClick={atualizarPrevia}>
              Atualizar a prévia com as correções
            </Button>
          )}
        </div>
        {plano.novos.length === 0 && plano.atualizar.length === 0 && (
          <p className="text-[13px] text-fg-muted">Nada muda: o cadastro já está como o contrato.</p>
        )}
        {plano.novos.length > 0 && (
          <div className="text-[13px]">
            <p className="font-medium text-fg">Entram como sócios novos</p>
            <ul className="list-disc pl-5 text-fg-secondary">
              {plano.novos.map((n) => (
                <li key={n.nome + (n.documento ?? "")}>{n.nome}</li>
              ))}
            </ul>
          </div>
        )}
        {plano.atualizar.length > 0 && (
          <div className="text-[13px] flex flex-col gap-1">
            <p className="font-medium text-fg">Já cadastrados, com dados que mudam</p>
            {plano.atualizar.map((a) => (
              <div key={a.id} className="text-fg-secondary">
                <span className="text-fg">{a.nomeNoCadastro}:</span>{" "}
                {a.mudancas.map((m) => `${m.campo} ${m.de} → ${m.para}`).join(" · ")}
              </div>
            ))}
          </div>
        )}
        {plano.iguais.length > 0 && (
          <p className="text-[13px] text-fg-muted">Sem mudança: {plano.iguais.map((i) => i.nomeNoCadastro).join(", ")}.</p>
        )}
        {plano.foraDoContrato.length > 0 && (
          <p className="text-[13px] text-warning">
            No cadastro e fora deste contrato: {plano.foraDoContrato.map((f) => f.nome).join(", ")}. Ninguém sai sozinho — se saiu,
            registre a saída com a data em{" "}
            <Link href={`/empresas/${companyId}/socios`} className="underline">
              Sócios
            </Link>
            .
          </p>
        )}
      </section>

      {msg && <p className={`text-[13px] ${msg.tipo === "erro" ? "text-danger" : "text-success"}`}>{msg.texto}</p>}

      {/* Rodapé do formulário: rejeitar (a saída destrutiva) à esquerda, e o
          primário sozinho à direita. Estavam juntos, e o campo do motivo, ao
          abrir, empurrava o "Gravar" para longe. */}
      {podeAplicar && (
        <div className="flex flex-wrap items-start justify-between gap-3 pt-4 border-t border-border">
          <RejeitarProposta propostaId={propostaId} rejeitar={acoes.rejeitar} />
          <Button
            variant="primary"
            disabled={pendente || linhas.every((l) => !l.incluir) || previaVelha}
            title={previaVelha ? "Atualize a prévia antes de gravar" : undefined}
            onClick={() =>
              startTransition(async () => {
                setMsg(null);
                const r = await acoes.aplicar(propostaId, marcadas());
                if ("error" in r) setMsg({ tipo: "erro", texto: r.error });
                else {
                  setMsg({ tipo: "ok", texto: r.mensagem ?? "Sócios gravados." });
                  router.refresh();
                }
              })
            }
          >
            {pendente ? "Gravando…" : "Gravar sócios"}
          </Button>
        </div>
      )}
    </div>
  );
}
