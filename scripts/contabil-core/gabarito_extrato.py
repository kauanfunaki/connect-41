"""Gabarito dos leitores de extrato do Contábil Core, Fase 4 (10/11/2026).

Plugin do pytest: roda a suíte de extrato do original (dev41tech/contabil-core) e grava cada chamada
aos leitores por banco, às primitivas de `_comum`, ao período e às conferências do `pdf_parser`, com
a entrada e a saída exatas. O porte em TypeScript repete as chamadas
(`src/lib/contabil-core/extrato/gabarito.test.ts`).

Dados: os testes do original usam extratos inventados. Os poucos CNPJs com cara de reais são
trocados por números fictícios do mesmo formato, e a chamada é REPETIDA com a entrada trocada: o que
vai para o gabarito é a saída da entrada fictícia, nunca a da original.

Uso, a partir da raiz do contabil-core, com pdfplumber, pytest e as dependências do projeto:
    PYTHONPATH=<connect>/scripts/contabil-core GABARITO_SAIDA=<saida.json> \
        python -m pytest -q -p gabarito_extrato tests/unit/test_extrato_*.py tests/unit/test_pdf_parser.py
"""
from __future__ import annotations

import dataclasses
import functools
import hashlib
import json
import os
import re
import types
from datetime import date, datetime, time, timedelta
from decimal import Decimal

chamadas: dict[str, dict] = {}

# CNPJ fictício: os 14 dígitos que não são de exemplo viram outros, derivados do original, no
# mesmo formato. Exemplos óbvios (00.000.000, 11.111.111, 12.345.678) ficam como estão.
_CNPJ = re.compile(r"\b(\d{2})\.?(\d{3})\.?(\d{3})/?(\d{4})-?(\d{2})\b")
_EXEMPLOS = ("00000000", "11111111", "12345678", "99999999")


def _troca_cnpj(m: re.Match) -> str:
    original = m.group(0)
    digitos = re.sub(r"\D", "", original)
    if len(digitos) != 14 or digitos.startswith(_EXEMPLOS):
        return original
    novo = "".join(str(int(c, 16) % 10) for c in hashlib.sha256(digitos.encode()).hexdigest()[:14])
    novo = "9" + novo[1:]  # começa com 9: fácil de reconhecer como fictício
    saida, i = [], 0
    for c in original:
        if c.isdigit():
            saida.append(novo[i])
            i += 1
        else:
            saida.append(c)
    return "".join(saida)


# Nomes de clientes que aparecem nos dados dos testes (como contraparte): trocados por um nome
# fictício. A lista vem da variável GABARITO_NOMES ("REAL=FICTICIO;Real=Ficticio"), fora do git,
# para o próprio nome não entrar no repositório. Use um fictício do mesmo tamanho.
_NOMES = dict(
    par.split("=", 1) for par in os.environ.get("GABARITO_NOMES", "").split(";") if "=" in par
)


def sanitizar(v):
    if isinstance(v, str):
        for real, ficticio in _NOMES.items():
            v = v.replace(real, ficticio)
        return _CNPJ.sub(_troca_cnpj, v)
    if isinstance(v, list):
        return [sanitizar(x) for x in v]
    if isinstance(v, tuple):
        return tuple(sanitizar(x) for x in v)
    if isinstance(v, dict):
        return {k: sanitizar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return dataclasses.replace(
            v, **{f.name: sanitizar(getattr(v, f.name)) for f in dataclasses.fields(v) if f.init}
        )
    return v


def codificar(v):
    if isinstance(v, int) and not isinstance(v, bool) and abs(v) > 2**53:
        return {"$int": str(v)}
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, Decimal):
        return {"$dec": str(v)}
    if isinstance(v, datetime):
        return {"$dt": str(v)}
    if isinstance(v, time):
        return {"$time": str(v)}
    if isinstance(v, timedelta):
        return {"$td": str(v)}
    if isinstance(v, date):
        return {"$date": v.isoformat()}
    if isinstance(v, bytes):
        return {"$bytes": v.hex()}
    if isinstance(v, types.ModuleType):
        return {"$mod": v.__name__.rsplit(".", 1)[-1]}
    if isinstance(v, (list, tuple)):
        return [codificar(x) for x in v]
    if isinstance(v, (set, frozenset)):
        return {"$set": sorted(codificar(x) for x in v)}
    if isinstance(v, dict):
        return {str(k): codificar(x) for k, x in v.items()}
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        return {f.name: codificar(getattr(v, f.name)) for f in dataclasses.fields(v)}
    raise TypeError(f"tipo sem codificação: {type(v)!r}")


