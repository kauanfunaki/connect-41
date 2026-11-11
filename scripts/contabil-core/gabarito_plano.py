"""Gabarito da importação do plano de contas por planilha (Fase 3b, 10/11/2026).

Roda o Contábil Core original sobre planilhas e lotes INVENTADOS aqui e grava, num JSON, a entrada e a
saída exatas de:
- `_parse_planilha` (xlsx pelo openpyxl, csv pelo módulo csv) e `_normaliza_linha_cabecalho`
  (`src/api/v1/plano_contas.py`);
- `PlanoContaService.importar_lote` (`src/domain/plano_contas/service.py`) com um banco de mentira:
  as faixas, as contas existentes, as contas com lançamento e o próximo número vêm do caso, e o que o
  serviço grava é capturado. É a parte da importação que não depende do banco.

O porte repete as chamadas em `src/lib/contabil-core/cadastro/planilhaDoPlano.test.ts`. Nenhum dado
real: as planilhas são geradas aqui e vão no JSON em base64 (o git deste repositório converte fim de
linha de arquivo texto, e os CSVs testam justamente \\r\\n e \\r).

Uso, a partir da raiz do contabil-core, com openpyxl e as dependências do projeto:
    python <connect>/scripts/contabil-core/gabarito_plano.py <connect>/src/lib/contabil-core/cadastro/gabarito/plano.json
"""
from __future__ import annotations

import asyncio
import base64
import csv
import io
import json
import os
import re
import sys
import uuid
import zipfile
from datetime import datetime, timedelta

os.environ.setdefault("OPENAI_ENABLED", "false")
os.environ.setdefault("ALLOW_FINANCIAL_DATA_TO_OPENAI", "false")
# Valores fictícios só para a configuração carregar: nada aqui abre banco.
os.environ.setdefault("SECRET_KEY", "gabarito-local-sem-segredo-0123456789abcdef")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://gabarito:gabarito@127.0.0.1:1/gabarito")
sys.path.insert(0, os.getcwd())

import openpyxl  # noqa: E402

from src.api.v1 import plano_contas as api  # noqa: E402
from src.db.models import PlanoConta  # noqa: E402
from src.domain.plano_contas import service as servico  # noqa: E402
from src.schemas.plano_contas import codigo_para_tupla  # noqa: E402


# ─── Células ────────────────────────────────────────────────────────────────


def celula(v):
    """Valor do Python → JSON, com o tipo (o porte tem um `Celula` com o mesmo tipo)."""
    if v is None or isinstance(v, str):
        return v
    if isinstance(v, bool):
        return {"$b": v}
    if isinstance(v, int):
        return {"$i": str(v)}
    if isinstance(v, float):
        return {"$f": repr(v)}
    if isinstance(v, datetime):
        return {"$d": str(v)}
    if isinstance(v, timedelta):
        return {"$t": str(v)}
    raise TypeError(type(v))


# ─── Planilhas inventadas ───────────────────────────────────────────────────


def xlsx(*folhas, ativa=0):
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    for i, linhas in enumerate(folhas):
        ws = wb.create_sheet(f"Folha{i + 1}")
        for linha in linhas:
            if isinstance(linha, dict):  # {"linha": n, "coluna": c, "valor": v}: célula solta
                ws.cell(row=linha["linha"], column=linha["coluna"], value=linha["valor"])
            else:
                ws.append(linha)
    wb.active = ativa
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def trocar_folha(conteudo: bytes, troca) -> bytes:
    """Reescreve o XML da primeira folha (para dimensão errada, ausente etc.)."""
    entrada = zipfile.ZipFile(io.BytesIO(conteudo))
    saida = io.BytesIO()
    with zipfile.ZipFile(saida, "w", zipfile.ZIP_DEFLATED) as z:
        for info in entrada.infolist():
            dados = entrada.read(info.filename)
            if info.filename == "xl/worksheets/sheet1.xml":
                dados = troca(dados.decode()).encode()
            z.writestr(info.filename, dados)
    return saida.getvalue()


def dimensao(ref):
    return lambda xml: re.sub(r'<dimension ref="[^"]*"\s*/>', f'<dimension ref="{ref}"/>', xml)


