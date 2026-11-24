"""Partes usadas tanto pelo servidor local (server.py) quanto pela coleta estática (coletar_json.py)."""
import json
import os
import urllib.request

import classificar as cl

ALVOS_PADRAO = ["Agência Brasileira de Inteligência", "Banco Central do Brasil", "Polícia Federal", "Receita Federal",
                "Instituto Rio Branco", "Tribunal de Contas da União", "Senado Federal", "Controladoria-Geral da União",
                "Polícia Rodoviária Federal"]
CONSULTAS_DOU_GERAIS = [('"edital de abertura"', "edital"), ('"realização de concurso público"', "autorizacao")]


def carregar_env(caminho):
    """Lê um .env simples (CHAVE=valor) sem sobrescrever variáveis já definidas."""
    if not os.path.exists(caminho):
        return
    for linha in open(caminho, encoding="utf-8"):
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        k, v = linha.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def municipios(pasta_cache):
    """Tabela UF → {nome normalizado: (id IBGE, nome)}; baixa do IBGE na primeira vez."""
    os.makedirs(pasta_cache, exist_ok=True)
    path = os.path.join(pasta_cache, "municipios.json")
    if not os.path.exists(path):
        with urllib.request.urlopen("https://servicodados.ibge.gov.br/api/v1/localidades/municipios?view=nivelado", timeout=60) as r:
            open(path, "wb").write(r.read())
    tab = {}
    for m in json.load(open(path, encoding="utf-8")):
        tab.setdefault(m["UF-sigla"], {})[cl.norm(m["municipio-nome"])] = (m["municipio-id"], m["municipio-nome"])
    return tab


def banca_para(c, bancas):
    """Liga um concurso do PCI à banca que o lista (FGV/Cesgranrio) por sigla ou nome."""
    sig, org = cl.norm(c["sigla"]), cl.norm(c["orgao"])
    for b in bancas:
        t = cl.norm(b["titulo"])
        if (len(sig) >= 3 and f" {sig} " in f" {t.replace('/', ' ').replace('-', ' ')} ") or (len(org) > 12 and org in t):
            return b["banca"], b["url"]
    return None, None
