package cl.jesunutri.capturer

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

class BackendClient(baseUrl: String) {
    private val root = baseUrl.trim().trimEnd('/')
    private val mediaType = "application/json; charset=utf-8".toMediaType()
    private val http = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(25, TimeUnit.SECONDS)
        .build()

    fun health(): JSONObject = getJson("/api/health")

    fun loadProducts(): List<Product> {
        val json = getJson("/api/inventory/snapshot")
        val products = json.optJSONArray("products") ?: JSONArray()
        return (0 until products.length()).mapNotNull { index ->
            val item = products.optJSONObject(index) ?: return@mapNotNull null
            Product(
                id = item.optString("id"),
                name = item.optString("nombre"),
                normalizedName = item.optString("nombre_normalizado"),
                baseUnit = item.optString("unidad_default")
            ).takeIf { it.id.isNotBlank() && it.name.isNotBlank() }
        }
    }

    fun lookupLink(codeNormalized: String): ProductCodeLink? {
        if (codeNormalized.isBlank()) return null
        val json = getJson("/api/product-code-links/${codeNormalized.urlSafe()}")
        return json.optJSONObject("link")?.toProductCodeLink()
    }

    fun saveProductCodeLink(
        result: LabelScanResult,
        product: Product,
        rule: PackageRule,
        imageDataUrl: String?,
        userId: String
    ): ProductCodeLink {
        val link = JSONObject()
            .put("productId", product.id)
            .put("codeRaw", result.codeRaw.ifBlank { result.gtin })
            .put("codeNormalized", result.codeNormalized.ifBlank { result.gtin })
            .put("codeType", result.codeType.ifBlank { "codigo" })
            .put("gtin", result.gtin)
            .put("barcodeFormat", result.barcodeFormat)
            .put("gs1Payload", JSONObject(result.gs1Payload))
            .put("detectedLot", result.lot)
            .put("detectedExpiry", result.expiryDate)
            .put("detectedMfgDate", result.mfgDate)
            .put("detectedQuantity", result.detectedQuantity ?: JSONObject.NULL)
            .put("packageType", rule.packageType)
            .put("packageQuantity", rule.packageQuantity ?: JSONObject.NULL)
            .put("packageUnit", rule.packageUnit)
            .put("baseUnit", rule.baseUnit)
            .put("conversionFactor", rule.conversionFactor ?: JSONObject.NULL)
            .put("conversionNotes", rule.notes)
            .put("labelTextOcr", result.ocrText)
            .put("labelImageDataUrl", imageDataUrl ?: "")
            .put("source", "android_mlkit_learning")
            .put("confidence", result.confidence)
            .put("createdBy", userId)
        val response = postJson("/api/product-code-links", JSONObject().put("link", link).put("userId", userId))
        return response.optJSONObject("link")?.toProductCodeLink()
            ?: error("El backend no devolvio el vinculo guardado.")
    }

    fun createScanSession(operatorId: String, operatorEmail: String): String {
        val id = UUID.randomUUID().toString()
        tableQuery(
            "operator_scan_sessions",
            JSONObject()
                .put("operation", "insert")
                .put(
                    "payload",
                    JSONObject()
                        .put("id", id)
                        .put("operator_id", operatorId)
                        .put("operator_email", operatorEmail)
                        .put("operator_name", "Capturador Android")
                        .put("status", "active")
                        .put("notes", "Sesion creada desde lector nativo Android")
                )
        )
        return id
    }

    fun saveScanSessionImage(
        result: LabelScanResult,
        link: ProductCodeLink,
        imageDataUrl: String?,
        userId: String
    ): String? {
        if (imageDataUrl.isNullOrBlank()) return null
        val image = JSONObject()
            .put("productId", link.productId)
            .put("productCodeLinkId", link.id ?: JSONObject.NULL)
            .put("imageDataUrl", imageDataUrl)
            .put("createdBy", userId)
            .put("ocrText", result.ocrText)
            .put("notes", "Captura enviada desde ingreso por escaneo Android")
            .put(
                "metadata",
                JSONObject()
                    .put("rawCode", result.codeRaw.ifBlank { link.codeRaw })
                    .put("normalizedCode", result.codeNormalized.ifBlank { link.codeNormalized })
                    .put("barcodeFormat", result.barcodeFormat)
                    .put("source", "android_mlkit_intake")
            )
        val response = postJson("/api/scan-session-images", JSONObject().put("image", image).put("userId", userId))
        return response.optJSONObject("image")?.optString("image_path")?.ifBlank { null }
    }