sem_dimensao = lambda xml: re.sub(r'<dimension ref="[^"]*"\s*/>', "", xml)  # noqa: E731

BASICO = [
    ["codigo", "descricao", "tipo", "tipo_sa"],
    ["1", "Ativo", "ativo", "S"],
    [1.1, "Ativo Circulante", "ativo", None],
    [2, "Passivo", "PASSIVO", "a"],
    [None, None, None, None],
    ["  1.1.01 ", "  Caixa  ", "ativo"],
    [None, "Sem código", "ativo", "A"],
    ["3", None, "receita"],
    [3.10, "Float 3.1", "receita"],
    [1e16, "Grande", "ativo"],
    [True, "Booleano", "ativo"],
    [datetime(2026, 1, 5, 10, 30), "Data", "ativo"],
    [0, "Zero", "ativo", 0],
    [-1.5, "Negativo", "ativo", False],
]

METADADOS = [
    [None],
    [None, "Empresa: 999 - EMPRESA FICTICIA", None, None, None, "Página:", "1/1"],
    [None, "CNPJ: 00.000.000/0001-00"],
    [None],
    [None, "PLANO DE CONTAS"],
    [None],
    [None, "Classificação", "Código", "T", "Descrição", "CNPJ", "Grau", "Tipo"],
    [None, "1", 1575, "S", "ATIVO", None, 1, "Ativo"],
    [None, "1.1", 1579.0, "A", "ATIVO CIRCULANTE", None, 2, "Ativo"],
    [None],
    [None, "1.1.1", "1580", "A", "CAIXA", None, 3, "PL"],
]

ALIASES = [
    ["Code", "Description", "Type", "S/A", "ID", "Saldo", None, "Nome"],
    ["1", "Primeira descrição", "Ativo", "s", 10, 1500.25, "x", "Nome vence (última coluna)"],
    ["2", "Segunda", "Passivo", "A", "20", None, None, None],
    ["3", "Terceira"],
]

ZERO_NO_CABECALHO = [
    [0, False, "COD", "Descrição ", " CLASSIFICAÇÃO", "código", "Tipo_SA"],
    ["a", "b", "1-cod", "Conta", "4.1", "777", "S"],
]


