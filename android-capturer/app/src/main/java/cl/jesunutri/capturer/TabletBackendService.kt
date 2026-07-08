package cl.jesunutri.capturer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class TabletBackendService : Service() {
    override fun onCreate() {
        super.onCreate()
        TabletServerRuntime.ensureStarted(this)
        createChannel()
        startForeground(
            8787,
            NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_upload_done)
                .setContentTitle("Jesunutri local activo")
                .setContentText("Backend de tablet disponible para capturadores.")
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build()
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        TabletServerRuntime.ensureStarted(this)
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Jesunutri local",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Mantiene activo el backend local de la tablet."
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    companion object {
        private const val CHANNEL_ID = "jesunutri_tablet_backend"
    }
}
