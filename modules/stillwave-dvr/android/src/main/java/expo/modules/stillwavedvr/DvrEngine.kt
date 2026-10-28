package expo.modules.stillwavedvr

import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.util.Properties
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import kotlin.math.max

/** Native ingestion stays independent of React timers, playback pause, and Activity lifecycle. */
class DvrEngine(private val root: File, private val onIdle: () -> Unit = {}, private val bufferSeconds: Double = BUFFER_SECONDS, private val bufferBytes: Long = BUFFER_BYTES) {
  companion object {
    const val BUFFER_SECONDS = 30 * 60.0
    const val BUFFER_BYTES = 512L * 1024 * 1024
    const val RESERVE_BYTES = 256L * 1024 * 1024
  }
  private val lock = Any()
  private val records = File(root, "recordings").apply { mkdirs() }
  private val buffers = File(root, "buffers").apply { mkdirs() }
  private val server = DvrServer { id -> synchronized(lock) {
    current?.takeIf { it.id == id }?.let { Pair(it.directory, Hls.manifest(it.segments.toList(), it.ended, it.discontinuitySequence) { f -> f }) }
      ?: recordingDirectory(id)?.takeIf { it.exists() }?.let { dir -> Pair(dir, manifestFor(dir)) }
  } }
  private var current: Session? = null
  private var owner: String? = null
  private val cancelledOwners = mutableSetOf<String>()
  private val deadlines = Executors.newSingleThreadScheduledExecutor()
  private val playingRecordings = mutableSetOf<String>()
  private val retentionFile = File(root, "retention.properties")
  private var retentionDays = Properties().apply { if (retentionFile.exists()) retentionFile.inputStream().use { load(it) } }.getProperty("days", "0").toIntOrNull()?.takeIf { it in listOf(0, 7, 30) } ?: 0

  private class Session(val id: String, val channelId: String, val name: String, val url: String, val headers: Map<String, String>, val directory: File) {
    val segments = mutableListOf<DvrSegment>()
    val inits = mutableMapOf<String, String>()
    val executor = Executors.newSingleThreadExecutor()
    @Volatile var stopped = false
    @Volatile var connection: HttpURLConnection? = null
    var supported = true
    var ready = false
    var ended = false
    var error = ""
    var recordingId: String? = null
    var recordingEnd = 0L
    var deadline: ScheduledFuture<*>? = null
    var nextIndex = 0L
    var nextInit = 0L
    var nextMs = 0L
    var lastSourceSequence = -1L
    var discontinuitySequence = 0L
  }

  init {
    // Recover completed fragments after process death; never imply an interrupted job is still recording.
    records.listFiles()?.filter { it.isDirectory }?.forEach { dir ->
      val p = metadata(dir)
      if (p.getProperty("status") == "recording") {
        p.setProperty("status", "interrupted"); p.setProperty("note", "Recording stopped when Android closed the recording process.")
        saveMetadata(dir, p)
      }
    }
    buffers.listFiles()?.forEach { it.deleteRecursively() }
  }

  fun open(ownerId: String, channelId: String, name: String, url: String, headers: Map<String, String>): Map<String, Any?> = synchronized(lock) {
    if (cancelledOwners.remove(ownerId)) return@synchronized mapOf("cancelled" to true)
    val old = current
    if (old != null && old.channelId == channelId && !old.stopped) { owner = ownerId; return@synchronized snapshotLocked(old) }
    if (old?.recordingId != null) throw IllegalStateException("A recording is running on ${old.name}. Stop it in Recordings before opening another channel.")
    old?.let(::stopSession)
    val id = UUID.randomUUID().toString()
    val session = Session(id, channelId, name, url, headers, File(buffers, id).apply { mkdirs() })
    current = session; owner = ownerId
    session.executor.execute { ingest(session) }
    snapshotLocked(session)
  }

  fun release(ownerId: String) = synchronized(lock) {
    if (owner != ownerId) { cancelledOwners.add(ownerId); if (cancelledOwners.size > 32) cancelledOwners.remove(cancelledOwners.first()); return@synchronized }
    owner = null
    current?.takeIf { it.recordingId == null }?.let { stopSession(it); current = null; onIdle() }
  }

