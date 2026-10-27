package expo.modules.stillwavedvr

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/** A visible data-download service; recording never depends on the screen or React's JS thread. */
class DvrService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var wake: PowerManager.WakeLock? = null
  private val refresh = object : Runnable {
    override fun run() {
      if (!DvrRuntime.engine(this@DvrService).hasActiveCapture() && !RecordingPlanner.hasPendingWork()) { stopSelf(); return }
      (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(941, notification())
      handler.postDelayed(this, 5000)
    }
  }
  override fun onCreate() {
    super.onCreate()
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("dvr", "DVR and recordings", NotificationManager.IMPORTANCE_LOW))
  }
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == "STOP_RECORDING") {
      DvrRuntime.engine(this).listRecordings().firstOrNull { it["status"] == "recording" }?.let { DvrRuntime.engine(this).stopRecording(it["id"] as String) }
    }
    if (Build.VERSION.SDK_INT >= 29) startForeground(941, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    else startForeground(941, notification())
    if (intent?.action == "START_SCHEDULED_RECORDING") intent.getStringExtra("id")?.let { RecordingPlanner.start(applicationContext, it) }
    if (wake == null) {
      wake = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Stillwave:DVR").apply { acquire(6 * 60 * 60 * 1000L) }
    }
    handler.removeCallbacks(refresh); handler.post(refresh)
    return START_NOT_STICKY
  }
  private fun notification(): Notification {
    val recording = DvrRuntime.engine(this).listRecordings().firstOrNull { it["status"] == "recording" }
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val builder = Notification.Builder(this, "dvr")
      .setSmallIcon(android.R.drawable.presence_video_online)
      .setContentTitle(if (recording != null) "Recording ${recording["channel"]}" else "Stillwave DVR buffer")
      .setContentText(if (recording != null) "Saving video · tap to open Recordings" else "Keeping recent video for pause and rewind")
      .setOngoing(true).setOnlyAlertOnce(true)
    if (launch != null) builder.setContentIntent(PendingIntent.getActivity(this, 940, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    if (recording != null) builder.addAction(Notification.Action.Builder(null, "Stop recording", PendingIntent.getService(this, 942, Intent(this, DvrService::class.java).setAction("STOP_RECORDING"), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)).build())
    return builder.build()
  }
  override fun onTimeout(startId: Int, fgsType: Int) {
    DvrRuntime.engine(this).shutdown("Android reached its background download time limit. Saved footage was kept.")
    stopSelf()
  }
  override fun onDestroy() {
    handler.removeCallbacks(refresh)
    wake?.let { if (it.isHeld) it.release() }; wake = null
    // An old stopSelf callback may race a new channel's start request. The
    // engine owns capture lifetime; only explicit timeout/stop shuts it down.
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}
