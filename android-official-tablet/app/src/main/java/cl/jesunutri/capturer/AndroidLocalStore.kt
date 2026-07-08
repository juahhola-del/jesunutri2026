package cl.jesunutri.capturer

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.os.Environment
import android.util.Base64
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import java.util.UUID
import java.util.concurrent.TimeUnit
import kotlin.math.max

class AndroidLocalStore(private val appContext: Context) :
    SQLiteOpenHelper(appContext, "jesunutri-tablet-local.db", null, 1) {

    private val http = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(45, TimeUnit.SECONDS)
        .build()

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            create table if not exists local_meta (
              key text primary key,
              value text not null
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            create table if not exists local_rows (
              table_name text not null,
              row_id text not null,
              payload_json text not null,
              updated_at text not null,
              primary key (table_name, row_id)
            )
            """.trimIndent()
        )
        db.execSQL("create index if not exists idx_local_rows_table on local_rows(table_name)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        onCreate(db)
    }

    fun install(): JSONObject {
        val db = writableDatabase
        db.beginTransaction()
        try {
            setMeta(db, "installed", "1")
            setMeta(db, "migration_version", MIGRATION_VERSION)
            setMeta(db, "latest_migration", MIGRATION_VERSION)
            setMeta(db, "installed_at", nowIso())
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return status(emptyList())
    }

    fun status(connectionUrls: List<String>): JSONObject {
        val db = readableDatabase
        val installed = getMeta(db, "installed") == "1"
        val importedAt = getMeta(db, "imported_at")
        val counts = JSONObject()
            .put("productos", countRows(db, "productos_insumos"))
            .put("lotes", countRows(db, "insumo_lotes"))
            .put("movimientos", countRows(db, "movimientos_inventario"))
            .put("tareas", countRows(db, "daily_tasks"))
            .put("ingresosPendientes", countRows(db, "ingresos_pendientes"))
            .put("productCodeLinks", countRows(db, "product_code_links"))
            .put("productLabelImages", countRows(db, "product_label_images"))
            .put("operatorScanSessions", countRows(db, "operator_scan_sessions"))
        return JSONObject()
            .put("ok", true)
            .put("mode", "android")
            .put("installed", installed)
            .put("status", if (installed) if (importedAt.isNullOrBlank()) "instalado" else "importado" else "pendiente")
            .put("migrationVersion", getMeta(db, "migration_version") ?: MIGRATION_VERSION)
            .put("latestMigration", MIGRATION_VERSION)
            .put("databasePath", appContext.getDatabasePath("jesunutri-tablet-local.db").absolutePath)
            .put("connectionUrls", toJsonArray(connectionUrls))
            .put("counts", counts)
            .put("importedAt", importedAt ?: JSONObject.NULL)
    }

    fun importFromSupabase(body: JSONObject, connectionUrls: List<String>): JSONObject {
        install()
        val supabaseUrl = body.optString("supabaseUrl").trim().trimEnd('/')
        val supabaseKey = body.optString("supabaseKey").trim()
        val accessToken = body.optString("accessToken").ifBlank { supabaseKey }
        val requestedTables = if (body.has("tables") && !body.isNull("tables")) {
            val input = body.optJSONArray("tables") ?: JSONArray()
            IMPORT_TABLES.filter { table -> (0 until input.length()).any { input.optString(it) == table } }
        } else {
            IMPORT_TABLES
        }
        val pageSize = body.optInt("pageSize", 1000).coerceIn(100, 1000)
        if (supabaseUrl.isBlank() || supabaseKey.isBlank()) {
            throw IllegalArgumentException("Faltan URL o anon key de Supabase.")
        }

        val summary = JSONArray()
        for (table in requestedTables) {
            val result = JSONObject()
                .put("table", table)
                .put("fetched", 0)
                .put("inserted", 0)
                .put("updated", 0)
                .put("duplicates", 0)
                .put("skipped", 0)
                .put("errors", JSONArray())
            try {
                val rows = fetchSupabaseRows(supabaseUrl, supabaseKey, accessToken, table, pageSize)
                val counts = upsertRows(table, rows)
                result.put("fetched", rows.length())
                result.put("inserted", counts.first)
                result.put("updated", counts.second)
            } catch (error: Exception) {
                result.getJSONArray("errors").put(JSONObject().put("message", error.message ?: "Error al importar."))
            }
            summary.put(result)
        }

        val totals = totals(summary)
        val importedEnough = totals.optInt("fetched", 0) > 0 || totals.optInt("errors", 0) == 0
        val db = writableDatabase
        if (importedEnough) setMeta(db, "imported_at", nowIso())
        return JSONObject()
            .put("ok", true)
            .put("status", if (importedEnough) "importado" else "error")
            .put("importedAt", getMeta(db, "imported_at"))
            .put("tables", summary)
            .put("totals", totals)
            .put("localStatus", status(connectionUrls))
    }

    fun inventorySnapshot(): JSONObject {
        val db = readableDatabase
        val products = tableRows(db, "productos_insumos")
            .filter { truthy(it.opt("activo"), true) && it.optString("deleted_at").isBlank() }
            .sortedBy { it.optString("nombre").lowercase(Locale.ROOT) }
        val inventory = availableInventoryRows(db)
        val lowStock = lowStockRows(db, inventory)
        val movements = tableRows(db, "movimientos_inventario")
            .sortedWith(compareByDescending<JSONObject> { it.optString("fecha_movimiento", it.optString("created_at")) })
            .take(300)
        return JSONObject()
            .put("ok", true)
            .put("source", "android")
            .put("products", toJsonArray(products))
            .put("inventory", toJsonArray(inventory))
            .put("lowStock", toJsonArray(lowStock))
            .put("movements", toJsonArray(movements))
    }

    fun queryTable(table: String, body: JSONObject): JSONObject {
        if (!ALLOWED_TABLES.contains(table) && !VIEW_TABLES.contains(table)) {
            throw IllegalArgumentException("Tabla local no permitida: $table")
        }
        if (VIEW_TABLES.contains(table) && body.optString("operation", "select") != "select") {
            throw IllegalArgumentException("Vista local de solo lectura: $table")
        }
        val db = writableDatabase
        val operation = body.optString("operation", "select")
        val rows = when (operation) {
            "select" -> selectRows(db, table, body)
            "insert" -> insertRows(db, table, payloads(body.opt("payload")))
            "upsert" -> upsertRowsForQuery(db, table, payloads(body.opt("payload")), body.optString("onConflict"))
            "update" -> updateRows(db, table, body.optJSONArray("filters") ?: JSONArray(), body.optJSONObject("payload") ?: JSONObject())
            "delete" -> deleteRows(db, table, body.optJSONArray("filters") ?: JSONArray())
            else -> throw IllegalArgumentException("Operacion local no soportada: $operation")
        }
        val data: Any? = when {
            body.optBoolean("single") || body.optBoolean("maybeSingle") -> rows.firstOrNull() ?: JSONObject.NULL
            else -> toJsonArray(rows)
        }
        return JSONObject().put("ok", true).put("data", data).put("count", rows.size)
    }

    fun createBackup(): JSONObject {
        val db = readableDatabase
        val tables = JSONObject()
        ALLOWED_TABLES.sorted().forEach { table ->
            tables.put(table, toJsonArray(tableRows(db, table)))
        }
        val payload = JSONObject()
            .put("ok", true)
            .put("format", "jesunutri-android-json-backup-v1")
            .put("createdAt", nowIso())
            .put("migrationVersion", getMeta(db, "migration_version") ?: MIGRATION_VERSION)
            .put("tables", tables)
        val dir = File(appContext.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: File(appContext.filesDir, "backups"), "jesunutri-backups")
            .apply { mkdirs() }
        val stamp = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss").format(java.time.LocalDateTime.now())
        val file = File(dir, "jesunutri-backup-$stamp.json")
        file.writeText(payload.toString(2), Charsets.UTF_8)
        return JSONObject()
            .put("ok", true)
            .put("status", "creado")
            .put("fileName", file.name)
            .put("path", file.absolutePath)
            .put("sizeBytes", file.length())
            .put("createdAt", payload.optString("createdAt"))
    }

    fun getProductCodeLinkByCode(code: String): JSONObject? {
        val normalized = normalizeCode(code)
        return tableRows(readableDatabase, "product_code_links")
            .firstOrNull { normalizeCode(it.optString("code_normalized")) == normalized && truthy(it.opt("is_active"), true) }
    }

    fun listProductCodeLinks(activeOnly: Boolean): JSONArray {
        val rows = tableRows(readableDatabase, "product_code_links")
            .filter { !activeOnly || truthy(it.opt("is_active"), true) }
            .sortedByDescending { it.optString("updated_at") }
        return toJsonArray(rows)
    }

    fun upsertProductCodeLink(body: JSONObject): JSONObject {
        val userId = body.optString("userId").ifBlank { "android-tablet" }
        val input = body.optJSONObject("link") ?: body
        val now = nowIso()
        val codeNormalized = normalizeCode(
            input.optString("codeNormalized")
                .ifBlank { input.optString("code_normalized") }
                .ifBlank { input.optString("gtin") }
                .ifBlank { input.optString("codeRaw") }
                .ifBlank { input.optString("code_raw") }
        )
        if (codeNormalized.isBlank()) throw IllegalArgumentException("El codigo detectado es obligatorio.")

        val db = writableDatabase
        db.beginTransaction()
        try {
            val existing = getProductCodeLinkByCode(codeNormalized)
            val id = existing?.optString("id")?.ifBlank { null } ?: uuid("pcl")
            val image = saveImageFromPayload(
                db = db,
                imageDataUrl = input.optString("labelImageDataUrl").ifBlank { input.optString("label_image_data_url") },
                productId = input.optString("productId").ifBlank { input.optString("product_id") },
                productCodeLinkId = id,
                createdBy = userId,
                notes = "Imagen aprendida desde tablet/capturador Android",
                ocrText = input.optString("labelTextOcr").ifBlank { input.optString("label_text_ocr") },
                metadata = input.optJSONObject("metadata") ?: JSONObject()
            )
            val row = JSONObject(existing?.toString() ?: "{}")
                .put("id", id)
                .put("product_id", input.optString("productId").ifBlank { input.optString("product_id") })
                .put("code_raw", input.optString("codeRaw").ifBlank { input.optString("code_raw").ifBlank { codeNormalized } })
                .put("code_normalized", codeNormalized)
                .put("code_type", input.optString("codeType").ifBlank { input.optString("code_type").ifBlank { "codigo" } })
                .put("gtin", input.optString("gtin").ifBlank { codeNormalized.takeIf { it.length in 8..14 } ?: "" })
                .put("barcode_format", input.optString("barcodeFormat").ifBlank { input.optString("barcode_format") })
                .put("gs1_payload_json", input.opt("gs1Payload") ?: input.opt("gs1_payload_json") ?: JSONObject())
                .put("detected_lot", input.optString("detectedLot").ifBlank { input.optString("detected_lot") })
                .put("detected_expiry", input.optString("detectedExpiry").ifBlank { input.optString("detected_expiry") })
                .put("detected_mfg_date", input.optString("detectedMfgDate").ifBlank { input.optString("detected_mfg_date") })
                .put("detected_quantity", nullableDouble(input, "detectedQuantity", "detected_quantity"))
                .put("package_type", input.optString("packageType").ifBlank { input.optString("package_type").ifBlank { "otro" } })
                .put("package_quantity", nullableDouble(input, "packageQuantity", "package_quantity"))
                .put("package_unit", input.optString("packageUnit").ifBlank { input.optString("package_unit") })
                .put("base_unit", input.optString("baseUnit").ifBlank { input.optString("base_unit") })
                .put("conversion_factor", nullableDouble(input, "conversionFactor", "conversion_factor"))
                .put("conversion_notes", input.optString("conversionNotes").ifBlank { input.optString("conversion_notes") })
                .put("label_text_ocr", input.optString("labelTextOcr").ifBlank { input.optString("label_text_ocr") })
                .put("label_image_id", image?.optString("id") ?: existing?.optString("label_image_id").orEmpty())
                .put("label_image_path", image?.optString("image_path") ?: existing?.optString("label_image_path").orEmpty())
                .put("source", input.optString("source").ifBlank { "android_mlkit_learning" })
                .put("confidence", input.optDouble("confidence", existing?.optDouble("confidence", 0.0) ?: 0.0))
                .put("created_by", existing?.optString("created_by").takeUnless { it.isNullOrBlank() } ?: userId)
                .put("updated_by", userId)
                .put("created_at", existing?.optString("created_at").takeUnless { it.isNullOrBlank() } ?: now)
                .put("updated_at", now)
                .put("last_seen_at", now)
                .put("scan_count", max(1, existing?.optInt("scan_count", 0)?.plus(1) ?: 1))
                .put("is_active", true)
            saveRow(db, "product_code_links", row)
            db.setTransactionSuccessful()
            return row
        } finally {
            db.endTransaction()
        }
    }

    fun saveScanSessionImage(body: JSONObject): JSONObject? {
        val userId = body.optString("userId").ifBlank { "android-capturer" }
        val image = body.optJSONObject("image") ?: body
        return saveImageFromPayload(
            db = writableDatabase,
            imageDataUrl = image.optString("imageDataUrl").ifBlank { image.optString("image_data_url") },
            productId = image.optString("productId").ifBlank { image.optString("product_id") },
            productCodeLinkId = image.optString("productCodeLinkId").ifBlank { image.optString("product_code_link_id") },
            createdBy = userId,
            notes = image.optString("notes"),
            ocrText = image.optString("ocrText").ifBlank { image.optString("ocr_text") },
            metadata = image.optJSONObject("metadata") ?: JSONObject()
        )
    }

    fun createInventoryEntry(body: JSONObject): JSONObject {
        val payload = body.optJSONObject("payload") ?: body
        val userId = body.optString("userId").ifBlank { payload.optString("user_id") }
        val db = writableDatabase
        db.beginTransaction()
        try {
            val product = findOrCreateProduct(db, payload)
            val lotId = uuid("lot")
            val now = nowIso()
            val lot = JSONObject()
                .put("id", lotId)
                .put("producto_id", product.optString("id"))
                .put("fecha_recepcion", payload.optString("fechaRecepcion").ifBlank { payload.optString("fecha_recepcion").ifBlank { LocalDate.now().toString() } })
                .put("fecha_vencimiento", payload.optString("fechaVencimiento").ifBlank { payload.optString("fecha_vencimiento") })
                .put("lote", payload.optString("lote"))
                .put("unidad", payload.optString("unidad").ifBlank { product.optString("unidad_default").ifBlank { "unidad" } })
                .put("observaciones", payload.optString("observaciones"))
                .put("alerta_vencimiento_revisada", false)
                .put("activo", true)
                .put("created_at", now)
                .put("updated_at", now)
            saveRow(db, "insumo_lotes", lot)
            val movement = JSONObject()
                .put("id", uuid("mov"))
                .put("producto_id", product.optString("id"))
                .put("lote_id", lotId)
                .put("tipo_movimiento", "ingreso")
                .put("cantidad", payload.optDouble("cantidad", 0.0))
                .put("unidad", lot.optString("unidad"))
                .put("usuario_id", userId)
                .put("motivo", payload.optString("motivo").ifBlank { "Ingreso desde app Android local" })
                .put("observacion", payload.optString("observaciones"))
                .put("fecha_movimiento", LocalDate.now().toString())
                .put("created_at", now)
            saveRow(db, "movimientos_inventario", movement)
            db.setTransactionSuccessful()
            return JSONObject().put("ok", true).put("productId", product.optString("id")).put("lotId", lotId)
        } finally {
            db.endTransaction()
        }
    }

    fun updateInventoryEntry(lotId: String, body: JSONObject): JSONObject {
        val payload = body.optJSONObject("payload") ?: body
        val db = writableDatabase
        val lot = tableRows(db, "insumo_lotes").firstOrNull { it.optString("id") == lotId }
            ?: throw IllegalArgumentException("Lote no encontrado.")
        copyKeys(payload, lot, listOf("fecha_recepcion", "fecha_vencimiento", "lote", "unidad", "observaciones", "activo"))
        if (payload.has("fechaRecepcion")) lot.put("fecha_recepcion", payload.optString("fechaRecepcion"))
        if (payload.has("fechaVencimiento")) lot.put("fecha_vencimiento", payload.optString("fechaVencimiento"))
        lot.put("updated_at", nowIso())
        saveRow(db, "insumo_lotes", lot)
        return JSONObject().put("ok", true).put("lotId", lotId)
    }

    fun updateLot(lotId: String, fields: JSONObject): JSONObject {
        val db = writableDatabase
        val lot = tableRows(db, "insumo_lotes").firstOrNull { it.optString("id") == lotId }
            ?: throw IllegalArgumentException("Lote no encontrado.")
        merge(lot, fields)
        lot.put("updated_at", nowIso())
        saveRow(db, "insumo_lotes", lot)
        return JSONObject().put("ok", true).put("lot", lot)
    }

    fun updateProduct(productId: String, fields: JSONObject): JSONObject {
        val db = writableDatabase
        val product = tableRows(db, "productos_insumos").firstOrNull { it.optString("id") == productId }
            ?: throw IllegalArgumentException("Producto no encontrado.")
        merge(product, fields)
        if (fields.has("nombre")) product.put("nombre_normalizado", normalizeName(fields.optString("nombre")))
        product.put("updated_at", nowIso())
        saveRow(db, "productos_insumos", product)
        return JSONObject().put("ok", true).put("product", product)
    }

    fun deleteLot(lotId: String): JSONObject {
        val db = writableDatabase
        val lot = tableRows(db, "insumo_lotes").firstOrNull { it.optString("id") == lotId }
            ?: return JSONObject().put("ok", true)
        lot.put("activo", false)
            .put("deleted_at", nowIso())
            .put("updated_at", nowIso())
        saveRow(db, "insumo_lotes", lot)
        return JSONObject().put("ok", true)
    }

    fun insertMovements(body: JSONObject): JSONObject {
        val movements = body.optJSONArray("movements") ?: JSONArray()
        val db = writableDatabase
        val rows = mutableListOf<JSONObject>()
        for (index in 0 until movements.length()) {
            val row = JSONObject(movements.optJSONObject(index)?.toString() ?: "{}")
            if (row.optString("id").isBlank()) row.put("id", uuid("mov"))
            if (row.optString("created_at").isBlank()) row.put("created_at", nowIso())
            rows.add(row)
            saveRow(db, "movimientos_inventario", row)
        }
        return JSONObject().put("ok", true).put("data", toJsonArray(rows))
    }

    fun imageFileForPath(uri: String): File? {
        val name = uri.substringAfterLast('/').takeIf { it.isNotBlank() } ?: return null
        val file = File(labelImagesDir(), name)
        return file.takeIf { it.exists() && it.isFile }
    }

    private fun fetchSupabaseRows(url: String, key: String, token: String, table: String, pageSize: Int): JSONArray {
        val rows = JSONArray()
        var offset = 0
        while (true) {
            val request = Request.Builder()
                .url("$url/rest/v1/$table?select=*")
                .header("apikey", key)
                .header("Authorization", "Bearer $token")
                .header("Range", "$offset-${offset + pageSize - 1}")
                .header("Prefer", "count=exact")
                .get()
                .build()
            http.newCall(request).execute().use { response ->
                val text = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    val message = runCatching { JSONObject(text).optString("message") }.getOrNull().takeUnless { it.isNullOrBlank() } ?: response.message
                    throw IllegalStateException("$table: $message")
                }
                val page = JSONArray(text.ifBlank { "[]" })
                for (index in 0 until page.length()) rows.put(page.getJSONObject(index))
                if (page.length() < pageSize) return rows
                offset += pageSize
            }
        }
    }

    private fun upsertRows(table: String, rows: JSONArray): Pair<Int, Int> {
        val db = writableDatabase
        var inserted = 0
        var updated = 0
        db.beginTransaction()
        try {
            for (index in 0 until rows.length()) {
                val row = JSONObject(rows.getJSONObject(index).toString())
                if (row.optString("id").isBlank()) row.put("id", uuid("row"))
                val existed = rowExists(db, table, row.optString("id"))
                saveRow(db, table, row)
                if (existed) updated += 1 else inserted += 1
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return inserted to updated
    }

    private fun selectRows(db: SQLiteDatabase, table: String, options: JSONObject): List<JSONObject> {
        val base = when (table) {
            "inventario_lotes_disponibles" -> availableInventoryRows(db)
            "alertas_stock_minimo" -> lowStockRows(db, availableInventoryRows(db))
            "historial_movimientos_inventario" -> tableRows(db, "movimientos_inventario")
            else -> tableRows(db, table)
        }
        val filters = options.optJSONArray("filters") ?: JSONArray()
        val filtered = base.filter { row -> matches(row, filters) }.toMutableList()
        val orders = options.optJSONArray("orders") ?: JSONArray()
        if (orders.length() > 0) {
            filtered.sortWith { left, right ->
                for (index in 0 until orders.length()) {
                    val order = orders.optJSONObject(index) ?: continue
                    val column = order.optString("column")
                    val ascending = order.optBoolean("ascending", true)
                    val result = compareJsonValues(left.opt(column), right.opt(column))
                    if (result != 0) return@sortWith if (ascending) result else -result
                }
                0
            }
        }
        val limit = options.optInt("limit", 0)
        return if (limit > 0) filtered.take(limit) else filtered
    }

    private fun insertRows(db: SQLiteDatabase, table: String, rows: List<JSONObject>): List<JSONObject> {
        val now = nowIso()
        return rows.map { source ->
            val row = JSONObject(source.toString())
            if (row.optString("id").isBlank()) row.put("id", uuid("row"))
            if (row.optString("created_at").isBlank()) row.put("created_at", now)
            row.put("updated_at", now)
            saveRow(db, table, row)
            row
        }
    }

    private fun upsertRowsForQuery(db: SQLiteDatabase, table: String, rows: List<JSONObject>, onConflict: String): List<JSONObject> {
        val conflictColumns = onConflict.split(",").map { it.trim() }.filter { it.isNotBlank() }
        return rows.map { source ->
            val row = JSONObject(source.toString())
            val existing = findExistingForUpsert(db, table, row, conflictColumns)
            if (existing != null) {
                merge(existing, row)
                existing.put("updated_at", nowIso())
                saveRow(db, table, existing)
                existing
            } else {
                insertRows(db, table, listOf(row)).first()
            }
        }
    }

    private fun updateRows(db: SQLiteDatabase, table: String, filters: JSONArray, payload: JSONObject): List<JSONObject> {
        val rows = tableRows(db, table).filter { matches(it, filters) }
        rows.forEach { row ->
            merge(row, payload)
            row.put("updated_at", nowIso())
            saveRow(db, table, row)
        }
        return rows
    }

    private fun deleteRows(db: SQLiteDatabase, table: String, filters: JSONArray): List<JSONObject> {
        val rows = tableRows(db, table).filter { matches(it, filters) }
        rows.forEach { row ->
            db.delete("local_rows", "table_name = ? and row_id = ?", arrayOf(table, row.optString("id")))
        }
        return rows.map { JSONObject().put("id", it.optString("id")) }
    }

    private fun availableInventoryRows(db: SQLiteDatabase): List<JSONObject> {
        val products = tableRows(db, "productos_insumos").associateBy { it.optString("id") }
        val lots = tableRows(db, "insumo_lotes").filter { truthy(it.opt("activo"), true) && it.optString("deleted_at").isBlank() }
        val movements = tableRows(db, "movimientos_inventario")
        return lots.mapNotNull { lot ->
            val lotId = lot.optString("id")
            val product = products[lot.optString("producto_id")]
            val total = movements.filter { it.optString("lote_id") == lotId }.sumOf { movementQuantity(it) }
            if (total <= 0.0) return@mapNotNull null
            JSONObject(lot.toString())
                .put("cantidad_disponible", total)
                .put("producto_nombre", product?.optString("nombre").orEmpty())
                .put("nombre", product?.optString("nombre").orEmpty())
                .put("nombre_normalizado", product?.optString("nombre_normalizado").orEmpty())
                .put("critico", product?.opt("critico") ?: false)
                .put("stock_minimo", product?.opt("stock_minimo") ?: 0)
        }.sortedWith(compareBy<JSONObject> { it.optString("fecha_vencimiento").ifBlank { "9999-12-31" } })
    }

    private fun lowStockRows(db: SQLiteDatabase, inventory: List<JSONObject>): List<JSONObject> {
        val totals = inventory.groupBy { it.optString("producto_id") }
            .mapValues { entry -> entry.value.sumOf { it.optDouble("cantidad_disponible", 0.0) } }
        return tableRows(db, "productos_insumos").filter { product ->
            val min = product.optDouble("stock_minimo", 0.0)
            min > 0.0 && (totals[product.optString("id")] ?: 0.0) <= min
        }.map { product ->
            JSONObject(product.toString()).put("stock_actual", totals[product.optString("id")] ?: 0.0)
        }
    }

    private fun findOrCreateProduct(db: SQLiteDatabase, payload: JSONObject): JSONObject {
        val requestedId = payload.optString("productoId").ifBlank { payload.optString("producto_id") }
        tableRows(db, "productos_insumos").firstOrNull { it.optString("id") == requestedId && it.optString("deleted_at").isBlank() }?.let { return it }
        val name = payload.optString("nombre").ifBlank { "Producto sin nombre" }.trim()
        val normalized = payload.optString("nombreNormalizado").ifBlank { payload.optString("nombre_normalizado").ifBlank { normalizeName(name) } }
        tableRows(db, "productos_insumos").firstOrNull { it.optString("nombre_normalizado") == normalized && it.optString("deleted_at").isBlank() }?.let { return it }
        val product = JSONObject()
            .put("id", requestedId.ifBlank { uuid("prod") })
            .put("nombre", name)
            .put("nombre_normalizado", normalized)
            .put("unidad_default", payload.optString("unidad").ifBlank { payload.optString("unidad_default").ifBlank { "unidad" } })
            .put("stock_minimo", 0)
            .put("critico", payload.optBoolean("critico", false))
            .put("consumo_promedio_diario", 0)
            .put("favorito", false)
            .put("activo", true)
            .put("created_at", nowIso())
            .put("updated_at", nowIso())
        saveRow(db, "productos_insumos", product)
        return product
    }

    private fun saveImageFromPayload(
        db: SQLiteDatabase,
        imageDataUrl: String,
        productId: String,
        productCodeLinkId: String?,
        createdBy: String,
        notes: String,
        ocrText: String,
        metadata: JSONObject
    ): JSONObject? {
        val match = Regex("^data:(image/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$").find(imageDataUrl.trim()) ?: return null
        val mime = if (match.groupValues[1] == "image/jpg") "image/jpeg" else match.groupValues[1]
        val extension = when (mime) {
            "image/png" -> "png"
            "image/webp" -> "webp"
            else -> "jpg"
        }
        val bytes = Base64.decode(match.groupValues[2], Base64.DEFAULT)
        if (bytes.isEmpty()) return null
        val id = uuid("img")
        val fileName = "$id.$extension"
        val file = File(labelImagesDir(), fileName)
        file.writeBytes(bytes)
        val now = nowIso()
        val row = JSONObject()
            .put("id", id)
            .put("product_code_link_id", productCodeLinkId.takeUnless { it.isNullOrBlank() } ?: JSONObject.NULL)
            .put("product_id", productId.ifBlank { "" }.takeIf { it.isNotBlank() } ?: JSONObject.NULL)
            .put("image_path", "/label-images/$fileName")
            .put("mime_type", mime)
            .put("size_bytes", bytes.size)
            .put("sha256", sha256(bytes))
            .put("captured_at", now)
            .put("created_by", createdBy)
            .put("notes", notes)
            .put("ocr_text", ocrText)
            .put("metadata_json", metadata)
            .put("created_at", now)
        saveRow(db, "product_label_images", row)
        return row
    }

    private fun tableRows(db: SQLiteDatabase, table: String): MutableList<JSONObject> {
        val rows = mutableListOf<JSONObject>()
        val cursor = db.rawQuery("select payload_json from local_rows where table_name = ?", arrayOf(table))
        cursor.use {
            while (it.moveToNext()) {
                rows.add(JSONObject(it.getString(0)))
            }
        }
        return rows
    }

    private fun saveRow(db: SQLiteDatabase, table: String, row: JSONObject) {
        val id = row.optString("id").ifBlank { uuid("row").also { row.put("id", it) } }
        val values = ContentValues().apply {
            put("table_name", table)
            put("row_id", id)
            put("payload_json", row.toString())
            put("updated_at", nowIso())
        }
        db.insertWithOnConflict("local_rows", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun rowExists(db: SQLiteDatabase, table: String, id: String): Boolean {
        val cursor = db.rawQuery("select 1 from local_rows where table_name = ? and row_id = ? limit 1", arrayOf(table, id))
        cursor.use { return it.moveToFirst() }
    }

    private fun findExistingForUpsert(db: SQLiteDatabase, table: String, row: JSONObject, conflictColumns: List<String>): JSONObject? {
        val rows = tableRows(db, table)
        if (row.optString("id").isNotBlank()) rows.firstOrNull { it.optString("id") == row.optString("id") }?.let { return it }
        val columns = when {
            conflictColumns.isNotEmpty() -> conflictColumns
            table == "usuarios_app" -> listOf("email")
            table == "productos_insumos" -> listOf("nombre_normalizado")
            table == "product_code_links" -> listOf("code_normalized")
            else -> emptyList()
        }
        if (columns.isEmpty()) return null
        return rows.firstOrNull { existing ->
            columns.all { column -> existing.optString(column).isNotBlank() && existing.optString(column) == row.optString(column) }
        }
    }

    private fun matches(row: JSONObject, filters: JSONArray): Boolean {
        for (index in 0 until filters.length()) {
            val filter = filters.optJSONObject(index) ?: continue
            val column = filter.optString("column")
            val op = filter.optString("op")
            val actual = row.opt(column)
            val expected = filter.opt("value")
            val ok = when (op) {
                "eq" -> compareString(actual) == compareString(expected)
                "neq" -> compareString(actual) != compareString(expected)
                "is" -> if (expected == null || expected == JSONObject.NULL) actual == null || actual == JSONObject.NULL else compareString(actual) == compareString(expected)
                "in" -> {
                    val array = expected as? JSONArray ?: JSONArray()
                    (0 until array.length()).any { compareString(actual) == compareString(array.opt(it)) }
                }
                "gt" -> compareString(actual).toDoubleOrNull()?.let { it > (compareString(expected).toDoubleOrNull() ?: Double.MAX_VALUE) }
                    ?: (compareString(actual) > compareString(expected))
                else -> true
            }
            if (!ok) return false
        }
        return true
    }

    private fun movementQuantity(row: JSONObject): Double {
        val quantity = row.optDouble("cantidad", 0.0)
        return when (row.optString("tipo_movimiento").lowercase(Locale.ROOT)) {
            "salida", "consumo", "merma", "descuento" -> -quantity
            else -> quantity
        }
    }

    private fun payloads(value: Any?): List<JSONObject> {
        return when (value) {
            is JSONArray -> (0 until value.length()).mapNotNull { value.optJSONObject(it) }
            is JSONObject -> listOf(value)
            else -> listOf(JSONObject())
        }
    }

    private fun merge(target: JSONObject, source: JSONObject) {
        val keys = source.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            target.put(key, source.opt(key))
        }
    }

    private fun copyKeys(source: JSONObject, target: JSONObject, keys: List<String>) {
        keys.forEach { key -> if (source.has(key)) target.put(key, source.opt(key)) }
    }

    private fun setMeta(db: SQLiteDatabase, key: String, value: String) {
        val values = ContentValues().apply {
            put("key", key)
            put("value", value)
        }
        db.insertWithOnConflict("local_meta", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun getMeta(db: SQLiteDatabase, key: String): String? {
        val cursor = db.rawQuery("select value from local_meta where key = ? limit 1", arrayOf(key))
        cursor.use { return if (it.moveToFirst()) it.getString(0) else null }
    }

    private fun countRows(db: SQLiteDatabase, table: String): Int {
        val cursor = db.rawQuery("select count(*) from local_rows where table_name = ?", arrayOf(table))
        cursor.use { return if (it.moveToFirst()) it.getInt(0) else 0 }
    }

    private fun totals(summary: JSONArray): JSONObject {
        val totals = JSONObject().put("fetched", 0).put("inserted", 0).put("updated", 0).put("duplicates", 0).put("skipped", 0).put("errors", 0)
        for (index in 0 until summary.length()) {
            val row = summary.optJSONObject(index) ?: continue
            listOf("fetched", "inserted", "updated", "duplicates", "skipped").forEach { key ->
                totals.put(key, totals.optInt(key) + row.optInt(key))
            }
            totals.put("errors", totals.optInt("errors") + (row.optJSONArray("errors")?.length() ?: 0))
        }
        return totals
    }

    private fun labelImagesDir(): File = File(appContext.filesDir, "label-images").apply { mkdirs() }

    companion object {
        const val MIGRATION_VERSION = "android-json-v1"
        val IMPORT_TABLES = listOf(
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
            "operator_scan_session_items"
        )
        val VIEW_TABLES = setOf("inventario_lotes_disponibles", "alertas_stock_minimo", "historial_movimientos_inventario")
        val ALLOWED_TABLES = IMPORT_TABLES.toSet()

        fun nowIso(): String = Instant.now().toString()
        fun uuid(prefix: String): String = "$prefix-${UUID.randomUUID()}"
        fun normalizeCode(value: String): String = value.replace("\\s+".toRegex(), "").trim().uppercase(Locale.ROOT)
        fun normalizeName(value: String): String {
            val noMarks = Normalizer.normalize(value.lowercase(Locale.ROOT), Normalizer.Form.NFD)
                .replace("\\p{Mn}+".toRegex(), "")
            return noMarks.replace("[^a-z0-9]+".toRegex(), " ").trim().replace("\\s+".toRegex(), " ")
        }
        fun toJsonArray(values: Iterable<Any?>): JSONArray {
            val array = JSONArray()
            values.forEach { array.put(it ?: JSONObject.NULL) }
            return array
        }
        fun truthy(value: Any?, defaultValue: Boolean = false): Boolean {
            return when (value) {
                null, JSONObject.NULL -> defaultValue
                is Boolean -> value
                is Number -> value.toInt() != 0
                else -> value.toString().equals("true", true) || value.toString() == "1"
            }
        }
        fun compareString(value: Any?): String = if (value == null || value == JSONObject.NULL) "" else value.toString()
        fun compareJsonValues(left: Any?, right: Any?): Int {
            val leftNumber = compareString(left).toDoubleOrNull()
            val rightNumber = compareString(right).toDoubleOrNull()
            return if (leftNumber != null && rightNumber != null) {
                leftNumber.compareTo(rightNumber)
            } else {
                compareString(left).compareTo(compareString(right), ignoreCase = true)
            }
        }
        fun nullableDouble(input: JSONObject, camel: String, snake: String): Any {
            val value = when {
                input.has(camel) && !input.isNull(camel) -> input.opt(camel)
                input.has(snake) && !input.isNull(snake) -> input.opt(snake)
                else -> null
            }
            return value ?: JSONObject.NULL
        }
        fun sha256(bytes: ByteArray): String {
            return MessageDigest.getInstance("SHA-256")
                .digest(bytes)
                .joinToString("") { "%02x".format(it) }
        }
    }
}