  fun snapshot(id: String): Map<String, Any?> = synchronized(lock) {
    val s = current?.takeIf { it.id == id } ?: return@synchronized mapOf("closed" to true)
    snapshotLocked(s)
  }
  fun hasActiveCapture(): Boolean = synchronized(lock) { current?.let { !it.stopped && !it.ended } == true }
  fun tuningConflict(channelId: String): String? = synchronized(lock) {
    current?.takeIf { it.recordingId != null && it.channelId != channelId }?.let { "A recording is running on ${it.name}. Stop it in Recordings before opening another channel." }
  }
  private fun snapshotLocked(s: Session): Map<String, Any?> = mapOf(
    "sessionId" to s.id, "uri" to server.url(s.id), "ready" to s.ready, "supported" to s.supported,
    "ended" to s.ended, "error" to s.error, "recordingId" to s.recordingId,
    "startMs" to (s.segments.firstOrNull()?.startMs ?: 0L), "endMs" to s.nextMs,
    "duration" to s.segments.sumOf { it.duration }, "bytes" to s.segments.sumOf { it.bytes },
    "limitSeconds" to bufferSeconds, "limitBytes" to bufferBytes
  )

  fun prepareRecording(ownerId: String, channelId: String, name: String, url: String, headers: Map<String, String>): Map<String, Any?> = synchronized(lock) {
    val old = current
    if (old?.recordingId != null) throw IllegalStateException("A recording is already running on ${old.name}. Only one stream is available.")
    if (old != null && old.channelId == channelId && !old.stopped) return@synchronized snapshotLocked(old) + mapOf("jobOwnsCapture" to false)
    if (old != null && owner != null) throw IllegalStateException("Stop playback on ${old.name} before recording another channel. Only one stream is available.")
    open(ownerId, channelId, name, url, headers) + mapOf("jobOwnsCapture" to true)
  }

  fun startRecording(id: String, title: String, stopAt: Double, extra: Map<String, String> = emptyMap()): Map<String, Any?> = synchronized(lock) {
    val s = current?.takeIf { it.id == id && it.ready && it.supported && !it.ended } ?: throw IllegalStateException("Wait for the DVR buffer to become ready.")
    if (s.recordingId != null) throw IllegalStateException("This channel is already recording.")
    require(stopAt.isFinite() && stopAt >= 0) { "Invalid recording end time." }
    if (stopAt > 0) require(stopAt > System.currentTimeMillis()) { "The recording end time has already passed." }
    val end = if (stopAt > 0) stopAt.toLong() else Long.MAX_VALUE
    ensureSpace()
    val recordingId = UUID.randomUUID().toString()
    val dir = File(records, recordingId).apply { check(mkdirs()) }
    val p = Properties().apply {
      setProperty("id", recordingId); setProperty("channel", s.name); setProperty("title", title.take(200).ifBlank { s.name })
      setProperty("createdAt", System.currentTimeMillis().toString()); setProperty("status", "recording")
      setProperty("channelId", s.channelId); setProperty("stopAt", if (end == Long.MAX_VALUE) "0" else end.toString())
      for (key in listOf("jobId", "programmeStart", "description", "episode")) extra[key]?.let { setProperty(key, it.take(4000)) }
      setProperty("segments", ""); setProperty("position", "0")
    }
    try { saveMetadata(dir, p) } catch (e: Exception) { dir.deleteRecursively(); throw IllegalStateException("Recording could not start. Check available device storage.", e) }
    s.recordingId = recordingId
    // Android's data-sync service budget is finite; the service timeout also finalizes safely.
    s.recordingEnd = end
    // Include the currently available segment so record-now has an immediate playable beginning.
    try {
      s.segments.lastOrNull()?.let { appendRecording(s, it) }
    } catch (e: Exception) {
      s.recordingId = null; s.recordingEnd = 0
      dir.deleteRecursively()
      throw IllegalStateException("Recording could not start. Check available device storage.", e)
    }
    scheduleDeadline(s, recordingId)
    recordingInfo(dir)
  }