def planilhas_xlsx():
    yield "x-basico", "plano.xlsx", xlsx(BASICO)
    yield "x-metadados", "plano.xlsx", xlsx(METADADOS)
    yield "x-ativa-segunda", "plano.xlsx", xlsx(BASICO, METADADOS, ativa=1)
    yield "x-ativa-primeira", "plano.xlsx", xlsx(METADADOS, BASICO, ativa=0)
    yield "x-aliases", "plano.xlsx", xlsx(ALIASES)
    yield "x-zero-no-cabecalho", "plano.xlsx", xlsx(ZERO_NO_CABECALHO)
    yield "x-sem-cabecalho", "plano.xlsx", xlsx([["não", "é", "um", "cabeçalho", "válido"], ["1", "algo", "ativo"]])
    yield "x-vazio", "plano.xlsx", xlsx([])
    metadado = [[f"linha {i}"] for i in range(1, 30)]
    yield "x-cabecalho-na-30", "plano.xlsx", xlsx(metadado + [["codigo", "descricao"], ["1", "Ativo"]])
    yield "x-cabecalho-na-31", "plano.xlsx", xlsx(metadado + [["x"], ["codigo", "descricao"], ["1", "Ativo"]])
    yield "x-colunas-demais", "plano.xlsx", xlsx([["codigo", "descricao"] + [f"c{i}" for i in range(99)], ["1", "Ativo"]])
    yield "x-colunas-no-limite", "plano.xlsx", xlsx([["codigo", "descricao"] + [f"c{i}" for i in range(98)], ["1", "Ativo"]])
    yield "x-dimensao-menor", "plano.xlsx", trocar_folha(xlsx(BASICO), dimensao("A1:B4"))
    yield "x-dimensao-maior", "plano.xlsx", trocar_folha(xlsx(BASICO), dimensao("A1:F30"))
    yield "x-dimensao-so-linhas", "plano.xlsx", trocar_folha(xlsx(BASICO), dimensao("1:5"))
    yield "x-dimensao-zero", "plano.xlsx", trocar_folha(xlsx(BASICO), dimensao("A0"))
    yield "x-dimensao-invalida", "plano.xlsx", trocar_folha(xlsx(BASICO), dimensao("A1:B"))
    yield "x-sem-dimensao", "plano.xlsx", trocar_folha(xlsx(METADADOS), sem_dimensao)
    yield "x-linhas-demais", "plano.xlsx", xlsx([["codigo", "descricao"], ["1", "Ativo"], {"linha": 60000, "coluna": 1, "valor": "9"}])
    yield "x-linhas-no-limite", "plano.xlsx", xlsx([["codigo", "descricao"], ["1", "Ativo"], {"linha": 50001, "coluna": 1, "valor": "9"}])
    largo = ["codigo", "descricao"] + [f"c{i}" for i in range(98)]
    yield "x-celulas-demais", "plano.xlsx", xlsx([largo, ["1", "Ativo"], {"linha": 6000, "coluna": 1, "valor": "9"}])
    yield "x-dimensao-larga-sem-cabecalho", "plano.xlsx", trocar_folha(xlsx([["a"], ["b"]]), dimensao("A1:XFD1048576"))
    yield "x-dimensao-larga-com-cabecalho", "plano.xlsx", trocar_folha(xlsx([["codigo", "descricao"], ["1", "A"]]), dimensao("A1:XFD1048576"))
    yield "x-formula", "plano.xlsx", xlsx([["codigo", "descricao", "tipo"], ["1", "=\"Ati\"&\"vo\"", "ativo"], ["=1+1", "Fórmula", "ativo"]])
    yield "x-nome-xls", "plano.xls", xlsx(BASICO)
    yield "x-nome-maiusculo", "PLANO.XLSX", xlsx(BASICO)
    yield "x-xls-de-verdade", "plano.xls", bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]) + bytes(504)
    yield "x-nao-e-zip", "plano.xlsx", b"isto nao e um zip"
    yield "x-vazio-bytes", "plano.xlsx", b""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("leia-me.txt", "nada aqui")
    yield "x-zip-sem-planilha", "plano.xlsx", buf.getvalue()


