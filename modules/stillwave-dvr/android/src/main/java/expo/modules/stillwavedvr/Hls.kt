package expo.modules.stillwavedvr

import java.net.URI
import java.time.Instant
import kotlin.math.ceil

class UnsupportedDvr(message: String) : Exception(message)

data class HlsSegment(val sequence: Long, val url: String, val duration: Double, val discontinuity: Boolean, val initUrl: String?)
data class HlsPlaylist(val segments: List<HlsSegment>, val ended: Boolean, val target: Double)
data class DvrSegment(val index: Long, val file: String, val duration: Double, val startMs: Long, val discontinuity: Boolean, val initFile: String?, val bytes: Long)

/** Parse complete media segments only. Partial LL-HLS fragments are never saved as complete footage. */
object Hls {
  private fun attributes(line: String): Map<String, String> =
    Regex("([A-Z0-9-]+)=(\"[^\"]*\"|[^,]*)").findAll(line.substringAfter(':')).associate { it.groupValues[1] to it.groupValues[2].trim('"') }

  fun resolve(base: String, reference: String): String {
    val uri = URI(base).resolve(reference.trim())
    if (uri.scheme !in listOf("http", "https")) throw UnsupportedDvr("DVR needs an HTTP or HTTPS stream.")
    return uri.toString()
  }

  fun variant(text: String, base: String): String? {
    val lines = text.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.toList()
    if (lines.firstOrNull()?.removePrefix("\uFEFF") != "#EXTM3U") throw UnsupportedDvr("Local DVR currently supports HLS streams. This channel can still play without DVR.")
    if (lines.any { it.startsWith("#EXT-X-SESSION-KEY:") && attributes(it)["METHOD"] != "NONE" }) throw UnsupportedDvr("DVR is unavailable for encrypted streams.")
    val externalAudio = lines.filter { it.startsWith("#EXT-X-MEDIA:") }.map(::attributes).filter { it["TYPE"] == "AUDIO" && it.containsKey("URI") }.map { it["GROUP-ID"] }.toSet()
    val variants = lines.mapIndexedNotNull { i, line ->
      if (!line.startsWith("#EXT-X-STREAM-INF:")) null else {
        val a = attributes(line)
        val url = lines.drop(i + 1).firstOrNull { !it.startsWith('#') }
        if (url == null || a["AUDIO"] in externalAudio) null else Pair(a["BANDWIDTH"]?.toLongOrNull() ?: 0L, resolve(base, url))
      }
    }
    if (variants.isEmpty() && lines.any { it.startsWith("#EXT-X-STREAM-INF:") }) throw UnsupportedDvr("This channel uses a separate audio feed. Play it normally; DVR support for that format is coming later.")
    // One stable rendition keeps recording and viewing on a single upstream feed.
    return variants.sortedBy { it.first }.lastOrNull { it.first <= 8_000_000L }?.second ?: variants.minByOrNull { it.first }?.second
  }

  fun parse(text: String, base: String): HlsPlaylist {
    var sequence = 0L
    var target = 6.0
    var duration: Double? = null
    var discontinuity = false
    var init: String? = null
    val result = mutableListOf<HlsSegment>()
    for (raw in text.lineSequence()) {
      val line = raw.trim()
      when {
        line.startsWith("#EXT-X-KEY:") && attributes(line)["METHOD"] != "NONE" -> throw UnsupportedDvr("DVR is unavailable for encrypted streams.")
        line.startsWith("#EXT-X-BYTERANGE:") -> throw UnsupportedDvr("DVR does not yet support byte-range HLS. This channel can still play normally.")
        line.startsWith("#EXT-X-MAP:") -> {
          val a = attributes(line)
          if (a.containsKey("BYTERANGE")) throw UnsupportedDvr("DVR does not yet support byte-range HLS.")
          init = resolve(base, a["URI"] ?: throw UnsupportedDvr("The channel has an invalid initialization segment."))
        }
        line.startsWith("#EXT-X-MEDIA-SEQUENCE:") -> sequence = line.substringAfter(':').toLong()
        line.startsWith("#EXT-X-TARGETDURATION:") -> target = line.substringAfter(':').toDouble().coerceIn(1.0, 120.0)
        line.startsWith("#EXTINF:") -> duration = line.substringAfter(':').substringBefore(',').toDouble().also { require(it.isFinite() && it > 0 && it <= 300) }
        line == "#EXT-X-DISCONTINUITY" -> discontinuity = true
        line.isNotEmpty() && !line.startsWith('#') && duration != null -> {
          result.add(HlsSegment(sequence++, resolve(base, line), duration, discontinuity, init))
          duration = null; discontinuity = false
        }
      }
    }
    if (result.isEmpty()) throw UnsupportedDvr("This HLS feed has no complete video segments to record yet.")
    return HlsPlaylist(result, text.lineSequence().any { it.trim() == "#EXT-X-ENDLIST" }, target)
  }

  fun manifest(segments: List<DvrSegment>, ended: Boolean, discontinuitySequence: Long = 0, uri: (String) -> String): String {
    val target = ceil(segments.maxOfOrNull { it.duration } ?: 6.0).toInt()
    return buildString {
      append("#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:$target\n#EXT-X-MEDIA-SEQUENCE:${segments.firstOrNull()?.index ?: 0}\n")
      append("#EXT-X-DISCONTINUITY-SEQUENCE:$discontinuitySequence\n")
      var init: String? = null
      for ((i, s) in segments.withIndex()) {
        if (s.discontinuity) append("#EXT-X-DISCONTINUITY\n")
        if (s.initFile != null && s.initFile != init) { append("#EXT-X-MAP:URI=\"${uri(s.initFile)}\"\n"); init = s.initFile }
        append("#EXT-X-PROGRAM-DATE-TIME:${Instant.ofEpochMilli(s.startMs)}\n#EXTINF:${s.duration},\n${uri(s.file)}\n")
      }
      if (ended) append("#EXT-X-ENDLIST\n")
    }
  }
}
