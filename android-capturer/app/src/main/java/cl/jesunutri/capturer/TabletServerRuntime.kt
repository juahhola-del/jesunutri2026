package cl.jesunutri.capturer

import android.content.Context
import fi.iki.elonen.NanoHTTPD

object TabletServerRuntime {
    @Volatile private var server: AndroidLocalServer? = null

    @Synchronized
    fun ensureStarted(context: Context): AndroidLocalServer {
        val existing = server
        if (existing != null && existing.isAlive) return existing
        val created = AndroidLocalServer(context.applicationContext)
        created.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false)
        server = created
        return created
    }
}
