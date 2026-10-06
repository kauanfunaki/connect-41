"use client";

import {
  type LucideIcon,
  AlarmClock,
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  Check,
  CheckCircle2,
  FileSignature,
  Lock,
  MessageSquareWarning,
  Video,
  Wallet,
} from "lucide-react";
import { CarrosselDeEntrada, Cartao, Selo, type CorDoSelo, type SlideDeEntrada } from "@/components/entrada/CarrosselDeEntrada";
import { SLIDES_DA_EQUIPE, type ChaveDoSlideDaEquipe } from "./slidesDaEquipe";

// O carrossel da entrada da equipe (06/10/2026): o operacional do dia a dia no
// Connect, no mesmo desenho do carrossel do portal — cenas em código, com
// nomes e valores inventados. Os textos ficam em `slidesDaEquipe`.
//
// Cada cena imita uma tela que existe, com os rótulos dela: o Meu dia
// (/tarefas), a fila de processos do Societário, contas a pagar e aprovações
// do BPO, e a Agenda na visão de semana. As cenas se passam na mesma semana
// (19 a 23/10/2026), para uma não desmentir a outra.
//
// Na menor largura do computador (1024px) a cena tem uns 430px: os cartões
// principais ficam curtos, e os que flutuam ocupam as sobras, para os rótulos
// e selos não ficarem escondidos.

const CENAS: Record<ChaveDoSlideDaEquipe, () => React.ReactNode> = {
  "meu-dia": CenaDoMeuDia,
  processos: CenaDosProcessos,
  contas: CenaDasContas,
  agenda: CenaDaAgenda,
};

const SLIDES: SlideDeEntrada[] = SLIDES_DA_EQUIPE.map((s) => ({ ...s, Cena: CENAS[s.chave] }));

export function CarrosselDaEquipe() {
  return <CarrosselDeEntrada rotulo="O que você encontra no Connect" slides={SLIDES} />;
}

// Cor de cada setor nas cenas — inventadas, como o resto; no Connect a cor
// vem do cadastro do setor.
const SETOR = {
  societario: { rotulo: "Societário", cor: "#6D3FC0" },
  bpo: { rotulo: "BPO", cor: "#0E7A55" },
  dp: { rotulo: "DP", cor: "#C77700" },
  recrutamento: { rotulo: "Recrutamento", cor: "#C2417A" },
  tech: { rotulo: "Tech", cor: "#4B5468" },
} as const;

type ChaveDoSetor = keyof typeof SETOR;

function PontoDoSetor({ setor }: { setor: ChaveDoSetor }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="size-1.5 rounded-full" style={{ background: SETOR[setor].cor }} />
      {SETOR[setor].rotulo}
    </span>
  );
}

// ─── 1. Meu dia: o que pede você agora, os números e a reunião do dia ────────

