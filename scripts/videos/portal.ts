// Roteiros dos vídeos do portal do cliente (01/10/2026).
//
// Ordem pensada para quem chega: os clientes do BPO entram no portal a partir
// de 05/10, então primeiro o que eles fazem na primeira semana (entrar, pedir,
// responder, aprovar), depois o que é consulta.
//
// O texto das legendas fala com o cliente, não com a equipe: "a 41", "você",
// sem termo interno (BPO, módulo, setor).

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DefinicaoDeVideo, Roteiro } from "./gravador";

const SELO = "Portal do cliente · 41";

async function encerramento(r: Roteiro, texto = "Dúvida? Abra uma solicitação pelo portal: a equipe responde por lá.") {
  await r.cartaz(SELO, "Pronto!", texto, 3200);
}

function menu(r: Roteiro) {
  return r.page.getByRole("navigation", { name: "Portal" });
}

function main(r: Roteiro) {
  return r.page.getByRole("main");
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
      resumo: "O login e onde fica cada coisa.",
      logado: false,
      async executar(r) {
        await r.ir("/portal/login");
        await r.cartaz(SELO, "Como entrar no portal", "E onde fica cada coisa");
        await r.legenda("O portal é o canal da sua empresa com a 41: documentos, pedidos, aprovações e avisos, num lugar só.");
        await r.digitar(r.page.locator("#email"), opcoes.email, "Entre com o e-mail que você cadastrou com a 41…");
        await r.digitar(r.page.locator("#senha"), opcoes.senha, "…e com a sua senha.");
        await r.clicar(r.page.getByRole("button", { name: "Entrar" }));
        await r.esperarTela("/portal");
        await r.semLegenda();
        await r.apontar(main(r).getByRole("table"), "A primeira tela mostra as notas fiscais das suas empresas.");
        await r.apontar(
          main(r).getByRole("link", { name: /pendências? aguardando/ }),
          "Quando a 41 precisa de algo seu, aparece um aviso no alto. Clique nele para ir direto ao assunto."
        );
        await r.apontarGrupo(
          menu(r).getByRole("link", { name: "Fluxo de caixa" }),
          menu(r).getByRole("link", { name: "Cobrança" }),
          "No menu ficam as áreas do portal. Em Financeiro: o caixa, as contas e o relatório do mês."
        );
        await r.apontarGrupo(
          menu(r).getByRole("link", { name: "Solicitações" }),
          menu(r).getByRole("link", { name: "Aprovações" }),
          "Em Com a equipe, você fala com a 41: faz pedidos, lê os avisos, responde pendências e aprova pagamentos."
        );
        await r.apontar(r.page.getByRole("link", { name: "Ajuda", exact: true }), "Ficou com dúvida? A Ajuda explica cada tela.");
        await r.apontar(r.page.getByRole("button", { name: "Sair" }), "E para sair, é aqui. Em computador compartilhado, sempre saia ao terminar.");
        await r.soltar();
        await encerramento(r);
      },
    },
    {
      arquivo: "02-pedir-algo-a-41",
      titulo: "Como pedir algo à 41",
      resumo: "Documentos, alterações e qualquer outra solicitação.",
      logado: true,
      async executar(r) {
        await r.ir("/portal/solicitacoes");
        await r.cartaz(SELO, "Como pedir algo à 41", "Documentos, alterações e qualquer outra solicitação");
        await r.apontar(menu(r).getByRole("link", { name: "Solicitações" }), "Tudo o que você precisar da 41 começa em Solicitações.");
        await r.clicar(main(r).getByRole("link", { name: "Nova solicitação" }).first(), "Clique em Nova solicitação.");
        await r.esperarTela("/portal/solicitacoes/nova");
        await r.clicar(main(r).getByRole("button", { name: /^Empresa/ }), "Escolha a empresa do pedido.");
        await r.page.keyboard.type("Transportes", { delay: 60 });
        await r.pausa(600);
        await r.clicar(r.page.getByRole("option", { name: /Transportes Modelo$/ }).first());
        await r.clicar(
          main(r).getByText("Pedir um documento", { exact: true }),
          "Depois, o assunto. Cada um mostra em quanto tempo a equipe responde."
        );
        await r.digitar(
          main(r).getByRole("textbox", { name: /O que você precisa/ }),
          "Preciso da certidão negativa de débitos federais atualizada, para uma licitação na semana que vem.",
          "Conte o que você precisa, com detalhes: período, nome do funcionário, número da nota…"
        );
        await r.apontar(main(r).getByRole("button", { name: /^Anexos/ }), "Se ajudar, anexe arquivos: PDF, imagem ou XML.");
        await r.clicar(main(r).getByRole("button", { name: "Enviar solicitação" }), "Por fim, envie.");
        await r.esperarTela(/\/portal\/solicitacoes\/(?!nova)[^/]+$/);
        await r.semLegenda();
        await r.legenda("Pronto: o pedido ganhou um número e um prazo de resposta, e a equipe certa já recebeu.");
        await r.legenda("A resposta chega aqui mesmo, com aviso por e-mail. É só voltar a esta tela para conversar com a equipe.");
        await encerramento(r, "Acompanhe todos os seus pedidos em Solicitações.");
      },
    },
    {
      arquivo: "03-responder-uma-pendencia",
      titulo: "Como responder uma pendência",
      resumo: "Quando a 41 precisa de algo seu para fechar o mês.",
      logado: true,
      async executar(r) {
        await r.ir("/portal/pendencias");
        await r.cartaz(SELO, "Como responder uma pendência", "Quando a 41 precisa de algo seu para fechar o mês");
        await r.apontar(
          main(r).getByRole("link", { name: /^Aguardando você/ }),
          "Pendências são pedidos da 41 para você: um documento, uma confirmação, uma informação."
        );
        await r.apontar(main(r).getByRole("table"), "Cada uma tem prazo. As vencidas aparecem marcadas.");
        await r.clicar(main(r).getByRole("link", { name: "Enviar o extrato bancário de setembro" }), "Clique na pendência para abrir.");
        await r.esperarTela(/\/portal\/pendencias\/[^/]+$/);
        await r.apontar(main(r).getByText(/^Precisamos do extrato/), "Aqui está o que a equipe precisa.");
        await r.digitar(
          main(r).getByRole("textbox", { name: "Mensagem" }),
          "Segue o extrato de setembro da conta movimento.",
          "Escreva uma mensagem…"
        );
        const arquivo = pdfDeExemplo(opcoes.pastaDeApoio, "extrato-setembro.pdf");
        await r.anexar(
          main(r).getByRole("button", { name: /^Anexos/ }),
          main(r).locator('input[type="file"]').first(),
          arquivo,
          "…e anexe o arquivo. Vale PDF, imagem ou XML de até 10 MB."
        );
        await r.clicar(main(r).getByRole("button", { name: "Enviar resposta" }), "Envie. A equipe é avisada na hora.");
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(1200);
        await r.semLegenda();
        await r.legenda("A resposta fica registrada aqui. Se faltar algo, a equipe responde nesta mesma conversa.");
        await encerramento(r, "As pendências em aberto também aparecem no alto da tela inicial.");
      },
    },
    {
      arquivo: "04-aprovar-pagamentos",
      titulo: "Como aprovar pagamentos",
      resumo: "As contas que só são pagas depois do seu OK.",
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
          "Não concorda com uma conta? Reprove e diga o motivo: a equipe recebe e resolve com você."
        );
        await r.apontar(
          main(r).getByText("Marcar todas dentro do meu teto"),
          "Com muitas contas, marque todas de uma vez e use Aprovar selecionadas."
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
        await encerramento(r, "Contas esperando o seu OK também aparecem no alto da tela inicial.");
      },
    },
    {
      arquivo: "05-acompanhar-o-financeiro",
      titulo: "Como acompanhar o financeiro",
      resumo: "Caixa, contas a pagar e o relatório do mês.",
      logado: true,
      async executar(r) {
        await r.ir("/portal/fluxo-de-caixa");
        await r.cartaz(SELO, "Como acompanhar o financeiro", "Caixa, contas a pagar e o relatório do mês");
        await r.apontar(main(r).getByRole("table").first(), "No Fluxo de caixa, o que entrou e saiu nos últimos seis meses…");
        const aVencer = main(r).getByRole("heading", { name: "A vencer a partir de hoje" });
        await r.rolarAte(aVencer);
        await r.apontar(aVencer, "…e o que vence daqui para frente, de 7 até 180 dias.");
        await r.page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
        await r.pausa(800);
        await r.apontar(main(r).getByRole("button", { name: /^Empresa/ }), "Tem mais de uma empresa? Escolha qual ver por aqui.");
        await r.clicar(menu(r).getByRole("link", { name: "Contas a pagar" }));
        await r.esperarTela("/portal/pagar");
        await r.apontar(main(r).getByRole("table"), "Em Contas a pagar, tudo o que suas empresas têm a pagar, com a situação de cada conta.");
        await r.apontar(
          main(r).getByRole("link", { name: "Aguardando aprovação" }).first(),
          "Este aviso leva direto para as contas que esperam o seu OK."
        );
        await r.clicar(menu(r).getByRole("link", { name: "Relatório" }));
        await r.esperarTela("/portal/relatorios");
        // O mês corrente pode estar no começo e zerado: o vídeo mostra o anterior.
        const hoje = new Date();
        const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        const mes = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, "0")}`;
        await r.apontar(main(r).getByRole("textbox", { name: "Mês" }), "No Relatório, escolha o mês…");
        await main(r).getByRole("textbox", { name: "Mês" }).fill(mes);
        await r.pausa(600);
        await r.clicar(main(r).getByRole("button", { name: "Aplicar" }));
        await r.page.waitForLoadState("networkidle").catch(() => {});
        await r.pausa(800);
        await r.apontar(main(r).getByRole("table"), "…e veja o resumo por empresa: pago, recebido e o que está vencido.");
        await r.soltar();
        await r.legenda("Essas telas são para consulta. Viu algo errado? Abra uma solicitação.");
        await encerramento(r);
      },
    },
    {
      arquivo: "06-ler-os-comunicados",
      titulo: "Como ler os comunicados da 41",
      resumo: "Recesso, prazos e orientações.",
      logado: true,
      async executar(r) {
        await r.ir("/portal");
        await r.cartaz(SELO, "Como ler os comunicados da 41", "Recesso, prazos e orientações");
        const aviso = main(r).getByRole("link", { name: /comunicados? novos? da 41/ });
        await r.apontar(aviso, "Quando a 41 publica um aviso, ele aparece no alto da tela inicial. Você também recebe por e-mail.");
        await r.clicar(aviso);
        await r.esperarTela("/portal/comunicados");
        const item = main(r).getByRole("link", { name: /Recesso de fim de ano/ });
        await r.apontar(item, "Os que você ainda não leu ficam marcados como Novo.");
        await r.clicar(item);
        await r.esperarTela(/\/portal\/comunicados\/[^/]+$/);
        await r.legenda("O comunicado fica guardado aqui, para consultar quando precisar.");
        await r.apontar(main(r).getByRole("link", { name: "solicitação" }), "Ficou com dúvida sobre o aviso? Abra uma solicitação por aqui.");
        await r.soltar();
        await encerramento(r, "Todos os comunicados ficam em Comunicados, no menu.");
      },
    },
    {
      arquivo: "07-esqueci-minha-senha",
      titulo: "Esqueci minha senha",
      resumo: "Como criar uma senha nova.",
      logado: false,
      async executar(r) {
        await r.ir("/portal/login");
        await r.cartaz(SELO, "Esqueci minha senha", "Como criar uma senha nova");
        await r.clicar(r.page.getByRole("link", { name: "Esqueci minha senha" }), "Na tela de entrada, clique em Esqueci minha senha.");
        await r.esperarTela(/esqueci-senha/);
        await r.digitar(r.page.getByLabel("E-mail"), opcoes.email, "Informe o e-mail que você usa para entrar.");
        // No ambiente local não há SMTP: o envio não sai, mas a tela de
        // confirmação é a mesma, de propósito (não revela quem tem conta).
        await r.clicar(r.page.getByRole("button", { name: "Enviar link" }), "Clique em Enviar link.");
        await r.page.getByText("Confira o seu e-mail").waitFor();
        await r.pausa(500);
        await r.legenda("O link para criar a senha nova chega no seu e-mail em alguns minutos.");
        await r.legenda("Não chegou? Olhe a caixa de spam. Se mesmo assim não vier, fale com o seu contato na 41.");
        await encerramento(r, "Com a senha nova, é só entrar normalmente.");
      },
    },
  ];
}
