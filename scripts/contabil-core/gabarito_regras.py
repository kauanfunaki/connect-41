"""Gabarito do modelo de regras e da leitura de planilhas de cadastro (Fase 3b, 10/11/2026).

Gera planilhas INVENTADAS (xlsx pelo openpyxl, xls pelo xlwt) e grava o que o Contábil Core original
faz com elas: `ler_planilhas_excel` (a leitura compartilhada pelas relações fiscais e pelas regras)
e `ler_relatorio_regras`. O porte é conferido por `cadastro/relatorioRegras.test.ts`.

Uso, a partir da raiz do contabil-core, com openpyxl, xlrd e xlwt:
    python scripts/contabil-core/gabarito_regras.py <saida.json>
"""
import io
import json
import os
import sys
from datetime import date, datetime

os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://g:g@127.0.0.1:1/g")
sys.path.insert(0, os.getcwd())

import openpyxl  # noqa: E402
import xlwt  # noqa: E402

from src.domain.contrapartes.relatorio import ler_planilhas_excel  # noqa: E402
from src.domain.regras.relatorio import ler_relatorio_regras  # noqa: E402


def xlsx(folhas):
    wb = openpyxl.Workbook()
    primeira = True
    for nome, linhas in folhas:
        ws = wb.active if primeira else wb.create_sheet()
        ws.title = nome
        primeira = False
        for linha in linhas:
            ws.append(linha)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


def xls(folhas):
    wb = xlwt.Workbook()
    for nome, linhas in folhas:
        ws = wb.add_sheet(nome)
        for i, linha in enumerate(linhas):
            for j, v in enumerate(linha):
                if v is not None:
                    ws.write(i, j, v, xlwt.easyxf(num_format_str="dd/mm/yyyy") if isinstance(v, (date, datetime)) else xlwt.Style.default_style)
    b = io.BytesIO()
    wb.save(b)
    return b.getvalue()


CAB = ["DEBITO", "CREDITO", "HITORICO CONTABIL", "PADRAO DO EXTRATO", "BANCO", "COPIAR DO EXTRATO"]
LINHAS = [
    ["Modelo de regras"],
    [],
    CAB,
    [1026, None, "TARIFA BANCARIA", "TARIFA PACOTE", "", "NÃO"],
    [None, 3001.0, "", "PIX RECEBIDO", "Todos os bancos", "SIM"],
    ["", "", "SEM LADO", "PADRAO", "", ""],
    [10, 20, "DOIS LADOS", "PADRAO", "", ""],
    ["abc", None, "CONTA TEXTO", "PADRAO X", "", ""],
    [0, None, "CONTA ZERO", "PADRAO Y", "", ""],
    [99999999999, None, "CONTA GRANDE", "PADRAO Z", "", ""],
    [1026, None, "COPIAR ERRADO", "PADRAO W", "", "TALVEZ"],
    [1026, None, "X", "PADRAO V", "", ""],
    [1026, None, "HISTORICO", "-", "", ""],
    [1026, None, "=SOMA(A1)", "PADRAO U", "", ""],
    [None, None, None, None, None, None],
    [2001, None, "  ESPAÇOS  ", "  PIX  EMITIDO  ", "ITAU", "sim"],
    [True, None, "BOOL", "PADRAO T", "", ""],
    [datetime(2026, 1, 5), None, "DATA", "PADRAO S", "", ""],
    [1026.5, None, "FRACAO", "PADRAO R", "", ""],
]
casos = [
    ("modelo.xlsx", xlsx([("Regras", LINHAS)])),
    ("modelo.xls", xls([("Regras", LINHAS)])),
    ("duas-abas.xlsx", xlsx([("Capa", [["nada"]]), ("Regras", LINHAS)])),
    ("duas-tabelas.xlsx", xlsx([("A", LINHAS), ("B", LINHAS)])),
    ("sem-tabela.xlsx", xlsx([("A", [["DEBITO", "CREDITO"], [1, 2]])])),
    ("colunas-repetidas.xlsx", xlsx([("A", [CAB + ["BANCO"], [1, None, "X Y", "PADRAO", "", ""]])])),
    ("historico-certo.xlsx", xlsx([("A", [["Débito", "Crédito", "Histórico Contábil", "Padrão do Extrato", "Banco", "Copiar do Extrato"], [5, None, "ALUGUEL", "ALUGUEL LOJA", "", ""]])])),
    ("vazio.xlsx", b""),
    ("texto.xlsx", b"nao e planilha"),
    ("planilha.csv", b"a;b"),
    ("cabecalho-na-linha-31.xlsx", xlsx([("A", [[f"linha {i}"] for i in range(30)] + [CAB, [1, None, "AB", "CD", "", ""]])])),
]

saida = []
for nome, conteudo in casos:
    registro = {"nome": nome, "bytes": conteudo.hex()}
    try:
        planilhas = ler_planilhas_excel(conteudo, nome)
        registro["planilhas"] = [
            {"nome": p.nome, "linhas": [[{"$dt": str(v)} if isinstance(v, datetime) else ({"$f": repr(v)} if isinstance(v, float) else v) for v in linha] for linha in p.linhas]}
            for p in planilhas
        ]
    except Exception as exc:  # noqa: BLE001
        registro["erro_planilhas"] = str(getattr(exc, "message", exc))
    try:
        registro["regras"] = [
            {"linha": r.linha, "contaNumero": r.conta_numero, "dc": r.dc, "descricao": r.descricao, "historico": r.historico,
             "banco": r.banco, "manterHistorico": r.manter_historico, "erro": r.erro}
            for r in ler_relatorio_regras(conteudo, nome)
        ]
    except Exception as exc:  # noqa: BLE001
        registro["erro_regras"] = str(getattr(exc, "message", exc))
    saida.append(registro)

with open(sys.argv[1], "w", encoding="utf-8", newline="\n") as f:
    json.dump(saida, f, ensure_ascii=False, indent=0)
print(len(saida), "casos")