def planilhas_csv():
    yield "c-virgula", "plano.csv", "codigo,descricao,tipo\n1.1.1,Caixa,ativo\n1,Ativo,ativo\n1.1,Ativo Circulante,ativo\n".encode()
    yield "c-ponto-e-virgula-bom-crlf", "plano.csv", "﻿Classificação;Código;Descrição;Tipo;S/A\r\n1;100;Ativo;ativo;S\r\n1.1;101;Ativo Circulante;ativo;A\r\n\r\n2;200;Passivo;passivo;S\r\n".encode()
    yield "c-tab-latin1", "plano.csv", "codigo\tDescrição\ttipo\n1\tAtivo\x85\tativo\n2\t Passivo e Patrimônio \tpassivo\n".encode("latin-1")
    yield "c-metadados", "plano.csv", "Empresa: 999 - EMPRESA FICTICIA\n\ncodigo,descricao,tipo\n1,Ativo,ativo\n".encode()
    yield "c-cr-solto", "plano.csv", "codigo;descricao;tipo\r1;Ativo;ativo\r2;Passivo;passivo\r".encode()
    yield "c-cr-entre-aspas", "plano.csv", 'codigo;descricao;tipo\r\r\n1;"Ativo\rcom quebra";ativo\r\r\n2;"Passivo\r\nduas linhas";passivo\n3;Receita;receita\r'.encode()
    yield "c-cr-no-fim", "plano.csv", "codigo,descricao\n1,Ativo\r\r".encode()
    yield "c-vazio", "plano.csv", b""
    yield "c-so-espacos", "plano.csv", b"   \n\t\n"
    yield "c-aspas", "plano.csv", 'codigo,descricao,tipo\n"1","Ativo, circulante e ""outros""",ativo\n2,"Passivo\nem duas linhas",passivo\n'.encode()
    yield "c-linhas-vazias", "plano.csv", "codigo;descricao;tipo\n\n1;Ativo;ativo\n;;\n\n2;Passivo;passivo\n;;;;\n".encode()
    yield "c-float-conta", "plano.csv", "codigo,descricao,tipo,conta_numero\n1,Ativo Circulante,ativo,1507.0\n".encode()
    yield "c-colunas-desiguais", "plano.csv", "codigo;descricao;tipo;tipo_sa\n1;Ativo\n2;Passivo;passivo;S;extra;mais\n3\n;Só descrição\n".encode()
    yield "c-sniffer-falha", "plano.csv", "Relatorio\nPlano\ncodigo,descricao\n1,Ativo\n".encode()
    yield "c-nome-txt", "plano.txt", "codigo;descricao\n1;Ativo\n".encode()
    yield "c-sem-cabecalho", "plano.csv", "a,b,c\n1,2,3\n".encode()
    yield "c-cabecalho-na-31", "plano.csv", ("".join(f"meta {i};x\n" for i in range(30)) + "codigo;descricao\n1;Ativo\n").encode()
    yield "c-utf8-invalido", "plano.csv", "codigo;descricao\n1;Ativo \xe7\xe3o\n".encode("latin-1") + b"\xff\n"
    yield "c-espaco-inicial", "plano.csv", 'codigo, descricao, tipo\n1, "Ativo", ativo\n2, Passivo, passivo\n'.encode()
    # Os mesmos casos com o Sniffer decidindo o separador por frequência, com mais linhas iguais:
    yield "c-pv-bom-crlf-regular", "plano.csv", "﻿Classificação;Código;Descrição;Tipo;S/A\r\n1;100;Ativo;ativo;S\r\n1.1;101;Ativo Circulante;ativo;A\r\n1.1.1;102;Caixa;ativo;A\r\n2;200;Passivo;passivo;S\r\n".encode()
    yield "c-linhas-vazias-virgula", "plano.csv", "codigo,descricao,tipo\n\n1,Ativo,ativo\n,,\n\n2,Passivo,passivo\n3,Receita,receita\n".encode()
    yield "c-colunas-desiguais-virgula", "plano.csv", "codigo,descricao,tipo,tipo_sa\n1,Ativo,ativo,S\n2,Passivo,passivo,S,extra\n3,Receita,receita,A\n4\n,Só descrição,ativo,A\n".encode()
    yield "c-latin1-virgula", "plano.csv", "codigo,descrição,tipo\n1,Ação\x85,ativo\n2,Patrimônio,passivo\n".encode("latin-1")
    yield "c-tab-regular", "plano.csv", "codigo\tdescricao\ttipo\n1\tAtivo\tativo\n2\tPassivo\tpassivo\n3\tReceita\treceita\n".encode()


def ler(conteudo: bytes, nome: str):
    try:
        linhas = api._parse_planilha(conteudo, nome.lower())
    except csv.Error as e:
        return {"excecao": "csv.Error", "mensagem": str(e)}
    except Exception as e:  # noqa: BLE001 — o gabarito grava qualquer recusa
        mensagem = getattr(e, "message", None)
        if mensagem is not None:
            return {"erro": mensagem}
        return {"excecao": type(e).__name__, "mensagem": str(e)}
    saida = []
    for d in linhas:
        item = {
            "linha": d["_linha"],
            "codigo": d["codigo"],
            "descricao": d["descricao"],
            "tipo": d["tipo"],
            "tipo_sa": d["tipo_sa"],
        }
        if "conta_numero" in d:
            item["conta_numero"] = d["conta_numero"]
        saida.append(item)
    return {"linhas": saida}


CABECALHOS = [
    ["codigo", "descricao"],
    ["Código", "Descrição", "Tipo"],
    ["Classificação", "Código", "Descrição"],
    ["classificacao", "CÓDIGO", "nome"],
    [" Code ", "DESCRIPTION", "type", "sa", "s/a", "id", "conta", "cod"],
    [None, "", 0, 0.0, False, True, 1, 2.5, float("nan"), "Saldo"],
    [datetime(2026, 1, 1), timedelta(0), timedelta(days=1), "\xa0Código\xa0"],
    ["Classificação", "código", "codigo"],
]


