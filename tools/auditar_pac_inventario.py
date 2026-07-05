import csv
from collections import Counter, defaultdict
from pathlib import Path

import analizar_modelo_abastecimiento as modelo


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "outputs" / "abastecimiento_modelo" / "minimos_y_prediccion_julio_2026.csv"
OUTPUT = ROOT / "outputs" / "abastecimiento_modelo" / "auditoria_pac_vs_inventario_real.txt"


def read_model_rows():
    return list(csv.DictReader(SOURCE.open(encoding="utf-8-sig")))


def num(value):
    try:
        return float(value or 0)
    except ValueError:
        return 0.0


def clean_display(value):
    return (
        str(value or "")
        .replace("Ã¡", "á")
        .replace("Ã©", "é")
        .replace("Ã­", "í")
        .replace("Ã³", "ó")
        .replace("Ãº", "ú")
        .replace("Ã±", "ñ")
        .replace("Ã", "Á")
        .replace("Ã‰", "É")
        .replace("Ã", "Í")
        .replace("Ã“", "Ó")
        .replace("Ãš", "Ú")
        .replace("Ã‘", "Ñ")
    )


def line_for(row, extra=""):
    detail = [
        f"- {clean_display(row['producto'])}",
        f"stock {row['stock_actual']}",
        f"min {row['minimo_sugerido']}",
        f"pedido julio {row['pedido_julio_sugerido']}",
        f"match PAC: {clean_display(row['match_pac']) or 'sin match'}",
    ]
    if extra:
        detail.append(extra)
    return " | ".join(detail)


def main():
    rows = read_model_rows()
    pac_rows = modelo.parse_pac()
    order_rows = modelo.parse_monthly_orders()
    products = modelo.supabase_get(
        "productos_insumos",
        "id,nombre,nombre_normalizado,unidad_default,stock_minimo,consumo_promedio_diario,critico,activo",
        {"activo": "eq.true"},
    )

    product_by_id = {item["id"]: item for item in products}
    pac_by_product_id = {}
    order_by_product_id = {}
    for product in products:
        pac_match, pac_score = modelo.best_match(product, pac_rows)
        order_match, order_score = modelo.best_match(product, order_rows)
        pac_by_product_id[product["id"]] = (pac_match, pac_score)
        order_by_product_id[product["id"]] = (order_match, order_score)

    pac_code_usage = defaultdict(list)
    for row in rows:
        pac_match, pac_score = pac_by_product_id.get(row["producto_id"], (None, 0))
        if pac_match:
            pac_code_usage[pac_match["code"]].append(row)

    source_counts = Counter(row["fuente"] for row in rows)
    pac_only = [row for row in rows if row["fuente"] == "pac_2026"]
    pac_with_stock = [row for row in pac_only if num(row["stock_actual"]) > 0]
    pac_orders = [row for row in pac_only if num(row["pedido_julio_sugerido"]) > 0]
    pac_big_orders = [row for row in pac_orders if num(row["pedido_julio_sugerido"]) >= 1000]
    low_score = []
    duplicate_pac = []

    for row in pac_only:
        pac_match, pac_score = pac_by_product_id.get(row["producto_id"], (None, 0))
        if pac_score < 90:
            low_score.append((row, pac_score))
        if pac_match and len(pac_code_usage[pac_match["code"]]) > 1:
            duplicate_pac.append((row, pac_match["code"]))

    lines = [
        "Auditoria PAC vs inventario real",
        "Objetivo: detectar si PAC esta empujando minimos/pedidos sobre productos sin respaldo mensual real.",
        "",
        "Conclusion corta:",
        "- El SQL no modifica stock real ni lotes de inventario.",
        "- Si puede modificar stock_minimo y consumo_promedio_diario de productos cuando la fuente es PAC.",
        "- Por eso, los registros con fuente pac_2026 son respaldo administrativo, no evidencia de pedido mensual real.",
        "",
        "Resumen:",
        f"- Total productos analizados: {len(rows)}",
        f"- Fuente pedidos mensuales: {source_counts.get('pedidos_mensuales', 0)}",
        f"- Fuente PAC 2026: {source_counts.get('pac_2026', 0)}",
        f"- Sin data: {source_counts.get('sin_data', 0)}",
        f"- PAC con stock real disponible: {len(pac_with_stock)}",
        f"- PAC con pedido julio sugerido: {len(pac_orders)}",
        f"- PAC con pedido julio >= 1000: {len(pac_big_orders)}",
        "",
        "Regla de lectura:",
        "- pedidos_mensuales = mas fidedigno para minimo/prediccion.",
        "- pac_2026 = util como respaldo, pero debe verse como media-baja hasta que tenga pedido mensual o conciliacion por codigo.",
        "- sin_data = no deberia forzar consumo ni pedido.",
        "",
    ]

    lines.append("PAC con pedido julio alto (revisar primero):")
    for row in sorted(pac_big_orders, key=lambda item: num(item["pedido_julio_sugerido"]), reverse=True)[:25]:
        pac_match, pac_score = pac_by_product_id.get(row["producto_id"], (None, 0))
        lines.append(line_for(row, f"score PAC {pac_score:.1f}"))
    lines.append("")

    lines.append("PAC usado con match de texto menor a 90 (posible contaminacion por nombre):")
    for row, score in sorted(low_score, key=lambda item: item[1])[:40]:
        lines.append(line_for(row, f"score PAC {score:.1f}"))
    lines.append("")

    lines.append("Mismo codigo PAC usado por mas de un producto del sistema:")
    grouped = defaultdict(list)
    for row, code in duplicate_pac:
        grouped[code].append(row)
    for code, grouped_rows in sorted(grouped.items(), key=lambda item: item[0])[:40]:
        lines.append(f"- Codigo PAC {code}")
        for row in grouped_rows:
            lines.append(f"  {line_for(row)}")
    lines.append("")

    lines.append("PAC con stock real pero sin pedido mensual real:")
    for row in sorted(pac_with_stock, key=lambda item: item["producto"].lower())[:80]:
        pac_match, pac_score = pac_by_product_id.get(row["producto_id"], (None, 0))
        lines.append(line_for(row, f"score PAC {pac_score:.1f}"))

    OUTPUT.write_text("\n".join(lines), encoding="utf-8")
    print(OUTPUT)


if __name__ == "__main__":
    main()
