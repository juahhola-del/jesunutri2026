package cl.jesunutri.capturer

import android.content.Context
import fi.iki.elonen.NanoHTTPD

object TabletServerRuntime {
    @Volatile private var server: AndroidLocalServer? = null

    @Synchronized
    fun ensureStarted(context: Context): AndroidLocalServer {
        val existing = server
        if (existing != null && existing.isAlive) return existing
        var lastError: Exception? = null
        for (port in PORT_CANDIDATES) {
            try {
                val created = AndroidLocalServer(context.applicationContext, port)
                created.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
                server = created
                return created
            } catch (error: Exception) {
                lastError = error
            }
        }
        throw IllegalStateException(
            "No se pudo iniciar el backend local Android en los puertos ${PORT_CANDIDATES.joinToString(", ")}.",
            lastError
        )
    }

    private val PORT_CANDIDATES = listOf(8787, 8788, 8789, 8790)
}
