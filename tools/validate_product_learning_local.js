const BASE_URL = process.env.JESUNUTRI_LOCAL_BACKEND_URL || "http://127.0.0.1:8787";

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

async function cleanup(code) {
  await request("/api/table/product_code_links/query", {
    method: "POST",
    body: {
      operation: "delete",
      filters: [{ op: "eq", column: "code_normalized", value: code }]
    }
  });
}

async function main() {
  const testCode = `codex-test-${Date.now()}`.toUpperCase();
  const normalizedCode = testCode.replace(/[^A-Z0-9]/g, "");

  await request("/api/install", { method: "POST", body: {} });
  const before = await request("/api/status");
  const snapshot = await request("/api/inventory/snapshot");
  const product = snapshot.products?.[0];
  if (!product?.id) throw new Error("No hay productos locales para validar aprendizaje.");

  try {
    const body = {
      userId: "codex-validation",
      link: {
        product_id: product.id,
        code_raw: testCode,
        code_normalized: normalizedCode,
        code_type: "simple",
        gtin: null,
        barcode_format: "test",
        package_type: "caja",
        package_quantity: 24,
        package_unit: "unidad",
        base_unit: product.unidad_default || "unidad",
        conversion_factor: 24,
        conversion_notes: "Validacion local automatica",
        source: "local_validation",
        confidence: 0.99
      }
    };

    const created = await request("/api/product-code-links", { method: "POST", body });
    const repeated = await request("/api/product-code-links", { method: "POST", body });
    const fetched = await request(`/api/product-code-links/${encodeURIComponent(normalizedCode)}`);
    const after = await request("/api/status");

    const assertions = {
      migrationReady: after.installed && after.migrationVersion === after.latestMigration,
      createdProduct: fetched.link?.product_id === product.id,
      packageType: fetched.link?.package_type === "caja",
      packageQuantity: Number(fetched.link?.package_quantity) === 24,
      packageUnit: fetched.link?.package_unit === "unidad",
      baseUnit: fetched.link?.base_unit === (product.unidad_default || "unidad"),
      conversionFactor: Number(fetched.link?.conversion_factor) === 24,
      scanCountIncremented: Number(created.link?.scan_count) === 1 && Number(repeated.link?.scan_count) === 2,
      pendingUnchanged: before.counts?.ingresosPendientes === after.counts?.ingresosPendientes,
      movementsUnchanged: before.counts?.movimientos === after.counts?.movimientos
    };
    const failed = Object.entries(assertions).filter(([, ok]) => !ok).map(([key]) => key);
    const summary = {
      ok: failed.length === 0,
      product: product.nombre,
      code: normalizedCode,
      assertions,
      failed
    };
    console.log(JSON.stringify(summary, null, 2));
    if (failed.length) process.exitCode = 1;
  } finally {
    await cleanup(normalizedCode);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
