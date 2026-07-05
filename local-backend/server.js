const cors = require("cors");
const express = require("express");
const { HOST, PORT, SUPABASE_IMPORT } = require("./config");
const {
  IMPORT_TABLES,
  createBackup,
  createPendingEntry,
  createInventoryEntry,
  deleteInventoryLot,
  ensureLocalAdminIfNoUsers,
  getInventorySnapshot,
  getStatus,
  importRowsIntoTable,
  insertMovements,
  installDatabase,
  listDailyTasks,
  listPendingEntries,
  queryLocalTable,
  removeLocalAdminSeedIfPresent,
  saveDailyTask,
  updateDailyTask,
  updateInventoryEntry,
  updateLot,
  updatePendingEntry,
  updateProduct,
  verifyLocalUser
} = require("./db");

const app = express();
const recentErrors = [];

function rememberError(error) {
  recentErrors.unshift({
    message: error.message || String(error),
    code: error.code || "ERROR",
    at: new Date().toISOString()
  });
  recentErrors.splice(10);
}

function publicStatus() {
  const status = getStatus();
  return {
    ...status,
    recentErrors
  };
}

function sendError(res, error) {
  rememberError(error);
  const statusCode = error.code === "LOCAL_DB_PENDING" ? 503 : 500;
  res.status(statusCode).json({
    ok: false,
    status: error.code === "LOCAL_DB_PENDING" ? "pendiente" : "error",
    error: error.message || "Error interno del backend local.",
    code: error.code || "ERROR",
    recentErrors
  });
}

app.use(cors({
  origin: true,
  credentials: false
}));
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.json({
    ok: true,
    service: "jesunutri-local-backend",
    message: "Backend local JESUnutri activo."
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "jesunutri-local-backend",
    mode: "local",
    time: new Date().toISOString()
  });
});

