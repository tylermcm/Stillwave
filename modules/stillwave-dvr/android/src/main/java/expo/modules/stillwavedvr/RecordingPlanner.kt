package expo.modules.stillwavedvr

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.StatFs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/** Durable alarm jobs. All footage is produced by the same real DvrEngine used by live TV. */
object RecordingPlanner {
  private val executor = Executors.newSingleThreadExecutor()
  private val inflight = AtomicInteger(0)
  fun hasPendingWork() = inflight.get() > 0
  private fun prefs(context: Context) = context.getSharedPreferences("recording-planner", Context.MODE_PRIVATE)
  private fun rows(context: Context, key: String): MutableList<JSONObject> {
    val array = JSONArray(prefs(context).getString(key, "[]"))
    return (0 until array.length()).map { array.getJSONObject(it) }.toMutableList()
  }
  private fun save(context: Context, key: String, rows: List<JSONObject>) {
    check(prefs(context).edit().putString(key, JSONArray(rows).toString()).commit()) { "Could not save the recording schedule." }
  }
  private fun alarm(context: Context, id: String): PendingIntent = PendingIntent.getBroadcast(context, 0,
    Intent(context, RecordingAlarmReceiver::class.java).setAction("RECORD_PROGRAMME").setData(Uri.Builder().scheme("stillwave-recording").authority("start").appendPath(id).build()).putExtra("id", id),
    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  fun precise(context: Context): Boolean = Build.VERSION.SDK_INT < 31 || (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).canScheduleExactAlarms()
  @Synchronized fun schedule(context: Context, serialized: String): String {
    require(serialized.length <= 32 * 1024) { "Recording details are too large." }
    val job = JSONObject(serialized)
    val channelId = job.getString("channelId"); val start = job.getLong("start"); val stop = job.getLong("stop")
    require(channelId.isNotBlank() && channelId.length <= 2000 && job.getString("title").length <= 300)
    val url = URL(job.getString("url")); require(url.protocol in listOf("http", "https"))
    require(stop > maxOf(start, System.currentTimeMillis()) && stop - start <= 24 * 60 * 60_000L) { "Choose an upcoming program shorter than a day." }
    val headers = job.optJSONObject("headers") ?: JSONObject()
    require(headers.length() <= 20 && headers.toString().length <= 12 * 1024)
    val id = UUID.nameUUIDFromBytes("$channelId:$start:${job.getString("title")}".toByteArray()).toString()
    val jobs = rows(context, "jobs")
    jobs.firstOrNull { it.getString("id") == id }?.let {
      if (!job.optBoolean("retry") || it.optString("status") !in listOf("cancelled", "failed", "missed", "conflict")) return it.toString()
      jobs.remove(it)
    }
    require(jobs.count { it.optString("status") in listOf("scheduled", "starting", "recording") } < 200) { "Keep at most 200 upcoming recordings." }
    job.put("id", id).put("status", "scheduled").put("error", "").put("recordingId", "")
    jobs.add(job)
    val active = jobs.filter { it.optString("status") in listOf("scheduled", "starting", "recording") }
    val archived = jobs.filter { it !in active }.takeLast(1000 - active.size)
    save(context, "jobs", archived + active); setAlarm(context, job)
    return job.toString()
  }
  private fun setAlarm(context: Context, job: JSONObject) {
    if (job.optString("status") != "scheduled") return
    val manager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val at = maxOf(System.currentTimeMillis() + 1000, job.getLong("start"))
    if (precise(context)) manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarm(context, job.getString("id")))
    else manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, alarm(context, job.getString("id")))
  }
  @Synchronized fun restore(context: Context) {
    val jobs = rows(context, "jobs"); val now = System.currentTimeMillis()
    jobs.forEach { job ->
      if (job.optString("status") == "starting" && !hasPendingWork()) job.put("status", "failed").put("error", "Android closed the app while this recording was starting.")
      if (job.optString("status") == "scheduled" && job.getLong("stop") <= now) job.put("status", "missed").put("error", "The program ended while recording was unavailable.")
      setAlarm(context, job)
    }
    save(context, "jobs", jobs)
  }
  @Synchronized fun plans(context: Context): String {
    val recordings = DvrRuntime.engine(context).listRecordings().associateBy { it["id"] as String }
    val jobs = rows(context, "jobs")
    var changed = false
    jobs.filter { it.optString("status") == "recording" }.forEach { job ->
      val record = recordings[job.optString("recordingId")]
      if (record == null || record["status"] != "recording") { job.put("status", record?.get("status") ?: "interrupted").put("error", record?.get("note") ?: "The recording is no longer available."); changed = true }
    }
    if (changed) save(context, "jobs", jobs)
    // Stream addresses stay app-private; do not expose them in UI diagnostics.
    return JSONArray(jobs).toString()
  }
  @Synchronized fun cancel(context: Context, id: String) {
    val jobs = rows(context, "jobs"); val job = jobs.find { it.getString("id") == id } ?: return
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(alarm(context, id))
    if (job.optString("recordingId").isNotBlank()) DvrRuntime.engine(context).stopRecording(job.getString("recordingId"))
    job.put("status", "cancelled"); save(context, "jobs", jobs)
  }
  @Synchronized private fun change(context: Context, id: String, change: (JSONObject) -> Unit): JSONObject? {
    val jobs = rows(context, "jobs"); val job = jobs.find { it.getString("id") == id } ?: return null
    change(job); save(context, "jobs", jobs); return job
  }
  @Synchronized fun fail(context: Context, id: String, message: String) { change(context, id) { it.put("status", "failed").put("error", message) } }
  fun start(context: Context, id: String) {
    inflight.incrementAndGet()
    executor.execute {
      val engine = DvrRuntime.engine(context); val owner = "recording-job:$id"; var ownsCapture = false
      try {
        val job = synchronized(this) {
          val found = rows(context, "jobs").find { it.getString("id") == id && it.optString("status") == "scheduled" }
          if (found != null) change(context, id) { it.put("status", "starting") } else null
        } ?: return@execute
        check(job.getLong("stop") > System.currentTimeMillis()) { "The program ended before recording could start." }
        val headers = job.optJSONObject("headers") ?: JSONObject()
        val headerMap = headers.keys().asSequence().associateWith { headers.getString(it) }
        val prepared = engine.prepareRecording(owner, job.getString("channelId"), job.getString("channelName"), job.getString("url"), headerMap)
        ownsCapture = prepared["jobOwnsCapture"] == true
        val sessionId = prepared["sessionId"] as String
        val deadline = minOf(job.getLong("stop"), System.currentTimeMillis() + 30_000)
        while (true) {
          val state = engine.snapshot(sessionId)
          check(state["closed"] != true && state["supported"] != false) { "This stream does not support local recording." }
          if (state["ready"] == true) break
          check(System.currentTimeMillis() < deadline) { "The stream did not become ready before the recording deadline." }
          synchronized(this) { check(rows(context, "jobs").any { it.getString("id") == id && it.optString("status") == "starting" }) { "Recording cancelled." } }
          Thread.sleep(250)
        }
        synchronized(this) {
          check(rows(context, "jobs").any { it.getString("id") == id && it.optString("status") == "starting" }) { "Recording cancelled." }
          val record = engine.startRecording(sessionId, job.getString("title"), job.getLong("stop").toDouble(), mapOf("jobId" to id, "programmeStart" to job.getLong("start").toString(), "description" to job.optString("description"), "episode" to job.optString("episode")))
          change(context, id) { it.put("status", "recording").put("recordingId", record["id"]) }
        }
      } catch (e: Exception) {
        val known = e.message.orEmpty()
        val safe = when {
          known.contains("Only one stream") -> known
          known in listOf("This stream does not support local recording.", "The stream did not become ready before the recording deadline.", "The program ended before recording could start.", "Recording cancelled.") -> known
          else -> "Recording could not start. Check the stream and available storage."
        }
        if (known != "Recording cancelled.") synchronized(this) { change(context, id) { it.put("status", if (known.contains("Only one stream")) "conflict" else "failed").put("error", safe) } }
      } finally { if (ownsCapture) engine.release(owner); inflight.decrementAndGet() }
    }
  }
  @Synchronized fun rules(context: Context) = JSONArray(rows(context, "rules")).toString()
  @Synchronized fun addRule(context: Context, serialized: String): String {
    require(serialized.length <= 16 * 1024)
    val rule = JSONObject(serialized); require(rule.getString("title").length <= 300 && rule.getString("channelId").length <= 2000)
    val rules = rows(context, "rules")
    val id = UUID.nameUUIDFromBytes("${rule.getString("channelId")}:${rule.getString("title")}".toByteArray()).toString()
    rules.firstOrNull { it.getString("id") == id }?.let { return it.toString() }
    require(rules.size < 100) { "Keep at most 100 series rules." }
    rule.put("id", id); rules.add(rule); save(context, "rules", rules); return rule.toString()
  }
  @Synchronized fun removeRule(context: Context, id: String) {
    save(context, "rules", rows(context, "rules").filter { it.getString("id") != id })
    rows(context, "jobs").filter { it.optString("seriesId") == id && it.optString("status") in listOf("scheduled", "starting") }.forEach { cancel(context, it.getString("id")) }
  }
}

class RecordingAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getStringExtra("id") ?: return
    try { context.startForegroundService(Intent(context, DvrService::class.java).setAction("START_SCHEDULED_RECORDING").putExtra("id", id)) }
    catch (_: Exception) { RecordingPlanner.fail(context, id, "Android did not allow background recording to start. Open Stillwave and check alarm/background permissions.") }
  }
}
class RecordingRestoreReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) { RecordingPlanner.restore(context) }
}
class StillwaveRecordingPlannerModule : Module() {
  private fun context() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("The app is not ready.")
  override fun definition() = ModuleDefinition {
    Name("StillwaveRecordingPlanner")
    AsyncFunction("schedule") { serialized: String -> RecordingPlanner.schedule(context(), serialized) }
    AsyncFunction("plans") { RecordingPlanner.plans(context()) }
    AsyncFunction("cancel") { id: String -> RecordingPlanner.cancel(context(), id) }
    AsyncFunction("rules") { RecordingPlanner.rules(context()) }
    AsyncFunction("addRule") { serialized: String -> RecordingPlanner.addRule(context(), serialized) }
    AsyncFunction("removeRule") { id: String -> RecordingPlanner.removeRule(context(), id) }
    AsyncFunction("restore") { RecordingPlanner.restore(context()) }
    Function("precise") { RecordingPlanner.precise(context()) }
    AsyncFunction("storage") { val fs = StatFs(context().filesDir.absolutePath); mapOf("totalBytes" to fs.totalBytes, "freeBytes" to fs.availableBytes) }
  }
}