# ─── importar_lote com banco de mentira ─────────────────────────────────────


class _Resultado:
    def __init__(self, objetos):
        self._objetos = objetos

    def scalars(self):
        return self

    def all(self):
        return list(self._objetos)


class _Aninhada:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _Banco:
    def __init__(self, existentes, falhar):
        self.existentes = existentes
        self.falhar = set(falhar)
        self.adicionadas: list[PlanoConta] = []
        self.removidas: list[PlanoConta] = []

    async def execute(self, _consulta):
        return _Resultado(self.existentes)

    def begin_nested(self):
        return _Aninhada()

    def add(self, objeto):
        if objeto.codigo in self.falhar:
            raise RuntimeError(f"falha simulada ao gravar {objeto.codigo}")
        if objeto.id is None:
            objeto.id = uuid.uuid4()
        self.adicionadas.append(objeto)

    async def flush(self):
        return None

    async def delete(self, objeto):
        self.removidas.append(objeto)


async def _sem_auditoria(*_a, **_k):
    return None


def conta_json(c, por_id):
    return {
        "codigo": c.codigo,
        "contaNumero": c.conta_numero,
        "descricao": c.descricao,
        "tipo": c.tipo,
        "tipoSa": c.tipo_sa,
        "paiCodigo": por_id[c.pai_id].codigo if c.pai_id else None,
    }


def importar(caso):
    servico.registrar_auditoria = _sem_auditoria
    empresa = uuid.uuid4()
    existentes = []
    movimentadas = set()
    for e in caso.get("existentes", []):
        c = PlanoConta(
            id=uuid.uuid4(), empresa_id=empresa, conta_numero=e["contaNumero"], codigo=e["codigo"],
            descricao=e["descricao"], tipo=e["tipo"], tipo_sa=e["tipoSa"], pai_id=None, deleted_at=None,
        )
        existentes.append(c)
        if e.get("movimentada"):
            movimentadas.add(c.id)
    banco = _Banco(existentes, caso.get("falhar", []))
    svc = servico.PlanoContaService(db=banco, empresa_id=empresa)
    faixas = [(f["tipo"], codigo_para_tupla(f["codigoDe"]), codigo_para_tupla(f["codigoAte"])) for f in caso.get("faixas", [])]

    async def _faixas():
        return faixas

    async def _proximo():
        return caso.get("proximoNumero", 1)

    async def _movimentada(conta_id):
        return conta_id in movimentadas

    svc._faixas_para_classificacao = _faixas
    svc._proximo_conta_numero = _proximo
    svc._tem_movimentacao = _movimentada
    linhas = [{"_linha": l["linha"], **{k: v for k, v in l.items() if k != "linha"}} for l in caso["linhas"]]
    try:
        r = asyncio.run(svc.importar_lote(linhas))
    except Exception as e:  # noqa: BLE001
        return {"excecao": type(e).__name__, "mensagem": str(e)}
    por_id = {c.id: c for c in existentes + banco.adicionadas}
    removidas = {id(c) for c in banco.removidas}
    return {
        "importadas": r.importadas,
        "atualizadas": r.atualizadas,
        "duplicadas": r.duplicadas,
        "erros": [e.model_dump() for e in r.erros],
        "novas": [conta_json(c, por_id) for c in banco.adicionadas if id(c) not in removidas],
        "existentes": [conta_json(c, por_id) for c in existentes],
    }


def l(linha, codigo, descricao, tipo="", tipo_sa="A", **extra):
    return {"linha": linha, "codigo": codigo, "descricao": descricao, "tipo": tipo, "tipo_sa": tipo_sa, **extra}


