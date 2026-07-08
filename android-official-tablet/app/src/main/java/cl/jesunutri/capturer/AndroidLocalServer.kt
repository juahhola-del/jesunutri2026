package cl.jesunutri.capturer

import android.content.Context
import fi.iki.elonen.NanoHTTPD
import org.json.JSONArray
import org.json.JSONObject
import java.io.FileInputStream
import java.net.NetworkInterface
import java.net.URLDecoder
import java.nio.charset.StandardCharsets
import java.time.Instant

class AndroidLocalServer(context: Context, private val portNumber: Int = 8787) : NanoHTTPD("0.0.0.0", portNumber) {
    private val assets = context.applicationContext.assets
    private val store = AndroidLocalStore(context.applicationContext)
    private val recentErrors = ArrayDeque<JSONObject>()

    override fun serve(session: IHTTPSession): Response {
        if (session.method == Method.OPTIONS) return cors(textResponse(Response.Status.OK, JSONObject().put("ok", true)))
        return try {
            val path = normalizePath(session.uri)
            val method = session.method
            val body = if (method == Method.POST || method == Method.PUT || method == Method.PATCH || method == Method.DELETE) readBody(session) else JSONObject()

            val response = when {
                method == Method.GET && path == "/api/health" -> json(
                    JSONObject()
                        .put("ok", true)
                        .put("service", "jesunutri-android-tablet-backend")
                        .put("mode", "android")
                        .put("connectionUrls", AndroidLocalStore.toJsonArray(connectionUrls()))
                        .put("time", Instant.now().toString())
                )
                method == Method.GET && path == "/api/status" -> json(store.status(connectionUrls()))
                method == Method.POST && path == "/api/install" -> json(store.install().put("connectionUrls", AndroidLocalStore.toJsonArray(connectionUrls())))
                method == Method.POST && path == "/api/import-from-supabase" -> json(store.importFromSupabase(body, connectionUrls()))
                method == Method.POST && path == "/api/backup" -> json(store.createBackup())
                method == Method.POST && path == "/api/auth/login" -> json(login(body))
                method == Method.POST && path == "/api/auth/logout" -> json(JSONObject().put("ok", true))
                method == Method.GET && path == "/api/inventory/snapshot" -> json(store.inventorySnapshot())
                method == Method.GET && path == "/api/tasks" -> json(JSONObject().put("ok", true).put("tasks", tableData("daily_tasks")))
                method == Method.POST && path == "/api/tasks" -> json(store.queryTable("daily_tasks", JSONObject().put("operation", "insert").put("payload", body.opt("task") ?: body)))
                method == Method.PATCH && path.startsWith("/api/tasks/") -> json(
                    store.queryTable(
                        "daily_tasks",
                        JSONObject()
                            .put("operation", "update")
                            .put("filters", JSONArray().put(JSONObject().put("column", "id").put("op", "eq").put("value", path.substringAfterLast('/'))))
                            .put("payload", body.opt("task") ?: body)
                    )
                )
                method == Method.GET && path == "/api/product-code-links" -> {
                    val activeOnly = session.parameters["active"]?.firstOrNull() != "false"
                    json(JSONObject().put("ok", true).put("links", store.listProductCodeLinks(activeOnly)))
                }
                method == Method.GET && path.startsWith("/api/product-code-links/") -> {
                    val code = decode(path.substringAfter("/api/product-code-links/"))
                    json(JSONObject().put("ok", true).put("link", store.getProductCodeLinkByCode(code) ?: JSONObject.NULL))
                }
                method == Method.POST && path == "/api/product-code-links" -> json(JSONObject().put("ok", true).put("link", store.upsertProductCodeLink(body)))
                method == Method.POST && path == "/api/scan-session-images" -> json(JSONObject().put("ok", true).put("image", store.saveScanSessionImage(body) ?: JSONObject.NULL))
                method == Method.GET && path == "/api/pending-entries" -> json(JSONObject().put("ok", true).put("entries", tableData("ingresos_pendientes")))
                method == Method.POST && path == "/api/pending-entries" -> json(createPendingEntry(body))
                method == Method.PATCH && path.startsWith("/api/pending-entries/") -> json(updatePendingEntry(path.substringAfterLast('/'), body))
                method == Method.POST && path.startsWith("/api/table/") && path.endsWith("/query") -> {
                    val table = decode(path.removePrefix("/api/table/").removeSuffix("/query").trim('/'))
                    json(store.queryTable(table, body))
                }
                method == Method.POST && path == "/api/inventory/entries" -> json(store.createInventoryEntry(body))
                method == Method.PATCH && path.startsWith("/api/inventory/entries/") -> json(store.updateInventoryEntry(path.substringAfterLast('/'), body))
                method == Method.DELETE && path.startsWith("/api/inventory/lots/") -> json(store.deleteLot(path.substringAfterLast('/')))
                method == Method.PATCH && path.startsWith("/api/inventory/lots/") -> json(store.updateLot(path.substringAfterLast('/'), body.optJSONObject("fields") ?: body))
                method == Method.PATCH && path.startsWith("/api/inventory/products/") -> json(store.updateProduct(path.substringAfterLast('/'), body.optJSONObject("fields") ?: body))
                method == Method.POST && path == "/api/inventory/movements" -> json(store.insertMovements(body))
                method == Method.GET && path.startsWith("/label-images/") -> imageResponse(path)
                method == Method.GET && isWebAssetPath(path) -> webAssetResponse(path)
                else -> json(JSONObject().put("ok", false).put("status", "error").put("error", "Endpoint Android local no encontrado."), Response.Status.NOT_FOUND)
            }
            cors(response)
        } catch (error: Exception) {
            rememberError(error)
            cors(
                json(
                    JSONObject()
                        .put("ok", false)
                        .put("status", "error")
                        .put("error", error.message ?: "Error interno del backend Android.")
                        .put("recentErrors", recentErrorsJson()),
                    Response.Status.INTERNAL_ERROR
                )
            )
        }
    }

