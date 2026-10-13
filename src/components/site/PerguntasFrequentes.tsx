import { Accordion } from "@/components/ui/Accordion";
import { CONTATO, EMPRESA } from "@/lib/site/textos";
import { FAIXA, LINK, RESPIRO, TITULO_2 } from "./estilos";
import { Rotulo } from "./Marca";

// Perguntas frequentes do site (13/10/2026, versão 3). Respostas curtas,
// factuais e modestas, sobre o que o Connect e a Lígia fazem hoje — cada uma
// confere com o código:
//
// - quem a Lígia é e o que ela não faz: `apresentacaoDaLigia` (lib/ia/ligia —
//   "nunca se passe por uma pessoa da equipe") e `escreve: false` nos agentes
//   do chat (lib/ia/catalogo);
// - o que ela vê: `agentesDoChat` e `escopoDoAgente` (lib/ia/chat/agentes — a
//   regra de acesso é a da tela; salário e dado médico pela permissão);
// - ligada por escritório, com a conta de IA dele e teto por mês:
//   `padraoLigado`, `tetoMensalCentavos` e a chave de cada cliente
//   (lib/ia/catalogo);
// - o portal com a conta Google: a entrada do portal (portal/login/google).
//
// Começam fechadas (decisão do Kauan de 08/10: recolhível abre fechado). O
// Accordion é o do app (components/ui), sem o `<details>` do navegador; a
// resposta já vem no HTML do servidor.

const PERGUNTAS: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "O que é o Connect?",
    resposta: `É o sistema em que o escritório de contabilidade organiza o trabalho dos setores — BPO Financeiro, Fiscal, Departamento Pessoal, Societário e Recrutamento — e atende os clientes pelo Portal do Cliente. Ele nasceu dentro de um escritório e é desenvolvido e operado pela ${EMPRESA.nome}, de Curitiba.`,
  },
  {
    pergunta: "Quem é a Lígia?",
    resposta:
      "É a inteligência artificial do Connect: uma assistente que atende cada setor no chat do canto da tela. Ela consulta o que está no sistema, responde em português comum e sugere o próximo passo. Se perguntarem, ela diz que é uma inteligência artificial — nunca se passa por alguém da equipe.",
  },
  {
    pergunta: "A Lígia faz alguma coisa sozinha?",
    resposta:
      "Não. Ela lê e sugere. Uma mudança, como concluir a etapa de um processo ou mover um candidato, só acontece quando uma pessoa da equipe confirma. Baixar uma conta, conciliar e aprovar continuam nas telas do Connect.",
  },
  {
    pergunta: "O que a Lígia consegue ver?",
    resposta:
      "O mesmo que a pessoa que pergunta: os setores e as telas a que ela tem acesso. Salário e dado médico só entram na resposta para quem tem essa permissão.",
  },
  {
    pergunta: "A Lígia pode errar?",
    resposta:
      "Pode, como qualquer inteligência artificial. Por isso ela consulta o Connect antes de responder, diz quando não encontrou o dado e, quando dá, termina com o link da tela para a pessoa conferir. A decisão continua com a equipe.",
  },
  {
    pergunta: "O cliente do escritório também fala com a Lígia?",
    resposta:
      "Ainda não. Hoje a Lígia atende a equipe do escritório. A ideia é que ela também atenda o cliente no Portal do Cliente — quando estiver pronta, ela aparece por lá.",
  },
  {
    pergunta: "Cada escritório escolhe o que usar?",
    resposta:
      "Sim. Os setores e os módulos são ligados por escritório, e a Lígia também, setor por setor, com a conta de inteligência artificial do próprio escritório e um teto de gasto por mês.",
  },
  {
    pergunta: "Como o cliente entra no Portal do Cliente?",
    resposta:
      "Com o acesso que o escritório cria para a empresa dele, pelo endereço do portal. Dá para entrar também com a conta Google, e o portal funciona no computador e no celular.",
  },
];

export function PerguntasFrequentes() {
  return (
    <section id="perguntas" aria-labelledby="perguntas-titulo" className="scroll-mt-16">
      <div className={`${FAIXA} ${RESPIRO} grid gap-10 lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] lg:gap-16`}>
        <div className="c41-site-surge lg:sticky lg:top-28 lg:self-start">
          <Rotulo>Dúvidas</Rotulo>
          <h2 id="perguntas-titulo" className={`${TITULO_2} mt-4 text-fg`}>
            Perguntas frequentes
          </h2>
          <p className="mt-5 max-w-[24em] text-fs-6 leading-relaxed text-fg-secondary">
            Não achou a sua dúvida? Escreva para a gente:
          </p>
          <a href={`mailto:${CONTATO}`} className={`${LINK} mt-1.5 inline-block break-all text-fs-6 font-semibold text-brand underline-offset-4 hover:underline`}>
            {CONTATO}
          </a>
        </div>

        <ul className="flex flex-col gap-3">
          {PERGUNTAS.map((p) => (
            <li key={p.pergunta} className="c41-site-surge rounded-2xl border border-border bg-canvas transition-colors hover:border-border-strong dark:bg-surface">
              <Accordion
                titulo={p.pergunta}
                chevron="fim"
                classeDoCabecalho="w-full rounded-2xl px-5 py-4 font-display text-fs-6 font-medium leading-snug text-fg sm:px-6 sm:py-5 sm:text-fs-7"
                classeDoConteudo="px-5 pb-5 text-fs-5 leading-relaxed text-fg-secondary sm:px-6 sm:pb-6"
              >
                <p className="max-w-[44em]">{p.resposta}</p>
              </Accordion>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
