const SUPABASE_URL = "https://kfobwrcxvqygmfvvccfl.supabase.co";

const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmb2J3cmN4dnF5Z21mdnZjY2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMzY0MTQsImV4cCI6MjA5NTgxMjQxNH0.hgGBTlCDtz3gbBTxnwmikVEtM6FFzRI1pL5BzgRFTPI";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage
  }
});

const DAY_MS = 24 * 60 * 60 * 1000;
const BULK_COLUMNS = ["nombre", "cantidad", "unidad", "fecha_vencimiento", "lote", "critico", "observaciones"];
const UNIT_OPTIONS = ["kg", "g", "lt", "ml", "unidad", "caja", "paquete"];
const MONTHS = [
  { label: "Enero", className: "month-1", color: "#0066FF" },
  { label: "Febrero", className: "month-2", color: "#00D9FF" },
  { label: "Marzo", className: "month-3", color: "#00FF66" },
  { label: "Abril", className: "month-4", color: "#99FF00" },
  { label: "Mayo", className: "month-5", color: "#FFD500" },
  { label: "Junio", className: "month-6", color: "#FF7A00" },
  { label: "Julio", className: "month-7", color: "#FF0000" },
  { label: "Agosto", className: "month-8", color: "#FF00AA" },
  { label: "Septiembre", className: "month-9", color: "#7A00FF" },
  { label: "Octubre", className: "month-10", color: "#B000FF" },
  { label: "Noviembre", className: "month-11", color: "#6B3E00" },
  { label: "Diciembre", className: "month-12", color: "#BFC7D5" }
];

const formatIsoDate = (date) => date.toISOString().slice(0, 10);

const addDays = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return formatIsoDate(date);
};

const mockInventory = [
  {
    id: 1,
    productoId: 1,
    nombre: "Harina fuerza",
    cantidad: 24,
    unidad: "kg",
    fechaVencimiento: addDays(12),
    fechaRecepcion: addDays(-8),
    lote: "HF-2405",
    observaciones: "Ingreso reciente",
    stockMinimo: 20,
    critico: true,
    revisada: false
  },
  {
    id: 2,
    productoId: 2,
    nombre: "Azucar granulada",
    cantidad: 8,
    unidad: "kg",
    fechaVencimiento: addDays(-3),
    fechaRecepcion: addDays(-35),
    lote: "AZ-118",
    observaciones: "Revisar retiro por vencimiento",
    stockMinimo: 12,
    critico: false,
    revisada: false
  },
  {
    id: 3,
    productoId: 3,
    nombre: "Leche entera",
    cantidad: 18,
    unidad: "lt",
    fechaVencimiento: addDays(0),
    fechaRecepcion: addDays(-2),
    lote: "LE-091",
    observaciones: "Prioridad de consumo",
    stockMinimo: 10,
    critico: true,
    revisada: false
  }
];

const state = {
  query: "",
  inventory: [],
  products: [],
  movements: [],
  pendingEntries: [],
  currentReview: null,
  bulkSessionRows: [],
  bulkEditingIndex: null,
  operatorSessionRows: [],
  operatorEditingIndex: null,
  lowStockProducts: [],
  deferredInstallPrompt: null,
  currentUser: null,
  usingFallback: false
};

const elements = {
  appSplash: document.getElementById("appSplash"),
  loginScreen: document.getElementById("loginScreen"),
  loginForm: document.getElementById("loginForm"),
  loginError: document.getElementById("loginError"),
  loginBtn: document.getElementById("loginBtn"),
  appShell: document.getElementById("appShell"),
  operatorShell: document.getElementById("operatorShell"),
  operatorBulkErrorList: document.getElementById("operatorBulkErrorList"),
  operatorWelcome: document.getElementById("operatorWelcome"),
  operatorNotice: document.getElementById("operatorNotice"),
  operatorReceiptDate: document.getElementById("operatorReceiptDate"),
  operatorReceiptDisplay: document.getElementById("operatorReceiptDisplay"),
  operatorProductForm: document.getElementById("operatorProductForm"),
  operatorProductsSummary: document.getElementById("operatorProductsSummary"),
  operatorProductsCount: document.getElementById("operatorProductsCount"),
  operatorProductsChips: document.getElementById("operatorProductsChips"),
  operatorProductsList: document.getElementById("operatorProductsList"),
  operatorPendingList: document.getElementById("operatorPendingList"),
  sendPendingBtn: document.getElementById("sendPendingBtn"),
  adminPendingList: document.getElementById("adminPendingList"),
  pendingCount: document.getElementById("pendingCount"),
  adminPendingNotice: document.getElementById("adminPendingNotice"),
  totalItems: document.getElementById("totalItems"),
  soonItems: document.getElementById("soonItems"),
  expiredItems: document.getElementById("expiredItems"),
  lowStockItems: document.getElementById("lowStockItems"),
  criticalProductsList: document.getElementById("criticalProductsList"),
  compactCriticalPanel: document.getElementById("compactCriticalPanel"),
  compactCriticalList: document.getElementById("compactCriticalList"),
  analyticsGrid: document.getElementById("analyticsGrid"),
  alertCount: document.getElementById("alertCount"),
  alertsList: document.getElementById("alertsList"),
  inventoryTable: document.getElementById("inventoryTable"),
  historyTableBody: document.getElementById("historyTableBody"),
  historyProductFilter: document.getElementById("historyProductFilter"),
  historyTypeFilter: document.getElementById("historyTypeFilter"),
  historyFromFilter: document.getElementById("historyFromFilter"),
  historyToFilter: document.getElementById("historyToFilter"),
  searchInput: document.getElementById("searchInput"),
  toast: document.getElementById("toast"),
  errorBox: document.getElementById("errorBox"),
  inventorySourceText: document.getElementById("inventorySourceText"),
  productSuggestions: document.getElementById("productSuggestions"),
  entryModal: document.getElementById("entryModal"),
  entryForm: document.getElementById("entryForm"),
  entryMonthPreview: document.getElementById("entryMonthPreview"),
  saveEntryBtn: document.getElementById("saveEntryBtn"),
  editModal: document.getElementById("editModal"),
  editForm: document.getElementById("editForm"),
  editProductName: document.getElementById("editProductName"),
  editMonthPreview: document.getElementById("editMonthPreview"),
  saveEditBtn: document.getElementById("saveEditBtn"),
  bulkModal: document.getElementById("bulkModal"),
  bulkErrorList: document.getElementById("bulkErrorList"),
  bulkReceiptDate: document.getElementById("bulkReceiptDate"),
  bulkReceiptDisplay: document.getElementById("bulkReceiptDisplay"),
  legacyInventoryFile: document.getElementById("legacyInventoryFile"),
  bulkProductForm: document.getElementById("bulkProductForm"),
  bulkProductsSummary: document.getElementById("bulkProductsSummary"),
  bulkProductsCount: document.getElementById("bulkProductsCount"),
  bulkProductsChips: document.getElementById("bulkProductsChips"),
  bulkProductsList: document.getElementById("bulkProductsList"),
  saveBulkBtn: document.getElementById("saveBulkBtn"),
  useModal: document.getElementById("useModal"),
  useForm: document.getElementById("useForm"),
  manualLotPanel: document.getElementById("manualLotPanel"),
  fifoDeviationWarning: document.getElementById("fifoDeviationWarning"),
  fifoSummaryList: document.getElementById("fifoSummaryList"),
  confirmUseBtn: document.getElementById("confirmUseBtn"),
  adjustModal: document.getElementById("adjustModal"),
  adjustForm: document.getElementById("adjustForm"),
  adjustLotSelect: document.getElementById("adjustLotSelect"),
  adjustSystemStock: document.getElementById("adjustSystemStock"),
  saveAdjustBtn: document.getElementById("saveAdjustBtn"),
  exportModal: document.getElementById("exportModal"),
  exportType: document.getElementById("exportType"),
  labelsModal: document.getElementById("labelsModal"),
  labelsList: document.getElementById("labelsList"),
  printLabelsBtn: document.getElementById("printLabelsBtn"),
  productSettingsModal: document.getElementById("productSettingsModal"),
  productSettingsForm: document.getElementById("productSettingsForm"),
  productSettingsName: document.getElementById("productSettingsName"),
  pauseProductBtn: document.getElementById("pauseProductBtn"),
  saveProductSettingsBtn: document.getElementById("saveProductSettingsBtn"),
  installAppBtn: document.getElementById("installAppBtn"),
  installHint: document.getElementById("installHint"),
  pendingReviewModal: document.getElementById("pendingReviewModal"),
  pendingReviewTitle: document.getElementById("pendingReviewTitle"),
  pendingReviewMeta: document.getElementById("pendingReviewMeta"),
  pendingReviewTableBody: document.getElementById("pendingReviewTableBody"),
  pendingReviewErrorList: document.getElementById("pendingReviewErrorList"),
  pendingRejectReason: document.getElementById("pendingRejectReason"),
  approvePendingBtn: document.getElementById("approvePendingBtn"),
  rejectPendingBtn: document.getElementById("rejectPendingBtn"),
  detailModal: document.getElementById("detailModal"),
  detailModalTitle: document.getElementById("detailModalTitle"),
  detailTableBody: document.getElementById("detailTableBody"),
  systemModal: document.getElementById("systemModal"),
  systemModalIcon: document.getElementById("systemModalIcon"),
  systemModalTitle: document.getElementById("systemModalTitle"),
  systemModalMessage: document.getElementById("systemModalMessage"),
  systemModalCancel: document.getElementById("systemModalCancel"),
  systemModalConfirm: document.getElementById("systemModalConfirm")
};