    fun status(): JSONObject = store.status(connectionUrls())

    fun connectionUrls(): List<String> {
        val urls = mutableListOf("http://127.0.0.1:$portNumber")
        val interfaces = NetworkInterface.getNetworkInterfaces()
        while (interfaces.hasMoreElements()) {
            val network = interfaces.nextElement()
            val addresses = network.inetAddresses
            while (addresses.hasMoreElements()) {
                val address = addresses.nextElement()
                val host = address.hostAddress ?: continue
                if (!address.isLoopbackAddress && host.indexOf(':') < 0) {
                    urls.add("http://$host:$portNumber")
                }
            }
        }
        return urls.distinct()
    }

    private fun login(body: JSONObject): JSONObject {
        val email = body.optString("email").trim().lowercase()
        val users = store.queryTable(
            "usuarios_app",
            JSONObject().put("operation", "select").put("filters", JSONArray().put(JSONObject().put("column", "email").put("op", "eq").put("value", email)))
        ).optJSONArray("data") ?: JSONArray()
        val user = users.optJSONObject(0)
            ?: return JSONObject().put("ok", false).put("status", "error").put("error", "Usuario local no encontrado.")
        return JSONObject()
            .put("ok", true)
            .put("user", user)
            .put("session", JSONObject().put("source", "android").put("user", user).put("createdAt", Instant.now().toString()))
    }

    private fun createPendingEntry(body: JSONObject): JSONObject {
        val entry = body.optJSONObject("entry") ?: JSONObject()
        if (entry.optString("id").isBlank()) entry.put("id", AndroidLocalStore.uuid("pending"))
        val inserted = store.queryTable("ingresos_pendientes", JSONObject().put("operation", "insert").put("payload", entry))
        val details = body.optJSONArray("details") ?: JSONArray()
        for (index in 0 until details.length()) {
            val detail = details.optJSONObject(index) ?: continue
            if (detail.optString("id").isBlank()) detail.put("id", AndroidLocalStore.uuid("pending-detail"))
            detail.put("ingreso_pendiente_id", entry.optString("id"))
            store.queryTable("ingresos_pendientes_detalle", JSONObject().put("operation", "insert").put("payload", detail))
        }
        return JSONObject().put("ok", true).put("entry", inserted.opt("data"))
    }

