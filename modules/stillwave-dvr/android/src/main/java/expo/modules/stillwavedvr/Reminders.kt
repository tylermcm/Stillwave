package expo.modules.stillwavedvr

import android.Manifest
import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

object ReminderStore {
  const val CHANNEL_EXTRA = "stillwave_reminder_channel"
  @Volatile var pendingChannel: String? = null
  private fun preferences(context: Context) = context.getSharedPreferences("program-reminders", Context.MODE_PRIVATE)
  private fun items(context: Context): List<JSONObject> {
    val array = JSONArray(preferences(context).getString("items", "[]"))
    return (0 until array.length()).map { array.getJSONObject(it) }
  }
  private fun alarmIntent(context: Context, id: String): PendingIntent = PendingIntent.getBroadcast(context, 0,
    Intent(context, ProgramReminderReceiver::class.java).setAction("PROGRAM_REMINDER")
      .setData(Uri.Builder().scheme("stillwave-reminder").authority("fire").appendPath(id).build()).putExtra("id", id),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  @Synchronized fun sync(context: Context, serialized: String) {
    require(serialized.length <= 512 * 1024) { "Too many saved reminders." }
    val array = JSONArray(serialized)
    require(array.length() <= 100) { "Keep at most 100 saved reminders." }
    val next = (0 until array.length()).map { array.getJSONObject(it) }
    next.forEach { item ->
      require(item.getString("id").length <= 8192 && item.getString("channelId").length <= 1000)
      require(item.getLong("stop") > item.getLong("start"))
    }
    val ids = next.map { it.getString("id") }.toSet()
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    for (old in items(context)) if (old.getString("id") !in ids) {
      manager.cancel(alarmIntent(context, old.getString("id")))
      (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(old.getString("id"), 0)
    }
    val fired = (preferences(context).getStringSet("fired", emptySet()) ?: emptySet()).intersect(ids)
    check(preferences(context).edit().putString("items", serialized).putStringSet("fired", fired).commit()) { "Could not save reminders." }
    restore(context)
  }

  @Synchronized fun restore(context: Context) {
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val fired = preferences(context).getStringSet("fired", emptySet()) ?: emptySet()
    val now = System.currentTimeMillis()
    for (item in items(context)) {
      val pending = alarmIntent(context, item.getString("id"))
      if (!item.optBoolean("notify") || item.getLong("start") <= now || item.getString("id") in fired) manager.cancel(pending)
      else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, maxOf(now + 1000, item.getLong("fireAt")), pending)
    }
  }

  @Synchronized fun fire(context: Context, id: String) {
    val item = items(context).find { it.getString("id") == id } ?: return
    val fired = (preferences(context).getStringSet("fired", emptySet()) ?: emptySet()).toMutableSet()
    if (!item.optBoolean("notify") || item.getLong("stop") <= System.currentTimeMillis() || id in fired) return
    fired.add(id); preferences(context).edit().putStringSet("fired", fired).commit()
    if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("program-reminders", "Program reminders", NotificationManager.IMPORTANCE_DEFAULT))
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.putExtra(CHANNEL_EXTRA, item.getString("channelId"))
      .setData(Uri.Builder().scheme("stillwave-reminder").authority("watch").appendPath(id).build())
      .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    val click = PendingIntent.getActivity(context, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, "program-reminders") else Notification.Builder(context)
    manager.notify(id, 0, builder.setSmallIcon(android.R.drawable.ic_media_play)
      .setContentTitle(item.getString("title").take(200))
      .setContentText("${item.getString("channelName").take(200)} · tap to watch")
      .setContentIntent(click).setAutoCancel(true).build())
  }
}

class ProgramReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == "PROGRAM_REMINDER") intent.getStringExtra("id")?.let { ReminderStore.fire(context, it) }
  }
}
class ReminderRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action in listOf(Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED, Intent.ACTION_TIME_CHANGED)) ReminderStore.restore(context)
  }
}
class StillwaveRemindersModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StillwaveReminders")
    Events("reminderOpen")
    AsyncFunction("sync") { serialized: String ->
      val context = appContext.reactContext?.applicationContext ?: throw IllegalStateException("Application not ready.")
      ReminderStore.sync(context, serialized)
    }
    Function("consumeChannel") {
      val activity = appContext.currentActivity
      val channel = ReminderStore.pendingChannel ?: activity?.intent?.getStringExtra(ReminderStore.CHANNEL_EXTRA)
      ReminderStore.pendingChannel = null; activity?.intent?.removeExtra(ReminderStore.CHANNEL_EXTRA)
      channel
    }
    OnNewIntent { intent ->
      intent.getStringExtra(ReminderStore.CHANNEL_EXTRA)?.let {
        ReminderStore.pendingChannel = it; intent.removeExtra(ReminderStore.CHANNEL_EXTRA)
        sendEvent("reminderOpen", emptyMap<String, String>())
      }
    }
  }
}