FAIXAS_DO_TESTE = [
    {"tipo": "ativo", "codigoDe": "1", "codigoAte": "1.999999999"},
    {"tipo": "passivo", "codigoDe": "2", "codigoAte": "2.2.999999999"},
    {"tipo": "patrimonio_liquido", "codigoDe": "2.3", "codigoAte": "2.3.999999999"},
    {"tipo": "receita", "codigoDe": "3", "codigoAte": "3.2.1.04.001"},
    {"tipo": "custo", "codigoDe": "3.3", "codigoAte": "3.3.7.01.0001"},
    {"tipo": "despesa", "codigoDe": "3.4", "codigoAte": "3.5.1.07.004"},
    {"tipo": "resultado", "codigoDe": "4", "codigoAte": "4.999999999"},
]

LOTES = {
    # Os casos de tests/integration/test_plano_contas.py:
    "filho-antes-do-pai": {"linhas": [l(2, "1.1.1", "Caixa", "ativo"), l(3, "1", "Ativo", "ativo"), l(4, "1.1", "Ativo Circulante", "ativo")]},
    "sem-tipo-sem-faixa": {"linhas": [l(2, "1", "Ativo"), l(3, "2", "Passivo")]},
    "faixas-da-empresa": {
        "faixas": FAIXAS_DO_TESTE,
        "linhas": [l(2, "1", "Ativo Circulante"), l(3, "2", "Fornecedores"), l(4, "2.3", "Capital Social"), l(5, "3", "Receita de Vendas"),
                   l(6, "3.3", "CMV"), l(7, "3.4", "Despesas Administrativas"), l(8, "4", "Apuracao do Resultado")],
    },
    "fora-de-toda-faixa": {"faixas": FAIXAS_DO_TESTE[:1], "linhas": [l(2, "9.9", "Fora de Qualquer Faixa")]},
    "numeracao-automatica": {"proximoNumero": 1, "linhas": [l(2, "1", "Ativo", "ativo"), l(3, "2", "Passivo", "passivo")]},
    "numero-informado": {"linhas": [l(2, "1", "Ativo", "ativo", conta_numero="900")]},
    "numero-float": {"linhas": [l(2, "1", "Ativo Circulante", "ativo", conta_numero="1507.0")]},
    "reimporta-descricao-e-numero": {
        "existentes": [{"codigo": "1", "contaNumero": 1, "descricao": "Ativo (nome antigo)", "tipo": "ativo", "tipoSa": "A"}],
        "linhas": [l(2, "1", "Ativo (nome corrigido)", "ativo", conta_numero="777")],
    },
    "reimporta-tipo-sem-movimento": {
        "existentes": [{"codigo": "2.1.1", "contaNumero": 1, "descricao": "Fornecedor X", "tipo": "despesa", "tipoSa": "A"}],
        "linhas": [l(2, "2.1.1", "Fornecedor X", "passivo")],
    },
    "reimporta-tipo-com-movimento": {
        "existentes": [{"codigo": "2.1.2", "contaNumero": 1, "descricao": "Fornecedor Y", "tipo": "despesa", "tipoSa": "A", "movimentada": True}],
        "linhas": [l(2, "2.1.2", "Fornecedor Y Ltda", "passivo")],
    },
    "reimporta-identica": {
        "existentes": [{"codigo": "3", "contaNumero": 1, "descricao": "Resultado", "tipo": "resultado", "tipoSa": "A"}],
        "linhas": [l(2, "3", "Resultado", "resultado")],
    },
    # Casos inventados para o resto do caminho:
    "validacao-e-hierarquia": {
        "proximoNumero": 50,
        "existentes": [
            {"codigo": "1", "contaNumero": 10, "descricao": "Ativo", "tipo": "ativo", "tipoSa": "A"},
            {"codigo": "2", "contaNumero": 49, "descricao": "Passivo", "tipo": "passivo", "tipoSa": "S", "movimentada": True},
        ],
        "faixas": [{"tipo": "despesa", "codigoDe": "4", "codigoAte": "4.9"}, {"tipo": "receita", "codigoDe": "1.5", "codigoAte": "1.5"}],
        "linhas": [
            l(2, "1.1", "Circulante", "ativo"),
            l(3, "1.1", "Repetida no lote", "ativo"),
            l(4, "", "Sem código", "ativo"),
            l(5, "1.2", "", "ativo"),
            l(6, "1.a", "X", "foo", "Z"),
            l(7, "1.3", "Ok", "PL", "s"),
            l(8, "1.4", "Ok", "Patrimonio_Liquido", "   "),
            l(9, "1" * 31, "é" * 301, "ativo"),
            l(10, "1.1.1.1.1.1", "Nível seis", "ativo"),
            l(11, "1.1.1.1.1", "Nível cinco", "ativo"),
            l(12, "1.1.1.1", "Nível quatro", "ativo"),
            l(13, "1.1.1", "Nível três", "ativo"),
            l(14, "5.1", "Sem ancestral", "ativo"),
            l(15, "5.1.1", "Sem avô", "ativo"),
            l(16, "4.1", "Pela faixa", "", "A"),
            l(17, "4. 2", "Faixa com espaço", "", "A"),
            l(18, "1. 5", "Faixa 1.5 com espaço", ""),
            l(19, "2", "Passivo", "ativo", "A"),
            l(20, "2.1", "Filha de movimentada", "passivo", conta_numero="abc"),
            l(21, "2.2", "Numero nan", "passivo", conta_numero="nan"),
            l(22, "2.3", "Numero com _", "passivo", conta_numero=" 1_000 "),
            l(23, "2.4", "Numero 1e3", "passivo", conta_numero="1e3"),
            l(24, "2.5", "Numero negativo", "passivo", conta_numero="-7.9"),
            l(25, "2.6", "Numero hexa", "passivo", conta_numero="0x10"),
            l(26, "١.٢", "Dígitos arábicos", "ativo"),
            l(27, "1", "Ativo renomeado", "ativo", "A", conta_numero="10"),
            l(28, " 3 ", " Receita ", " Receita ", " a "),
            l(29, "3.10", "Ordem numérica", "receita"),
            l(30, "3.9", "Ordem numérica", "receita"),
            l(31, "3.1", "x", "receita"),
            l(32, "it's", "aspas \"duplas\" e 'simples' ​\x00 e uma descrição bem comprida para cortar", "tipo\tcom tab"),
            # O corte do repr no erro do pydantic conta bytes em UTF-8:
            l(33, "6", "Seis", "ã" * 24),
            l(34, "7", "Sete", "ã" * 25),
            l(35, "8", "Oito", "€a" * 13),
            l(36, "9", "Nove", "a€" * 13),
            l(37, "10", "Dez", "x" * 47 + "😀"),
        ],
    },
    "pai-falha-ao-gravar": {
        "falhar": ["7.1"],
        "linhas": [l(2, "7", "Raiz", "ativo"), l(3, "7.1", "Falha", "ativo"), l(4, "7.1.1", "Neta", "ativo"),
                   l(5, "7.1.1.1", "Bisneta", "ativo"), l(6, "7.2", "Irmã", "ativo")],
    },
    "existente-vira-sintetica": {
        "existentes": [{"codigo": "8", "contaNumero": 3, "descricao": "Raiz", "tipo": "ativo", "tipoSa": "S"}],
        "linhas": [l(2, "8", "Raiz", "ativo", "A"), l(3, "8.1", "Filha", "ativo")],
    },
    "numero-infinito": {"linhas": [l(2, "1", "Ativo", "ativo", conta_numero="inf")]},
}


def main():
    saida = sys.argv[1]
    planilhas = {}
    for caso, nome, conteudo in list(planilhas_xlsx()) + list(planilhas_csv()):
        planilhas[caso] = {"nome": nome, "base64": base64.b64encode(conteudo).decode(), "resultado": ler(conteudo, nome)}
    cabecalhos = [
        {"entrada": [celula(v) for v in linha], "saida": api._normaliza_linha_cabecalho(linha)} for linha in CABECALHOS
    ]
    lotes = {caso: {"entrada": entrada, "resultado": importar(entrada)} for caso, entrada in LOTES.items()}
    with open(saida, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"planilhas": planilhas, "cabecalhos": cabecalhos, "lotes": lotes}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(planilhas)} planilhas, {len(cabecalhos)} cabeçalhos e {len(lotes)} lotes em {saida}")


if __name__ == "__main__":
    main()