app.get("/api/status", (req, res) => {
  try {
    res.json(publicStatus());
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/install", (req, res) => {
  try {
    const status = installDatabase();
    res.json({
      ...status,
      recentErrors
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/backup", (req, res) => {
  try {
    res.json(createBackup());
  } catch (error) {
    sendError(res, error);
  }
});

async function fetchSupabaseTable({ supabaseUrl, supabaseKey, accessToken, table, pageSize = 1000 }) {
  const rows = [];
  let offset = 0;
  const cleanUrl = String(supabaseUrl || "").replace(/\/+$/, "");
  const token = accessToken || supabaseKey;
  if (!cleanUrl || !supabaseKey) throw new Error("Faltan URL o anon key de Supabase.");

  while (true) {
    const end = offset + pageSize - 1;
    const url = `${cleanUrl}/rest/v1/${encodeURIComponent(table)}?select=*`;
    const response = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${token}`,
        Range: `${offset}-${end}`,
        Prefer: "count=exact"
      }
    });
    const text = await response.text();
    let payload = [];
    try {
      payload = text ? JSON.parse(text) : [];
    } catch (error) {
      throw new Error(`Supabase devolvio una respuesta no JSON para ${table}.`);
    }
    if (!response.ok) {
      const message = payload?.message || payload?.error || response.statusText;
      throw new Error(`${table}: ${message}`);
    }
    if (!Array.isArray(payload)) throw new Error(`${table}: respuesta inesperada de Supabase.`);
    rows.push(...payload);
    if (payload.length < pageSize) break;
    offset += pageSize;
  }
  return rows;
}

app.post("/api/import-from-supabase", async (req, res) => {
  try {
    installDatabase({ seedAdmin: false });
    const {
      supabaseUrl,
      supabaseKey,
      accessToken,
      tables,
      pageSize = 1000
    } = req.body || {};
    const resolvedUrl = supabaseUrl || SUPABASE_IMPORT.url;
    const resolvedKey = SUPABASE_IMPORT.serviceRoleKey || supabaseKey || SUPABASE_IMPORT.anonKey;
    const resolvedToken = SUPABASE_IMPORT.serviceRoleKey || accessToken || resolvedKey;
    const requestedTables = Array.isArray(tables) && tables.length
      ? IMPORT_TABLES.filter((table) => tables.includes(table))
      : IMPORT_TABLES;
    const summary = [];

    for (const table of requestedTables) {
      try {
        const rows = await fetchSupabaseTable({
          supabaseUrl: resolvedUrl,
          supabaseKey: resolvedKey,
          accessToken: resolvedToken,
          table,
          pageSize: Math.min(Math.max(Number(pageSize) || 1000, 100), 1000)
        });
        if (table === "usuarios_app" && rows.length > 0) {
          removeLocalAdminSeedIfPresent();
        }
        summary.push(importRowsIntoTable(table, rows));
      } catch (error) {
        summary.push({
          table,
          fetched: 0,
          inserted: 0,
          updated: 0,
          duplicates: 0,
          skipped: 0,
          errors: [{ message: error.message }]
        });
      }
    }
    ensureLocalAdminIfNoUsers();

    res.json({
      ok: true,
      status: "importado",
      importedAt: new Date().toISOString(),
      tables: summary,
      totals: summary.reduce((acc, row) => ({
        fetched: acc.fetched + row.fetched,
        inserted: acc.inserted + row.inserted,
        updated: acc.updated + row.updated,
        duplicates: acc.duplicates + (row.duplicates || 0),
        skipped: acc.skipped + row.skipped,
        errors: acc.errors + row.errors.length
      }), { fetched: 0, inserted: 0, updated: 0, duplicates: 0, skipped: 0, errors: 0 }),
      localStatus: publicStatus()
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = verifyLocalUser(email, password);
    if (!user) {
      res.status(401).json({
        ok: false,
        status: "error",
        error: "Credenciales locales invalidas."
      });
      return;
    }
    res.json({
      ok: true,
      user,
      session: {
        source: "local",
        user,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/auth/logout", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/tasks", (req, res) => {
  try {
    res.json({ ok: true, tasks: listDailyTasks() });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/tasks", (req, res) => {
  try {
    const task = saveDailyTask(req.body?.task || req.body || {}, req.body?.userId || null);
    res.json({ ok: true, task });
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/tasks/:taskId", (req, res) => {
  try {
    const task = updateDailyTask(req.params.taskId, req.body?.task || req.body || {});
    res.json({ ok: true, task });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/pending-entries", (req, res) => {
  try {
    res.json({
      ok: true,
      entries: listPendingEntries(req.query.scope || "operator", req.query.userId || null)
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/pending-entries", (req, res) => {
  try {
    res.json(createPendingEntry(req.body?.entry || {}, req.body?.details || []));
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/pending-entries/:entryId", (req, res) => {
  try {
    res.json(updatePendingEntry(req.params.entryId, req.body?.fields || req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/table/:table/query", (req, res) => {
  try {
    res.json({
      ok: true,
      ...queryLocalTable(req.params.table, req.body || {})
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.get("/api/inventory/snapshot", (req, res) => {
  try {
    res.json({
      ok: true,
      source: "local",
      ...getInventorySnapshot()
    });
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/inventory/entries", (req, res) => {
  try {
    res.json(createInventoryEntry(req.body?.payload || req.body || {}, req.body?.userId || null));
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/inventory/entries/:lotId", (req, res) => {
  try {
    res.json(updateInventoryEntry({
      ...(req.body?.payload || req.body || {}),
      loteId: req.params.lotId
    }, req.body?.userId || null));
  } catch (error) {
    sendError(res, error);
  }
});

app.delete("/api/inventory/lots/:lotId", (req, res) => {
  try {
    res.json(deleteInventoryLot(req.params.lotId, req.body?.userId || null));
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/inventory/lots/:lotId", (req, res) => {
  try {
    res.json(updateLot(req.params.lotId, req.body?.fields || req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
});

app.patch("/api/inventory/products/:productId", (req, res) => {
  try {
    res.json(updateProduct(req.params.productId, req.body?.fields || req.body || {}));
  } catch (error) {
    sendError(res, error);
  }
});

app.post("/api/inventory/movements", (req, res) => {
  try {
    res.json(insertMovements(req.body?.movements || [], req.body?.userId || null));
  } catch (error) {
    sendError(res, error);
  }
});

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    status: "error",
    error: "Endpoint local no encontrado."
  });
});

app.listen(PORT, HOST, () => {
  console.log(`Backend local JESUnutri activo en http://${HOST}:${PORT}`);
});