function normalize(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function getToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getDaysRemaining(isoDate) {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00`);
  return Math.round((target - getToday()) / DAY_MS);
}

function getStatus(item) {
  const days = getDaysRemaining(item.fechaVencimiento);
  if (days === null) return { key: "sin-fecha", label: "Sin fecha", days };
  if (days < 0) return { key: "vencido", label: "Vencido", days };
  if (days === 0) return { key: "hoy", label: "Vence hoy", days };
  if (days <= 20) return { key: "proximo", label: "Proximo a vencer", days };
  return { key: "vigente", label: "Vigente", days };
}

function formatDisplayDate(isoDate) {
  if (!isoDate) return "Sin fecha";
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatDisplayDate(value);
  return date.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatDays(days) {
  if (days === null) return "-";
  if (days < 0) return `${Math.abs(days)} vencido`;
  if (days === 0) return "Hoy";
  return `${days} dias`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isInteger(number) ? String(number) : number.toFixed(2).replace(/\.?0+$/, "");
}

function isStandaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function updateInstallUi() {
  const installed = isStandaloneMode();
  document.body.classList.toggle("app-installed", installed);
  elements.installHint.hidden = installed;
  if (installed || !state.deferredInstallPrompt) elements.installAppBtn.hidden = true;
}

function getMonthInfo(isoDate) {
  if (!isoDate) return null;
  const [year, month] = isoDate.split("-");
  const info = MONTHS[Number(month) - 1];
  if (!info) return null;
  return { ...info, year };
}

function renderMonthBadge(isoDate) {
  const info = getMonthInfo(isoDate);
  if (!info) return '<span class="month-badge no-month">Sin fecha</span>';
  return `<span class="month-badge"><span class="month-dot ${info.className}"></span>${info.label} ${info.year}</span>`;
}

function getReadableTextColor(hexColor) {
  const clean = hexColor.replace("#", "");
  const red = parseInt(clean.slice(0, 2), 16);
  const green = parseInt(clean.slice(2, 4), 16);
  const blue = parseInt(clean.slice(4, 6), 16);
  const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  return luminance > 0.58 ? "#111827" : "#ffffff";
}

function setMonthPreview(element, isoDate) {
  element.innerHTML = isoDate ? renderMonthBadge(isoDate) : "";
}

function escapeHtml(value) {
  return (value ?? "")
    .toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getSupabaseErrorMessage(error) {
  if (!error) return "Error desconocido";
  return [error.message, error.details, error.hint].filter(Boolean).join(" | ");
}

function showToast(message, type = "success") {
  elements.toast.textContent = message;
  elements.toast.classList.remove("success", "error");
  elements.toast.classList.add(type, "show");
  window.setTimeout(() => elements.toast.classList.remove("show"), 2600);
}

function showToastSuccess(message) {
  showToast(message, "success");
}

function showToastError(message) {
  showToast(message, "error");
}

function showError(message, error) {
  const detail = error ? getSupabaseErrorMessage(error) : "";
  const finalMessage = detail ? `${message}: ${detail}` : message;
  elements.errorBox.textContent = finalMessage;
  elements.errorBox.hidden = false;
  showToastError(message);
  console.error(message, error || "");
}

function clearError() {
  elements.errorBox.textContent = "";
  elements.errorBox.hidden = true;
}

function showLoginError(message) {
  elements.loginError.textContent = message;
  elements.loginError.hidden = false;
}

function clearLoginError() {
  elements.loginError.textContent = "";
  elements.loginError.hidden = true;
}

function hideSplash() {
  elements.appSplash.hidden = true;
}

function showLogin() {
  hideSplash();
  state.currentUser = null;
  elements.appShell.hidden = true;
  elements.operatorShell.hidden = true;
  elements.loginScreen.hidden = false;
  elements.loginForm.elements.email.focus();
}

function showAdminApp() {
  hideSplash();
  elements.loginScreen.hidden = true;
  elements.operatorShell.hidden = true;
  elements.appShell.hidden = false;
}

function showOperatorApp() {
  hideSplash();
  elements.loginScreen.hidden = true;
  elements.appShell.hidden = true;
  elements.operatorShell.hidden = false;
  const displayName = state.currentUser?.nombre || state.currentUser?.email || "Operador";
  elements.operatorWelcome.innerHTML = `<strong>Bienvenido: ${escapeHtml(displayName)}</strong><span>Rol: Operador</span>`;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function isAdmin() {
  return state.currentUser?.rol === "admin";
}

function requireAdminAction() {
  if (!isAdmin()) throw new Error("Accion disponible solo para admin.");
}

async function loadAuthorizedUser(authUser) {
  const { data, error } = await supabaseClient
    .from("usuarios_app")
    .select("id,email,nombre,rol,activo")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.activo !== true) {
    await supabaseClient.auth.signOut();
    throw new Error("Usuario sin acceso autorizado.");
  }

  state.currentUser = {
    id: data.id,
    email: data.email || authUser.email,
    nombre: data.nombre || data.email || authUser.email,
    rol: data.rol
  };
  return state.currentUser;
}

async function startAuthenticatedApp(session) {
  await withTimeout(loadAuthorizedUser(session.user), 12000, "No se pudo validar el usuario. Revisa internet o permisos RLS.");
  if (isAdmin()) {
    showAdminApp();
    try {
      await withTimeout(refreshInventory(), 18000, "No se pudo cargar inventario a tiempo.");
      await withTimeout(loadAdminPendingEntries(), 12000, "No se pudieron cargar ingresos pendientes.");
      renderAdminPendingEntries();
    } catch (error) {
      showError("Sesion iniciada, pero hubo un problema cargando datos", error);
    }
    return;
  }

  showOperatorApp();
  setupOperatorEntryTable();
  try {
    await withTimeout(loadProductsFromSupabase(), 12000, "No se pudo cargar catalogo de productos.");
    await withTimeout(loadOperatorPendingEntries(), 12000, "No se pudieron cargar tus ingresos enviados.");
  } catch (error) {
    elements.operatorBulkErrorList.hidden = false;
    elements.operatorBulkErrorList.innerHTML = `<div>${escapeHtml(getSupabaseErrorMessage(error))}</div>`;
    showToastError("Sesion iniciada, pero falta cargar datos.");
  }
}

async function checkInitialSession() {
  clearLoginError();
  try {
    const { data, error } = await withTimeout(
      supabaseClient.auth.getSession(),
      10000,
      "Tu sesion expiro."
    );
    if (error || !data.session) {
      showLogin();
      return;
    }
    await startAuthenticatedApp(data.session);
  } catch (authError) {
    showLogin();
    showLoginError(authError.message || "Tu sesion expiro.");
  }
}

function closeSystemModal(resolveValue = false) {
  elements.systemModal.classList.remove("is-open");
  window.setTimeout(() => {
    elements.systemModal.hidden = true;
    if (typeof elements.systemModal._resolve === "function") {
      elements.systemModal._resolve(resolveValue);
      elements.systemModal._resolve = null;
    }
  }, 140);
}

function showModalConfirm({
  title = "Confirmar accion",
  message = "",
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "warning"
} = {}) {
  elements.systemModalTitle.textContent = title;
  elements.systemModalMessage.textContent = message;
  elements.systemModalConfirm.textContent = confirmText;
  elements.systemModalCancel.textContent = cancelText;
  elements.systemModalIcon.textContent = variant === "success" ? "OK" : "";
  elements.systemModalIcon.className = `system-modal-icon ${variant}`;
  elements.systemModal.querySelector(".system-modal").classList.toggle("compact-delete", confirmText === "Eliminar");
  elements.systemModal.hidden = false;
  window.requestAnimationFrame(() => elements.systemModal.classList.add("is-open"));
  elements.systemModalConfirm.focus();

  return new Promise((resolve) => {
    elements.systemModal._resolve = resolve;
  });
}

function showModalSuccess(title = "Listo", message = "Operacion completada.") {
  elements.systemModalCancel.hidden = true;
  return showModalConfirm({
    title,
    message,
    confirmText: "Cerrar",
    variant: "success"
  }).finally(() => {
    elements.systemModalCancel.hidden = false;
  });
}

function showModalError(title = "No se pudo completar", message = "Revisa el detalle e intenta nuevamente.") {
  elements.systemModalCancel.hidden = true;
  return showModalConfirm({
    title,
    message,
    confirmText: "Cerrar",
    variant: "error"
  }).finally(() => {
    elements.systemModalCancel.hidden = false;
  });
}

function handleSystemModalKeydown(event) {
  if (elements.systemModal.hidden) return;
  if (event.key === "Escape") closeSystemModal(false);
}

function mapSupabaseLot(row) {
  const product = state.products.find((item) => String(item.id) === String(row.producto_id));
  return {
    id: row.lote_id,
    productoId: row.producto_id,
    nombre: row.nombre || "Sin nombre",
    cantidad: Number(row.cantidad_disponible ?? 0),
    unidad: row.unidad || "-",
    fechaVencimiento: row.fecha_vencimiento,
    fechaRecepcion: row.fecha_recepcion,
    lote: row.lote,
    observaciones: row.observaciones,
    stockMinimo: Number(row.stock_minimo ?? product?.stock_minimo ?? 0),
    critico: Boolean(row.critico ?? product?.critico),
    consumoPromedioDiario: Number(row.consumo_promedio_diario ?? product?.consumo_promedio_diario ?? 0),
    favorito: Boolean(row.favorito ?? product?.favorito),
    revisada: Boolean(row.alerta_vencimiento_revisada),
    activo: row.activo !== false
  };
}

async function loadProductsFromSupabase() {
  let { data, error } = await supabaseClient
    .from("productos_insumos")
    .select("id,nombre,nombre_normalizado,unidad_default,stock_minimo,critico,consumo_promedio_diario,favorito,activo")
    .eq("activo", true)
    .is("deleted_at", null)
    .order("nombre", { ascending: true });

  if (error && /consumo_promedio_diario|favorito/i.test(getSupabaseErrorMessage(error))) {
    const fallback = await supabaseClient
      .from("productos_insumos")
      .select("id,nombre,nombre_normalizado,unidad_default,stock_minimo,critico,activo")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("nombre", { ascending: true });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) throw error;
  state.products = (data || []).map((product) => ({
    ...product,
    consumo_promedio_diario: Number(product.consumo_promedio_diario || 0),
    favorito: Boolean(product.favorito),
    nombre_normalizado: product.nombre_normalizado || normalize(product.nombre)
  }));
  renderProductSuggestions();
}

async function loadInventoryFromSupabase() {
  await loadProductsFromSupabase();

  const { data, error } = await supabaseClient
    .from("inventario_lotes_disponibles")
    .select("*")
    .gt("cantidad_disponible", 0)
    .eq("activo", true)
    .order("fecha_vencimiento", { ascending: true, nullsFirst: false });

  if (error) throw error;

  const { data: lowStockRows, error: lowStockError } = await supabaseClient
    .from("alertas_stock_minimo")
    .select("*");

  if (lowStockError) throw lowStockError;

  state.inventory = (data || []).map(mapSupabaseLot);
  state.lowStockProducts = lowStockRows || [];
  state.usingFallback = false;
  elements.inventorySourceText.textContent = "Datos reales cargados desde Supabase.";
  clearError();
}

async function loadMovementHistory() {
  if (state.usingFallback) {
    state.movements = [];
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from("movimientos_inventario")
      .select(`
        id,
        producto_id,
        lote_id,
        tipo_movimiento,
        cantidad,
        unidad,
        fecha_movimiento,
        motivo,
        observacion,
        desviacion_fifo,
        lote_recomendado_id,
        created_at,
        productos_insumos(nombre),
        insumo_lotes(lote,fecha_vencimiento)
      `)
      .order("fecha_movimiento", { ascending: false })
      .limit(300);

    if (error) throw error;

    state.movements = (data || []).map((row) => ({
      id: row.id,
      productoId: row.producto_id,
      loteId: row.lote_id,
      tipo: row.tipo_movimiento,
      cantidad: Number(row.cantidad || 0),
      unidad: row.unidad || "-",
      fecha: row.fecha_movimiento || row.created_at,
      motivo: row.motivo || "",
      observacion: row.observacion || "",
      desviacionFifo: Boolean(row.desviacion_fifo),
      loteRecomendadoId: row.lote_recomendado_id,
      producto: row.productos_insumos?.nombre || state.products.find((product) => String(product.id) === String(row.producto_id))?.nombre || "Producto",
      lote: row.insumo_lotes?.lote || "-",
      fechaVencimiento: row.insumo_lotes?.fecha_vencimiento || null
    }));
  } catch (error) {
    state.movements = [];
    console.warn("No se pudo cargar historial de movimientos", error);
  }
}

function loadFallbackInventory(error) {
  state.inventory = mockInventory.map((item) => ({ ...item }));
  state.products = mockInventory.map((item) => ({
    id: item.productoId,
    nombre: item.nombre,
    nombre_normalizado: normalize(item.nombre),
    unidad_default: item.unidad,
    stock_minimo: item.stockMinimo,
    consumo_promedio_diario: item.critico ? 4 : 0,
    favorito: Boolean(item.critico),
    critico: Boolean(item.critico),
    activo: true
  }));
  state.lowStockProducts = state.inventory
    .filter((item) => item.cantidad < item.stockMinimo)
    .map((item) => ({ producto_id: item.productoId, nombre: item.nombre, stock_actual: item.cantidad, stock_minimo: item.stockMinimo }));
  state.movements = [];
  state.usingFallback = true;
  renderProductSuggestions();
  elements.inventorySourceText.textContent = "Supabase no respondio correctamente. Mostrando datos mock de respaldo.";
  showError("No se pudo cargar inventario desde Supabase", error);
}

async function refreshInventory() {
  try {
    await loadInventoryFromSupabase();
    await loadMovementHistory();
  } catch (error) {
    loadFallbackInventory(error);
  }
  render();
}

function renderProductSuggestions() {
  const seen = new Set();
  elements.productSuggestions.innerHTML = state.products
    .filter((product) => {
      const key = product.nombre_normalizado || normalize(product.nombre);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((product) => `<option value="${escapeHtml(product.nombre)}" label="${escapeHtml(product.nombre_normalizado || normalize(product.nombre))}"></option>`)
    .join("");
}

function findProductByName(name) {
  const normalized = normalize(name);
  return state.products.find((product) => product.nombre_normalizado === normalized || normalize(product.nombre) === normalized);
}

function findProductById(id) {
  return state.products.find((product) => String(product.id) === String(id));
}

function getProductLots(productId) {
  return state.inventory.filter((item) => String(item.productoId) === String(productId));
}

function getProductStockTotal(productId) {
  return getProductLots(productId).reduce((sum, lot) => sum + Number(lot.cantidad || 0), 0);
}

function maybeAutofillUnit(nameInput, unitInput) {
  const product = findProductByName(nameInput.value);
  if (product?.unidad_default) unitInput.value = product.unidad_default;
}

function getFilteredInventory() {
  const query = normalize(state.query);
  if (!query) return state.inventory;
  return state.inventory.filter((item) => normalize(item.nombre).includes(query));
}

function getAlertItems(items = state.inventory) {
  return items
    .map((item) => ({ ...item, status: getStatus(item) }))
    .filter((item) => ["vencido", "hoy", "proximo"].includes(item.status.key))
    .sort((a, b) => (a.status.days ?? 99999) - (b.status.days ?? 99999));
}

function getLowStockDetailItems() {
  return state.lowStockProducts.map((row) => {
    const productLots = state.inventory.filter((item) => String(item.productoId) === String(row.producto_id));
    const firstLot = productLots[0] || {};
    return {
      id: row.producto_id,
      productoId: row.producto_id,
      nombre: row.nombre || firstLot.nombre || "Producto bajo stock",
      cantidad: Number(row.stock_actual ?? 0),
      unidad: row.unidad_default || firstLot.unidad || "-",
      fechaVencimiento: firstLot.fechaVencimiento || null,
      lote: firstLot.lote || "-",
      observaciones: `Stock minimo: ${row.stock_minimo ?? 0}. Faltante: ${row.faltante ?? "-"}`,
      statusOverride: { key: "proximo", label: "Bajo stock", days: null }
    };
  });
}

function getCriticalSummaries() {
  return state.products
    .filter((product) => product.critico)
    .map((product) => {
      const lots = getProductLots(product.id);
      const stockActual = lots.reduce((sum, lot) => sum + Number(lot.cantidad || 0), 0);
      const unidad = product.unidad_default || lots[0]?.unidad || "-";
      const stockMinimo = Number(product.stock_minimo || 0);
      const consumoPromedioDiario = Number(product.consumo_promedio_diario || 0);
      const diasCobertura = consumoPromedioDiario > 0 ? stockActual / consumoPromedioDiario : null;
      let estado = "OK";
      let statusKey = "ok";
      let badge = "ESTABLE";
      let coverageLabel = "Sin consumo configurado";
      let coverageKey = "sin-consumo";

      if (stockActual <= 0) {
        estado = "Sin stock";
        statusKey = "sin-stock";
        badge = "CRITICO URGENTE";
      } else if (stockMinimo > 0 && stockActual < stockMinimo) {
        estado = "Bajo stock";
        statusKey = "bajo-stock";
        badge = "COMPRAR PRONTO";
      } else if (stockMinimo <= 0) {
        estado = "Sin minimo definido";
        statusKey = "sin-minimo";
        badge = "SIN MINIMO";
      }

      if (consumoPromedioDiario > 0) {
        const days = Math.floor(diasCobertura);
        coverageLabel = `${formatNumber(diasCobertura)} dias`;
        if (days <= 0) {
          coverageKey = "sin-stock";
          badge = "CRITICO URGENTE";
        } else if (diasCobertura <= 2) {
          coverageKey = "urgente";
          badge = "CRITICO URGENTE";
        } else if (diasCobertura <= 5) {
          coverageKey = "comprar-pronto";
          if (badge === "ESTABLE") badge = "COMPRAR PRONTO";
        } else {
          coverageKey = "ok";
        }
      } else if (stockActual > 0) {
        badge = statusKey === "sin-minimo" ? "SIN MINIMO" : "SIN CONSUMO";
      }

      return {
        productoId: product.id,
        nombre: product.nombre,
        stockActual,
        unidad,
        stockMinimo,
        consumoPromedioDiario,
        diasCobertura,
        coverageLabel,
        coverageKey,
        estado,
        statusKey,
        badge,
        favorito: Boolean(product.favorito),
        warning: stockMinimo <= 0 ? "Producto critico sin stock minimo definido." : ""
      };
    })
    .sort((a, b) => {
      const order = { "sin-stock": 0, "bajo-stock": 1, "sin-minimo": 2, ok: 3 };
      return order[a.statusKey] - order[b.statusKey] || a.nombre.localeCompare(b.nombre);
    });
}

function renderCriticalProducts() {
  const items = getCriticalSummaries();
  if (!items.length) {
    elements.criticalProductsList.innerHTML = '<div class="empty compact-empty">No hay productos criticos configurados.</div>';
    return;
  }

  elements.criticalProductsList.innerHTML = items
    .map((item) => `
      <article class="critical-item ${item.statusKey}">
        <div>
          <strong>${escapeHtml(item.nombre)}</strong>
          <span>${formatNumber(item.stockActual)} ${escapeHtml(item.unidad)} disponibles</span>
          <span>Cobertura: ${escapeHtml(item.coverageLabel)}</span>
          ${item.warning ? `<em>${escapeHtml(item.warning)}</em>` : ""}
        </div>
        <div class="critical-meta">
          <span>Min: ${formatNumber(item.stockMinimo)}</span>
          <b>${item.badge}</b>
          <button class="btn small" type="button" data-settings-product="${item.productoId}">Configurar</button>
        </div>
      </article>
    `)
    .join("");
}

function renderCompactCriticalView() {
  const items = getCriticalSummaries();
  if (!items.length) {
    elements.compactCriticalList.innerHTML = '<div class="empty compact-empty">No hay productos criticos configurados.</div>';
    return;
  }

  elements.compactCriticalList.innerHTML = items
    .map((item) => `
      <article class="compact-critical-item ${item.statusKey}">
        <strong>${escapeHtml(item.nombre)}</strong>
        <span>${formatNumber(item.stockActual)} ${escapeHtml(item.unidad)}</span>
        <span>Min ${formatNumber(item.stockMinimo)}</span>
        <span>${escapeHtml(item.coverageLabel)}</span>
        <b>${escapeHtml(item.badge)}</b>
      </article>
    `)
    .join("");
}

function getFilteredMovements() {
  const productQuery = normalize(elements.historyProductFilter?.value || "");
  const type = elements.historyTypeFilter?.value || "";
  const from = elements.historyFromFilter?.value || "";
  const to = elements.historyToFilter?.value || "";

  return state.movements.filter((movement) => {
    const movementDate = movement.fecha ? movement.fecha.slice(0, 10) : "";
    if (productQuery && !normalize(movement.producto).includes(productQuery)) return false;
    if (type && movement.tipo !== type) return false;
    if (from && movementDate < from) return false;
    if (to && movementDate > to) return false;
    return true;
  });
}

function renderHistory() {
  const rows = getFilteredMovements();
  if (!rows.length) {
    elements.historyTableBody.innerHTML = '<tr><td colspan="8" class="empty">No hay movimientos para mostrar.</td></tr>';
    return;
  }

  elements.historyTableBody.innerHTML = rows
    .map((movement) => `
      <tr>
        <td>${formatDisplayDate((movement.fecha || "").slice(0, 10))}</td>
        <td><strong>${escapeHtml(movement.producto)}</strong></td>
        <td>${escapeHtml(movement.lote || "-")}</td>
        <td>
          <span class="movement-type">${escapeHtml(movement.tipo)}</span>
          ${movement.desviacionFifo ? '<span class="fifo-badge">Desviacion FIFO</span>' : ""}
        </td>
        <td>${movement.cantidad}</td>
        <td>${escapeHtml(movement.unidad)}</td>
        <td>${escapeHtml(movement.motivo || "-")}</td>
        <td>${escapeHtml(movement.observacion || "-")}</td>
      </tr>
    `)
    .join("");
}

function getRecentMovements(days = 30) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days);
  return state.movements.filter((movement) => {
    if (!movement.fecha) return false;
    return new Date(movement.fecha) >= from;
  });
}

function getTopMovements(type, { deviationOnly = false } = {}) {
  const totals = new Map();
  getRecentMovements().forEach((movement) => {
    if (movement.tipo !== type) return;
    if (deviationOnly && !movement.desviacionFifo) return;
    const current = totals.get(movement.producto) || 0;
    totals.set(movement.producto, current + Number(movement.cantidad || 0));
  });
  return [...totals.entries()]
    .map(([producto, total]) => ({ producto, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function renderAnalytics() {
  const groups = [
    { title: "Mas consumidos", rows: getTopMovements("consumo") },
    { title: "Mas ajustes", rows: getTopMovements("ajuste_manual") },
    { title: "Mas mermas", rows: getTopMovements("merma") },
    { title: "Desviaciones FIFO", rows: getTopMovements("consumo", { deviationOnly: true }) }
  ];

  elements.analyticsGrid.innerHTML = groups
    .map((group) => `
      <article class="analytics-card">
        <h3>${escapeHtml(group.title)}</h3>
        ${group.rows.length ? group.rows.map((row) => `
          <div class="analytics-row">
            <span>${escapeHtml(row.producto)}</span>
            <strong>${formatNumber(row.total)}</strong>
          </div>
        `).join("") : '<div class="empty compact-empty">Sin datos.</div>'}
      </article>
    `)
    .join("");
}

function updateMetrics() {
  const withStatus = state.inventory.map((item) => ({ ...item, status: getStatus(item) }));
  const alerts = getAlertItems();
  elements.totalItems.textContent = state.inventory.length;
  elements.soonItems.textContent = withStatus.filter((item) => ["hoy", "proximo"].includes(item.status.key)).length;
  elements.expiredItems.textContent = withStatus.filter((item) => item.status.key === "vencido").length;
  const lowStockIds = new Set(state.lowStockProducts.map((item) => String(item.producto_id)));
  getCriticalSummaries()
    .filter((item) => item.statusKey === "sin-stock")
    .forEach((item) => lowStockIds.add(String(item.productoId)));
  elements.lowStockItems.textContent = lowStockIds.size;
  elements.alertCount.textContent = `${alerts.length} alertas`;
}

function renderAlerts() {
  const alerts = getAlertItems();
  if (!alerts.length) {
    elements.alertsList.innerHTML = '<div class="empty">No hay alertas de vencimiento activas.</div>';
    return;
  }

  elements.alertsList.innerHTML = alerts
    .map((item) => `
      <article class="alert-card">
        <div>
          <div class="alert-title">${escapeHtml(item.nombre)}</div>
          <div class="alert-meta">${item.cantidad} ${escapeHtml(item.unidad)} disponible - lote ${escapeHtml(item.lote || "sin lote")}</div>
          <div class="alert-meta">Recepcion: ${formatDisplayDate(item.fechaRecepcion)}</div>
          <div class="alert-meta">${escapeHtml(item.observaciones || "Sin observaciones")}</div>
        </div>
        <span>${formatDisplayDate(item.fechaVencimiento)}</span>
        ${renderMonthBadge(item.fechaVencimiento)}
        <span>${formatDays(item.status.days)}</span>
        <span class="status ${item.status.key}">${item.status.label}</span>
        <button class="btn" type="button" data-review-id="${item.id}">
          ${item.revisada ? "Revisada" : "Marcar revisada"}
        </button>
      </article>
    `)
    .join("");
}

function renderInventory() {
  const rows = getFilteredInventory();
  if (!rows.length) {
    elements.inventoryTable.innerHTML = '<tr><td colspan="9" class="empty">No se encontraron insumos.</td></tr>';
    return;
  }

  elements.inventoryTable.innerHTML = rows
    .map((item) => {
      const status = getStatus(item);
      return `
        <tr>
          <td><strong>${escapeHtml(item.nombre)}</strong></td>
          <td>${item.cantidad}</td>
          <td>${escapeHtml(item.unidad)}</td>
          <td>${formatDisplayDate(item.fechaVencimiento)}</td>
          <td>${renderMonthBadge(item.fechaVencimiento)}</td>
          <td>${formatDays(status.days)}</td>
          <td>${escapeHtml(item.lote || "-")}</td>
          <td><span class="status ${status.key}">${status.label}</span></td>
          <td class="row-actions">
            <button class="btn small" type="button" data-edit-id="${item.id}">Editar</button>
            <button class="btn small danger-btn" type="button" data-delete-id="${item.id}">Eliminar</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function render() {
  updateMetrics();
  renderCriticalProducts();
  renderCompactCriticalView();
  renderAlerts();
  renderInventory();
  renderHistory();
  renderAnalytics();
}

function openEntryModal() {
  elements.entryForm.reset();
  elements.entryForm.elements.fecha_recepcion.value = formatIsoDate(new Date());
  setMonthPreview(elements.entryMonthPreview, "");
  elements.entryModal.hidden = false;
  elements.entryForm.elements.nombre.focus();
}

function closeEntryModal() {
  elements.entryModal.hidden = true;
}

function openEditModal(item) {
  elements.editForm.reset();
  elements.editForm.elements.lote_id.value = item.id;
  elements.editForm.elements.producto_id.value = item.productoId;
  elements.editForm.elements.cantidad_actual.value = item.cantidad;
  elements.editForm.elements.nombre.value = item.nombre || "";
  elements.editForm.elements.cantidad.value = item.cantidad;
  elements.editForm.elements.unidad.value = item.unidad;
  elements.editForm.elements.fecha_recepcion.value = item.fechaRecepcion || formatIsoDate(new Date());
  elements.editForm.elements.fecha_vencimiento.value = item.fechaVencimiento || "";
  elements.editForm.elements.lote.value = item.lote || "";
  elements.editForm.elements.observaciones.value = item.observaciones || "";
  elements.editForm.elements.gramos.value = "";
  elements.editProductName.textContent = item.nombre;
  setMonthPreview(elements.editMonthPreview, item.fechaVencimiento);
  elements.editModal.hidden = false;
  elements.editForm.elements.nombre.focus();
}

function closeEditModal() {
  elements.editModal.hidden = true;
}

function parseDateInput(value) {
  const clean = value.trim();
  if (!clean) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (match) {
    const day = match[1].padStart(2, "0");
    const month = match[2].padStart(2, "0");
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${month}-${day}`;
  }
  if (/^\d{8}$/.test(clean)) return `${clean.slice(4, 8)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  if (/^\d{6}$/.test(clean)) return `20${clean.slice(4, 6)}-${clean.slice(2, 4)}-${clean.slice(0, 2)}`;
  return clean;
}

function isValidIsoDate(value) {
  if (!value) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00:00`);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
}

function getExpiryFromParts(form) {
  const day = form.elements.vence_dd.value.trim();
  const month = form.elements.vence_mm.value.trim();
  const year = form.elements.vence_yyyy.value.trim();
  if (!day && !month && !year) return null;
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{4}$/.test(year)) {
    throw new Error("Fecha de vencimiento invalida.");
  }
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  if (!isValidIsoDate(iso)) throw new Error("Fecha de vencimiento invalida.");
  return iso;
}

function normalizeLotValue(value) {
  return value.trim().toUpperCase();
}

function appendGramsToObservations(observaciones, gramos) {
  const gramsValue = Number(gramos);
  const base = observaciones.trim();
  if (!gramsValue || gramsValue <= 0) return base || null;
  const gramsText = `Gramos: ${formatNumber(gramsValue)} g`;
  return base ? `${base}\n${gramsText}` : gramsText;
}

function getSelectedPosUnit(form) {
  const extra = form.elements.unidad_extra.value;
  if (extra) return extra;
  return form.querySelector('input[name="unidad"]:checked')?.value || "";
}

function setSelectedPosUnit(form, unit) {
  const main = [...form.querySelectorAll('input[name="unidad"]')].find((input) => input.value === unit);
  form.elements.unidad_extra.value = "";
  if (main) {
    main.checked = true;
    return;
  }
  form.querySelectorAll('input[name="unidad"]').forEach((input) => {
    input.checked = false;
  });
  form.elements.unidad_extra.value = unit || "";
}

function sanitizeGramsInput(input) {
  input.value = input.value.replace(/\D/g, "").slice(0, 3);
}

function getFocusableFields(form) {
  return [...form.querySelectorAll("input, select, textarea, button, fieldset[tabindex], label[tabindex]")]
    .filter((field) => !field.disabled && field.type !== "hidden" && field.tabIndex >= 0 && field.offsetParent !== null);
}

function focusNextAfter(form, currentField) {
  const fields = getFocusableFields(form);
  const index = fields.indexOf(currentField);
  if (index >= 0 && index < fields.length - 1) fields[index + 1].focus();
}

const QUICK_UNITS = ["kg", "lt", "unidad"];

function selectNextQuickUnit(form, direction = 1) {
  const current = form.querySelector('input[name="unidad"]:checked')?.value || QUICK_UNITS[0];
  const currentIndex = QUICK_UNITS.includes(current) ? QUICK_UNITS.indexOf(current) : 0;
  const nextUnit = QUICK_UNITS[(currentIndex + direction + QUICK_UNITS.length) % QUICK_UNITS.length];
  setSelectedPosUnit(form, nextUnit);
}

function handleQuickUnitKeydown(form, unitPicker, event) {
  if (event.key === "Tab") {
    event.preventDefault();
    event.stopPropagation();
    selectNextQuickUnit(form, event.shiftKey ? -1 : 1);
    unitPicker.focus();
    return;
  }

  if (event.key.toLowerCase() === "q") {
    event.preventDefault();
    event.stopPropagation();
    focusNextAfter(form, unitPicker);
  }
}

function setupUnitKeyboard(form) {
  const unitPicker = form.querySelector(".unit-tiles");
  if (!unitPicker) return;
  const quickUnitInputs = [...form.querySelectorAll('input[name="unidad"]')];
  quickUnitInputs.forEach((input) => {
    input.tabIndex = -1;
    input.addEventListener("change", () => {
      if (input.checked) form.elements.unidad_extra.value = "";
    });
    input.addEventListener("keydown", (event) => handleQuickUnitKeydown(form, unitPicker, event));
    input.closest("label")?.addEventListener("keydown", (event) => handleQuickUnitKeydown(form, unitPicker, event));
  });
  form.elements.unidad_extra.tabIndex = -1;
  form.elements.unidad_extra.addEventListener("change", () => {
    if (!form.elements.unidad_extra.value) return;
    quickUnitInputs.forEach((input) => {
      input.checked = false;
    });
  });

  unitPicker.addEventListener("keydown", (event) => handleQuickUnitKeydown(form, unitPicker, event));
}

function setupCriticalKeyboard(form) {
  const criticalToggle = form.querySelector(".critical-toggle");
  if (!criticalToggle) return;
  criticalToggle.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "q") {
      event.preventDefault();
      form.elements.critico.checked = !form.elements.critico.checked;
    }
  });
}

function getPosFormPayload(form, receiptDate) {
  const nombre = form.elements.nombre.value.trim();
  const cantidad = Number(form.elements.cantidad.value);
  const unidad = getSelectedPosUnit(form);
  const fechaVencimiento = getExpiryFromParts(form);
  const lote = normalizeLotValue(form.elements.lote.value);

  if (!nombre) throw new Error("Producto obligatorio.");
  if (!cantidad || cantidad <= 0) throw new Error("Cantidad debe ser mayor que cero.");
  if (!unidad) throw new Error("Unidad obligatoria.");
  if (!lote) throw new Error("El lote es obligatorio.");
  if (!isValidIsoDate(receiptDate)) throw new Error("Fecha recepcion invalida.");

  return {
    nombre,
    nombreNormalizado: normalize(nombre),
    cantidad,
    unidad,
    fechaRecepcion: receiptDate,
    fechaVencimiento,
    critico: form.elements.critico.checked,
    lote,
    observaciones: appendGramsToObservations(form.elements.observaciones.value, form.elements.gramos.value)
  };
}

function getPosContext(kind) {
  if (kind === "operator") {
    return {
      rows: state.operatorSessionRows,
      setRows: (rows) => { state.operatorSessionRows = rows; },
      editingKey: "operatorEditingIndex",
      form: elements.operatorProductForm,
      summary: elements.operatorProductsSummary,
      count: elements.operatorProductsCount,
      chips: elements.operatorProductsChips,
      list: elements.operatorProductsList,
      errorList: elements.operatorBulkErrorList,
      receiptInput: elements.operatorReceiptDate,
      receiptDisplay: elements.operatorReceiptDisplay,
      addButton: document.getElementById("operatorAddProductBtn")
    };
  }

  return {
    rows: state.bulkSessionRows,
    setRows: (rows) => { state.bulkSessionRows = rows; },
    editingKey: "bulkEditingIndex",
    form: elements.bulkProductForm,
    summary: elements.bulkProductsSummary,
    count: elements.bulkProductsCount,
    chips: elements.bulkProductsChips,
    list: elements.bulkProductsList,
    errorList: elements.bulkErrorList,
    receiptInput: elements.bulkReceiptDate,
    receiptDisplay: elements.bulkReceiptDisplay,
    addButton: document.getElementById("bulkAddProductBtn")
  };
}

function renderPosSession(kind) {
  const ctx = getPosContext(kind);
  const rows = ctx.rows;
  ctx.count.textContent = `Productos ingresados (${rows.length})`;
  ctx.chips.innerHTML = rows.slice(0, 4).map((row) => `<span>${escapeHtml(row.nombre)} ${formatNumber(row.cantidad)} ${escapeHtml(row.unidad)}</span>`).join("");
  ctx.list.innerHTML = rows.length
    ? rows.map((row, index) => `
      <article class="pos-added-item" data-pos-item="${kind}" data-index="${index}">
        <div>
          <strong>${escapeHtml(row.nombre)}</strong>
          <span>${formatNumber(row.cantidad)} ${escapeHtml(row.unidad)} - vence ${formatDisplayDate(row.fechaVencimiento)}</span>
          <span>Lote: ${escapeHtml(row.lote || "-")} ${row.critico ? "- CRITICO" : ""}</span>
        </div>
        <div class="row-actions">
          <button class="btn small" type="button" data-pos-edit="${kind}" data-index="${index}">Editar</button>
          <button class="btn small danger-btn" type="button" data-pos-delete="${kind}" data-index="${index}">Eliminar</button>
        </div>
      </article>
    `).join("")
    : '<div class="empty compact-empty">Aun no hay productos agregados.</div>';
  ctx.addButton.textContent = state[ctx.editingKey] === null ? "Agregar producto" : "Guardar edición";
}

function resetPosSession(kind) {
  const ctx = getPosContext(kind);
  ctx.setRows([]);
  state[ctx.editingKey] = null;
  const today = formatIsoDate(new Date());
  ctx.receiptInput.value = today;
  ctx.receiptDisplay.textContent = formatReceiptDisplay(today);
  ctx.errorList.hidden = true;
  ctx.errorList.innerHTML = "";
  if (ctx.summary) ctx.summary.open = false;
  clearPosForm(ctx.form);
  renderPosSession(kind);
}

function addOrUpdatePosRow(kind) {
  const ctx = getPosContext(kind);
  try {
    const payload = getPosFormPayload(ctx.form, ctx.receiptInput.value || formatIsoDate(new Date()));
    const rows = [...ctx.rows];
    if (state[ctx.editingKey] === null) {
      rows.push(payload);
      if (ctx.summary) ctx.summary.open = false;
    } else {
      rows[state[ctx.editingKey]] = payload;
    }
    ctx.setRows(rows);
    state[ctx.editingKey] = null;
    ctx.errorList.hidden = true;
    ctx.errorList.innerHTML = "";
    clearPosForm(ctx.form);
    renderPosSession(kind);
    requestAnimationFrame(() => ctx.form.elements.nombre.focus());
  } catch (error) {
    ctx.errorList.hidden = false;
    ctx.errorList.innerHTML = `<div>${escapeHtml(error.message)}</div>`;
  }
}

function editPosRow(kind, index) {
  const ctx = getPosContext(kind);
  const row = ctx.rows[index];
  if (!row) return;
  state[ctx.editingKey] = index;
  fillPosForm(ctx.form, row);
  renderPosSession(kind);
}

function deletePosRow(kind, index) {
  const ctx = getPosContext(kind);
  ctx.setRows(ctx.rows.filter((_, rowIndex) => rowIndex !== index));
  state[ctx.editingKey] = null;
  renderPosSession(kind);
}

function clearPosForm(form) {
  form.reset();
  form.querySelector('input[name="unidad"][value="kg"]').checked = true;
  form.elements.unidad_extra.value = "";
  form.elements.gramos.value = "";
  form.querySelector(".optional-note")?.removeAttribute("open");
  form.elements.nombre.focus();
}

function fillPosForm(form, row) {
  form.elements.nombre.value = row.nombre || "";
  form.elements.cantidad.value = row.cantidad || "";
  setSelectedPosUnit(form, row.unidad || "kg");
  form.elements.critico.checked = Boolean(row.critico);
  form.elements.lote.value = row.lote || "";
  form.elements.observaciones.value = row.observaciones || "";
  form.elements.gramos.value = "";
  if (row.fechaVencimiento) {
    const [year, month, day] = row.fechaVencimiento.split("-");
    form.elements.vence_dd.value = day;
    form.elements.vence_mm.value = month;
    form.elements.vence_yyyy.value = year;
  } else {
    form.elements.vence_dd.value = "";
    form.elements.vence_mm.value = "";
    form.elements.vence_yyyy.value = "";
  }
  form.elements.nombre.focus();
}

function formatReceiptDisplay(isoDate) {
  return formatDisplayDate(isoDate).replaceAll("-", "/");
}

function setupDateAutoAdvance(form) {
  ["vence_dd", "vence_mm", "vence_yyyy"].forEach((name) => {
    form.elements[name].addEventListener("input", () => {
      const max = name === "vence_yyyy" ? 4 : 2;
      if (form.elements[name].value.length >= max) {
        const next = name === "vence_dd" ? form.elements.vence_mm : name === "vence_mm" ? form.elements.vence_yyyy : form.elements.lote;
        next.focus();
        next.select?.();
      }
    });
  });
}

function bindLotUppercase(input) {
  input.addEventListener("input", () => {
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.value = input.value.toUpperCase();
    input.setSelectionRange?.(start, end);
  });
}

function getFormPayload(form) {
  const formData = new FormData(form);
  const nombre = formData.get("nombre").trim();
  const cantidad = Number(formData.get("cantidad"));
  const unidad = formData.get("unidad");
  const fechaRecepcion = formData.get("fecha_recepcion");
  const fechaVencimiento = formData.get("fecha_vencimiento") || null;
  const critico = formData.get("critico") === "on";

  if (!nombre) throw new Error("El nombre del producto es obligatorio.");
  if (!cantidad || cantidad <= 0) throw new Error("La cantidad debe ser mayor que cero.");
  if (!unidad) throw new Error("La unidad es obligatoria.");
  if (!fechaRecepcion) throw new Error("La fecha de recepcion es obligatoria.");

  return {
    nombre,
    nombreNormalizado: normalize(nombre),
    cantidad,
    unidad,
    fechaRecepcion,
    fechaVencimiento,
    critico,
    lote: normalizeLotValue(formData.get("lote")) || null,
    observaciones: appendGramsToObservations(formData.get("observaciones"), formData.get("gramos"))
  };
}

function validateBulkRow(rawRow) {
  const errors = [];
  const nombre = rawRow.nombre.trim();
  const cantidad = Number(rawRow.cantidad);
  const unidad = rawRow.unidad.trim() || "kg";
  const fechaRecepcion = elements.bulkReceiptDate.value || formatIsoDate(new Date());
  const fechaVencimiento = rawRow.fecha_vencimiento.trim() ? parseDateInput(rawRow.fecha_vencimiento) : null;
  const critico = Boolean(rawRow.critico);

  if (!nombre) errors.push("producto obligatorio");
  if (!cantidad || cantidad <= 0) errors.push("cantidad debe ser mayor que cero");
  if (!UNIT_OPTIONS.includes(unidad)) errors.push("unidad invalida");
  if (!isValidIsoDate(fechaRecepcion)) errors.push("fecha recepcion invalida");
  if (fechaVencimiento && !isValidIsoDate(fechaVencimiento)) errors.push("fecha vencimiento invalida");

  return {
    valid: errors.length === 0,
    errors,
    payload: {
      nombre,
      nombreNormalizado: normalize(nombre),
      cantidad,
      unidad,
      fechaRecepcion,
      fechaVencimiento,
      critico,
      lote: normalizeLotValue(rawRow.lote) || null,
      observaciones: rawRow.observaciones.trim() || null
    }
  };
}

async function findOrCreateProduct(payload) {
  const cached = state.products.find((product) => product.nombre_normalizado === payload.nombreNormalizado);
  if (cached) {
    if (payload.critico && !cached.critico && !state.usingFallback) {
      const { error } = await supabaseClient
        .from("productos_insumos")
        .update({ critico: true })
        .eq("id", cached.id);
      if (error) throw error;
      cached.critico = true;
    }
    return cached;
  }

  const { data: existingProduct, error: findError } = await supabaseClient
    .from("productos_insumos")
    .select("id,nombre,nombre_normalizado,unidad_default,stock_minimo,critico,consumo_promedio_diario,favorito,activo")
    .eq("nombre_normalizado", payload.nombreNormalizado)
    .maybeSingle();

  if (findError) throw findError;
  if (existingProduct) {
    if (payload.critico && !existingProduct.critico) {
      const { error } = await supabaseClient
        .from("productos_insumos")
        .update({ critico: true })
        .eq("id", existingProduct.id);
      if (error) throw error;
      existingProduct.critico = true;
    }
    return existingProduct;
  }

  const { data: createdProduct, error: createError } = await supabaseClient
    .from("productos_insumos")
    .insert({
      nombre: payload.nombre,
      nombre_normalizado: payload.nombreNormalizado,
      unidad_default: payload.unidad,
      stock_minimo: 0,
      critico: Boolean(payload.critico),
      consumo_promedio_diario: 0,
      favorito: false,
      activo: true
    })
    .select("id,nombre,nombre_normalizado,unidad_default,stock_minimo,critico")
    .single();

  if (createError) throw createError;
  state.products.push(createdProduct);
  renderProductSuggestions();
  return createdProduct;
}

async function createEntry(payload) {
  requireAdminAction();
  const product = await findOrCreateProduct(payload);

  const { data: lot, error: lotError } = await supabaseClient
    .from("insumo_lotes")
    .insert({
      producto_id: product.id,
      fecha_recepcion: payload.fechaRecepcion,
      fecha_vencimiento: payload.fechaVencimiento,
      lote: payload.lote,
      unidad: payload.unidad,
      observaciones: payload.observaciones,
      alerta_vencimiento_revisada: false,
      activo: true
    })
    .select("id")
    .single();

  if (lotError) throw lotError;

  const { error: movementError } = await supabaseClient
    .from("movimientos_inventario")
    .insert({
      producto_id: product.id,
      lote_id: lot.id,
      tipo_movimiento: "ingreso",
      cantidad: payload.cantidad,
      unidad: payload.unidad,
      motivo: "Ingreso desde formulario web",
      usuario_id: state.currentUser?.id || null,
      observacion: payload.observaciones
    });

  if (movementError) throw movementError;
}

async function updateEntry(form) {
  requireAdminAction();
  const formData = new FormData(form);
  const loteId = formData.get("lote_id");
  const productoId = formData.get("producto_id");
  const nombre = formData.get("nombre").trim();
  const nombreNormalizado = normalize(nombre);
  const currentQuantity = Number(formData.get("cantidad_actual"));
  const nextQuantity = Number(formData.get("cantidad"));
  const unidad = formData.get("unidad");
  const fechaRecepcion = formData.get("fecha_recepcion");
  const fechaVencimiento = formData.get("fecha_vencimiento") || null;
  const lote = normalizeLotValue(formData.get("lote")) || null;
  const observaciones = appendGramsToObservations(formData.get("observaciones"), formData.get("gramos"));

  if (!nombre) throw new Error("El nombre del producto es obligatorio.");
  if (nextQuantity < 0) throw new Error("La cantidad no puede ser negativa.");

  const currentProduct = findProductById(productoId);
  if (!currentProduct) throw new Error("Producto no encontrado.");

  if (normalize(currentProduct.nombre) !== nombreNormalizado || currentProduct.nombre !== nombre) {
    const duplicatedProduct = state.products.find((product) =>
      String(product.id) !== String(productoId) &&
      (product.nombre_normalizado === nombreNormalizado || normalize(product.nombre) === nombreNormalizado)
    );
    if (duplicatedProduct) throw new Error(`Ya existe un producto llamado "${duplicatedProduct.nombre}".`);

    const { error: productError } = await supabaseClient
      .from("productos_insumos")
      .update({
        nombre,
        nombre_normalizado: nombreNormalizado,
        unidad_default: unidad
      })
      .eq("id", productoId);

    if (productError) throw productError;
  }

  const { error: lotError } = await supabaseClient
    .from("insumo_lotes")
    .update({
      fecha_recepcion: fechaRecepcion,
      fecha_vencimiento: fechaVencimiento,
      lote,
      unidad,
      observaciones
    })
    .eq("id", loteId);

  if (lotError) throw lotError;

  const delta = Number((nextQuantity - currentQuantity).toFixed(3));
  if (delta === 0) return;

  const movementType = delta > 0 ? "ingreso" : "eliminacion";
  const { error: movementError } = await supabaseClient
    .from("movimientos_inventario")
    .insert({
      producto_id: productoId,
      lote_id: loteId,
      tipo_movimiento: movementType,
      cantidad: Math.abs(delta),
      unidad,
      motivo: "Ajuste manual desde edicion",
      observacion: observaciones
    });

  if (movementError) throw movementError;
}

async function deleteEntry(id) {
  requireAdminAction();
  const item = state.inventory.find((entry) => String(entry.id) === String(id));
  if (!item) return;
  const confirmed = await showModalConfirm({
    title: "Eliminar lote",
    message: `Eliminar “${item.nombre}”`,
    confirmText: "Eliminar",
    cancelText: "Cancelar",
    variant: "error"
  });
  if (!confirmed) return;

  if (state.usingFallback) {
    state.inventory = state.inventory.filter((entry) => String(entry.id) !== String(id));
    render();
    showToastSuccess("Lote eliminado.");
    return;
  }

  const { error: movementError } = await supabaseClient
    .from("movimientos_inventario")
    .insert({
      producto_id: item.productoId,
      lote_id: item.id,
      tipo_movimiento: "eliminacion",
      cantidad: item.cantidad,
      unidad: item.unidad,
      motivo: "Eliminacion logica desde inventario",
      observacion: item.observaciones
    });

  if (movementError) {
    showError("No se pudo crear movimiento de eliminacion", movementError);
    return;
  }

  const { error: lotError } = await supabaseClient
    .from("insumo_lotes")
    .update({ activo: false, deleted_at: new Date().toISOString() })
    .eq("id", item.id);

  if (lotError) {
    showError("No se pudo marcar el lote como inactivo", lotError);
    return;
  }

  await refreshInventory();
  showToastSuccess("Lote eliminado.");
}

function getProductLotsForUse(productId, unidad) {
  return state.inventory
    .filter((item) => String(item.productoId) === String(productId))
    .filter((item) => item.cantidad > 0)
    .filter((item) => !unidad || item.unidad === unidad)
    .sort((a, b) => {
      if (!a.fechaVencimiento && !b.fechaVencimiento) return 0;
      if (!a.fechaVencimiento) return 1;
      if (!b.fechaVencimiento) return -1;
      return a.fechaVencimiento.localeCompare(b.fechaVencimiento);
    });
}

function buildFifoPlan(productId, cantidad, unidad) {
  const lots = getProductLotsForUse(productId, unidad);
  const totalAvailable = lots.reduce((sum, lot) => sum + Number(lot.cantidad), 0);
  const plan = [];
  let remaining = cantidad;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const consume = Math.min(Number(lot.cantidad), remaining);
    plan.push({ lot, cantidad: Number(consume.toFixed(3)) });
    remaining = Number((remaining - consume).toFixed(3));
  }

  return {
    lots,
    plan,
    totalAvailable,
    remaining,
    recommendedLot: lots[0] || null,
    sufficient: cantidad > 0 && remaining <= 0
  };
}

function renderFifoPlan(planResult, manualLot = null, manualQuantity = 0) {
  if (!planResult || (!planResult.plan.length && !manualLot)) {
    elements.fifoSummaryList.innerHTML = '<div class="empty">Selecciona producto y cantidad para calcular FIFO.</div>';
    return;
  }

  const rows = manualLot
    ? [{ lot: manualLot, cantidad: manualQuantity }]
    : planResult.plan;

  elements.fifoSummaryList.innerHTML = rows
    .map(({ lot, cantidad }, index) => `
      <div class="fifo-row ${index === 0 ? "recommended" : ""}">
        <div>
          <strong>${index === 0 ? "Lote recomendado por FIFO" : "Continuacion FIFO"}</strong>
          <span>lote ${escapeHtml(lot.lote || "sin lote")} - disponible ${lot.cantidad} ${escapeHtml(lot.unidad)}</span>
        </div>
        <div>${formatDisplayDate(lot.fechaVencimiento)}</div>
        <div>${renderMonthBadge(lot.fechaVencimiento)}</div>
        <div><strong>${cantidad} ${escapeHtml(lot.unidad)}</strong></div>
      </div>
    `)
    .join("");
}

function getUseFormState() {
  const nombre = elements.useForm.elements.nombre.value.trim();
  const product = findProductByName(nombre);
  const cantidad = Number(elements.useForm.elements.cantidad.value);
  const unidad = elements.useForm.elements.unidad.value;
  return { nombre, product, cantidad, unidad };
}

function populateManualLots(lots) {
  const select = elements.useForm.elements.lote_especifico;
  const currentValue = select.value;
  select.innerHTML = lots
    .map((lot) => `<option value="${lot.id}">${escapeHtml(lot.lote || "sin lote")} - ${formatDisplayDate(lot.fechaVencimiento)} - ${lot.cantidad} ${escapeHtml(lot.unidad)}</option>`)
    .join("");
  if (currentValue && lots.some((lot) => String(lot.id) === currentValue)) select.value = currentValue;
}

function updateUseSummary() {
  const { product, cantidad, unidad } = getUseFormState();
  if (!product || !cantidad || cantidad <= 0) {
    renderFifoPlan(null);
    populateManualLots([]);
    return null;
  }

  const planResult = buildFifoPlan(product.id, cantidad, unidad);
  populateManualLots(planResult.lots);

  const useSpecific = elements.useForm.elements.usar_lote_especifico.checked;
  elements.manualLotPanel.hidden = !useSpecific;

  if (useSpecific) {
    const selectedLot = planResult.lots.find((lot) => String(lot.id) === String(elements.useForm.elements.lote_especifico.value));
    const isDeviation = selectedLot && planResult.recommendedLot && String(selectedLot.id) !== String(planResult.recommendedLot.id);
    elements.fifoDeviationWarning.hidden = !isDeviation;
    renderFifoPlan(planResult, selectedLot, cantidad);
  } else {
    elements.fifoDeviationWarning.hidden = true;
    renderFifoPlan(planResult);
  }

  return planResult;
}

function openUseModal(prefillItem = null) {
  elements.useForm.reset();
  if (prefillItem) {
    elements.useForm.elements.nombre.value = prefillItem.nombre;
    elements.useForm.elements.unidad.value = prefillItem.unidad;
    if (prefillItem.cantidadUsar) elements.useForm.elements.cantidad.value = prefillItem.cantidadUsar;
  }
  elements.manualLotPanel.hidden = true;
  elements.fifoDeviationWarning.hidden = true;
  updateUseSummary();
  elements.useModal.hidden = false;
  elements.useForm.elements.nombre.focus();
}

function closeUseModal() {
  elements.useModal.hidden = true;
}

async function registerUse() {
  requireAdminAction();
  const { nombre, product, cantidad, unidad } = getUseFormState();
  if (!nombre || !product) throw new Error("Producto obligatorio.");
  if (!cantidad || cantidad <= 0) throw new Error("La cantidad usada debe ser mayor que cero.");

  const planResult = buildFifoPlan(product.id, cantidad, unidad);
  if (!planResult.sufficient) {
    throw new Error(`Stock insuficiente. Disponible: ${planResult.totalAvailable} ${unidad}`);
  }

  const observation = elements.useForm.elements.observacion.value.trim() || null;
  const useSpecific = elements.useForm.elements.usar_lote_especifico.checked;
  let movements = [];

  if (useSpecific) {
    const selectedLot = planResult.lots.find((lot) => String(lot.id) === String(elements.useForm.elements.lote_especifico.value));
    if (!selectedLot) throw new Error("Selecciona un lote especifico.");
    if (cantidad > selectedLot.cantidad) throw new Error(`Stock insuficiente en lote seleccionado. Disponible: ${selectedLot.cantidad} ${unidad}`);

    const recommendedLot = planResult.recommendedLot;
    const isDeviation = recommendedLot && String(selectedLot.id) !== String(recommendedLot.id);
    const reason = elements.useForm.elements.motivo_desviacion.value;
    if (isDeviation && !reason) throw new Error("Debes indicar motivo de desviacion FIFO.");

    movements = [{
      producto_id: product.id,
      lote_id: selectedLot.id,
      tipo_movimiento: "consumo",
      cantidad,
      unidad,
      motivo: isDeviation ? reason : "Consumo FIFO",
      observacion: observation,
      desviacion_fifo: Boolean(isDeviation),
      lote_recomendado_id: recommendedLot?.id || selectedLot.id
    }];
  } else {
    movements = planResult.plan.map(({ lot, cantidad: lotQuantity }) => ({
      producto_id: product.id,
      lote_id: lot.id,
      tipo_movimiento: "consumo",
      cantidad: lotQuantity,
      unidad,
      motivo: "Consumo FIFO",
      observacion: observation,
      desviacion_fifo: false,
      lote_recomendado_id: lot.id
    }));
  }

  const { error } = await supabaseClient
    .from("movimientos_inventario")
    .insert(movements);

  if (error) throw error;
}

function getAdjustFormProduct() {
  const nombre = elements.adjustForm.elements.nombre.value.trim();
  const product = findProductByName(nombre);
  return { nombre, product };
}

function renderAdjustLots() {
  const { product } = getAdjustFormProduct();
  const unidad = elements.adjustForm.elements.unidad.value;
  const lots = product ? getProductLotsForUse(product.id, unidad) : [];

  elements.adjustLotSelect.innerHTML = lots.length
    ? lots.map((lot) => `
        <option value="${escapeHtml(lot.id)}">
          ${escapeHtml(lot.lote || "sin lote")} - ${lot.cantidad} ${escapeHtml(lot.unidad)} - ${formatDisplayDate(lot.fechaVencimiento)}
        </option>
      `).join("")
    : '<option value="">Sin lotes disponibles</option>';

  updateAdjustSystemStock();
}

function updateAdjustSystemStock() {
  const lotId = elements.adjustLotSelect.value;
  const lot = state.inventory.find((item) => String(item.id) === String(lotId));
  const stock = lot ? Number(lot.cantidad || 0) : 0;
  elements.adjustSystemStock.value = stock;
  if (lot) elements.adjustForm.elements.unidad.value = lot.unidad;
}

function openAdjustModal(prefillItem = null) {
  elements.adjustForm.reset();
  elements.adjustForm.elements.motivo.value = "conteo fisico";
  if (prefillItem) {
    elements.adjustForm.elements.nombre.value = prefillItem.nombre;
    elements.adjustForm.elements.unidad.value = prefillItem.unidad;
  }
  renderAdjustLots();
  if (prefillItem) {
    elements.adjustLotSelect.value = prefillItem.id;
    updateAdjustSystemStock();
  }
  elements.adjustModal.hidden = false;
  elements.adjustForm.elements.nombre.focus();
}

function closeAdjustModal() {
  elements.adjustModal.hidden = true;
}

async function registerAdjustment() {
  requireAdminAction();
  if (state.usingFallback) throw new Error("No se puede ajustar inventario mientras Supabase esta en modo respaldo.");

  const { product } = getAdjustFormProduct();
  const lotId = elements.adjustForm.elements.lote_id.value;
  const lot = state.inventory.find((item) => String(item.id) === String(lotId));
  const systemStock = Number(elements.adjustForm.elements.stock_sistema.value || 0);
  const realStock = Number(elements.adjustForm.elements.stock_real.value);
  const unidad = elements.adjustForm.elements.unidad.value;
  const motivo = elements.adjustForm.elements.motivo.value;
  const observacion = elements.adjustForm.elements.observacion.value.trim() || null;

  if (!product) throw new Error("Producto obligatorio.");
  if (!lot) throw new Error("Selecciona un lote con stock disponible.");
  if (Number.isNaN(realStock) || realStock < 0) throw new Error("El stock real contado debe ser cero o mayor.");

  const delta = Number((realStock - systemStock).toFixed(3));
  if (delta === 0) throw new Error("No hay diferencia para ajustar.");

  const movement = {
    producto_id: product.id,
    lote_id: lot.id,
    tipo_movimiento: delta > 0 ? "ajuste_manual" : motivo === "merma" ? "merma" : "merma",
    cantidad: Math.abs(delta),
    unidad,
    motivo,
    observacion
  };

  const { error } = await supabaseClient
    .from("movimientos_inventario")
    .insert(movement);

  if (error) throw error;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(filename, rows) {
  if (!rows.length) {
    showToastError("No hay datos para exportar.");
    return;
  }

  const headers = Object.keys(rows[0]);
  const csv = [
    headers.map(csvEscape).join(";"),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(";"))
  ].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getExportRows(type) {
  if (type === "criticos") return getCriticalSummaries().map((item) => ({
    producto: item.nombre,
    stock_actual: item.stockActual,
    unidad: item.unidad,
    stock_minimo: item.stockMinimo,
    consumo_promedio_diario: item.consumoPromedioDiario,
    dias_cobertura: item.coverageLabel,
    estado: item.estado,
    badge: item.badge,
    advertencia: item.warning
  }));

  if (type === "alertas") return getAlertItems().map((item) => ({
    producto: item.nombre,
    cantidad: item.cantidad,
    unidad: item.unidad,
    fecha_vencimiento: formatDisplayDate(item.fechaVencimiento),
    dias: formatDays(item.status.days),
    lote: item.lote || "",
    estado: item.status.label,
    observaciones: item.observaciones || ""
  }));

  if (type === "historial") return getFilteredMovements().map((movement) => ({
    fecha: formatDisplayDate((movement.fecha || "").slice(0, 10)),
    producto: movement.producto,
    lote: movement.lote,
    tipo_movimiento: movement.tipo,
    cantidad: movement.cantidad,
    unidad: movement.unidad,
    motivo: movement.motivo,
    observacion: movement.observacion,
    desviacion_fifo: movement.desviacionFifo ? "si" : "no"
  }));

  return state.inventory.map((item) => ({
    producto: item.nombre,
    cantidad: item.cantidad,
    unidad: item.unidad,
    fecha_recepcion: formatDisplayDate(item.fechaRecepcion),
    fecha_vencimiento: formatDisplayDate(item.fechaVencimiento),
    mes: getMonthInfo(item.fechaVencimiento)?.label || "Sin fecha",
    lote: item.lote || "",
    estado: getStatus(item).label,
    observaciones: item.observaciones || ""
  }));
}

function openExportModal() {
  elements.exportModal.hidden = false;
}

function closeExportModal() {
  elements.exportModal.hidden = true;
}

function exportSelectedCsv() {
  const type = elements.exportType.value;
  const filenames = {
    inventario: "jesunutri_inventario.csv",
    criticos: "jesunutri_productos_criticos.csv",
    alertas: "jesunutri_alertas_vencimiento.csv",
    historial: "jesunutri_historial_movimientos.csv"
  };
  downloadCsv(filenames[type] || "jesunutri_export.csv", getExportRows(type));
  showToastSuccess("Exportadito.");
  closeExportModal();
}

function openLabelsModal() {
  const items = state.inventory;
  elements.labelsList.innerHTML = items.length
    ? items.map((item) => `
        <label class="label-row">
          <input type="checkbox" value="${escapeHtml(item.id)}" checked>
          <span>
            <strong>${escapeHtml(item.nombre)}</strong>
            <small>${escapeHtml(item.lote || "sin lote")} - ${item.cantidad} ${escapeHtml(item.unidad)} - ${formatDisplayDate(item.fechaVencimiento)}</small>
          </span>
          ${renderMonthBadge(item.fechaVencimiento)}
        </label>
      `).join("")
    : '<div class="empty">No hay lotes disponibles para etiquetar.</div>';
  elements.labelsModal.hidden = false;
}

function closeLabelsModal() {
  elements.labelsModal.hidden = true;
}

function getSelectedLabelItems() {
  const selectedIds = [...elements.labelsList.querySelectorAll('input[type="checkbox"]:checked')].map((input) => String(input.value));
  return state.inventory.filter((item) => selectedIds.includes(String(item.id)));
}

function printSelectedLabels() {
  const items = getSelectedLabelItems();
  if (!items.length) {
    showToastError("Selecciona al menos un lote.");
    return;
  }

  const logoUrl = new URL("logo.png", window.location.href).href;
  const labels = items.map((item) => {
    const month = getMonthInfo(item.fechaVencimiento);
    const background = month ? month.color : "#8792a2";
    const textColor = getReadableTextColor(background);
    const copies = Math.max(1, Math.ceil(Number(item.cantidad || 1)));
    return Array.from({ length: copies }, () => `
      <article class="print-label" style="background:${background};color:${textColor};border-color:${textColor};">
        <header class="print-label-top">
          <img src="${logoUrl}" alt="Jesunutri">
          <div class="print-month">
            ${month ? `${month.label} ${month.year}` : "Sin fecha"}
          </div>
        </header>
        <h1>${escapeHtml(item.nombre)}</h1>
        <p>Vence: ${formatDisplayDate(item.fechaVencimiento)}</p>
        <p>Lote: ${escapeHtml(item.lote || "sin lote")}</p>
        <p>Cantidad: ${formatNumber(item.cantidad)} ${escapeHtml(item.unidad)}</p>
      </article>
    `).join("");
  }).join("");

  const printWindow = window.open("", "_blank", "width=900,height=700");
  if (!printWindow) {
    showToastError("No se pudo abrir la vista de impresion.");
    return;
  }
  printWindow.document.write(`
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>Etiquetas Jesunutri</title>
        <style>
          * { box-sizing: border-box; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          body { margin: 0; padding: 18px; font-family: Arial, sans-serif; color: #111827; background: #fff; }
          .sheet { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
          .print-label { min-height: 210px; border: 2px solid; border-radius: 10px; padding: 14px; break-inside: avoid; page-break-inside: avoid; }
          .print-label-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
          .print-label-top img { width: 84px; max-height: 42px; object-fit: contain; object-position: left top; }
          h1 { margin: 0 0 12px; font-size: 30px; line-height: 1.05; text-transform: uppercase; }
          p { margin: 8px 0; font-size: 18px; }
          .print-month { font-size: 24px; font-weight: 900; text-align: right; text-transform: uppercase; }
          @media print {
            body { padding: 0; }
            .sheet { gap: 0; }
            .print-label { border-radius: 0; }
          }
        </style>
      </head>
      <body><main class="sheet">${labels}</main></body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
  showToastSuccess("Etiquetas listas.");
}

function openProductSettings(productId) {
  const product = findProductById(productId);
  if (!product) {
    showToastError("Producto no encontrado.");
    return;
  }

  elements.productSettingsForm.reset();
  elements.productSettingsForm.elements.producto_id.value = product.id;
  elements.productSettingsForm.elements.stock_minimo.value = Number(product.stock_minimo || 0);
  elements.productSettingsForm.elements.unidad_default.value = product.unidad_default || "kg";
  elements.productSettingsForm.elements.consumo_promedio_diario.value = Number(product.consumo_promedio_diario || 0);
  elements.productSettingsForm.elements.critico.checked = Boolean(product.critico);
  elements.productSettingsName.textContent = product.nombre;
  elements.pauseProductBtn.textContent = product.activo === false ? "Reactivar producto" : "Pausar producto";
  elements.productSettingsModal.hidden = false;
  elements.productSettingsForm.elements.stock_minimo.focus();
}

function closeProductSettingsModal() {
  elements.productSettingsModal.hidden = true;
}

async function saveProductSettings() {
  requireAdminAction();
  if (state.usingFallback) throw new Error("No se puede configurar producto mientras Supabase esta en modo respaldo.");

  const form = elements.productSettingsForm;
  const productId = form.elements.producto_id.value;
  const stockMinimo = Number(form.elements.stock_minimo.value);
  const consumoPromedioDiario = Number(form.elements.consumo_promedio_diario.value);
  const unidadDefault = form.elements.unidad_default.value;

  if (stockMinimo < 0) throw new Error("El stock minimo no puede ser negativo.");
  if (consumoPromedioDiario < 0) throw new Error("El consumo promedio diario no puede ser negativo.");

  const { error } = await supabaseClient
    .from("productos_insumos")
    .update({
      stock_minimo: stockMinimo,
      unidad_default: unidadDefault,
      consumo_promedio_diario: consumoPromedioDiario,
      critico: form.elements.critico.checked
    })
    .eq("id", productId);

  if (error) throw error;
}

async function toggleProductActive() {
  requireAdminAction();
  if (state.usingFallback) throw new Error("No se puede pausar producto mientras Supabase esta en modo respaldo.");

  const productId = elements.productSettingsForm.elements.producto_id.value;
  const product = findProductById(productId);
  if (!product) throw new Error("Producto no encontrado.");
  const nextActive = product.activo === false;
  const confirmed = await showModalConfirm({
    title: `${nextActive ? "Reactivar" : "Pausar"} "${product.nombre}"`,
    message: "",
    confirmText: nextActive ? "Reactivar" : "Pausar",
    cancelText: "Cancelar",
    variant: nextActive ? "success" : "warning"
  });
  if (!confirmed) return;

  const { error } = await supabaseClient
    .from("productos_insumos")
    .update({ activo: nextActive })
    .eq("id", productId);

  if (error) throw error;
  closeProductSettingsModal();
  showToastSuccess(nextActive ? "Producto reactivado." : "Producto pausado.");
  await refreshInventory();
}

function exportBackupCsv() {
  downloadCsv("jesunutri_backup_inventario.csv", getExportRows("inventario"));
  downloadCsv("jesunutri_backup_productos.csv", state.products.map((product) => ({
    id: product.id,
    nombre: product.nombre,
    nombre_normalizado: product.nombre_normalizado,
    unidad_default: product.unidad_default,
    stock_minimo: product.stock_minimo,
    consumo_promedio_diario: product.consumo_promedio_diario || 0,
    critico: product.critico ? "si" : "no",
    favorito: product.favorito ? "si" : "no",
    activo: product.activo === false ? "no" : "si"
  })));
  downloadCsv("jesunutri_backup_movimientos.csv", getExportRows("historial"));
  downloadCsv("jesunutri_backup_criticos.csv", getExportRows("criticos"));
  showToastSuccess("Backup CSV generado.");
}

function createBulkInput(name, type = "text", value = "") {
  const input = document.createElement(type === "select" ? "select" : "input");
  input.dataset.field = name;
  input.className = "bulk-input";

  if (type === "checkbox") {
    input.type = "checkbox";
    input.className = "bulk-checkbox";
    input.checked = value === true || value === "true" || value === "1" || normalize(value || "") === "si";
    return input;
  }

  if (type === "select") {
    UNIT_OPTIONS.forEach((unit) => {
      const option = document.createElement("option");
      option.value = unit;
      option.textContent = unit;
      input.appendChild(option);
    });
    input.value = value || "kg";
    return input;
  }

  input.type = type;
  input.value = value;
  if (name === "lote") {
    input.value = normalizeLotValue(String(value || ""));
    bindLotUppercase(input);
  }
  if (name === "nombre") {
    input.setAttribute("list", "productSuggestions");
    input.autocomplete = "off";
  }
  if (name === "cantidad") {
    input.min = "0.001";
    input.step = "0.001";
  }
  return input;
}

function openBulkModal() {
  elements.bulkModal.hidden = false;
  resetPosSession("bulk");
  requestAnimationFrame(() => elements.bulkProductForm.elements.nombre.focus());
}

function closeBulkModal() {
  elements.bulkModal.hidden = true;
}

function parseDelimitedText(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeLegacyHeader(header) {
  return normalize(header.replace(/^\ufeff/, "")).replaceAll(" ", "_");
}

function buildLegacyObservation(row) {
  const parts = [];
  if (row.observaciones) parts.push(row.observaciones.trim());
  if (row.estado) parts.push(`Estado version antigua: ${row.estado.trim()}`);
  return parts.filter(Boolean).join("\n") || null;
}

function legacyInventoryRowToPayload(row, index) {
  const nombre = (row.producto || row.nombre || "").trim();
  const cantidad = Number(String(row.cantidad || "").replace(",", "."));
  const unidad = (row.unidad || "kg").trim().toLowerCase();
  const fechaRecepcion = parseDateInput(row.fecha_recepcion || "") || formatIsoDate(new Date());
  const fechaVencimiento = row.fecha_vencimiento ? parseDateInput(row.fecha_vencimiento) : null;
  const lote = normalizeLotValue(row.lote || "");
  const errors = [];

  if (!nombre) errors.push("producto obligatorio");
  if (!cantidad || cantidad <= 0) errors.push("cantidad debe ser mayor que cero");
  if (!UNIT_OPTIONS.includes(unidad)) errors.push(`unidad invalida (${unidad || "vacia"})`);
  if (!isValidIsoDate(fechaRecepcion)) errors.push("fecha recepcion invalida");
  if (fechaVencimiento && !isValidIsoDate(fechaVencimiento)) errors.push("fecha vencimiento invalida");
  if (!lote) errors.push("lote obligatorio");

  if (errors.length) {
    throw new Error(`Fila ${index + 2}: ${errors.join(", ")}`);
  }

  return {
    nombre,
    nombreNormalizado: normalize(nombre),
    cantidad,
    unidad,
    fechaRecepcion,
    fechaVencimiento,
    critico: false,
    lote,
    observaciones: buildLegacyObservation(row)
  };
}

function parseLegacyInventoryCsv(text) {
  const table = parseDelimitedText(text, ";");
  if (table.length < 2) throw new Error("El CSV no tiene filas para importar.");

  const headers = table[0].map(normalizeLegacyHeader);
  const required = ["producto", "cantidad", "unidad", "fecha_recepcion", "fecha_vencimiento", "lote"];
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Faltan columnas del CSV antiguo: ${missing.join(", ")}.`);

  return table.slice(1).map((cells, rowIndex) => {
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = (cells[cellIndex] || "").trim();
    });
    return legacyInventoryRowToPayload(row, rowIndex);
  });
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer el archivo."));
    reader.readAsText(file, "utf-8");
  });
}

async function importLegacyInventoryFile(file) {
  if (!file) return;
  elements.bulkErrorList.hidden = true;
  elements.bulkErrorList.innerHTML = "";

  try {
    const text = await readTextFile(file);
    const rows = parseLegacyInventoryCsv(text);
    if (!rows.length) throw new Error("No se encontraron productos en el CSV.");
    state.bulkSessionRows = rows;
    state.bulkEditingIndex = null;

    const receiptDates = [...new Set(rows.map((row) => row.fechaRecepcion).filter(Boolean))];
    if (receiptDates.length === 1) {
      elements.bulkReceiptDate.value = receiptDates[0];
      elements.bulkReceiptDisplay.textContent = formatReceiptDisplay(receiptDates[0]);
    }

    elements.bulkProductsSummary.open = true;
    clearPosForm(elements.bulkProductForm);
    renderPosSession("bulk");
    showToastSuccess(`CSV antiguo cargado: ${rows.length} productos.`);
  } catch (error) {
    elements.bulkErrorList.hidden = false;
    elements.bulkErrorList.innerHTML = `<div>${escapeHtml(error.message)}</div>`;
  } finally {
    elements.legacyInventoryFile.value = "";
  }
}

function isBulkRowEmpty(row) {
  return BULK_COLUMNS
    .filter((column) => column !== "critico")
    .every((column) => !row[column].trim());
}

function pasteExcelDataForTable(event, tableBody) {
  const target = event.target.closest(".bulk-input");
  if (!target) return;
  const text = event.clipboardData.getData("text");
  if (!text.includes("\t") && !text.includes("\n")) return;
  event.preventDefault();

  const rows = text.trimEnd().split(/\r?\n/).map((line) => line.split("\t"));
  const startCell = target.closest("td");
  const startRow = target.closest("tr");
  const startRowIndex = [...tableBody.children].indexOf(startRow);
  const startColumnIndex = [...startRow.children].filter((cell) => !cell.classList.contains("bulk-month-cell")).indexOf(startCell);

  rows.forEach((cells, rowOffset) => {
    while (tableBody.children.length <= startRowIndex + rowOffset) addPendingRow(tableBody);
    const row = tableBody.children[startRowIndex + rowOffset];
    cells.forEach((cellValue, columnOffset) => {
      const columnName = BULK_COLUMNS[startColumnIndex + columnOffset];
      if (!columnName) return;
      const input = row.querySelector(`[data-field="${columnName}"]`);
      if (!input) return;
      if (input.type === "checkbox") {
        input.checked = ["si", "sí", "true", "1", "x"].includes(normalize(cellValue));
      } else {
        input.value = columnName.startsWith("fecha")
          ? parseDateInput(cellValue) || ""
          : columnName === "lote"
            ? normalizeLotValue(cellValue)
            : cellValue.trim();
      }
      if (columnName === "nombre") maybeAutofillUnit(input, row.querySelector('[data-field="unidad"]'));
      if (columnName === "fecha_vencimiento") row.querySelector(".bulk-month-cell").innerHTML = renderMonthBadge(input.value);
    });
  });
}

function addPendingRow(tableBody, values = {}, focusFirst = false, removable = false) {
  const tr = document.createElement("tr");
  BULK_COLUMNS.forEach((column) => {
    const td = document.createElement("td");
    const type = column === "cantidad" ? "number" : column === "unidad" ? "select" : column === "critico" ? "checkbox" : column.startsWith("fecha") ? "date" : "text";
    td.appendChild(createBulkInput(column, type, values[column] ?? ""));
    tr.appendChild(td);
    if (column === "fecha_vencimiento") {
      const monthTd = document.createElement("td");
      monthTd.className = "bulk-month-cell";
      monthTd.innerHTML = values.fecha_vencimiento ? renderMonthBadge(values.fecha_vencimiento) : "";
      tr.appendChild(monthTd);
    }
  });

  if (removable) {
    const actionTd = document.createElement("td");
    actionTd.innerHTML = '<button class="btn small danger-btn remove-row-btn" type="button" data-remove-pending-row>Quitar</button>';
    tr.appendChild(actionTd);
  }

  tableBody.appendChild(tr);
  if (focusFirst) tr.querySelector(".bulk-input")?.focus();
  return tr;
}

function setupOperatorEntryTable() {
  resetPosSession("operator");
}

function getPendingRows(tableBody) {
  return [...tableBody.querySelectorAll("tr")].map((tr) => {
    const row = {};
    BULK_COLUMNS.forEach((column) => {
      const input = tr.querySelector(`[data-field="${column}"]`);
      row[column] = input?.type === "checkbox" ? input.checked : input?.value || "";
    });
    return { tr, row };
  });
}

function validatePendingTableRows(tableBody, errorList, receiptDate = formatIsoDate(new Date())) {
  const rows = getPendingRows(tableBody).filter(({ row }) => !isBulkRowEmpty(row));
  const results = rows.map(({ tr, row }, index) => {
    const errors = [];
    const nombre = row.nombre.trim();
    const cantidad = Number(row.cantidad);
    const unidad = row.unidad.trim() || "kg";
    const fechaVencimiento = row.fecha_vencimiento.trim() ? parseDateInput(row.fecha_vencimiento) : null;

    if (!nombre) errors.push("producto obligatorio");
    if (!cantidad || cantidad <= 0) errors.push("cantidad debe ser mayor que cero");
    if (!UNIT_OPTIONS.includes(unidad)) errors.push("unidad invalida");
    if (!isValidIsoDate(receiptDate)) errors.push("fecha recepcion invalida");
    if (fechaVencimiento && !isValidIsoDate(fechaVencimiento)) errors.push("fecha vencimiento invalida");

    return {
      tr,
      index: index + 1,
      valid: errors.length === 0,
      errors,
      payload: {
        nombre,
        nombreNormalizado: normalize(nombre),
        cantidad,
        unidad,
        fechaRecepcion: receiptDate,
        fechaVencimiento,
        critico: Boolean(row.critico),
        lote: normalizeLotValue(row.lote) || null,
        observaciones: row.observaciones.trim() || null
      }
    };
  });

  const messages = [];
  results.forEach((result) => {
    result.tr.classList.toggle("row-invalid", !result.valid);
    if (!result.valid) messages.push(`Fila ${result.index}: ${result.errors.join(", ")}`);
  });
  errorList.hidden = messages.length === 0;
  errorList.innerHTML = messages.map((message) => `<div>${escapeHtml(message)}</div>`).join("");
  return results;
}

async function createPendingEntryFromOperator() {
  if (state.currentUser?.rol !== "operador") throw new Error("Solo operadores pueden enviar ingresos pendientes desde esta vista.");
  const receiptDate = elements.operatorReceiptDate.value || formatIsoDate(new Date());
  const validRows = state.operatorSessionRows;
  if (!validRows.length) throw new Error("Agrega al menos un producto.");

  const { data: pending, error: pendingError } = await supabaseClient
    .from("ingresos_pendientes")
    .insert({
      creado_por: state.currentUser.id,
      creado_por_email: state.currentUser.email,
      creado_por_nombre: state.currentUser.nombre,
      fecha_recepcion: receiptDate,
      observacion_general: null,
      estado: "pendiente"
    })
    .select("id")
    .single();

  if (pendingError) throw pendingError;

  const detailRows = validRows.map((payload) => ({
    ingreso_pendiente_id: pending.id,
    nombre: payload.nombre,
    nombre_normalizado: payload.nombreNormalizado,
    cantidad: payload.cantidad,
    unidad: payload.unidad,
    fecha_vencimiento: payload.fechaVencimiento,
    lote: payload.lote,
    critico: payload.critico,
    observaciones: payload.observaciones
  }));

  const { error: detailError } = await supabaseClient
    .from("ingresos_pendientes_detalle")
    .insert(detailRows);

  if (detailError) throw detailError;
}

async function fetchPendingEntries(scope = "operator") {
  let query = supabaseClient
    .from("ingresos_pendientes")
    .select("*")
    .order("created_at", { ascending: false });

  if (scope === "operator") query = query.eq("creado_por", state.currentUser.id);

  const { data, error } = await query;
  if (error) throw error;

  const ids = (data || []).map((entry) => entry.id);
  let details = [];
  if (ids.length) {
    const { data: detailData, error: detailError } = await supabaseClient
      .from("ingresos_pendientes_detalle")
      .select("*")
      .in("ingreso_pendiente_id", ids)
      .order("created_at", { ascending: true });
    if (detailError) throw detailError;
    details = detailData || [];
  }

  return (data || []).map((entry) => ({
    ...entry,
    detalles: details.filter((detail) => detail.ingreso_pendiente_id === entry.id)
  }));
}

async function loadOperatorPendingEntries() {
  state.pendingEntries = await fetchPendingEntries("operator");
  renderOperatorPendingEntries();
}

async function loadAdminPendingEntries() {
  state.pendingEntries = await fetchPendingEntries("admin");
}

function renderOperatorPendingEntries() {
  if (!state.pendingEntries.length) {
    elements.operatorNotice.hidden = true;
    elements.operatorNotice.textContent = "";
    elements.operatorPendingList.innerHTML = '<div class="empty compact-empty">Aun no hay ingresos enviados.</div>';
    return;
  }

  const changedEntries = state.pendingEntries.filter((entry) => entry.estado === "aprobado" || entry.estado === "rechazado");
  if (changedEntries.length) {
    const last = changedEntries[0];
    const label = last.estado === "aprobado" ? "aprobado" : "rechazado";
    elements.operatorNotice.textContent = `Tu ingreso del ${formatDateTime(last.created_at)} fue ${label}.`;
    elements.operatorNotice.className = `internal-notice operator-notice ${last.estado}`;
    elements.operatorNotice.hidden = false;
  } else {
    elements.operatorNotice.hidden = true;
    elements.operatorNotice.textContent = "";
  }

  elements.operatorPendingList.innerHTML = state.pendingEntries
    .map((entry) => `
      <details class="operator-pending-card ${entry.estado}">
        <summary>
          <div>
            <strong>Enviado: ${formatDateTime(entry.created_at)}</strong>
            <span>Recepcion: ${formatDisplayDate(entry.fecha_recepcion)} - ${entry.detalles.length} productos</span>
            ${entry.aprobado_por_email ? `<span>Aprobado por: ${escapeHtml(entry.aprobado_por_email)}</span>` : ""}
            ${entry.rechazado_por_email ? `<span>Rechazado por: ${escapeHtml(entry.rechazado_por_email)}</span>` : ""}
            ${entry.motivo_rechazo ? `<em>${escapeHtml(entry.motivo_rechazo)}</em>` : ""}
          </div>
          <span class="pending-status ${entry.estado}">${escapeHtml(entry.estado)}</span>
          <span class="btn small view-detail-chip">Ver detalle</span>
        </summary>
        <div class="operator-pending-detail">
          ${entry.detalles.map((detail) => `
            <article>
              <strong>${escapeHtml(detail.nombre)}</strong>
              <span>${formatNumber(detail.cantidad)} ${escapeHtml(detail.unidad)} - vence ${formatDisplayDate(detail.fecha_vencimiento)}</span>
              <span>Lote: ${escapeHtml(detail.lote || "-")} ${detail.critico ? "- Critico" : ""}</span>
            </article>
          `).join("")}
        </div>
      </details>
    `)
    .join("");
}

function renderAdminPendingEntries() {
  const pending = state.pendingEntries.filter((entry) => entry.estado === "pendiente");
  elements.pendingCount.textContent = `${pending.length} pendientes`;
  if (pending.length) {
    elements.adminPendingNotice.textContent = `Tienes ${pending.length} ingresos pendientes por revisar.`;
    elements.adminPendingNotice.hidden = false;
  } else {
    elements.adminPendingNotice.hidden = true;
    elements.adminPendingNotice.textContent = "";
  }
  if (!state.pendingEntries.length) {
    elements.adminPendingList.innerHTML = '<div class="empty compact-empty">No hay ingresos pendientes.</div>';
    return;
  }

  elements.adminPendingList.innerHTML = state.pendingEntries
    .map((entry) => `
      <article class="pending-item">
        <div>
          <strong>${escapeHtml(entry.creado_por_nombre || entry.creado_por_email || "Operador")}</strong>
          <span>Recepcion: ${formatDisplayDate(entry.fecha_recepcion)} - ${entry.detalles.length} filas</span>
        </div>
        <span class="pending-status ${entry.estado}">${escapeHtml(entry.estado)}</span>
        <button class="btn small" type="button" data-review-pending="${entry.id}">Ver / Revisar</button>
      </article>
    `)
    .join("");
}

function openPendingReview(id) {
  const entry = state.pendingEntries.find((item) => item.id === id);
  if (!entry) return;
  state.currentReview = entry;
  elements.pendingReviewTitle.textContent = "Ingreso pendiente";
  elements.pendingReviewMeta.textContent = `${entry.creado_por_nombre || entry.creado_por_email || "Operador"} - Recepcion ${formatDisplayDate(entry.fecha_recepcion)}`;
  elements.pendingReviewErrorList.hidden = true;
  elements.pendingReviewErrorList.innerHTML = "";
  elements.pendingRejectReason.value = "";
  elements.pendingReviewTableBody.innerHTML = "";
  entry.detalles.forEach((detail) => addPendingRow(elements.pendingReviewTableBody, {
    nombre: detail.nombre,
    cantidad: detail.cantidad,
    unidad: detail.unidad,
    fecha_vencimiento: detail.fecha_vencimiento || "",
    lote: detail.lote || "",
    critico: detail.critico,
    observaciones: detail.observaciones || ""
  }, false, true));
  elements.pendingReviewModal.hidden = false;
}

function closePendingReviewModal() {
  elements.pendingReviewModal.hidden = true;
  state.currentReview = null;
}

async function approveCurrentPending() {
  requireAdminAction();
  if (!state.currentReview) throw new Error("No hay ingreso pendiente seleccionado.");
  const results = validatePendingTableRows(elements.pendingReviewTableBody, elements.pendingReviewErrorList, state.currentReview.fecha_recepcion);
  const validRows = results.filter((result) => result.valid);
  if (!validRows.length) throw new Error("No hay filas validas para aprobar.");

  for (const row of validRows) {
    await createEntry({
      ...row.payload,
      observaciones: [row.payload.observaciones, "Aprobado desde ingreso pendiente"].filter(Boolean).join(" | ")
    });
  }

  const { error } = await supabaseClient
    .from("ingresos_pendientes")
    .update({
      estado: "aprobado",
      aprobado_por: state.currentUser.id,
      aprobado_por_email: state.currentUser.email,
      aprobado_at: new Date().toISOString()
    })
    .eq("id", state.currentReview.id);

  if (error) throw error;
}

async function rejectCurrentPending() {
  requireAdminAction();
  if (!state.currentReview) throw new Error("No hay ingreso pendiente seleccionado.");
  const reason = elements.pendingRejectReason.value.trim();
  if (!reason) throw new Error("Debes indicar motivo de rechazo.");

  const { error } = await supabaseClient
    .from("ingresos_pendientes")
    .update({
      estado: "rechazado",
      rechazado_por: state.currentUser.id,
      rechazado_por_email: state.currentUser.email,
      rechazado_at: new Date().toISOString(),
      motivo_rechazo: reason
    })
    .eq("id", state.currentReview.id);

  if (error) throw error;
}

async function markAlertReviewed(id) {
  requireAdminAction();
  if (state.usingFallback) {
    const item = state.inventory.find((entry) => String(entry.id) === String(id));
    if (item) item.revisada = true;
    render();
    showToastSuccess("Alerta revisada en modo mock. El inventario no fue modificado.");
    return;
  }

  const { error } = await supabaseClient
    .from("insumo_lotes")
    .update({ alerta_vencimiento_revisada: true })
    .eq("id", id);

  if (error) {
    showError("No se pudo marcar la alerta como revisada", error);
    return;
  }

  await refreshInventory();
  showToastSuccess("Cambios actualizados.");
}

function getDetailItems(type) {
  if (type === "total") return state.inventory;
  if (type === "soon") return state.inventory.filter((item) => ["hoy", "proximo"].includes(getStatus(item).key));
  if (type === "expired") return state.inventory.filter((item) => getStatus(item).key === "vencido");
  if (type === "lowstock") return getLowStockDetailItems();
  return [];
}

function openDetailModal(type) {
  const titles = {
    total: "Total insumos",
    soon: "Proximos a vencer",
    expired: "Vencidos",
    lowstock: "Bajo stock"
  };
  const items = getDetailItems(type);
  elements.detailModalTitle.textContent = titles[type] || "Detalle";
  elements.detailTableBody.innerHTML = items.length
    ? items.map((item) => {
        const status = item.statusOverride || getStatus(item);
        return `
          <tr>
            <td><strong>${escapeHtml(item.nombre)}</strong></td>
            <td>${item.cantidad}</td>
            <td>${escapeHtml(item.unidad)}</td>
            <td>${formatDisplayDate(item.fechaVencimiento)}</td>
            <td>${renderMonthBadge(item.fechaVencimiento)}</td>
            <td>${formatDays(status.days)}</td>
            <td>${escapeHtml(item.lote || "-")}</td>
            <td>${escapeHtml(item.observaciones || "-")}</td>
            <td><span class="status ${status.key}">${status.label}</span></td>
          </tr>
        `;
      }).join("")
    : '<tr><td colspan="9" class="empty">No hay datos para este filtro.</td></tr>';
  elements.detailModal.hidden = false;
}

function closeDetailModal() {
  elements.detailModal.hidden = true;
}

elements.searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderInventory();
});

document.addEventListener("click", (event) => {
  const reviewButton = event.target.closest("[data-review-id]");
  if (reviewButton) {
    markAlertReviewed(reviewButton.dataset.reviewId);
    return;
  }

  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const item = state.inventory.find((entry) => String(entry.id) === String(editButton.dataset.editId));
    if (item) openEditModal(item);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (deleteButton) {
    deleteEntry(deleteButton.dataset.deleteId);
    return;
  }

  const settingsButton = event.target.closest("[data-settings-product]");
  if (settingsButton) {
    openProductSettings(settingsButton.dataset.settingsProduct);
    return;
  }

  const reviewPendingButton = event.target.closest("[data-review-pending]");
  if (reviewPendingButton) {
    openPendingReview(reviewPendingButton.dataset.reviewPending);
    return;
  }

  const removePendingRowButton = event.target.closest("[data-remove-pending-row]");
  if (removePendingRowButton) {
    removePendingRowButton.closest("tr")?.remove();
    return;
  }

  const posEditButton = event.target.closest("[data-pos-edit]");
  if (posEditButton) {
    editPosRow(posEditButton.dataset.posEdit, Number(posEditButton.dataset.index));
    return;
  }

  const posDeleteButton = event.target.closest("[data-pos-delete]");
  if (posDeleteButton) {
    deletePosRow(posDeleteButton.dataset.posDelete, Number(posDeleteButton.dataset.index));
    return;
  }

  const posItem = event.target.closest("[data-pos-item]");
  if (posItem && !event.target.closest("button")) {
    editPosRow(posItem.dataset.posItem, Number(posItem.dataset.index));
    return;
  }

  const detailButton = event.target.closest("[data-detail]");
  if (detailButton) openDetailModal(detailButton.dataset.detail);
});

elements.systemModalCancel.addEventListener("click", () => closeSystemModal(false));
elements.systemModalConfirm.addEventListener("click", () => closeSystemModal(true));
elements.systemModal.addEventListener("click", (event) => {
  if (event.target === elements.systemModal) closeSystemModal(false);
});
document.addEventListener("keydown", handleSystemModalKeydown);

document.getElementById("closeEntryModal").addEventListener("click", closeEntryModal);
document.getElementById("cancelEntry").addEventListener("click", closeEntryModal);
elements.entryModal.addEventListener("click", (event) => {
  if (event.target === elements.entryModal) closeEntryModal();
});

document.getElementById("useStockBtn").addEventListener("click", () => openUseModal());
document.getElementById("closeUseModal").addEventListener("click", closeUseModal);
document.getElementById("cancelUse").addEventListener("click", closeUseModal);
elements.useModal.addEventListener("click", (event) => {
  if (event.target === elements.useModal) closeUseModal();
});
elements.useForm.elements.nombre.addEventListener("input", () => {
  maybeAutofillUnit(elements.useForm.elements.nombre, elements.useForm.elements.unidad);
  updateUseSummary();
});
elements.useForm.elements.cantidad.addEventListener("input", updateUseSummary);
elements.useForm.elements.unidad.addEventListener("change", updateUseSummary);
elements.useForm.elements.usar_lote_especifico.addEventListener("change", updateUseSummary);
elements.useForm.elements.lote_especifico.addEventListener("change", updateUseSummary);
elements.useForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  elements.confirmUseBtn.disabled = true;
  elements.confirmUseBtn.textContent = "Registrando...";
  try {
    await registerUse();
    closeUseModal();
    showToastSuccess("Uso registrado.");
    await refreshInventory();
  } catch (error) {
    showError("No se pudo registrar el uso", error);
  } finally {
    elements.confirmUseBtn.disabled = false;
    elements.confirmUseBtn.textContent = "Confirmar uso";
  }
});

elements.entryForm.elements.nombre.addEventListener("input", () => {
  maybeAutofillUnit(elements.entryForm.elements.nombre, elements.entryForm.elements.unidad);
});
elements.entryForm.elements.fecha_vencimiento.addEventListener("input", (event) => {
  setMonthPreview(elements.entryMonthPreview, event.target.value);
});
elements.entryForm.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
    const fields = [...elements.entryForm.querySelectorAll("input, select, textarea, button")].filter((field) => !field.disabled && field.type !== "hidden");
    const index = fields.indexOf(event.target);
    if (index >= 0 && index < fields.length - 1) {
      event.preventDefault();
      fields[index + 1].focus();
    }
  }
});
elements.entryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  elements.saveEntryBtn.disabled = true;
  elements.saveEntryBtn.textContent = "Guardando...";
  try {
    await createEntry(getFormPayload(elements.entryForm));
    closeEntryModal();
    showToastSuccess("Guardadito.");
    await refreshInventory();
  } catch (error) {
    showError("No se pudo guardar el ingreso", error);
  } finally {
    elements.saveEntryBtn.disabled = false;
    elements.saveEntryBtn.textContent = "Guardar ingreso";
  }
});

document.getElementById("closeEditModal").addEventListener("click", closeEditModal);
document.getElementById("cancelEdit").addEventListener("click", closeEditModal);
elements.editModal.addEventListener("click", (event) => {
  if (event.target === elements.editModal) closeEditModal();
});
elements.editForm.elements.fecha_vencimiento.addEventListener("input", (event) => {
  setMonthPreview(elements.editMonthPreview, event.target.value);
});
elements.editForm.elements.nombre.addEventListener("input", () => {
  maybeAutofillUnit(elements.editForm.elements.nombre, elements.editForm.elements.unidad);
});
elements.editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  elements.saveEditBtn.disabled = true;
  elements.saveEditBtn.textContent = "Guardando...";
  try {
    await updateEntry(elements.editForm);
    closeEditModal();
    showToastSuccess("Guardadito.");
    await refreshInventory();
  } catch (error) {
    showError("No se pudo editar el ingreso", error);
  } finally {
    elements.saveEditBtn.disabled = false;
    elements.saveEditBtn.textContent = "Guardar cambios";
  }
});

document.getElementById("bulkEntryBtn").addEventListener("click", openBulkModal);
document.getElementById("cancelBulk").addEventListener("click", closeBulkModal);
elements.legacyInventoryFile.addEventListener("change", (event) => {
  importLegacyInventoryFile(event.target.files?.[0]);
});
elements.bulkProductForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addOrUpdatePosRow("bulk");
});
elements.saveBulkBtn.addEventListener("click", async () => {
  clearError();
  const validRows = state.bulkSessionRows;
  if (!validRows.length) {
    elements.bulkErrorList.hidden = false;
    elements.bulkErrorList.innerHTML = "<div>Agrega al menos un producto antes de guardar.</div>";
    return;
  }

  elements.saveBulkBtn.disabled = true;
  elements.saveBulkBtn.textContent = "Guardando...";
  let saved = 0;
  const saveErrors = [];

  for (const payload of validRows) {
    try {
      await createEntry(payload);
      saved += 1;
    } catch (error) {
      saveErrors.push(`${payload.nombre}: ${getSupabaseErrorMessage(error)}`);
    }
  }

  if (saveErrors.length) {
    elements.bulkErrorList.hidden = false;
    elements.bulkErrorList.innerHTML = saveErrors.map((message) => `<div>${escapeHtml(message)}</div>`).join("");
    showError("Algunas filas no se pudieron guardar", { message: saveErrors.join(" | ") });
  }
  if (saved > 0) {
    showToastSuccess("Guardadito.");
    await refreshInventory();
  }
  if (saved === validRows.length) closeBulkModal();
  elements.saveBulkBtn.disabled = false;
  elements.saveBulkBtn.textContent = "Guardar ingreso";
});

document.getElementById("closeDetailModal").addEventListener("click", closeDetailModal);
elements.detailModal.addEventListener("click", (event) => {
  if (event.target === elements.detailModal) closeDetailModal();
});

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearLoginError();
  elements.loginBtn.disabled = true;
  elements.loginBtn.textContent = "Ingresando...";

  const formData = new FormData(elements.loginForm);
  const email = formData.get("email").trim();
  const password = formData.get("password");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data?.session) throw new Error("Supabase no devolvio una sesion activa.");
    await startAuthenticatedApp(data.session);
    elements.loginForm.reset();
  } catch (error) {
    const message = getSupabaseErrorMessage(error);
    const isCredentialError = /invalid login credentials|email not confirmed|invalid credentials/i.test(message);
    showLoginError(isCredentialError ? "Email o password incorrecto." : `No se pudo ingresar: ${message}`);
  } finally {
    elements.loginBtn.disabled = false;
    elements.loginBtn.textContent = "Ingresar";
  }
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});
document.getElementById("operatorLogoutBtn").addEventListener("click", async () => {
  await supabaseClient.auth.signOut();
  showLogin();
});

elements.operatorProductForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addOrUpdatePosRow("operator");
});
document.getElementById("operatorCancelEntry").addEventListener("click", () => {
  resetPosSession("operator");
});
elements.sendPendingBtn.addEventListener("click", async () => {
  elements.sendPendingBtn.disabled = true;
  elements.sendPendingBtn.textContent = "Enviando...";
  try {
    await createPendingEntryFromOperator();
    setupOperatorEntryTable();
    await loadOperatorPendingEntries();
    showToastSuccess("Ingreso enviado a revision.");
  } catch (error) {
    elements.operatorBulkErrorList.hidden = false;
    elements.operatorBulkErrorList.innerHTML = `<div>${escapeHtml(getSupabaseErrorMessage(error))}</div>`;
    showToastError("No se pudo enviar ingreso pendiente.");
  } finally {
    elements.sendPendingBtn.disabled = false;
    elements.sendPendingBtn.textContent = "Enviar a revision";
  }
});

document.getElementById("adjustStockBtn").addEventListener("click", () => openAdjustModal());
document.getElementById("closeAdjustModal").addEventListener("click", closeAdjustModal);
document.getElementById("cancelAdjust").addEventListener("click", closeAdjustModal);
elements.adjustModal.addEventListener("click", (event) => {
  if (event.target === elements.adjustModal) closeAdjustModal();
});
elements.adjustForm.elements.nombre.addEventListener("input", () => {
  maybeAutofillUnit(elements.adjustForm.elements.nombre, elements.adjustForm.elements.unidad);
  renderAdjustLots();
});
elements.adjustForm.elements.unidad.addEventListener("change", renderAdjustLots);
elements.adjustLotSelect.addEventListener("change", updateAdjustSystemStock);
elements.adjustForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  elements.saveAdjustBtn.disabled = true;
  elements.saveAdjustBtn.textContent = "Guardando...";
  try {
    await registerAdjustment();
    closeAdjustModal();
    showToastSuccess("Ajustadito.");
    await refreshInventory();
  } catch (error) {
    showError("No se pudo guardar el ajuste", error);
  } finally {
    elements.saveAdjustBtn.disabled = false;
    elements.saveAdjustBtn.textContent = "Guardar ajuste";
  }
});

document.getElementById("closePendingReviewModal").addEventListener("click", closePendingReviewModal);
document.getElementById("cancelPendingReview").addEventListener("click", closePendingReviewModal);
elements.pendingReviewModal.addEventListener("click", (event) => {
  if (event.target === elements.pendingReviewModal) closePendingReviewModal();
});
document.getElementById("addPendingReviewRow").addEventListener("click", () => addPendingRow(elements.pendingReviewTableBody, {}, true, true));
elements.pendingReviewTableBody.addEventListener("input", (event) => {
  const input = event.target.closest(".bulk-input");
  if (!input) return;
  const row = input.closest("tr");
  if (input.dataset.field === "nombre") maybeAutofillUnit(input, row.querySelector('[data-field="unidad"]'));
  if (input.dataset.field === "fecha_vencimiento") row.querySelector(".bulk-month-cell").innerHTML = renderMonthBadge(input.value);
});
elements.pendingReviewTableBody.addEventListener("paste", (event) => pasteExcelDataForTable(event, elements.pendingReviewTableBody));
elements.approvePendingBtn.addEventListener("click", async () => {
  elements.approvePendingBtn.disabled = true;
  elements.approvePendingBtn.textContent = "Aprobando...";
  try {
    await approveCurrentPending();
    closePendingReviewModal();
    await refreshInventory();
    await loadAdminPendingEntries();
    renderAdminPendingEntries();
    showToastSuccess("Ingreso aprobado.");
  } catch (error) {
    showError("No se pudo aprobar ingreso", error);
  } finally {
    elements.approvePendingBtn.disabled = false;
    elements.approvePendingBtn.textContent = "Aprobar ingreso";
  }
});
elements.rejectPendingBtn.addEventListener("click", async () => {
  elements.rejectPendingBtn.disabled = true;
  elements.rejectPendingBtn.textContent = "Rechazando...";
  try {
    await rejectCurrentPending();
    closePendingReviewModal();
    await loadAdminPendingEntries();
    renderAdminPendingEntries();
    showToastSuccess("Ingreso rechazado.");
  } catch (error) {
    showError("No se pudo rechazar ingreso", error);
  } finally {
    elements.rejectPendingBtn.disabled = false;
    elements.rejectPendingBtn.textContent = "Rechazar";
  }
});

setupDateAutoAdvance(elements.bulkProductForm);
setupDateAutoAdvance(elements.operatorProductForm);
[elements.entryForm, elements.editForm, elements.bulkProductForm, elements.operatorProductForm].forEach((form) => {
  bindLotUppercase(form.elements.lote);
});
[elements.bulkProductForm, elements.operatorProductForm].forEach((form) => {
  setupUnitKeyboard(form);
  setupCriticalKeyboard(form);
  form.querySelector(".optional-note summary")?.setAttribute("tabindex", "-1");
  form.elements.observaciones.tabIndex = -1;
  form.elements.gramos.addEventListener("input", () => sanitizeGramsInput(form.elements.gramos));
});
elements.bulkProductForm.elements.nombre.addEventListener("input", () => {
  const product = findProductByName(elements.bulkProductForm.elements.nombre.value);
  if (product?.unidad_default) setSelectedPosUnit(elements.bulkProductForm, product.unidad_default);
});
elements.operatorProductForm.elements.nombre.addEventListener("input", () => {
  const product = findProductByName(elements.operatorProductForm.elements.nombre.value);
  if (product?.unidad_default) setSelectedPosUnit(elements.operatorProductForm, product.unidad_default);
});
[elements.bulkProductsChips, elements.operatorProductsChips].forEach((chipList) => {
  chipList?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
});

document.getElementById("exportBtn").addEventListener("click", openExportModal);
document.getElementById("closeExportModal").addEventListener("click", closeExportModal);
document.getElementById("cancelExport").addEventListener("click", closeExportModal);
elements.exportModal.addEventListener("click", (event) => {
  if (event.target === elements.exportModal) closeExportModal();
});
document.getElementById("confirmExportBtn").addEventListener("click", exportSelectedCsv);

document.getElementById("labelsBtn").addEventListener("click", openLabelsModal);
document.getElementById("closeLabelsModal").addEventListener("click", closeLabelsModal);
document.getElementById("cancelLabels").addEventListener("click", closeLabelsModal);
elements.labelsModal.addEventListener("click", (event) => {
  if (event.target === elements.labelsModal) closeLabelsModal();
});
elements.printLabelsBtn.addEventListener("click", printSelectedLabels);

document.getElementById("backupBtn").addEventListener("click", exportBackupCsv);
document.getElementById("criticalViewBtn").addEventListener("click", () => {
  elements.compactCriticalPanel.hidden = !elements.compactCriticalPanel.hidden;
});

document.getElementById("closeProductSettingsModal").addEventListener("click", closeProductSettingsModal);
document.getElementById("cancelProductSettings").addEventListener("click", closeProductSettingsModal);
elements.productSettingsModal.addEventListener("click", (event) => {
  if (event.target === elements.productSettingsModal) closeProductSettingsModal();
});
elements.pauseProductBtn.addEventListener("click", async () => {
  try {
    await toggleProductActive();
  } catch (error) {
    showError("No se pudo cambiar el estado del producto", error);
  }
});
elements.productSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  elements.saveProductSettingsBtn.disabled = true;
  elements.saveProductSettingsBtn.textContent = "Guardando...";
  try {
    await saveProductSettings();
    closeProductSettingsModal();
    showToastSuccess("Stock minimo actualizado.");
    await refreshInventory();
  } catch (error) {
    showError("No se pudo actualizar producto", error);
  } finally {
    elements.saveProductSettingsBtn.disabled = false;
    elements.saveProductSettingsBtn.textContent = "Guardar";
  }
});

[
  elements.historyProductFilter,
  elements.historyTypeFilter,
  elements.historyFromFilter,
  elements.historyToFilter
].forEach((filter) => {
  filter.addEventListener("input", renderHistory);
  filter.addEventListener("change", renderHistory);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  if (!isStandaloneMode()) elements.installAppBtn.hidden = false;
});

elements.installAppBtn.addEventListener("click", async () => {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  elements.installAppBtn.hidden = true;
});

window.addEventListener("appinstalled", () => {
  state.deferredInstallPrompt = null;
  document.body.classList.add("app-installed");
  elements.installAppBtn.hidden = true;
  elements.installHint.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then(() => console.log("Service Worker registrado"))
      .catch((error) => console.warn("No se pudo registrar Service Worker", error));
  });
}

updateInstallUi();
checkInitialSession();




