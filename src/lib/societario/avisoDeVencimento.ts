// O e-mail diário de vencimentos do Societário (12/11/2026), o que o Radar
// Societário mandava. Regras puras: o que entra no e-mail e em que marco.
//
// Decisões do Kauan (12/11/2026):
// - vai para uma lista de e-mails que o Societário mantém na tela de Licenças;
// - entram licenças e certidões;
// - licença avisa a 90, 60 e 30 dias e quando vence (os marcos do Radar), uma
//   vez por marco. Vencida há mais de 30 dias não entra: já é atraso conhecido,
//   e na primeira passada lotaria o e-mail;
// - certidão vale de 30 a 180 dias, então 90/60/30 avisaria no dia da emissão.
//   Ela segue a regra da própria tela de Certidões: avisa quando sai positiva,
//   quando vence em até 15 dias e quando venceu — uma vez cada.

import { somarDias } from "@/lib/datas/calendario";
import { DIAS_PARA_VENCER } from "@/lib/certidoes/lista-regras";
import { ehRegular, ROTULO_DA_CERTIDAO, type SituacaoDaCertidao, type TipoDeCertidao } from "@/lib/certidoes/regras";

export const MARCOS_DA_LICENCA = [90, 60, 30] as const;
/** Licença vencida há mais que isto não entra no e-mail. */
export const VENCIDA_HA_NO_MAXIMO = 30;

export type LicencaParaAviso = {
  id: string;
  empresa: string;
  cnpj: string | null;
  tipo: string;
  numero: string | null;
  /** "AAAA-MM-DD" da validade. */
  venceEm: string;
};

export type CertidaoParaAviso = {
  id: string;
  empresa: string;
  cnpj: string | null;
  tipo: TipoDeCertidao;
  situacao: SituacaoDaCertidao;
  validaAte: string | null;
  /** Alguém do setor já marcou a positiva como vista. */
  vista: boolean;
};

export type ItemDoAviso = {
  /** Chave do envio: o mesmo item no mesmo marco não sai duas vezes. */
  chave: string;
  empresa: string;
  cnpj: string | null;
  documento: string;
  /** "AAAA-MM-DD", ou null (certidão positiva sem validade). */
  vence: string | null;
  /** Em palavras: "vence em 45 dias", "venceu há 3 dias", "saiu positiva". */
  situacao: string;
  /** Para a cor da linha no e-mail. */
  gravidade: "vencida" | "perto" | "atencao";
};

/** Dias entre dois "AAAA-MM-DD" (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

const emPalavras = (dias: number) =>
  dias < 0 ? `venceu há ${-dias} dia${dias === -1 ? "" : "s"}` : dias === 0 ? "vence hoje" : `vence em ${dias} dia${dias === 1 ? "" : "s"}`;

/** O marco da licença hoje: 90, 60, 30, "vencida" ou nada (fora de todos). */
export function marcoDaLicenca(venceEm: string, hoje: string): number | "vencida" | null {
  const dias = diasEntre(hoje, venceEm);
  if (dias < 0) return -dias <= VENCIDA_HA_NO_MAXIMO ? "vencida" : null;
  const marcos = [...MARCOS_DA_LICENCA].sort((a, b) => a - b);
  return marcos.find((m) => dias <= m) ?? null;
}

export function itensDasLicencas(licencas: LicencaParaAviso[], hoje: string): ItemDoAviso[] {
  const itens: ItemDoAviso[] = [];
  for (const l of licencas) {
    const marco = marcoDaLicenca(l.venceEm, hoje);
    if (marco === null) continue;
    const dias = diasEntre(hoje, l.venceEm);
    itens.push({
      chave: `VENC_EMAIL:LIC:${l.id}:${marco}:${l.venceEm}`,
      empresa: l.empresa,
      cnpj: l.cnpj,
      documento: l.numero ? `${l.tipo} nº ${l.numero}` : l.tipo,
      vence: l.venceEm,
      situacao: emPalavras(dias),
      gravidade: dias < 0 ? "vencida" : dias <= 30 ? "perto" : "atencao",
    });
  }
  return itens;
}

export function itensDasCertidoes(certidoes: CertidaoParaAviso[], hoje: string): ItemDoAviso[] {
  const itens: ItemDoAviso[] = [];
  for (const c of certidoes) {
    if (c.situacao === "NAO_SAIU") continue;
    const documento = `Certidão ${ROTULO_DA_CERTIDAO[c.tipo]}`;
    const base = { empresa: c.empresa, cnpj: c.cnpj, documento, vence: c.validaAte };
    if (!ehRegular(c.situacao)) {
      // Positiva: avisa uma vez por certidão, enquanto ninguém do setor marcou como vista.
      if (!c.vista) itens.push({ ...base, chave: `VENC_EMAIL:CERT:${c.id}:positiva`, situacao: "saiu positiva", gravidade: "vencida" });
      continue;
    }
    if (!c.validaAte) continue;
    const dias = diasEntre(hoje, c.validaAte);
    if (dias < 0) {
      if (-dias <= VENCIDA_HA_NO_MAXIMO) {
        itens.push({ ...base, chave: `VENC_EMAIL:CERT:${c.id}:vencida`, situacao: emPalavras(dias), gravidade: "vencida" });
      }
    } else if (c.validaAte <= somarDias(hoje, DIAS_PARA_VENCER)) {
      itens.push({ ...base, chave: `VENC_EMAIL:CERT:${c.id}:vencendo`, situacao: emPalavras(dias), gravidade: "perto" });
    }
  }
  return itens;
}

/** A ordem do e-mail: o mais urgente primeiro (vencido, depois a data mais próxima). */
export function ordenar(itens: ItemDoAviso[]): ItemDoAviso[] {
  const peso = { vencida: 0, perto: 1, atencao: 2 } as const;
  return [...itens].sort(
    (a, b) => peso[a.gravidade] - peso[b.gravidade] || (a.vence ?? "").localeCompare(b.vence ?? "") || a.empresa.localeCompare(b.empresa, "pt-BR"),
  );
}

/** A lista de e-mails digitada (um por linha, ou separados por vírgula ou ponto e vírgula), sem repetir. */
export function lerEmails(texto: string): { validos: string[]; invalidos: string[] } {
  const partes = texto
    .split(/[\s,;]+/)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  const validos: string[] = [];
  const invalidos: string[] = [];
  for (const p of partes) {
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p)) {
      if (!validos.includes(p)) validos.push(p);
    } else invalidos.push(p);
  }
  return { validos, invalidos };
}
