// Roteiros dos vídeos do portal do cliente (01/10/2026; refeitos em 06/10).
//
// Ordem pensada para quem chega: primeiro entrar e a primeira tela (o Início),
// depois o que o cliente faz na primeira semana (pedir, responder, aprovar) e
// por fim o que é consulta.
//
// O texto das legendas fala com o cliente, não com a equipe: "o escritório",
// "você", sem termo interno (BPO, módulo, setor) e sem o nome de um escritório
// — o portal é de todo escritório que usa o Connect.
//
// 06/10: o portal ganhou a entrada em duas metades, o "Lembrar de mim" e o
// Início como primeira tela (os documentos fiscais foram para
// `/portal/documentos`). O "Esqueci minha senha" agora é a tela da equipe com
// `?de=portal`, e o mês do Relatório é escolhido num calendário de meses.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { zonaDeAnexo, type DefinicaoDeVideo, type Roteiro } from "./gravador";

const SELO = "Portal do cliente";

async function encerramento(r: Roteiro, texto = "Dúvida? Abra uma solicitação pelo portal: a equipe responde por lá.") {
  await r.cartaz(SELO, "Pronto!", texto, 3200);
}

function menu(r: Roteiro) {
  return r.page.getByRole("navigation", { name: "Portal" });
}

function main(r: Roteiro) {
  return r.page.getByRole("main");
}

/** O quadro "O que precisa de você" do Início. */
function precisaDeVoce(r: Roteiro) {
  return main(r).getByRole("region", { name: "O que precisa de você" });
}

/** Um PDF mínimo, mas válido, para anexar nas respostas. */
function pdfDeExemplo(pasta: string, nome: string) {
  const texto = "Extrato de exemplo - setembro";
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${44 + texto.length} >>\nstream\nBT /F1 18 Tf 72 760 Td (${texto}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let corpo = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(corpo.length);
    corpo += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = corpo.length;
  corpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const p of posicoes) corpo += `${String(p).padStart(10, "0")} 00000 n \n`;
  corpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  mkdirSync(pasta, { recursive: true });
  const arquivo = path.join(pasta, nome);
  writeFileSync(arquivo, corpo);
  return arquivo;
}