    fun addSessionItem(
        sessionId: String,
        result: LabelScanResult,
        link: ProductCodeLink,
        product: Product?,
        packageCount: Double,
        imagePath: String? = null
    ) {
        val factor = link.conversionFactor ?: link.packageQuantity ?: 1.0
        val total = packageCount * factor
        tableQuery(
            "operator_scan_session_items",
            JSONObject()
                .put("operation", "insert")
                .put(
                    "payload",
                    JSONObject()
                        .put("id", UUID.randomUUID().toString())
                        .put("session_id", sessionId)
                        .put("product_id", link.productId)
                        .put("product_code_link_id", link.id ?: JSONObject.NULL)
                        .put("raw_code", result.codeRaw.ifBlank { link.codeRaw })
                        .put("normalized_code", result.codeNormalized.ifBlank { link.codeNormalized })
                        .put("product_name_snapshot", product?.name ?: "")
                        .put("package_type", link.packageType)
                        .put("package_quantity", link.packageQuantity ?: JSONObject.NULL)
                        .put("package_unit", link.packageUnit)
                        .put("base_unit", link.baseUnit)
                        .put("conversion_factor", link.conversionFactor ?: JSONObject.NULL)
                        .put("package_count", packageCount)
                        .put("total_quantity", total)
                        .put("lot", result.lot.ifBlank { link.detectedLot })
                        .put("expiry_date", result.expiryDate.ifBlank { link.detectedExpiry })
                        .put("mfg_date", result.mfgDate.ifBlank { link.detectedMfgDate })
                        .put("confidence", maxOf(result.confidence, link.confidence))
                        .put("image_path", imagePath ?: JSONObject.NULL)
                        .put("status", "pending")
                        .put(
                            "metadata_json",
                            JSONObject()
                                .put("source", "android_mlkit_intake")
                                .put("ocrText", result.ocrText)
                                .put("barcodeFormat", result.barcodeFormat)
                                .put("sources", JSONObject(result.sources))
                        )
                )
        )
    }

    fun submitSession(sessionId: String, notes: String = "Sesion enviada desde capturador Android") {
        val now = java.time.Instant.now().toString()
        tableQuery(
            "operator_scan_sessions",
            JSONObject()
                .put("operation", "update")
                .put(
                    "filters",
                    JSONArray().put(JSONObject().put("column", "id").put("op", "eq").put("value", sessionId))
                )
                .put(
                    "payload",
                    JSONObject()
                        .put("status", "submitted")
                        .put("submitted_at", now)
                        .put("last_activity_at", now)
                        .put("notes", notes)
                )
        )
    }

    private fun tableQuery(table: String, body: JSONObject): JSONObject {
        return postJson("/api/table/$table/query", body)
    }

    private fun getJson(path: String): JSONObject {
        val request = Request.Builder().url("$root$path").get().build()
        http.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}: $body")
            return JSONObject(body)
        }
    }

    private fun postJson(path: String, body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url("$root$path")
            .post(body.toString().toRequestBody(mediaType))
            .build()
        http.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error("HTTP ${response.code}: $text")
            return JSONObject(text)
        }
    }

    private fun JSONObject.toProductCodeLink(): ProductCodeLink {
        return ProductCodeLink(
            id = optString("id").ifBlank { null },
            productId = optString("product_id", optString("productId")),
            codeRaw = optString("code_raw", optString("codeRaw")),
            codeNormalized = optString("code_normalized", optString("codeNormalized")),
            codeType = optString("code_type", optString("codeType")),
            gtin = optString("gtin"),
            barcodeFormat = optString("barcode_format", optString("barcodeFormat")),
            detectedLot = optString("detected_lot", optString("detectedLot")),
            detectedExpiry = optString("detected_expiry", optString("detectedExpiry")),
            detectedMfgDate = optString("detected_mfg_date", optString("detectedMfgDate")),
            detectedQuantity = optNullableDouble("detected_quantity"),
            packageType = optString("package_type", optString("packageType")),
            packageQuantity = optNullableDouble("package_quantity"),
            packageUnit = optString("package_unit", optString("packageUnit")),
            baseUnit = optString("base_unit", optString("baseUnit")),
            conversionFactor = optNullableDouble("conversion_factor"),
            conversionNotes = optString("conversion_notes", optString("conversionNotes")),
            labelTextOcr = optString("label_text_ocr", optString("labelTextOcr")),
            confidence = optDouble("confidence", 0.0)
        )
    }

    private fun JSONObject.optNullableDouble(name: String): Double? {
        if (!has(name) || isNull(name)) return null
        return optDouble(name).takeIf { !it.isNaN() }
    }

    private fun String.urlSafe(): String = replace(" ", "").trim()
}