def _registrar(nome, fn, args, kwargs):
    try:
        entrada = {"fn": nome, "args": codificar(list(args)), "kwargs": codificar(kwargs)}
    except TypeError:
        return
    try:
        entrada["result"] = codificar(fn(*args, **kwargs))
    except TypeError as exc:
        if "codificação" in str(exc):
            return
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    except Exception as exc:  # noqa: BLE001 — o erro também é saída
        entrada["error"] = {"tipo": type(exc).__name__, "mensagem": str(exc)}
    chave = json.dumps([entrada["fn"], entrada["args"], entrada["kwargs"]], sort_keys=True, ensure_ascii=False)
    chamadas.setdefault(chave, entrada)


def envolver(modulo, nome_fn, rotulo):
    original = getattr(modulo, nome_fn)
    if getattr(original, "__gabarito__", False):
        return

    @functools.wraps(original)
    def gravador(*args, **kwargs):
        resultado = original(*args, **kwargs)  # o teste segue com a chamada de verdade
        trocados = (sanitizar(list(args)), sanitizar(kwargs))
        _registrar(rotulo, original, *trocados)
        return resultado

    gravador.__gabarito__ = True
    setattr(modulo, nome_fn, gravador)


def pytest_configure(config):  # noqa: ARG001
    from src.domain.extrato import _comum, bancos, pdf_parser, periodo

    for adaptador in bancos.ADAPTADORES:
        nome = adaptador.__name__.rsplit(".", 1)[-1]
        for fn in ("reconhece", "extrair", "extrair_de_palavras", "consolidar_blocos"):
            if hasattr(adaptador, fn):
                envolver(adaptador, fn, f"{nome}.{fn}")
    for fn in ("escolher", "por_sigla", "por_conteudo"):
        envolver(bancos, fn, f"bancos.{fn}")
    for fn in (
        "parse_data", "parse_data_extenso", "parse_valor", "gerar_fitid", "agrupar_linhas",
        "colar_fragmentos", "ordenar_do_mais_antigo", "borda_direita",
    ):
        envolver(_comum, fn, f"_comum.{fn}")
    for fn in ("fim_do_periodo", "ajustar_virada_de_ano"):
        envolver(periodo, fn, f"periodo.{fn}")
    from src.domain.extrato import planilha_parser

    for fn in (
        "parse_planilha", "_linhas_xlsx", "_linhas_xls", "_linhas_csv", "_mapear_colunas",
        "_para_data", "_para_decimal", "_ajustar_pelo_saldo", "_decrescente", "_chave",
    ):
        envolver(planilha_parser, fn, f"planilha_parser.{fn}")
    for fn in (
        "_parse_linhas_multipagina", "_fracao_legivel", "_documento_de_outro_tipo",
        "_recusa_de_adaptador_vazio", "_validar_blocos", "_validar_cadeia_de_saldos",
        "_validar_completude", "_valor_declarado", "_fmt_reais",
    ):
        envolver(pdf_parser, fn, f"pdf_parser.{fn}")