    private fun updatePendingEntry(id: String, body: JSONObject): JSONObject {
        return store.queryTable(
            "ingresos_pendientes",
            JSONObject()
                .put("operation", "update")
                .put("filters", JSONArray().put(JSONObject().put("column", "id").put("op", "eq").put("value", id)))
                .put("payload", body.optJSONObject("fields") ?: body)
        ).put("ok", true)
    }

    private fun tableData(table: String): JSONArray {
        val result = store.queryTable(table, JSONObject().put("operation", "select"))
        return result.optJSONArray("data") ?: JSONArray()
    }

    private fun imageResponse(path: String): Response {
        val file = store.imageFileForPath(path)
            ?: return json(JSONObject().put("ok", false).put("error", "Imagen no encontrada."), Response.Status.NOT_FOUND)
        val mime = when (file.extension.lowercase()) {
            "png" -> "image/png"
            "webp" -> "image/webp"
            else -> "image/jpeg"
        }
        return cors(newChunkedResponse(Response.Status.OK, mime, FileInputStream(file)))
    }

    private fun isWebAssetPath(path: String): Boolean {
        val assetPath = webAssetPath(path)
        return PUBLIC_WEB_ASSETS.contains(assetPath)
    }

    private fun webAssetResponse(path: String): Response {
        val assetPath = webAssetPath(path)
        return try {
            val input = assets.open("www/$assetPath")
            newChunkedResponse(Response.Status.OK, mimeFor(assetPath), input)
        } catch (error: Exception) {
            json(JSONObject().put("ok", false).put("error", "Archivo de app Android no encontrado: $assetPath"), Response.Status.NOT_FOUND)
        }
    }

    private fun webAssetPath(path: String): String {
        val clean = path.trim('/').ifBlank { "index.html" }
        return when (clean) {
            "favicon.ico" -> "icon-192.png"
            else -> clean
        }
    }

    private fun mimeFor(path: String): String {
        return when (path.substringAfterLast('.', "").lowercase()) {
            "html" -> "text/html; charset=utf-8"
            "css" -> "text/css; charset=utf-8"
            "js" -> "application/javascript; charset=utf-8"
            "json" -> "application/json; charset=utf-8"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            else -> "application/octet-stream"
        }
    }

    private fun readBody(session: IHTTPSession): JSONObject {
        val files = HashMap<String, String>()
        session.parseBody(files)
        val raw = files["postData"].orEmpty()
        return if (raw.isBlank()) JSONObject() else JSONObject(raw)
    }

    private fun normalizePath(uri: String): String = uri.substringBefore('?').ifBlank { "/" }

    private fun decode(value: String): String = URLDecoder.decode(value, StandardCharsets.UTF_8.name())

    private fun json(payload: JSONObject, status: Response.Status = Response.Status.OK): Response {
        return textResponse(status, payload)
    }

    private fun textResponse(status: Response.Status, payload: JSONObject): Response {
        return newFixedLengthResponse(status, "application/json; charset=utf-8", payload.toString())
    }

    private fun cors(response: Response): Response {
        response.addHeader("Access-Control-Allow-Origin", "*")
        response.addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, Range, Prefer")
        response.addHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        response.addHeader("Access-Control-Max-Age", "86400")
        return response
    }

    private fun rememberError(error: Exception) {
        recentErrors.addFirst(JSONObject().put("message", error.message ?: "Error").put("at", Instant.now().toString()))
        while (recentErrors.size > 10) recentErrors.removeLast()
    }

    private fun recentErrorsJson(): JSONArray {
        val array = JSONArray()
        recentErrors.forEach { array.put(it) }
        return array
    }

    companion object {
        private val PUBLIC_WEB_ASSETS = setOf(
            "index.html",
            "styles.css",
            "script.js",
            "browser-local-backend.js",
            "service-worker.js",
            "manifest.json",
            "logo.png",
            "icon-192.png",
            "icon-512.png",
            "vendor/supabase-js-2.min.js",
            "vendor/xlsx.full.min.js",
            "vendor/zxing-browser.min.js"
        )
    }
}
