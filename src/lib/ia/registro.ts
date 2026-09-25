// Quem coloca as ferramentas no registro.
//
// Existe como função explícita, e não como efeito colateral de `import`, por
// dois motivos: import só por efeito é a primeira coisa que um bundler
// reordena ou remove, e um registro vazio não quebra nada — o agente
// simplesmente recusa todas as ferramentas dele, o que na tela parece um
// modelo que resolveu não consultar nada. Bug silencioso, do tipo pior.
//
// `conversarComFerramentas` chama isto antes de montar a conversa. É
// idempotente, então chamar de novo não custa nem duplica.

import { FERRAMENTAS, registrarFerramentas } from "@/lib/ia/ferramentas";
import { FERRAMENTAS_DE_RECRUTAMENTO } from "@/lib/ia/ferramentas-recrutamento";
import { FERRAMENTAS_DE_CANDIDATO } from "@/lib/ia/ferramentas-candidato";
import { FERRAMENTAS_DE_SOCIETARIO } from "@/lib/ia/ferramentas-societario";
import { FERRAMENTAS_DE_AJUDA } from "@/lib/ia/ferramentas-ajuda";
import { FERRAMENTAS_DE_RECRUTAMENTO_DO_SETOR } from "@/lib/ia/ferramentas-recrutamento-setor";
import { FERRAMENTAS_DE_FISCAL } from "@/lib/ia/ferramentas-fiscal";

const CONJUNTOS = [
  FERRAMENTAS_DE_RECRUTAMENTO,
  FERRAMENTAS_DE_CANDIDATO,
  FERRAMENTAS_DE_SOCIETARIO,
  FERRAMENTAS_DE_AJUDA,
  FERRAMENTAS_DE_RECRUTAMENTO_DO_SETOR,
  FERRAMENTAS_DE_FISCAL,
];

export function registrarTodasAsFerramentas(): void {
  for (const conjunto of CONJUNTOS) {
    // Já registrado: sai. `registrarFerramentas` recusa nome repetido de
    // propósito, e não é papel dele distinguir "duplicata de verdade" de
    // "chamaram duas vezes".
    const primeiro = Object.keys(conjunto)[0];
    if (primeiro && FERRAMENTAS[primeiro]) continue;
    registrarFerramentas(conjunto);
  }
}