def chamadas_diretas():
    """Entradas inventadas para as primitivas que a suíte só usa por dentro dos leitores."""
    from src.domain.extrato import _comum, periodo
    from src.domain.extrato.ofx_parser import TransacaoOFX

    for s in (
        "1.234,56", "-1.234,56", "(1.234,56)", "1.234,56-", "R$ 1.234,56", "R$\xa01.234,56", "1,234.56",
        "500,00D", "0,00", "-0,00", "12", "1.5", "abc", "", "  -  ", "1.234.567,89", "١٢٣,٤٥", "10,5",
    ):
        _registrar("_comum.parse_valor", _comum.parse_valor, [s], {})
    for s, ano in (
        ("05/01/2026", None), ("05/01/26", None), ("31/02/2026", 2025), ("05/01", 2024), ("29/02", 2023),
        ("29/02", 2024), ("data 07-03-2025 x", None), ("sem data", 2026), ("32/13", 2026), ("05/13/2026 06/01", 2026),
    ):
        _registrar("_comum.parse_data", _comum.parse_data, [s, ano], {})
    for s in ("2 de Janeiro de 2026", "31 de março de 2025", "1 de MARCO de 2024", "30 de fevereiro de 2026", "2 de Foo de 2026"):
        _registrar("_comum.parse_data_extenso", _comum.parse_data_extenso, [s], {})
    for d, h, v, i in (
        (date(2026, 1, 5), "PIX RECEBIDO", Decimal("1234.56"), 0),
        (date(2026, 1, 5), "Tarifa ção", Decimal("-0.50"), 7),
        (date(2025, 12, 31), "", Decimal("1E+3"), 12),
        (date(2025, 12, 31), "X", Decimal("-0"), 3),
    ):
        _registrar("_comum.gerar_fitid", _comum.gerar_fitid, [d, h, v, i], {})
    palavras = [
        {"text": "b", "x0": 50.0, "x1": 60.0, "top": 100.2, "bottom": 108.0},
        {"text": "a", "x0": 10.0, "x1": 20.0, "top": 101.5, "bottom": 109.0},
        {"text": "c", "x0": 10.0, "x1": 20.0, "top": 104.6, "bottom": 112.0},
        {"text": "d", "x0": 30.0, "x1": 40.0, "top": 104.6, "bottom": 112.0},
    ]
    _registrar("_comum.agrupar_linhas", _comum.agrupar_linhas, [palavras], {})
    _registrar("_comum.agrupar_linhas", _comum.agrupar_linhas, [palavras, 5.0], {})
    t = [
        TransacaoOFX("A", date(2026, 1, 3), Decimal("10"), "X", "CREDIT", None, 0),
        TransacaoOFX("B", date(2026, 1, 2), Decimal("-5"), "Y", "DEBIT", Decimal("3"), 1),
        TransacaoOFX("C", date(2026, 1, 2), Decimal("1"), "Z", "CREDIT", None, 2),
    ]
    _registrar("_comum.ordenar_do_mais_antigo", _comum.ordenar_do_mais_antigo, [t], {})
    _registrar("_comum.ordenar_do_mais_antigo", _comum.ordenar_do_mais_antigo, [t[:2]], {})
    _registrar("_comum.colar_fragmentos", _comum.colar_fragmentos, [t, [(100.0, 0), (130.0, 1)], [(95.0, "ANTES"), (104.0, "DEPOIS"), (300.0, "RODAPE"), (115.0, "EMPATE")]], {})
    _registrar("_comum.borda_direita", _comum.borda_direita, [["data", "valor", "r$", "saldo"], [{"text": "Data", "x1": 30.0}, {"text": "Valor", "x1": 200.0}, {"text": "R$", "x1": 215.5}, {"text": "Saldo", "x1": 300.0}], "va"], {})
    _registrar("_comum.borda_direita", _comum.borda_direita, [["saidas", "saldo"], [{"text": "Saídas", "x1": 120.0}, {"text": "Saldo", "x1": 300.0}], "sa", ("saí", "saidas")], {})
    for linhas in (
        ["Período: 01/02/2025 a 28/02/2025"], ["Emitido em 12/05/2026", "fev 2025"], ["saldo em 31/01/25", "saldo em 15/01/25"],
        ["nada"], ["Lançamentos do período: 01/11/2025 até 30/11/2025"], ["fevereiro de 2024"],
    ):
        _registrar("periodo.fim_do_periodo", periodo.fim_do_periodo, [linhas], {})
    _registrar("periodo.ajustar_virada_de_ano", periodo.ajustar_virada_de_ano, [[
        TransacaoOFX("A", date(2026, 12, 31), Decimal("1"), "X", "CREDIT"),
        TransacaoOFX("B", date(2026, 1, 2), Decimal("1"), "X", "CREDIT"),
        TransacaoOFX("C", date(2024, 2, 29), Decimal("1"), "X", "CREDIT"),
    ], date(2026, 1, 31)], {})
    _registrar("periodo.ajustar_virada_de_ano", periodo.ajustar_virada_de_ano, [[
        TransacaoOFX("C", date(2024, 2, 29), Decimal("1"), "X", "CREDIT"),
    ], date(2023, 6, 30)], {})