export function videosDoPortal(opcoes: { email: string; senha: string; pastaDeApoio: string }): DefinicaoDeVideo[] {
  return [
    {
      arquivo: "01-entrar-no-portal",
      titulo: "Como entrar no portal",
      resumo: "A entrada e onde fica cada coisa.",
      chave: "entrar",
      logado: false,
      async executar(r) {
        await r.ir("/portal/login");
        await r.cartaz(SELO, "Como entrar no portal", "E onde fica cada coisa");
        await r.legenda("O portal é o canal da sua empresa com o escritório: documentos, pedidos, aprovações e avisos, num lugar só.");
        await r.legenda("No primeiro acesso, o escritório manda um e-mail com o link para você criar a sua senha.");
        await r.digitar(r.page.locator("#email"), opcoes.email, "Depois, é só entrar com o seu e-mail…");
        await r.digitar(r.page.locator("#senha"), opcoes.senha, "…e com a sua senha.");
        await r.apontar(
          r.page.getByText("Lembrar de mim", { exact: true }),
          "Lembrar de mim deixa você conectado por 30 dias neste aparelho. Em computador compartilhado, não marque."
        );
        await r.clicar(r.page.getByRole("button", { name: "Entrar", exact: true }), "Clique em Entrar.");
        await r.esperarTela("/portal");
        await r.semLegenda();
        await r.apontar(
          precisaDeVoce(r).getByRole("heading", { name: "O que precisa de você" }),
          "Você chega ao Início: no alto, o que o escritório precisa de você."
        );
        await r.apontarGrupo(
          menu(r).getByRole("link", { name: "DRE" }),
          menu(r).getByRole("link", { name: "Cobrança" }),
          "No menu ficam as áreas do portal. Em Financeiro: o resultado, o caixa, as contas e o relatório do mês."
        );
        await r.apontarGrupo(
          menu(r).getByRole("link", { name: "Solicitações" }),
          menu(r).getByRole("link", { name: "Aprovações" }),
          "Em Com a equipe, você fala com o escritório: faz pedidos, lê os avisos, responde pendências e aprova pagamentos."
        );
        await r.apontar(r.page.getByRole("link", { name: "Ajuda", exact: true }), "Ficou com dúvida? A Ajuda explica cada tela, passo a passo.");
        await r.apontar(r.page.getByRole("button", { name: "Sair" }), "E para sair, é aqui. Em computador compartilhado, sempre saia ao terminar.");
        await r.soltar();
        await encerramento(r);
      },
    },
    {
      arquivo: "02-o-inicio-do-portal",
      titulo: "O Início do portal",
      resumo: "O que espera por você e o resumo das suas empresas.",
      chave: "inicio",
      logado: true,
      async executar(r) {
        await r.ir("/portal");
        await r.cartaz(SELO, "O Início do portal", "O que espera por você e o resumo das suas empresas");
        await r.apontar(
          main(r).getByRole("heading", { level: 1 }),
          "Ao entrar no portal, você chega ao Início. Ele mostra o que espera por você, numa tela só."
        );
        await r.apontar(
          menu(r).getByRole("link", { name: "Início" }),
          "Para voltar a ele de qualquer tela, clique em Início no menu, ou no logo, lá em cima."
        );
        await r.apontar(precisaDeVoce(r), "Em O que precisa de você aparece o que espera a sua resposta ou aprovação.");
        await r.apontar(
          precisaDeVoce(r).getByRole("link", { name: "Aprovar" }),
          "Cada linha diz quantos são, e o botão leva direto à tela certa."
        );
        await r.soltar();
        await r.legenda("Quando não há nada esperando, o quadro avisa: Nada esperando por você.");
        const financeiro = main(r).getByRole("heading", { name: "Contas a pagar e a receber" });
        await r.rolarAte(financeiro);
        await r.apontar(
          financeiro,
          "Em Financeiro, as contas a pagar vencidas, as que vencem nesta semana e o que está em atraso para receber."
        );
        await r.apontar(
          main(r).getByRole("heading", { name: "Processos em andamento" }),
          "E em Processos em andamento, em que pé estão os processos das suas empresas."
        );
        await r.topo();
        await r.apontar(
          main(r).getByRole("button", { name: /^Empresa/ }),
          "Tem mais de uma empresa? Escolha aqui qual ver, ou deixe Todas as empresas."
        );
        const atalhos = main(r).getByRole("region", { name: "Atalhos" });
        await r.rolarAte(atalhos);
        await r.apontar(atalhos, "Nos Atalhos ficam os caminhos mais usados: pedir algo à equipe, os documentos fiscais e a ajuda.");
        // O quadro dos avisos só aparece com as chaves VAPID no servidor (ver
        // scripts/local/README.md) e quando o navegador aceita notificação.
        const avisos = main(r).getByRole("button", { name: "Ativar" });
        if (await avisos.count()) {
          await r.rolarAte(avisos);
          await r.apontar(avisos, "No fim do Início, Ativar liga os avisos no celular ou no navegador, para saber na hora quando a equipe precisar de você.");
          await r.rolarAte(atalhos);
        }
        await r.clicar(atalhos.getByRole("link", { name: /Ver documentos fiscais/ }), "Os documentos fiscais, por exemplo, ficam a um clique.");
        await r.esperarTela("/portal/documentos");
        await r.apontar(main(r).getByRole("table"), "Aqui estão as notas emitidas e recebidas pelas suas empresas.");
        await r.apontar(main(r).getByRole("button", { name: "Filtros" }), "Em Filtros, escolha o mês em Competência para ver só as notas dele.");
        await r.soltar();
        await encerramento(r, "O Início é sempre o melhor lugar para começar.");
      },
    },
    {
      arquivo: "03-pedir-algo-ao-escritorio",
      titulo: "Como pedir algo ao escritório",
      resumo: "Documentos, alterações e qualquer outra solicitação.",
      chave: "solicitacao",
      logado: true,
      async executar(r) {
        await r.ir("/portal/solicitacoes");
        await r.cartaz(SELO, "Como pedir algo ao escritório", "Documentos, alterações e qualquer outra solicitação");
        await r.apontar(menu(r).getByRole("link", { name: "Solicitações" }), "Tudo o que você precisar do escritório começa em Solicitações.");
        await r.clicar(main(r).getByRole("link", { name: "Nova solicitação" }).first(), "Clique em Nova solicitação.");
        await r.esperarTela("/portal/solicitacoes/nova");
        await r.escolher(
          main(r).getByRole("button", { name: /^Empresa/ }),
          "Transportes",
          r.page.getByRole("option", { name: /^TM Transportes Modelo \d/ }),
          "Escolha a empresa do pedido."
        );
        await r.clicar(
          main(r).getByText("Declaração de faturamento", { exact: true }),
          "Depois, o assunto. Cada um mostra em quantos dias úteis a equipe responde."
        );
        await r.digitar(
          main(r).getByRole("textbox", { name: /O que você precisa/ }),
          "Preciso da declaração de faturamento dos últimos 12 meses, para apresentar ao banco na semana que vem.",
          "Conte o que você precisa, com detalhes: período, nome do funcionário, número da nota…"
        );
        await r.apontar(zonaDeAnexo(main(r)), "Se ajudar, anexe arquivos: PDF, imagem ou XML.");
        await r.clicar(main(r).getByRole("button", { name: "Enviar solicitação" }), "Por fim, clique em Enviar solicitação.");
        await r.esperarTela(/\/portal\/solicitacoes\/(?!nova)[^/]+$/);
        await r.semLegenda();
        await r.legenda("Pronto: o pedido ganhou um número e um prazo de resposta, e a equipe certa já recebeu.");
        await r.legenda("Quando a equipe responder, você recebe um e-mail. A conversa continua aqui mesmo, nesta tela.");
        await encerramento(r, "Acompanhe todos os seus pedidos em Solicitações.");
      },
    },
    {
      arquivo: "04-responder-uma-pendencia",
      titulo: "Como responder uma pendência",
      resumo: "Quando a equipe precisa de um documento ou de uma informação sua.",
      chave: "pendencia",
      logado: true,
      async executar(r) {
        await r.ir("/portal");
        await r.cartaz(SELO, "Como responder uma pendência", "Quando a equipe precisa de um documento ou de uma informação sua");
        const responder = precisaDeVoce(r).getByRole("link", { name: "Responder" });
        await r.apontar(responder, "Quando a equipe precisa de algo seu, o Início avisa. Clique em Responder…");
        await r.clicar(responder);
        await r.esperarTela("/portal/pendencias");
        await r.apontar(
          main(r).getByRole("link", { name: /^Aguardando você/ }),
          "…ou abra Pendências no menu. As que esperam por você aparecem como Aguardando você."
        );
        await r.apontar(main(r).getByRole("table"), "Cada uma tem prazo. As vencidas aparecem marcadas.");
        await r.clicar(main(r).getByRole("link", { name: "Enviar o extrato bancário de setembro" }), "Clique na pendência para abrir.");
        await r.esperarTela(/\/portal\/pendencias\/[^/]+$/);
        await r.apontar(main(r).getByText(/^Precisamos do extrato/), "Aqui está o que a equipe precisa.");
        await r.digitar(
          main(r).getByRole("textbox", { name: "Mensagem" }),
          "Segue o extrato de setembro da conta movimento.",
          "Escreva em Mensagem…"
        );
        const arquivo = pdfDeExemplo(opcoes.pastaDeApoio, "extrato-setembro.pdf");
        await r.anexar(
          zonaDeAnexo(main(r)),
          main(r).locator('input[type="file"]').first(),
          arquivo,
          "…e anexe o arquivo em Anexos. Vale PDF, imagem ou XML de até 10 MB."
        );
        await r.clicar(main(r).getByRole("button", { name: "Enviar resposta" }), "Clique em Enviar resposta. A equipe é avisada na hora.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.semLegenda();
        await r.legenda("A resposta fica registrada aqui. Se faltar algo, a equipe responde nesta mesma conversa.");
        await encerramento(r, "Se o prazo passar sem resposta, você recebe um lembrete por e-mail.");
      },
    },
    {
      arquivo: "05-aprovar-pagamentos",
      titulo: "Como aprovar pagamentos",
      resumo: "As contas que só são pagas depois do seu OK.",
      chave: "aprovar",
      logado: true,
      async executar(r) {
        await r.ir("/portal/aprovacoes");
        await r.cartaz(SELO, "Como aprovar pagamentos", "As contas que só são pagas depois do seu OK");
        await r.apontar(
          menu(r).getByRole("link", { name: "Aprovações" }),
          "Algumas contas a pagar só são pagas depois da sua aprovação. Elas ficam em Aprovações."
        );
        const linhas = main(r).getByRole("row");
        // Pelo selo, não pela descrição: a descrição da conta pode repetir o texto.
        const dentro = linhas.filter({ has: r.page.getByRole("cell", { name: "Dentro do teto", exact: true }) });
        const fora = linhas.filter({ has: r.page.getByRole("cell", { name: "Fora do teto", exact: true }) });
        await r.apontar(
          dentro.getByRole("cell", { name: "Dentro do teto", exact: true }),
          "Cada pessoa tem um teto: o valor máximo que pode aprovar. Esta conta está dentro do seu."
        );
        await r.apontar(
          fora.getByRole("cell", { name: "Outra pessoa aprova", exact: true }),
          "Esta passa do seu teto. Quem aprova é outra pessoa da sua empresa, com teto maior."
        );
        await r.apontar(
          dentro.getByRole("button", { name: "Reprovar" }),
          "Não concorda com uma conta? Reprove e escreva o motivo: ele vai para quem lançou a conta."
        );
        await r.apontar(
          main(r).getByText("Marcar todas dentro do meu teto"),
          "Com muitas contas, marque todas de uma vez e clique em Aprovar selecionadas."
        );
        await r.clicar(dentro.getByRole("button", { name: "Aprovar" }), "Para aprovar uma só, clique em Aprovar.");
        // A confirmação do Connect é `alertdialog` (ConfirmDialog), não `dialog`.
        const dialogo = r.page.getByRole("alertdialog");
        await dialogo.waitFor();
        await r.clicar(dialogo.getByRole("button", { name: "Aprovar" }), "Confirme. A conta é liberada para pagamento.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.semLegenda();
        await r.legenda("Feito: a conta saiu da lista e segue para pagamento pela equipe.");
        await encerramento(r, "Contas esperando o seu OK também aparecem no Início, em O que precisa de você.");
      },
    },
    {
      arquivo: "06-acompanhar-o-financeiro",
      titulo: "Como acompanhar o financeiro",
      resumo: "Caixa, contas a pagar e o relatório do mês.",
      chave: "financeiro",
      logado: true,
      async executar(r) {
        await r.ir("/portal/fluxo-de-caixa");
        await r.cartaz(SELO, "Como acompanhar o financeiro", "Caixa, contas a pagar e o relatório do mês");
        await r.apontar(main(r).getByRole("table").first(), "No Fluxo de caixa, o que entrou e saiu nos últimos seis meses…");
        const aVencer = main(r).getByRole("heading", { name: "A vencer a partir de hoje" });
        await r.rolarAte(aVencer);
        await r.apontar(aVencer, "…e o que vence daqui para frente, de 7 até 180 dias.");
        await r.topo();
        await r.apontar(main(r).getByRole("button", { name: /^Empresa/ }), "Tem mais de uma empresa? Escolha qual ver por aqui.");
        await r.clicar(menu(r).getByRole("link", { name: "Contas a pagar" }));
        await r.esperarTela("/portal/pagar");
        await r.apontar(main(r).getByRole("table"), "Em Contas a pagar, tudo o que suas empresas têm a pagar, com a situação de cada conta.");
        await r.apontar(
          main(r).getByRole("link", { name: "Aguardando aprovação" }).first(),
          "Esta marca leva direto às contas que esperam o seu OK."
        );
        await r.apontar(
          menu(r).getByRole("link", { name: "Contas a receber" }),
          "Contas a receber e Cobrança funcionam do mesmo jeito, para o que suas empresas têm a receber."
        );
        await r.clicar(menu(r).getByRole("link", { name: "Relatório" }));
        await r.esperarTela("/portal/relatorios");
        // O mês corrente pode estar no começo e zerado: o vídeo mostra o anterior.
        const hoje = new Date();
        const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const nomeDoMes = anterior.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
        await r.clicar(main(r).getByRole("button", { name: "Abrir meses" }), "No Relatório, escolha o mês…");
        await r.clicar(r.page.getByRole("dialog", { name: "Meses" }).getByRole("button", { name: nomeDoMes }));
        await r.clicar(main(r).getByRole("button", { name: "Aplicar" }));
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(main(r).getByRole("table"), "…e veja o resumo por empresa: o que foi pago, recebido e o que está vencido.");
        await r.soltar();
        await r.legenda("Essas telas são para consulta. Viu algo errado? Fale com a equipe por uma solicitação.");
        await encerramento(r);
      },
    },
    {
      arquivo: "07-ler-os-comunicados",
      titulo: "Como ler os comunicados do escritório",
      resumo: "Recesso, prazos e orientações.",
      chave: "comunicado",
      logado: true,
      async executar(r) {
        await r.ir("/portal");
        await r.cartaz(SELO, "Como ler os comunicados do escritório", "Recesso, prazos e orientações");
        const ler = precisaDeVoce(r).getByRole("link", { name: "Ler" });
        await r.apontar(
          ler,
          "Quando o escritório publica um aviso, ele aparece no Início, em O que precisa de você. Você também recebe por e-mail."
        );
        await r.clicar(ler);
        await r.esperarTela("/portal/comunicados");
        const item = main(r).getByRole("link", { name: /Recesso de fim de ano/ });
        await r.apontar(item, "Os comunicados ficam todos aqui. Os que você ainda não leu levam a etiqueta Novo.");
        await r.clicar(item, "Clique para ler o texto inteiro.");
        await r.esperarTela(/\/portal\/comunicados\/[^/]+$/);
        await r.legenda("O comunicado fica guardado aqui, para consultar quando precisar. Se tiver anexo, ele aparece logo abaixo.");
        await r.apontar(main(r).getByRole("link", { name: "Abrir solicitação" }), "Ficou com dúvida sobre o aviso? Abra uma solicitação por aqui.");
        await r.soltar();
        await encerramento(r, "Todos os comunicados ficam em Comunicados, no menu.");
      },
    },
    {
      arquivo: "08-esqueci-minha-senha",
      titulo: "Esqueci minha senha",
      resumo: "Como criar uma senha nova.",
      chave: "senha",
      logado: false,
      async executar(r) {
        await r.ir("/portal/login");
        await r.cartaz(SELO, "Esqueci minha senha", "Como criar uma senha nova");
        await r.clicar(r.page.getByRole("link", { name: "Esqueci minha senha" }), "Na tela de entrada, clique em Esqueci minha senha.");
        await r.esperarTela(/esqueci-senha/);
        await r.digitar(r.page.getByRole("textbox", { name: "E-mail" }), opcoes.email, "Informe o e-mail que você usa para entrar.");
        // No ambiente local não há SMTP: o envio não sai, mas a tela de
        // confirmação é a mesma, de propósito (não revela quem tem conta).
        await r.clicar(r.page.getByRole("button", { name: "Enviar link" }), "Clique em Enviar link.");
        await r.page.getByText("Confira o seu e-mail").waitFor();
        await r.pausa(500);
        await r.legenda("O link para criar a senha nova chega no seu e-mail em alguns minutos. Ele vale por uma hora.");
        await r.legenda("Não chegou? Olhe a caixa de spam. Se mesmo assim não vier, fale com o escritório.");
        await encerramento(r, "Com a senha nova, é só entrar normalmente.");
      },
    },
  ];
}