  private fun scheduleDeadline(s: Session, recordingId: String) {
    s.deadline?.cancel(false)
    if (s.recordingEnd != Long.MAX_VALUE) s.deadline = deadlines.schedule({
      synchronized(lock) {
        if (current === s && s.recordingId == recordingId && System.currentTimeMillis() >= s.recordingEnd) {
          finishRecording(s, "completed", "Scheduled stop time reached.")
          if (owner == null) { stopSession(s); current = null; onIdle() }
        }
      }
    }, max(0L, s.recordingEnd - System.currentTimeMillis()), TimeUnit.MILLISECONDS)
  }

  fun extendRecording(id: String): Long = synchronized(lock) {
    val s = current?.takeIf { it.recordingId == id } ?: throw IllegalStateException("This recording is no longer running.")
    val now = System.currentTimeMillis()
    val stop = maxOf(now, s.recordingEnd.takeIf { it != Long.MAX_VALUE } ?: now) + 30 * 60_000L
    check(stop - now <= 24 * 60 * 60_000L) { "Recording end must be within the next day." }
    val dir = File(records, id); val p = metadata(dir)
    p.setProperty("stopAt", stop.toString()); saveMetadata(dir, p)
    s.recordingEnd = stop; scheduleDeadline(s, id); stop
  }

  fun stopRecording(id: String, note: String = ""): Unit = synchronized(lock) {
    val s = current?.takeIf { it.recordingId == id } ?: return@synchronized
    finishRecording(s, if (note.isEmpty()) "completed" else "interrupted", note)
    if (owner == null) { stopSession(s); current = null; onIdle() }
  }