def planilhas_inventadas():
    """Arquivos inventados para os leitores de planilha: tipos de célula, datas, CSVs estranhos."""
    import csv
    import io

    import openpyxl
    import xlwt

    from src.domain.extrato import planilha_parser as pp

    def xlsx(linhas, formatos=None, folha_antes=False):
        wb = openpyxl.Workbook()
        ws = wb.active
        if folha_antes:
            ws.title = "Capa"
            ws.append(["nada aqui"])
            ws = wb.create_sheet("Extrato")
        for linha in linhas:
            ws.append(linha)
        for coord, fmt in (formatos or {}).items():
            ws[coord].number_format = fmt
        b = io.BytesIO()
        wb.save(b)
        return b.getvalue()

    def xls(linhas, estilos=None):
        wb = xlwt.Workbook()
        ws = wb.add_sheet("Extrato")
        for i, linha in enumerate(linhas):
            for j, v in enumerate(linha):
                if v is None:
                    continue
                estilo = (estilos or {}).get((i, j))
                if estilo:
                    ws.write(i, j, v, xlwt.easyxf(num_format_str=estilo))
                else:
                    ws.write(i, j, v)
        b = io.BytesIO()
        wb.save(b)
        return b.getvalue()

    cab = ["Data", "Histórico", "Documento", "Crédito", "Débito", "Saldo"]
    numeros = [
        cab,
        [datetime(2026, 6, 30), "SALDO ANTERIOR", None, None, None, 1000],
        [datetime(2026, 7, 1, 10, 30), "PIX RECEBIDO ALFA", 3560100, 250.5, None, 1250.5],
        [datetime(2026, 7, 2), "TARIFA", 12345678901234567890, None, 9.9, 1240.6],
        [date(2026, 7, 3), "TED ENVIADA BETA", "  0042 ", None, -40, 1200.6],
        [datetime(2026, 7, 4), "CRED JUROS", True, 0.1 + 0.2, None, 1200.9],
        [None, None, None, None, None, None],
        [datetime(2026, 7, 5), "SALDO ATUAL", None, None, None, 1200.9],
    ]
    arquivos = [
        ("numeros.xlsx", xlsx(numeros, {"F2": "#,##0.00", "A3": "dd/mm/yyyy hh:mm", "B9": "@"})),
        ("formatos.xlsx", xlsx([
            ["Data", "Descrição", "Valor", "Saldo", "Hora", "Duração"],
            [45474, "SERIAL COMO DATA", 10, 10, 0.5, 1.25],
            [45475.75, "COM HORA", -5, 5, 0.999, 30],
        ], {"A2": "dd/mm/yyyy", "A3": "d-mmm-yy h:mm", "E2": "h:mm:ss", "E3": "hh:mm", "F2": "[h]:mm:ss", "F3": "[mm]:ss", "C2": '"R$" #,##0.00;[Red]-"R$" #,##0.00'})),
        ("segunda-folha.xlsx", xlsx(numeros, folha_antes=True)),
        ("extrato.xls", xls([
            ["Extrato"],
            ["Data", "Lançamento", "Dcto.", "Crédito (R$)", "Débito (R$)", "Saldo (R$)"],
            ["30/06/2026", "SALDO ANTERIOR", None, None, None, 1000.0],
            [46204.0, "RENTAB", 3560100, 250, None, 1250],
            [46205.5, "PIX ENVIADO ALFA LTDA", "2019261", None, 100.25, 1149.75],
            [46206.0, "BOOL", True, 1, None, 1150.75],
        ], {(3, 0): "dd/mm/yyyy", (4, 0): "dd/mm/yyyy hh:mm", (5, 0): "dd/mm/yy"})),
    ]
    csvs = {
        "ponto-e-virgula.csv": "Data;Descrição;Valor;Saldo\r\n01/07/2026;PIX RECEBIDO;1.250,00;1.250,00\r\n02/07/2026;TARIFA;-9,90;1.240,10\r\n",
        "virgula-aspas.csv": 'Data,Descrição,Valor,Saldo\n01/07/2026,"PIX, RECEBIDO ""ALFA""","1.250,00","1.250,00"\n02/07/2026,"TARIFA",-9.90,1240.10\n',
        "tab.csv": "Data\tHistórico\tValor\tSaldo\n01/07/2026\tPIX  RECEBIDO\t1250,00\t1250,00\n\n02/07/2026\tTARIFA\t-9,90\t1240,10",
        "so-cr.csv": "Data;Lançamento;Valor;Saldo\r01/07/2026;PIX;10,00;10,00\r02/07/2026;TARIFA;-1,00;9,00\r",
        "aspas-quebra.csv": 'Data;Histórico;Valor;Saldo\n01/07/2026;"PIX\nEM DUAS LINHAS";10,00;10,00\n02/07/2026;"ABERTA;-1,00;9,00\n',
        "espaco-inicial.csv": 'Data, Histórico, Valor, Saldo\n01/07/2026, "PIX", 10.00, 10.00\n02/07/2026, "TARIFA", -1.00, 9.00\n',
        "uma-coluna.csv": "Data\n01/07/2026\n",
        "aspas-simples.csv": "Data;Histórico;Valor;Saldo\n01/07/2026;'PIX ALFA';10,00;10,00\n",
    }
    for nome, b in arquivos:
        _registrar("planilha_parser._linhas_xlsx" if nome.endswith("xlsx") else "planilha_parser._linhas_xls",
                   pp._linhas_xlsx if nome.endswith("xlsx") else pp._linhas_xls, [b], {})
        _registrar("planilha_parser.parse_planilha", pp.parse_planilha, [b, nome, 2026], {})
    for nome, texto in csvs.items():
        for codificacao in ("utf-8", "utf-8-sig", "latin-1"):
            b = texto.encode(codificacao)
            _registrar("planilha_parser._linhas_csv", pp._linhas_csv, [b], {})
            _registrar("planilha_parser.parse_planilha", pp.parse_planilha, [b, nome, 2026], {})
    # O Sniffer sozinho, nas amostras dos CSVs e em umas a mais.
    amostras = list(csvs.values()) + [
        "a;b;c\n1;2;3\n4;5;6\n", "a,b;c\n1,2;3\n", "x\ty\n1\t2\n3\t4\n", "", "sem separador nenhum\nnem aqui\n",
        '"a";"b"\n"1";"2"\n', "a; b; c\n1; 2; 3\n", "1,5;2,5\n3,5;4,5\n5,5;6,5\n",
    ]
    for amostra in amostras:
        def farejar(s):
            try:
                d = csv.Sniffer().sniff(s, delimiters=";,\t")
            except csv.Error:
                return None
            return [d.delimiter, d.quotechar, bool(d.doublequote), bool(d.skipinitialspace)]
        _registrar("csv.sniff", farejar, [amostra], {})


def pytest_unconfigure(config):  # noqa: ARG001
    saida = os.environ.get("GABARITO_SAIDA")
    if not saida:
        return
    chamadas_diretas()
    planilhas_inventadas()
    registros = sorted(chamadas.values(), key=lambda r: (r["fn"], json.dumps(r["args"], ensure_ascii=False)))
    with open(saida, "w", encoding="utf-8", newline="\n") as f:
        json.dump(registros, f, ensure_ascii=False, indent=0)
    por_fn: dict[str, int] = {}
    for r in registros:
        por_fn[r["fn"]] = por_fn.get(r["fn"], 0) + 1
    print(f"\ngabarito: {len(registros)} chamadas em {len(por_fn)} funções -> {saida}")