function CenaDoMeuDia() {
  const itens: { Icone: LucideIcon; titulo: string; origem: string; setor: ChaveDoSetor; selo: React.ReactNode }[] = [
    {
      Icone: FileSignature,
      titulo: "Baixa — Comércio Lima & Filhos",
      origem: "Processo",
      setor: "societario",
      selo: <Selo cor="vermelho">Prazo vencido há 1 dia</Selo>,
    },
    {
      Icone: MessageSquareWarning,
      titulo: "Extrato bancário de setembro",
      origem: "Pendência",
      setor: "bpo",
      selo: <Selo cor="ambar">Vence hoje</Selo>,
    },
    {
      Icone: ArrowRightLeft,
      titulo: "Admissão de Carla Souza",
      origem: "Transferência",
      setor: "dp",
      selo: <Selo cor="ambar">Parado há 4 dias</Selo>,
    },
  ];
  const numeros: { rotulo: string; valor: string; tom: string }[] = [
    { rotulo: "Atrasados", valor: "1", tom: "text-[#B3372C]" },
    { rotulo: "Vencem em breve", valor: "3", tom: "text-[#9A5B00]" },
    { rotulo: "Em andamento", valor: "5", tom: "" },
    { rotulo: "Feitos na semana", valor: "14", tom: "text-[#0E7A55]" },
  ];
  return (
    <>
      <Cartao className="left-[2%] top-[3%] w-[65%] p-4 flex flex-col gap-3" entrar={0}>
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[17px] font-semibold leading-tight">Meu dia</p>
          <p className="text-[10.5px] text-[#6B7489] truncate">Segunda-feira, 19 de outubro</p>
        </div>
        <div className="rounded-xl border border-[#E9ECF3] overflow-hidden">
          <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#E9ECF3] text-[11.5px] font-semibold">
            <AlarmClock size={13} className="text-[#6B7489]" />
            Pede você agora
            <span className="ml-auto text-[10.5px] font-medium text-[#6B7489] tabular-nums">{itens.length}</span>
          </div>
          {itens.map((i) => (
            <div key={i.titulo} className="flex items-start gap-2.5 px-3 py-2.5 border-b border-[#F0F2F6] last:border-b-0">
              <span className="mt-0.5 inline-flex size-7 flex-shrink-0 items-center justify-center rounded-md bg-[#F2F4F8] text-[#4B5468]">
                <i.Icone size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold leading-snug truncate">{i.titulo}</span>
                <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] text-[#6B7489]">
                  <span>{i.origem}</span>
                  <span>·</span>
                  <PontoDoSetor setor={i.setor} />
                  {i.selo}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Cartao>
      {/* Os números do dia */}
      <Cartao className="right-[2%] top-[9%] w-[31%] z-10 p-3.5 flex flex-col gap-2" entrar={200}>
        {numeros.map((n) => (
          <span key={n.rotulo} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] text-[#6B7489]">{n.rotulo}</span>
            <span className={`flex-shrink-0 text-[18px] font-semibold tabular-nums leading-none ${n.tom}`}>{n.valor}</span>
          </span>
        ))}
      </Cartao>
      {/* A reunião do dia */}
      <Cartao className="right-[3%] bottom-[6%] w-[46%] z-20 p-3 flex items-center gap-2.5" entrar={380}>
        <span className="inline-flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#1F5EEA] text-white">
          <Video size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold truncate">Reunião de fechamento</span>
          <span className="block text-[10.5px] text-[#6B7489] truncate">hoje, 10:00 · Transportes Modelo</span>
        </span>
      </Cartao>
      {/* Meu dia × Meu time, a troca do coordenador */}
      <Cartao className="left-[5%] bottom-[4%] z-20 p-1 flex items-center gap-0.5 !rounded-full" entrar={520}>
        <span className="rounded-full bg-[#1F5EEA] px-3 py-1 text-[11px] font-semibold text-white">Meu dia</span>
        <span className="rounded-full px-3 py-1 text-[11px] font-semibold text-[#4B5468]">Meu time</span>
      </Cartao>
    </>
  );
}

// ─── 2. Processos: a fila do Societário, as etapas e a exigência ──────────────

function CenaDosProcessos() {
  const linhas: { tipo: string; empresa: string; selo: React.ReactNode; prazo: string; tom: string }[] = [
    {
      tipo: "Alteração Contratual",
      empresa: "Padaria Bom Grão",
      selo: <Selo cor="ambar">Em exigência</Selo>,
      prazo: "8 de 4–7 dias úteis",
      tom: "text-[#B3372C]",
    },
    {
      tipo: "Constituição",
      empresa: "Studio Aurora Design",
      selo: <Selo cor="azul">Aguardando órgão</Selo>,
      prazo: "3 de 4–7 dias úteis",
      tom: "text-[#4B5468]",
    },
    {
      tipo: "Baixa",
      empresa: "Comércio Lima & Filhos",
      selo: <Selo cor="cinza">Aguardando cliente</Selo>,
      prazo: "16 de 10–15 dias úteis",
      tom: "text-[#B3372C]",
    },
  ];
  const etapas: { rotulo: string; feita: boolean }[] = [
    { rotulo: "Elaboração da minuta", feita: true },
    { rotulo: "Sistemas da Junta", feita: true },
    { rotulo: "Sistemas da Receita", feita: true },
    { rotulo: "Acompanhamento do registro", feita: false },
  ];
  return (
    <>
      <Cartao className="left-[2%] top-[3%] w-[60%] p-4 flex flex-col gap-2.5" entrar={0}>
        <p className="text-[15px] font-semibold leading-tight">Processos</p>
        <span className="flex flex-wrap items-center gap-1.5 text-[10.5px] font-semibold">
          <span className="rounded-full bg-[#141824] px-2 py-0.5 text-white">Todos 12</span>
          <span className="rounded-full bg-[#EEF0F5] px-2 py-0.5 text-[#4B5468]">Em exigência 2</span>
          <span className="rounded-full bg-[#EEF0F5] px-2 py-0.5 text-[#4B5468]">Aguardando órgão 5</span>
        </span>
        <div className="flex flex-col">
          {linhas.map((l) => (
            <div key={l.tipo} className="flex items-center justify-between gap-3 py-2 border-t border-[#F0F2F6]">
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold leading-snug truncate">{l.tipo}</span>
                <span className="block text-[10.5px] text-[#6B7489] truncate">{l.empresa}</span>
              </span>
              <span className="flex flex-col items-end gap-1 flex-shrink-0">
                {l.selo}
                <span className={`text-[10.5px] font-medium tabular-nums whitespace-nowrap ${l.tom}`}>{l.prazo}</span>
              </span>
            </div>
          ))}
        </div>
      </Cartao>
      {/* As etapas de um processo */}
      <Cartao className="right-[2%] top-[20%] w-[38%] z-10 p-3.5 flex flex-col gap-2" entrar={260}>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold truncate">Constituição</span>
          <span className="block text-[10.5px] text-[#6B7489] truncate">Studio Aurora Design</span>
        </span>
        <ol className="flex flex-col gap-1.5">
          {etapas.map((e) => (
            <li key={e.rotulo} className="flex items-center gap-2 text-[11px]">
              {e.feita ? (
                <span className="inline-flex size-4 flex-shrink-0 items-center justify-center rounded-full bg-[#0E7A55] text-white">
                  <Check size={10} strokeWidth={3} />
                </span>
              ) : (
                <span className="inline-flex size-4 flex-shrink-0 items-center justify-center rounded-full border-2 border-[#1F5EEA]">
                  <span className="size-1.5 rounded-full bg-[#1F5EEA]" />
                </span>
              )}
              <span className={`truncate ${e.feita ? "text-[#6B7489]" : "font-semibold text-[#1F5EEA]"}`}>{e.rotulo}</span>
            </li>
          ))}
        </ol>
      </Cartao>
      {/* A exigência do órgão */}
      <Cartao className="left-[6%] bottom-[5%] w-[52%] z-20 p-3 flex items-start gap-2.5" entrar={460}>
        <span className="mt-0.5 inline-flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#FBF0DC] text-[#9A5B00]">
          <AlertTriangle size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold">Exigência da Junta · Padaria Bom Grão</span>
          <span className="block text-[11px] text-[#444D61] leading-snug">Falta a assinatura de um sócio no contrato.</span>
        </span>
      </Cartao>
    </>
  );
}

// ─── 3. Contas: os totais, a lista, a aprovada e a que espera o cliente ───────

function CenaDasContas() {
  const totais: { rotulo: string; valor: string; tom: string; Icone: LucideIcon }[] = [
    { rotulo: "Em aberto", valor: "R$ 48.320", tom: "", Icone: Wallet },
    { rotulo: "Vencido", valor: "R$ 2.180", tom: "text-[#B3372C]", Icone: AlertTriangle },
    { rotulo: "Vence hoje", valor: "R$ 6.452", tom: "text-[#9A5B00]", Icone: CalendarClock },
    { rotulo: "Pago", valor: "R$ 91.700", tom: "text-[#0E7A55]", Icone: CheckCircle2 },
  ];
  const contas: { fornecedor: string; empresa: string; valor: string; cor: CorDoSelo; situacao: string }[] = [
    { fornecedor: "Companhia de Energia", empresa: "Padaria Bom Grão", valor: "R$ 1.284,90", cor: "ambar", situacao: "Vence hoje" },
    { fornecedor: "Imobiliária Central", empresa: "Transportes Modelo", valor: "R$ 7.800,00", cor: "violeta", situacao: "Aguardando aprovação" },
    { fornecedor: "Oficina do Paulo", empresa: "Transportes Modelo", valor: "R$ 1.560,00", cor: "verde", situacao: "Aprovada" },
  ];
  return (
    <>
      {/* Os quatro números do topo da tela */}
      <Cartao className="left-[2%] top-[2%] w-[96%] px-4 py-3 grid grid-cols-4 gap-3" entrar={0}>
        {totais.map((t) => (
          <span key={t.rotulo} className="min-w-0 flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10.5px] text-[#6B7489] whitespace-nowrap">
              <t.Icone size={12} className="flex-shrink-0" /> {t.rotulo}
            </span>
            <span className={`text-[15px] font-semibold tabular-nums tracking-[-0.01em] truncate ${t.tom}`}>{t.valor}</span>
          </span>
        ))}
      </Cartao>
      <Cartao className="left-[2%] top-[25%] w-[64%] z-10 p-4 flex flex-col gap-1" entrar={160}>
        <p className="text-[14px] font-semibold mb-1">Contas a pagar</p>
        {contas.map((c) => (
          <div key={c.fornecedor} className="flex items-center justify-between gap-3 py-1.5 border-t border-[#F0F2F6]">
            <span className="min-w-0">
              <span className="block text-[12px] font-semibold leading-snug truncate">{c.fornecedor}</span>
              <span className="block text-[10.5px] text-[#6B7489] truncate">{c.empresa}</span>
            </span>
            <span className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[12.5px] font-semibold tabular-nums">{c.valor}</span>
              <Selo cor={c.cor}>{c.situacao}</Selo>
            </span>
          </div>
        ))}
      </Cartao>
      {/* A aprovação do cliente chegando */}
      <Cartao className="right-[2%] top-[33%] w-[32%] z-20 p-3 flex items-start gap-2" entrar={340}>
        <CheckCircle2 size={20} className="text-[#0E7A55] flex-shrink-0" />
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold leading-snug">Aprovada pelo cliente</span>
          <span className="block text-[10.5px] text-[#6B7489] truncate">Oficina do Paulo</span>
        </span>
      </Cartao>
      {/* A que ainda espera: o "Pagar" fica desligado, com o motivo embaixo */}
      <Cartao className="left-[8%] bottom-[4%] w-[58%] z-20 p-3 flex flex-col gap-2" entrar={500}>
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0 text-[11.5px] font-semibold truncate">Imobiliária Central · R$ 7.800,00</span>
          <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-[#EEF0F5] px-2.5 py-1 text-[11px] font-semibold text-[#8A93A6]">
            <Lock size={11} /> Pagar
          </span>
        </span>
        <span className="text-[10.5px] leading-snug text-[#6B7489]">
          Aguardando aprovação — a baixa só é liberada depois que a conta for aprovada.
        </span>
      </Cartao>
    </>
  );
}

// ─── 4. Agenda: a semana com os prazos dos setores e as reuniões ──────────────

function CenaDaAgenda() {
  const dias: { dia: string; hoje?: boolean; prazos: { titulo: string; setor: ChaveDoSetor }[]; reuniao?: { hora: string; titulo: string; linha: number } }[] = [
    {
      dia: "Seg 19",
      hoje: true,
      prazos: [{ titulo: "3 contas a pagar", setor: "bpo" }],
      reuniao: { hora: "10:00", titulo: "Reunião de fechamento", linha: 0 },
    },
    { dia: "Ter 20", prazos: [{ titulo: "Férias de Ana Lima", setor: "dp" }] },
    {
      dia: "Qua 21",
      prazos: [
        { titulo: "Alteração Contratual", setor: "societario" },
        { titulo: "Exame de Bruno Alves", setor: "dp" },
      ],
      reuniao: { hora: "14:30", titulo: "Alinhamento com o cliente", linha: 2 },
    },
    { dia: "Qui 22", prazos: [{ titulo: "Certificado vence: Mercado Vila Nova", setor: "tech" }], reuniao: { hora: "09:00", titulo: "Reunião do setor", linha: 0 } },
    { dia: "Sex 23", prazos: [{ titulo: "Inscrições encerram: Auxiliar administrativo", setor: "recrutamento" }] },
  ];
  const horas = ["09h", "11h", "14h", "16h"];
  return (
    <>
      <Cartao className="left-[2%] top-[2%] w-[96%] p-4 flex flex-col gap-3" entrar={0}>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold leading-tight">Agenda</span>
            <span className="block text-[10.5px] text-[#6B7489]">19 a 23 de outubro</span>
          </span>
          <span className="flex flex-shrink-0 items-center gap-0.5 rounded-lg bg-[#EEF0F5] p-0.5 text-[10.5px] font-semibold text-[#4B5468]">
            <span className="px-2 py-0.5">Dia</span>
            <span className="rounded-md bg-white px-2 py-0.5 text-[#141824] shadow-[0_1px_2px_rgba(0,0,0,0.08)]">Semana</span>
            <span className="px-2 py-0.5">Mês</span>
          </span>
        </div>
        <div className="grid grid-cols-5 gap-1.5">
          {dias.map((d) => (
            <div key={d.dia} className="min-w-0 flex flex-col gap-1">
              <span className={`text-[10.5px] font-semibold ${d.hoje ? "text-[#1F5EEA]" : "text-[#4B5468]"}`}>{d.dia}</span>
              {/* Prazos de dia inteiro, na cor do setor */}
              <span className="flex flex-col gap-1 min-h-[42px]">
                {d.prazos.map((p) => (
                  <span
                    key={p.titulo}
                    className="block truncate rounded-[5px] px-1.5 py-0.5 text-[9.5px] font-semibold"
                    style={{ background: `color-mix(in srgb, ${SETOR[p.setor].cor} 14%, white)`, color: SETOR[p.setor].cor }}
                  >
                    {p.titulo}
                  </span>
                ))}
              </span>
              {/* As horas, com a reunião no lugar dela */}
              <span className="flex flex-col">
                {horas.map((h, i) => (
                  <span key={h} className="relative h-7 border-t border-[#F0F2F6]">
                    {d.reuniao?.linha === i && (
                      <span className="absolute inset-x-0 top-0.5 rounded-[5px] bg-[#1F5EEA] px-1.5 py-0.5 text-white">
                        <span className="block text-[9px] font-semibold leading-tight tabular-nums">{d.reuniao.hora}</span>
                        <span className="block truncate text-[9.5px] leading-tight">{d.reuniao.titulo}</span>
                      </span>
                    )}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      </Cartao>
      {/* Os setores, pela cor */}
      <Cartao className="left-[4%] bottom-[4%] z-10 px-3 py-2 flex items-center gap-2.5 !rounded-full text-[10.5px] font-medium text-[#4B5468]" entrar={300}>
        <PontoDoSetor setor="societario" />
        <PontoDoSetor setor="bpo" />
        <PontoDoSetor setor="dp" />
        <PontoDoSetor setor="recrutamento" />
      </Cartao>
      {/* Uma reunião da semana, aberta */}
      <Cartao className="right-[3%] bottom-[3%] w-[42%] z-20 p-3 flex items-center gap-2.5" entrar={480}>
        <span className="inline-flex size-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#1F5EEA] text-white">
          <Video size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold truncate">Alinhamento com o cliente</span>
          <span className="block text-[10.5px] text-[#6B7489] truncate">qua, 14:30 · Studio Aurora Design</span>
        </span>
      </Cartao>
    </>
  );
}