  fun listRecordings(): List<Map<String, Any?>> = synchronized(lock) {
    cleanupWatchedLocked()
    records.listFiles()?.filter { it.isDirectory && File(it, "recording.properties").exists() }?.map(::recordingInfo)?.sortedByDescending { it["createdAt"] as Long } ?: emptyList()
  }
  fun recordingSource(id: String): Map<String, Any?> = synchronized(lock) {
    val dir = recordingDirectory(id)?.takeIf { it.exists() } ?: throw IllegalArgumentException("Recording not found.")
    playingRecordings.add(id)
    recordingInfo(dir) + mapOf("uri" to server.url(id))
  }
  fun savePosition(id: String, seconds: Double) = synchronized(lock) {
    val dir = recordingDirectory(id)?.takeIf { it.exists() } ?: return@synchronized
    require(seconds.isFinite()) { "Invalid playback position." }
    val p = metadata(dir); val duration = readSegments(p).sumOf { it.duration }
    p.setProperty("position", max(0.0, seconds).toString())
    if (p.getProperty("status") == "completed" && duration > 0 && seconds / duration >= .98 && p.getProperty("watchedAt", "0") == "0") p.setProperty("watchedAt", System.currentTimeMillis().toString())
    saveMetadata(dir, p)
  }
  fun releaseRecording(id: String) = synchronized(lock) { playingRecordings.remove(id); Unit }
  fun protectRecording(id: String, protect: Boolean) = synchronized(lock) {
    val dir = recordingDirectory(id)?.takeIf { it.exists() } ?: throw IllegalArgumentException("Recording not found.")
    val p = metadata(dir); p.setProperty("protected", protect.toString()); saveMetadata(dir, p)
  }
  fun setRetention(days: Int) = synchronized(lock) {
    require(days in listOf(0, 7, 30)) { "Choose Off, 7 days or 30 days." }
    val p = Properties().apply { setProperty("days", days.toString()) }
    val next = File(root, "retention.properties.tmp")
    next.outputStream().use { out -> p.store(out, "StillWave watched recording cleanup"); out.fd.sync() }
    Files.move(next.toPath(), retentionFile.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
    retentionDays = days
  }
  fun retentionDays(): Int = synchronized(lock) { retentionDays }
  private fun cleanupWatchedLocked() {
    if (retentionDays == 0) return
    val cutoff = System.currentTimeMillis() - retentionDays * 24 * 60 * 60_000L
    records.listFiles()?.filter { it.isDirectory && it.name !in playingRecordings && current?.recordingId != it.name }?.forEach { dir ->
      val p = metadata(dir); val watchedAt = p.getProperty("watchedAt", "0").toLongOrNull() ?: 0
      if (p.getProperty("status") == "completed" && p.getProperty("protected") != "true" && watchedAt > 0 && watchedAt <= cutoff) check(dir.deleteRecursively()) { "Could not remove an expired watched recording." }
    }
  }
  fun deleteRecording(id: String) = synchronized(lock) {
    check(current?.recordingId != id) { "Stop this recording before deleting it." }
    check(id !in playingRecordings) { "Close playback before deleting this recording." }
    recordingDirectory(id)?.let { dir ->
      check(metadata(dir).getProperty("protected") != "true") { "Unprotect this recording before deleting it." }
      check(!dir.exists() || dir.deleteRecursively()) { "Could not delete this recording." }
    }
  }
  fun shutdown(reason: String) = synchronized(lock) {
    current?.let { finishRecording(it, "interrupted", reason); stopSession(it) }; current = null; owner = null; onIdle()
  }

  private fun ingest(s: Session) {
    var mediaUrl = s.url
    var failures = 0
    try {
      for (depth in 0..3) {
        val (text, finalUrl) = getText(s, mediaUrl)
        val variant = Hls.variant(text, finalUrl)
        mediaUrl = variant ?: finalUrl
        if (variant == null) break
        if (depth == 3) throw UnsupportedDvr("This channel has too many nested HLS playlists.")
      }
      var first = true
      while (!s.stopped) {
        try {
          val (text, finalUrl) = getText(s, mediaUrl)
          val playlist = Hls.parse(text, finalUrl)
          val reset = !first && (playlist.segments.lastOrNull()?.sequence ?: 0) < s.lastSourceSequence
          if (reset) s.lastSourceSequence = -1
          val incoming = if (first) playlist.segments.takeLast(3) else playlist.segments.filter { it.sequence > s.lastSourceSequence }
          for ((i, source) in incoming.withIndex()) {
            if (s.stopped) break
            ensureSpace()
            val init = source.initUrl?.let { uri -> s.inits[uri] ?: run {
              val name = "init-${s.nextInit++}.bin"; download(s, uri, File(s.directory, name)); s.inits[uri] = name; name
            } }
            val file = "segment-${s.nextIndex}.bin"
            download(s, source.url, File(s.directory, file))
            synchronized(lock) {
              if (s.stopped) return@synchronized
              if (s.nextMs == 0L) s.nextMs = System.currentTimeMillis() - (incoming.drop(i).sumOf { it.duration } * 1000).toLong()
              val gap = s.lastSourceSequence >= 0 && source.sequence > s.lastSourceSequence + 1
              val segment = DvrSegment(s.nextIndex++, file, source.duration, s.nextMs, source.discontinuity || gap || reset && i == 0, init, File(s.directory, file).length())
              s.nextMs += (source.duration * 1000).toLong()
              s.segments.add(segment); s.lastSourceSequence = source.sequence
              if (s.recordingId != null) try { appendRecording(s, segment) } catch (e: Exception) {
                finishRecording(s, "interrupted", "A recording write failed. Earlier saved footage was kept.")
                throw e
              }
              prune(s)
              s.ready = true; s.error = ""; failures = 0
              if (System.currentTimeMillis() >= s.recordingEnd) finishRecording(s, "completed", "Scheduled stop time reached.")
            }
          }
          first = false
          synchronized(lock) {
            if (playlist.ended) { s.ended = true; finishRecording(s, "completed", "The source stream ended.") }
            if (owner == null && s.recordingId == null) { stopSession(s); if (current === s) current = null; onIdle() }
          }
          if (playlist.ended || s.stopped) break
          Thread.sleep((playlist.target * 450).toLong().coerceIn(500, 4000))
        } catch (e: UnsupportedDvr) { throw e }
        catch (e: Exception) {
          if (s.stopped || e is InterruptedException) break
          synchronized(lock) { s.error = "The incoming stream was interrupted. Retrying; saved footage is still available." }
          failures++
          if (failures >= 8 || root.usableSpace < RESERVE_BYTES) throw e
          Thread.sleep((failures * 1500L).coerceAtMost(10_000))
        }
      }
    } catch (e: Exception) {
      if (!s.stopped) synchronized(lock) {
        s.error = if (e is UnsupportedDvr) e.message ?: "DVR unavailable." else if (root.usableSpace < RESERVE_BYTES) "Recording stopped because device storage is almost full." else "The DVR capture stopped after repeated stream failures. Saved footage is still available."
        s.supported = e !is UnsupportedDvr
        s.ended = true
        finishRecording(s, "interrupted", s.error)
      }
    } finally {
      s.executor.shutdown()
      if (s.stopped) s.directory.deleteRecursively()
    }
  }

  private fun ensureSpace() { check(root.usableSpace >= RESERVE_BYTES) { "Not enough free storage for DVR." } }
  private fun prune(s: Session) {
    var bytes = s.segments.sumOf { it.bytes }
    var duration = s.segments.sumOf { it.duration }
    while (s.segments.size > 3 && (bytes > bufferBytes || duration > bufferSeconds)) {
      val old = s.segments.removeAt(0); bytes -= old.bytes; duration -= old.duration; File(s.directory, old.file).delete()
      if (old.discontinuity) s.discontinuitySequence++
    }
    val usedInits = s.segments.mapNotNull { it.initFile }.toSet()
    // Keep initialization files reusable by the current source, but cap their count.
    if (s.inits.size > 32) s.inits.entries.removeAll { (_, file) -> if (file !in usedInits) { File(s.directory, file).delete(); true } else false }
  }
  private fun stopSession(s: Session) {
    s.stopped = true; s.deadline?.cancel(false); s.executor.shutdownNow()
    // disconnect() can wait on a socket read. Never block a module/UI call or
    // the engine lock while cancelling a provider request.
    Thread({
      try { s.connection?.disconnect(); s.executor.awaitTermination(20, TimeUnit.SECONDS) }
      finally { s.directory.deleteRecursively() }
    }, "Stillwave DVR cleanup").apply { isDaemon = true; start() }
  }
  private fun finishRecording(s: Session, status: String, note: String) {
    val id = s.recordingId ?: return
    val dir = File(records, id); val p = metadata(dir)
    p.setProperty("status", status); p.setProperty("note", note); saveMetadata(dir, p); s.recordingId = null; s.recordingEnd = 0
    s.deadline?.cancel(false); s.deadline = null
  }
  private fun appendRecording(s: Session, segment: DvrSegment) {
    val dir = File(records, s.recordingId ?: return)
    if (segment.initFile != null && !File(dir, segment.initFile).exists()) Files.copy(File(s.directory, segment.initFile).toPath(), File(dir, segment.initFile).toPath())
    Files.copy(File(s.directory, segment.file).toPath(), File(dir, segment.file).toPath(), StandardCopyOption.REPLACE_EXISTING)
    val p = metadata(dir)
    val previous = readSegments(p)
    if (previous.lastOrNull()?.index == segment.index) return
    val list = previous + segment
    p.setProperty("segments", list.joinToString("\n") { "${it.index}\t${it.file}\t${it.duration}\t${it.startMs}\t${it.discontinuity}\t${it.initFile ?: ""}\t${it.bytes}" })
    saveMetadata(dir, p)
  }
  private fun recordingDirectory(id: String): File? = if (id.matches(Regex("[a-f0-9-]{36}"))) File(records, id) else null
  private fun readSegments(p: Properties): List<DvrSegment> = p.getProperty("segments", "").lineSequence().filter { it.isNotEmpty() }.map { line ->
    val a = line.split('\t'); DvrSegment(a[0].toLong(), a[1], a[2].toDouble(), a[3].toLong(), a[4].toBoolean(), a[5].ifEmpty { null }, a[6].toLong())
  }.toList()
  private fun manifestFor(dir: File): String { val p = metadata(dir); return Hls.manifest(readSegments(p), p.getProperty("status") != "recording") { it } }
  private fun recordingInfo(dir: File): Map<String, Any?> {
    val p = metadata(dir); val list = readSegments(p)
    return mapOf("id" to dir.name, "channel" to p.getProperty("channel", "Channel"), "title" to p.getProperty("title", "Recording"),
      "createdAt" to p.getProperty("createdAt", "0").toLong(), "status" to p.getProperty("status", "interrupted"), "note" to p.getProperty("note", ""),
      "duration" to list.sumOf { it.duration }, "bytes" to list.sumOf { it.bytes }, "position" to p.getProperty("position", "0").toDouble(),
      "channelId" to p.getProperty("channelId", ""), "stopAt" to p.getProperty("stopAt", "0").toLong(), "jobId" to p.getProperty("jobId", ""),
      "programmeStart" to p.getProperty("programmeStart", "0").toLong(), "description" to p.getProperty("description", ""), "episode" to p.getProperty("episode", ""),
      "protected" to (p.getProperty("protected") == "true"), "watchedAt" to p.getProperty("watchedAt", "0").toLong())
  }
  private fun metadata(dir: File): Properties = Properties().apply { File(dir, "recording.properties").takeIf { it.exists() }?.inputStream()?.use { load(it) } }
  private fun saveMetadata(dir: File, p: Properties) {
    val temp = File(dir, "recording.properties.tmp")
    temp.outputStream().use { out -> p.store(out, "Stillwave DVR"); out.fd.sync() }
    Files.move(temp.toPath(), File(dir, "recording.properties").toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
  }

  private fun connect(s: Session, address: String): HttpURLConnection {
    if (s.stopped) throw InterruptedException()
    val c = URL(address).openConnection() as HttpURLConnection
    c.connectTimeout = 12_000; c.readTimeout = 15_000; c.instanceFollowRedirects = true
    s.headers.forEach { (key, value) -> c.setRequestProperty(key, value) }
    s.connection = c
    val code = c.responseCode
    if (code !in 200..299) { c.disconnect(); throw IllegalStateException("Stream request failed ($code).") }
    return c
  }
  private fun getText(s: Session, address: String): Pair<String, String> {
    val c = connect(s, address)
    try { return c.inputStream.use { input ->
      if (c.contentType?.substringBefore(';')?.lowercase()?.startsWith("video/") == true) throw UnsupportedDvr("Local DVR currently supports HLS streams. This channel can still play without DVR.")
      val output = java.io.ByteArrayOutputStream(); val data = ByteArray(4096)
      while (true) {
        val count = input.read(data); if (count < 0) break
        output.write(data, 0, count)
        if (output.size() > 2 * 1024 * 1024) throw UnsupportedDvr("This channel does not provide a supported HLS playlist.")
        if (output.size() >= 16 && !String(output.toByteArray().take(16).toByteArray(), Charsets.UTF_8).trimStart('\uFEFF', ' ', '\r', '\n').startsWith("#EXTM3U")) throw UnsupportedDvr("Local DVR currently supports HLS streams. This channel can still play without DVR.")
      }
      val bytes = output.toByteArray()
      Pair(String(bytes, Charsets.UTF_8), c.url.toString())
    } } finally { c.disconnect(); s.connection = null }
  }
  fun close() { shutdown("The recording process stopped."); deadlines.shutdownNow(); server.close() }
  private fun download(s: Session, address: String, destination: File) {
    val c = connect(s, address); val temp = File(destination.path + ".part")
    try {
      c.inputStream.use { input -> temp.outputStream().use { output ->
        val data = ByteArray(64 * 1024); var total = 0L
        while (true) {
          if (s.stopped) throw InterruptedException()
          val n = input.read(data); if (n < 0) break
          total += n; if (total > 64L * 1024 * 1024) throw UnsupportedDvr("A stream segment exceeds the DVR size limit.")
          output.write(data, 0, n)
        }
        check(total > 0) { "Empty stream segment." }
      } }
      Files.move(temp.toPath(), destination.toPath(), StandardCopyOption.REPLACE_EXISTING)
    } finally { c.disconnect(); s.connection = null; temp.delete() }
  }
}
