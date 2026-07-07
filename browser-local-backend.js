(function () {
  const DB_NAME = "jesunutri_browser_local_backend";
  const DB_VERSION = 1;
  const META_STORE = "__meta";
  const VIEW_TABLES = new Set([
    "inventario_lotes_disponibles",
    "alertas_stock_minimo",
    "historial_movimientos_inventario"
  ]);
  const TABLES = [
    "usuarios_app",
    "productos_insumos",
    "insumo_lotes",
    "movimientos_inventario",
    "ingresos_pendientes",
    "ingresos_pendientes_detalle",
    "daily_tasks",
    "clinical_pac_years",
    "clinical_pac_items",
    "clinical_monthly_orders",
    "clinical_monthly_order_items",
    "clinical_real_order_imports",
    "clinical_real_order_items",
    "clinical_budget_snapshots",
    "clinical_daily_demands",
    "clinical_daily_diet_counts",
    "clinical_daily_enteral_items",
    "clinical_daily_supply_items",
    "clinical_daily_import_errors",
    "clinical_product_links",
    "clinical_demand_product_links",
    "product_code_links",
    "product_label_images",
    "operator_scan_sessions",
    "operator_scan_session_items",
    ...VIEW_TABLES
  ];
  const IMPORT_TABLES = TABLES.filter((table) => !VIEW_TABLES.has(table));
  const REQUIRED_IMPORT_TABLES = new Set([
    "usuarios_app",
    "productos_insumos",
    "insumo_lotes",
    "movimientos_inventario"
  ]);

  let dbPromise = null;

  function now() {
    return new Date().toISOString();
  }

  function createId(prefix = "pwa") {
    const id = self.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${id}`;
  }

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function normalizeCode(value) {
    return String(value || "").replace(/\s+/g, "").trim().toUpperCase();
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "key" });
        TABLES.forEach((table) => {
          if (!db.objectStoreNames.contains(table)) db.createObjectStore(table, { keyPath: "id" });
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("No se pudo abrir IndexedDB."));
    });
    return dbPromise;
  }

  function txStore(db, storeName, mode = "readonly") {
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Operacion IndexedDB fallida."));
    });
  }

  async function getMeta(key) {
    const db = await openDb();
    const row = await requestToPromise(txStore(db, META_STORE).get(key));
    return row?.value ?? null;
  }

  async function setMeta(key, value) {
    const db = await openDb();
    await requestToPromise(txStore(db, META_STORE, "readwrite").put({ key, value }));
  }

  async function getAll(table) {
    if (VIEW_TABLES.has(table)) return getViewRows(table);
    const db = await openDb();
    return requestToPromise(txStore(db, table).getAll());
  }

  async function putRows(table, rows = [], { clear = false } = {}) {
    if (VIEW_TABLES.has(table)) return;
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(table, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("No se pudo guardar datos locales."));
      const store = tx.objectStore(table);
      if (clear) store.clear();
      rows.forEach((row) => {
        const next = { ...row };
        if (!next.id) next.id = createId(table);
        store.put(next);
      });
    });
  }

  async function replaceTable(table, rows = []) {
    await putRows(table, rows, { clear: true });
  }

  async function clearAllTables() {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IMPORT_TABLES, "readwrite");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("No se pudo limpiar la base local."));
      IMPORT_TABLES.forEach((table) => tx.objectStore(table).clear());
    });
  }

  function readValue(row, column) {
    return row?.[column];
  }

  function applyFilters(rows, filters = []) {
    return rows.filter((row) => filters.every((filter) => {
      const actual = readValue(row, filter.column);
      if (filter.op === "eq") return String(actual) === String(filter.value);
      if (filter.op === "neq") return String(actual) !== String(filter.value);
      if (filter.op === "gt") return Number(actual || 0) > Number(filter.value || 0);
      if (filter.op === "is") return filter.value === null ? actual == null : actual === filter.value;
      if (filter.op === "in") return (filter.value || []).map(String).includes(String(actual));
      return true;
    }));
  }

  function applyOrders(rows, orders = []) {
    return [...rows].sort((a, b) => {
      for (const order of orders) {
        const av = readValue(a, order.column);
        const bv = readValue(b, order.column);
        const compare = String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true });
        if (compare) return order.ascending === false ? -compare : compare;
      }
      return 0;
    });
  }

  async function queryTable(table, options = {}) {
    const operation = options.operation || "select";
    if (!TABLES.includes(table)) throw new Error(`Tabla local no permitida: ${table}`);
    if (VIEW_TABLES.has(table) && operation !== "select") throw new Error(`Vista local solo lectura: ${table}`);

    if (operation === "select") {
      let rows = await getAll(table);
      rows = applyFilters(rows, options.filters || []);
      rows = applyOrders(rows, options.orders || []);
      if (options.limit) rows = rows.slice(0, Number(options.limit));
      const data = options.single || options.maybeSingle ? (rows[0] || null) : rows;
      return { data, count: rows.length };
    }

    const currentRows = await getAll(table);
    let rows = [];
    if (operation === "insert") {
      rows = (Array.isArray(options.payload) ? options.payload : [options.payload || {}]).map((payload) => ({
        id: payload.id || createId(table),
        ...payload,
        created_at: payload.created_at || now(),
        updated_at: payload.updated_at || now()
      }));
      await putRows(table, rows);
    } else if (operation === "upsert") {
      const conflictColumns = String(options.onConflict || "").split(",").map((item) => item.trim()).filter(Boolean);
      rows = (Array.isArray(options.payload) ? options.payload : [options.payload || {}]).map((payload) => {
        const existing = payload.id
          ? currentRows.find((row) => String(row.id) === String(payload.id))
          : currentRows.find((row) => conflictColumns.length && conflictColumns.every((column) => String(row[column]) === String(payload[column])));
        return {
          ...(existing || {}),
          id: existing?.id || payload.id || createId(table),
          ...payload,
          created_at: existing?.created_at || payload.created_at || now(),
          updated_at: now()
        };
      });
      await putRows(table, rows);
    } else if (operation === "update") {
      const targets = applyFilters(currentRows, options.filters || []);
      rows = targets.map((row) => ({ ...row, ...(options.payload || {}), updated_at: now() }));
      await putRows(table, rows);
    } else if (operation === "delete") {
      const targets = applyFilters(currentRows, options.filters || []);
      const db = await openDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(table, "readwrite");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("No se pudo eliminar datos locales."));
        const store = tx.objectStore(table);
        targets.forEach((row) => store.delete(row.id));
      });
      rows = targets.map((row) => ({ id: row.id }));
    } else {
      throw new Error(`Operacion local no soportada: ${operation}`);
    }

    const data = options.single || options.maybeSingle ? (rows[0] || null) : rows;
    return { data, count: rows.length };
  }

  function movementSignedQuantity(movement) {
    const quantity = Number(movement.cantidad || 0);
    const type = normalizeText(movement.tipo_movimiento || movement.tipo);
    if (type.includes("consumo") || type.includes("salida") || type.includes("eliminacion") || type.includes("merma")) return -Math.abs(quantity);
    return quantity;
  }

  async function getInventoryViewRows() {
    const [products, lots, movements] = await Promise.all([
      getAll("productos_insumos"),
      getAll("insumo_lotes"),
      getAll("movimientos_inventario")
    ]);
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const quantityByLot = new Map();
    movements.forEach((movement) => {
      const lotId = movement.lote_id || movement.loteId;
      if (!lotId) return;
      quantityByLot.set(String(lotId), Number((quantityByLot.get(String(lotId)) || 0) + movementSignedQuantity(movement)));
    });
    return lots
      .filter((lot) => lot.activo !== false && lot.activo !== 0 && !lot.deleted_at)
      .map((lot) => {
        const product = productById.get(String(lot.producto_id || lot.productoId)) || {};
        const quantity = Number(quantityByLot.get(String(lot.id)) || 0);
        return {
          lote_id: lot.id,
          producto_id: lot.producto_id || lot.productoId,
          nombre: product.nombre || lot.nombre || "Producto",
          cantidad_disponible: Number(quantity.toFixed(3)),
          unidad: lot.unidad || product.unidad_default || "kg",
          fecha_recepcion: lot.fecha_recepcion || lot.fechaRecepcion || null,
          fecha_vencimiento: lot.fecha_vencimiento || lot.fechaVencimiento || null,
          lote: lot.lote || null,
          observaciones: lot.observaciones || null,
          cantidad_por_caja: lot.cantidad_por_caja || lot.cantidadPorCaja || null,
          alerta_vencimiento_revisada: lot.alerta_vencimiento_revisada || false,
          activo: product.activo !== false && product.activo !== 0,
          deleted_at: lot.deleted_at || product.deleted_at || null,
          stock_minimo: product.stock_minimo || 0,
          critico: product.critico || false,
          consumo_promedio_diario: product.consumo_promedio_diario || 0,
          favorito: product.favorito || false
        };
      })
      .filter((row) => row.activo && !row.deleted_at);
  }

  async function getLowStockRows() {
    const [products, inventory] = await Promise.all([getAll("productos_insumos"), getInventoryViewRows()]);
    const totals = new Map();
    inventory.forEach((row) => {
      totals.set(String(row.producto_id), Number((totals.get(String(row.producto_id)) || 0) + Number(row.cantidad_disponible || 0)));
    });
    return products
      .filter((product) => product.activo !== false && product.activo !== 0 && !product.deleted_at && Number(product.stock_minimo || 0) > 0)
      .map((product) => ({
        producto_id: product.id,
        nombre: product.nombre,
        stock_actual: Number((totals.get(String(product.id)) || 0).toFixed(3)),
        stock_minimo: Number(product.stock_minimo || 0),
        faltante: Number(Math.max(0, Number(product.stock_minimo || 0) - (totals.get(String(product.id)) || 0)).toFixed(3))
      }))
      .filter((row) => row.stock_actual <= row.stock_minimo);
  }

  async function getMovementHistoryRows() {
    const [products, lots, movements] = await Promise.all([
      getAll("productos_insumos"),
      getAll("insumo_lotes"),
      getAll("movimientos_inventario")
    ]);
    const productById = new Map(products.map((product) => [String(product.id), product]));
    const lotById = new Map(lots.map((lot) => [String(lot.id), lot]));
    return movements.map((movement) => {
      const product = productById.get(String(movement.producto_id || movement.productoId)) || {};
      const lot = lotById.get(String(movement.lote_id || movement.loteId)) || {};
      return {
        ...movement,
        producto: product.nombre || movement.producto || "Producto",
        lote: lot.lote || movement.lote || "-",
        fecha_vencimiento: lot.fecha_vencimiento || movement.fecha_vencimiento || null
      };
    });
  }

  async function getViewRows(table) {
    if (table === "inventario_lotes_disponibles") return getInventoryViewRows();
    if (table === "alertas_stock_minimo") return getLowStockRows();
    if (table === "historial_movimientos_inventario") return getMovementHistoryRows();
    return [];
  }

  async function getStatus() {
    const installed = Boolean(await getMeta("installed"));
    const [products, lots, movements, tasks, pendingEntries, pacYears, demands] = await Promise.all([
      getAll("productos_insumos"),
      getAll("insumo_lotes"),
      getAll("movimientos_inventario"),
      getAll("daily_tasks"),
      getAll("ingresos_pendientes"),
      getAll("clinical_pac_years"),
      getAll("clinical_daily_demands")
    ]);
    return {
      ok: true,
      installed,
      status: installed ? "instalado" : "pendiente",
      migrationVersion: "indexeddb-v1",
      latestMigration: "indexeddb-v1",
      databasePath: "IndexedDB del navegador",
      connectionUrls: ["pwa://indexeddb"],
      counts: {
        productos: products.length,
        lotes: lots.length,
        movimientos: movements.length,
        tareas: tasks.length,
        ingresosPendientes: pendingEntries.length,
        pacYears: pacYears.length,
        demandasDiarias: demands.length
      },
      recentErrors: []
    };
  }

  async function install() {
    await openDb();
    await setMeta("installed", true);
    await setMeta("installedAt", now());
    return getStatus();
  }

  async function fetchSupabaseRows({ supabaseUrl, supabaseKey, accessToken, table }) {
    const rows = [];
    const pageSize = 1000;
    const baseUrl = String(supabaseUrl || "").replace(/\/+$/, "");
    const token = accessToken || supabaseKey;
    if (!baseUrl || !supabaseKey) throw new Error("Faltan credenciales de Supabase.");
    for (let offset = 0; offset < 100000; offset += pageSize) {
      const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${token}`,
          Range: `${offset}-${offset + pageSize - 1}`
        }
      });
      if (!response.ok) {
        const message = await response.text().catch(() => response.statusText);
        const error = new Error(`No se pudo importar ${table}: ${message || response.status}`);
        error.status = response.status;
        error.payload = message || "";
        error.table = table;
        throw error;
      }
      const page = await response.json();
      rows.push(...page);
      if (!Array.isArray(page) || page.length < pageSize) break;
    }
    return rows;
  }

  function isMissingSupabaseTableError(error) {
    const text = `${error?.message || ""} ${error?.payload || ""}`;
    return error?.status === 404 || /PGRST205|Could not find the table|schema cache|does not exist/i.test(text);
  }

  async function importFromSupabase(config = {}) {
    await install();
    const totals = {};
    const summary = [];
    const fetchedTables = [];
    for (const table of IMPORT_TABLES) {
      try {
        const rows = await fetchSupabaseRows({ ...config, table });
        totals[table] = rows.length;
        fetchedTables.push({ table, rows });
        summary.push({
          table,
          fetched: rows.length,
          inserted: rows.length,
          updated: 0,
          duplicates: 0,
          skipped: 0,
          errors: []
        });
      } catch (error) {
        if (isMissingSupabaseTableError(error) && !REQUIRED_IMPORT_TABLES.has(table)) {
          totals[table] = 0;
          summary.push({
            table,
            fetched: 0,
            inserted: 0,
            updated: 0,
            duplicates: 0,
            skipped: 0,
            optional: true,
            errors: [{ message: "Tabla opcional no existe en Supabase; se omitio." }]
          });
          continue;
        }
        throw error;
      }
    }
    await clearAllTables();
    for (const { table, rows } of fetchedTables) {
      await replaceTable(table, rows);
    }
    await setMeta("lastImport", { at: now(), totals });
    const fetched = Object.values(totals).reduce((sum, value) => sum + Number(value || 0), 0);
    const skipped = summary.filter((row) => row.optional && row.errors?.length).length;
    return {
      ok: true,
      imported: true,
      totals: {
        fetched,
        inserted: fetched,
        updated: 0,
        duplicates: 0,
        skipped,
        byTable: totals
      },
      tables: summary,
      status: await getStatus()
    };
  }

  async function inventorySnapshot() {
    const products = (await getAll("productos_insumos"))
      .filter((product) => product.activo !== false && product.activo !== 0 && !product.deleted_at)
      .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || "")));
    const inventory = (await getInventoryViewRows())
      .filter((row) => Number(row.cantidad_disponible || 0) > 0)
      .sort((a, b) => String(a.fecha_vencimiento || "9999-99-99").localeCompare(String(b.fecha_vencimiento || "9999-99-99")));
    const lowStock = await getLowStockRows();
    const movements = (await getMovementHistoryRows())
      .sort((a, b) => String(b.fecha_movimiento || b.created_at || "").localeCompare(String(a.fecha_movimiento || a.created_at || "")))
      .slice(0, 300);
    return { ok: true, source: "browser-indexeddb", products, inventory, lowStock, movements };
  }

  async function localLogin({ email }) {
    const users = await getAll("usuarios_app");
    const user = users.find((row) => String(row.email || "").toLowerCase() === String(email || "").toLowerCase() && row.activo !== false && row.activo !== 0);
    if (!user) throw new Error("Usuario local no encontrado.");
    return { ok: true, user: { id: user.id, email: user.email, nombre: user.nombre || user.email, rol: user.rol || "admin", source: "local" } };
  }

  async function saveTask(task = {}, userId = null) {
    const row = { ...task, id: task.id || createId("task"), created_by: task.created_by || userId, updated_at: now(), created_at: task.created_at || now() };
    await putRows("daily_tasks", [row]);
    return { ok: true, task: row };
  }

  async function updateTask(taskId, task = {}) {
    const rows = await getAll("daily_tasks");
    const existing = rows.find((row) => String(row.id) === String(taskId));
    const row = { ...(existing || {}), ...task, id: taskId, updated_at: now() };
    await putRows("daily_tasks", [row]);
    return { ok: true, task: row };
  }

  async function listPendingEntries(scope, userId) {
    const [entries, details] = await Promise.all([getAll("ingresos_pendientes"), getAll("ingresos_pendientes_detalle")]);
    return entries
      .filter((entry) => scope !== "operator" || !userId || String(entry.creado_por) === String(userId))
      .map((entry) => ({ ...entry, detalles: details.filter((detail) => String(detail.ingreso_pendiente_id) === String(entry.id)) }))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  }

  async function createPendingEntry(entry = {}, details = []) {
    const pendingId = entry.id || createId("pending");
    const row = { ...entry, id: pendingId, estado: entry.estado || "pendiente", created_at: entry.created_at || now(), updated_at: now() };
    const detailRows = details.map((detail) => ({
      ...detail,
      id: detail.id || createId("pending-detail"),
      ingreso_pendiente_id: pendingId,
      created_at: detail.created_at || now(),
      updated_at: now()
    }));
    await putRows("ingresos_pendientes", [row]);
    await putRows("ingresos_pendientes_detalle", detailRows);
    return { ok: true, id: pendingId };
  }

  async function updatePendingEntry(entryId, fields = {}) {
    const rows = await getAll("ingresos_pendientes");
    const existing = rows.find((row) => String(row.id) === String(entryId));
    if (!existing) throw new Error("Ingreso pendiente no encontrado.");
    await putRows("ingresos_pendientes", [{ ...existing, ...fields, updated_at: now() }]);
    return { ok: true };
  }

  async function upsertProductCodeLink(link = {}, userId = null) {
    const codeNormalized = normalizeCode(link.code_normalized || link.codeNormalized || link.gtin || link.code_raw || link.codeRaw);
    if (!link.product_id && !link.productId) throw new Error("Selecciona un producto para aprender el codigo.");
    if (!codeNormalized) throw new Error("No hay codigo detectado para aprender.");
    const rows = await getAll("product_code_links");
    const existing = rows.find((row) => String(row.code_normalized) === codeNormalized);
    const currentScanCount = Number(existing?.scan_count || 0);
    const row = {
      ...(existing || {}),
      ...link,
      id: existing?.id || link.id || createId("code-link"),
      product_id: link.product_id || link.productId,
      code_raw: link.code_raw || link.codeRaw || codeNormalized,
      code_normalized: codeNormalized,
      created_by: link.created_by || link.createdBy || userId || existing?.created_by || null,
      created_at: existing?.created_at || link.created_at || now(),
      updated_at: now(),
      last_seen_at: now(),
      scan_count: currentScanCount + 1,
      is_active: link.is_active === false ? 0 : 1
    };
    await putRows("product_code_links", [row]);
    if (link.label_image_data_url || link.labelImageDataUrl) {
      await putRows("product_label_images", [{
        id: createId("label-image"),
        product_code_link_id: row.id,
        product_id: row.product_id,
        image_path: link.label_image_data_url || link.labelImageDataUrl,
        captured_at: now(),
        created_by: row.created_by,
        ocr_text: link.label_text_ocr || link.labelTextOcr || null
      }]);
      row.label_image_path = link.label_image_data_url || link.labelImageDataUrl;
      await putRows("product_code_links", [row]);
    }
    return { ok: true, link: row };
  }

  async function findOrCreateProduct(payload = {}) {
    const products = await getAll("productos_insumos");
    const normalized = payload.nombreNormalizado || payload.nombre_normalizado || normalizeText(payload.nombre);
    const existing = products.find((product) => product.nombre_normalizado === normalized);
    if (existing) return existing;
    const row = {
      id: createId("product"),
      nombre: payload.nombre,
      nombre_normalizado: normalized,
      unidad_default: payload.unidad || payload.unidad_default || "kg",
      stock_minimo: 0,
      critico: Boolean(payload.critico),
      consumo_promedio_diario: 0,
      favorito: false,
      activo: true,
      created_at: now(),
      updated_at: now()
    };
    await putRows("productos_insumos", [row]);
    return row;
  }

  async function createInventoryEntry(payload = {}, userId = null) {
    const product = await findOrCreateProduct(payload);
    const lotId = createId("lot");
    const timestamp = now();
    await putRows("insumo_lotes", [{
      id: lotId,
      producto_id: product.id,
      fecha_recepcion: payload.fechaRecepcion || payload.fecha_recepcion || timestamp.slice(0, 10),
      fecha_vencimiento: payload.fechaVencimiento || payload.fecha_vencimiento || null,
      lote: payload.lote || null,
      unidad: payload.unidad || product.unidad_default || "kg",
      observaciones: payload.observaciones || null,
      alerta_vencimiento_revisada: false,
      activo: true,
      created_at: timestamp,
      updated_at: timestamp
    }]);
    await putRows("movimientos_inventario", [{
      id: createId("movement"),
      producto_id: product.id,
      lote_id: lotId,
      tipo_movimiento: "ingreso",
      cantidad: Number(payload.cantidad || 0),
      unidad: payload.unidad || product.unidad_default || "kg",
      fecha_movimiento: timestamp,
      usuario_id: userId || null,
      motivo: payload.motivo || "Ingreso desde modo local PWA",
      observacion: payload.observaciones || null,
      created_at: timestamp
    }]);
    return { ok: true, productId: product.id, lotId };
  }

  async function updateInventoryEntry(lotId, payload = {}, userId = null) {
    const [products, lots] = await Promise.all([getAll("productos_insumos"), getAll("insumo_lotes")]);
    const productId = payload.productoId || payload.producto_id;
    const product = products.find((row) => String(row.id) === String(productId));
    const lot = lots.find((row) => String(row.id) === String(lotId));
    if (!product || !lot) throw new Error("Falta lote o producto para editar.");
    const timestamp = now();
    const nombre = String(payload.nombre || product.nombre || "").trim();
    await putRows("productos_insumos", [{
      ...product,
      nombre,
      nombre_normalizado: payload.nombreNormalizado || payload.nombre_normalizado || normalizeText(nombre),
      unidad_default: payload.unidad || product.unidad_default || "kg",
      updated_at: timestamp
    }]);
    await putRows("insumo_lotes", [{
      ...lot,
      fecha_recepcion: payload.fechaRecepcion || payload.fecha_recepcion || lot.fecha_recepcion || timestamp.slice(0, 10),
      fecha_vencimiento: payload.fechaVencimiento || payload.fecha_vencimiento || null,
      lote: payload.lote || null,
      unidad: payload.unidad || product.unidad_default || "kg",
      observaciones: payload.observaciones || null,
      updated_at: timestamp
    }]);
    const currentQuantity = Number(payload.currentQuantity ?? payload.cantidad_actual ?? 0);
    const nextQuantity = Number(payload.nextQuantity ?? payload.cantidad ?? currentQuantity);
    const delta = Number((nextQuantity - currentQuantity).toFixed(3));
    if (delta !== 0) {
      await putRows("movimientos_inventario", [{
        id: createId("movement"),
        producto_id: product.id,
        lote_id: lotId,
        tipo_movimiento: delta > 0 ? "ingreso" : "eliminacion",
        cantidad: Math.abs(delta),
        unidad: payload.unidad || product.unidad_default || "kg",
        fecha_movimiento: timestamp,
        usuario_id: userId || null,
        motivo: "Ajuste manual desde modo local PWA",
        observacion: payload.observaciones || null,
        created_at: timestamp
      }]);
    }
    return { ok: true };
  }

  async function deleteInventoryLot(lotId, userId = null) {
    const [inventory, lots] = await Promise.all([getInventoryViewRows(), getAll("insumo_lotes")]);
    const item = inventory.find((row) => String(row.lote_id) === String(lotId));
    const lot = lots.find((row) => String(row.id) === String(lotId));
    if (!lot) throw new Error("Lote no encontrado.");
    const timestamp = now();
    if (item && Number(item.cantidad_disponible || 0) > 0) {
      await putRows("movimientos_inventario", [{
        id: createId("movement"),
        producto_id: item.producto_id,
        lote_id: lotId,
        tipo_movimiento: "eliminacion",
        cantidad: Number(item.cantidad_disponible || 0),
        unidad: item.unidad || "kg",
        fecha_movimiento: timestamp,
        usuario_id: userId || null,
        motivo: "Eliminacion logica desde modo local PWA",
        observacion: item.observaciones || null,
        created_at: timestamp
      }]);
    }
    await putRows("insumo_lotes", [{ ...lot, activo: false, deleted_at: timestamp, deleted_by: userId || null, updated_at: timestamp }]);
    return { ok: true };
  }

  async function insertMovements(movements = [], userId = null) {
    const rows = movements.map((movement) => ({
      ...movement,
      id: movement.id || createId("movement"),
      producto_id: movement.producto_id || movement.productoId,
      lote_id: movement.lote_id || movement.loteId || null,
      tipo_movimiento: movement.tipo_movimiento || movement.tipo,
      fecha_movimiento: movement.fecha_movimiento || now(),
      usuario_id: movement.usuario_id || userId || null,
      created_at: movement.created_at || now()
    }));
    await putRows("movimientos_inventario", rows);
    return { ok: true, count: rows.length };
  }

  async function updateLot(lotId, fields = {}) {
    const lots = await getAll("insumo_lotes");
    const existing = lots.find((row) => String(row.id) === String(lotId));
    if (!existing) throw new Error("Lote no encontrado.");
    await putRows("insumo_lotes", [{ ...existing, ...fields, updated_at: now() }]);
    return { ok: true };
  }

  async function updateProduct(productId, fields = {}) {
    const products = await getAll("productos_insumos");
    const existing = products.find((row) => String(row.id) === String(productId));
    if (!existing) throw new Error("Producto no encontrado.");
    await putRows("productos_insumos", [{ ...existing, ...fields, updated_at: now() }]);
    return { ok: true };
  }

  async function handleRequest(path, { method = "GET", body = null } = {}) {
    const url = new URL(path, "pwa://local");
    const pathname = url.pathname;
    if (pathname === "/api/status" || pathname === "/api/health") return getStatus();
    if (pathname === "/api/install" && method === "POST") return install();
    if (pathname === "/api/import-from-supabase" && method === "POST") return importFromSupabase(body || {});
    if (pathname === "/api/backup" && method === "POST") return { ok: true, source: "browser-indexeddb", backup: await inventorySnapshot() };
    if (pathname === "/api/auth/login" && method === "POST") return localLogin(body || {});
    if (pathname === "/api/auth/logout") return { ok: true };
    if (pathname === "/api/inventory/snapshot") return inventorySnapshot();
    if (pathname === "/api/tasks" && method === "GET") return { ok: true, tasks: await getAll("daily_tasks") };
    if (pathname === "/api/tasks" && method === "POST") return saveTask(body?.task || body || {}, body?.userId || null);
    if (pathname.startsWith("/api/tasks/") && method === "PATCH") return updateTask(decodeURIComponent(pathname.split("/").pop()), body?.task || body || {});
    if (pathname === "/api/product-code-links" && method === "GET") return { ok: true, links: (await getAll("product_code_links")).filter((row) => row.is_active !== false && row.is_active !== 0) };
    if (pathname === "/api/product-code-links" && method === "POST") return upsertProductCodeLink(body?.link || body || {}, body?.userId || null);
    if (pathname.startsWith("/api/product-code-links/")) {
      const code = normalizeCode(decodeURIComponent(pathname.split("/").pop()));
      return { ok: true, link: (await getAll("product_code_links")).find((row) => normalizeCode(row.code_normalized) === code) || null };
    }
    if (pathname === "/api/pending-entries" && method === "GET") return { ok: true, entries: await listPendingEntries(url.searchParams.get("scope") || "operator", url.searchParams.get("userId") || null) };
    if (pathname === "/api/pending-entries" && method === "POST") return createPendingEntry(body?.entry || {}, body?.details || []);
    if (pathname.startsWith("/api/pending-entries/") && method === "PATCH") return updatePendingEntry(decodeURIComponent(pathname.split("/").pop()), body?.fields || body || {});
    if (pathname.match(/^\/api\/table\/[^/]+\/query$/) && method === "POST") {
      const table = decodeURIComponent(pathname.split("/")[3]);
      return { ok: true, ...(await queryTable(table, body || {})) };
    }
    if (pathname === "/api/inventory/entries" && method === "POST") return createInventoryEntry(body?.payload || body || {}, body?.userId || null);
    if (pathname.match(/^\/api\/inventory\/entries\/[^/]+$/) && method === "PATCH") {
      return updateInventoryEntry(decodeURIComponent(pathname.split("/").pop()), body?.payload || body || {}, body?.userId || null);
    }
    if (pathname.match(/^\/api\/inventory\/lots\/[^/]+$/) && method === "DELETE") {
      return deleteInventoryLot(decodeURIComponent(pathname.split("/").pop()), body?.userId || null);
    }
    if (pathname === "/api/inventory/movements" && method === "POST") return insertMovements(body?.movements || [], body?.userId || null);
    if (pathname.match(/^\/api\/inventory\/lots\/[^/]+$/) && method === "PATCH") return updateLot(decodeURIComponent(pathname.split("/").pop()), body?.fields || body || {});
    if (pathname.match(/^\/api\/inventory\/products\/[^/]+$/) && method === "PATCH") return updateProduct(decodeURIComponent(pathname.split("/").pop()), body?.fields || body || {});
    throw new Error("Endpoint local PWA no encontrado.");
  }

  window.JesunutriBrowserLocal = {
    isSupported: () => Boolean(window.indexedDB),
    install,
    status: getStatus,
    request: handleRequest
  };
})();
