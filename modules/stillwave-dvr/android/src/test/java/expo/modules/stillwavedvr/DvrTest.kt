package expo.modules.stillwavedvr

import org.junit.Assert.*
import org.junit.Test
import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.URL
import java.nio.file.Files
import java.util.concurrent.atomic.AtomicInteger

class DvrTest {
  @Test fun masterChoosesMuxedRenditionAndResolvesRedirectRelativePaths() {
    val master = """#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="separate",URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=9000000
huge.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=5000000
video/main.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=7000000,AUDIO="separate"
silent.m3u8
"""
    assertEquals("https://example.test/new/video/main.m3u8", Hls.variant(master, "https://example.test/new/master.m3u8"))
  }
  @Test fun preservesSequenceDurationsInitAndDiscontinuities() {
    val parsed = Hls.parse("""#EXTM3U
#EXT-X-MEDIA-SEQUENCE:99
#EXT-X-TARGETDURATION:7
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.25,
first.m4s
#EXT-X-DISCONTINUITY
#EXTINF:6.1,
second.m4s
#EXT-X-ENDLIST
""", "https://example.test/a/main.m3u8")
    assertEquals(99L, parsed.segments[0].sequence)
    assertEquals(100L, parsed.segments[1].sequence)
    assertEquals("https://example.test/a/init.mp4", parsed.segments[0].initUrl)
    assertTrue(parsed.segments[1].discontinuity); assertTrue(parsed.ended)
    val manifest = Hls.manifest(listOf(DvrSegment(42, "segment-42.bin", 6.25, 1_700_000_000_000, true, "init-0.bin", 100)), true, 3) { it }
    assertTrue(manifest.contains("#EXT-X-MEDIA-SEQUENCE:42")); assertTrue(manifest.contains("#EXT-X-DISCONTINUITY-SEQUENCE:3"))
    assertTrue(manifest.contains("#EXT-X-PROGRAM-DATE-TIME:")); assertTrue(manifest.endsWith("#EXT-X-ENDLIST\n"))
    assertFalse(manifest.contains("example.test"))
  }
  @Test fun rejectsUnsupportedEncryptionAndByteRanges() {
    for (line in listOf("#EXT-X-KEY:METHOD=AES-128,URI=\"key\"", "#EXT-X-BYTERANGE:100@0", "#EXT-X-MAP:URI=\"init\",BYTERANGE=\"100@0\"")) {
      try { Hls.parse("#EXTM3U\n$line\n#EXTINF:6,\nvideo.ts", "https://example.test/a.m3u8"); fail("Must reject $line") }
      catch (_: UnsupportedDvr) { }
    }
  }
  @Test fun recordsOneCaptureContinuesAfterPlayerClosesAndSurvivesRestart() {
    val sequence = AtomicInteger(10)
    val requests = AtomicInteger()
    val provider = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
    Thread({
      while (!provider.isClosed) try { provider.accept().use { client ->
        val input = client.getInputStream().bufferedReader()
        val path = input.readLine().split(' ')[1]
        val headers = mutableMapOf<String, String>()
        while (true) { val line = input.readLine() ?: break; if (line.isEmpty()) break; headers[line.substringBefore(':').lowercase()] = line.substringAfter(':').trim() }
        val allowed = headers["x-provider-key"] == "private-key"
        val body = if (path.endsWith(".m3u8")) {
          val first = sequence.get()
          "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:$first\n#EXT-X-TARGETDURATION:1\n" + (first..first + 2).joinToString("") { "#EXTINF:1,\nseg-$it.ts\n" }
        } else { requests.incrementAndGet(); "fixture-video-$path" }
        val bytes = body.toByteArray()
        val status = if (allowed) "200 OK" else "403 Forbidden"
        val out = client.getOutputStream(); out.write("HTTP/1.1 $status\r\nContent-Length: ${bytes.size}\r\nConnection: close\r\n\r\n".toByteArray()); out.write(bytes); out.flush()
      } } catch (_: Exception) { }
    }, "DVR fixture provider").apply { isDaemon = true; start() }
    val root = Files.createTempDirectory("stillwave-dvr-test").toFile()
    var engine = DvrEngine(root, bufferSeconds = 5.0)
    try {
      val opened = engine.open("owner", "channel", "Fixture", "http://127.0.0.1:${provider.localPort}/main.m3u8", mapOf("X-Provider-Key" to "private-key"))
      val id = opened["sessionId"] as String
      await { engine.snapshot(id)["ready"] == true && engine.snapshot(id)["duration"] == 3.0 }
      assertEquals(3, requests.get())
      val prepared = engine.prepareRecording("scheduled-owner", "channel", "Fixture", "http://127.0.0.1:${provider.localPort}/main.m3u8", emptyMap())
      assertEquals(id, prepared["sessionId"]); assertEquals(false, prepared["jobOwnsCapture"])
      try { engine.prepareRecording("other-owner", "different", "Different", "http://127.0.0.1:${provider.localPort}/main.m3u8", emptyMap()); fail("Must preserve a visible player on another channel") } catch (_: IllegalStateException) {}
      val recorded = engine.startRecording(id, "A show", 0.0, mapOf("jobId" to "job", "programmeStart" to "123", "episode" to "S4 E9")); val recordingId = recorded["id"] as String
      assertEquals("channel", recorded["channelId"]); assertEquals("job", recorded["jobId"]); assertEquals(123L, recorded["programmeStart"]); assertEquals("S4 E9", recorded["episode"])
      try { engine.prepareRecording("duplicate", "channel", "Fixture", "http://127.0.0.1:${provider.localPort}/main.m3u8", emptyMap()); fail("Must not start a second recording") } catch (_: IllegalStateException) {}
      val recordingUri = engine.recordingSource(recordingId)["uri"] as String
      assertFalse(URL(recordingUri).readText().contains("ENDLIST"))
      engine.release("owner")
      sequence.incrementAndGet()
      await { (engine.listRecordings().first()["duration"] as Double) >= 2 }
      assertEquals(4, requests.get()) // Watching/recording didn't download duplicate upstream segments.
      assertNotNull(engine.tuningConflict("different")); assertNull(engine.tuningConflict("channel"))
      val originalStart = opened["startMs"] as Long
      val beforeSlide = engine.snapshot(id)["startMs"] as Long
      sequence.addAndGet(3)
      await { requests.get() == 7 && engine.snapshot(id)["duration"] == 5.0 }
      sequence.incrementAndGet()
      await { requests.get() == 8 && engine.snapshot(id)["duration"] == 5.0 }
      assertTrue((engine.snapshot(id)["startMs"] as Long) > beforeSlide)
      assertTrue((engine.snapshot(id)["startMs"] as Long) > originalStart)
      assertFalse(File(root, "buffers/$id/segment-2.bin").exists())
      try { engine.open("other", "different", "Other channel", "http://unused", emptyMap()); fail("One-capture conflict must be explicit") } catch (_: IllegalStateException) { }
      engine.stopRecording(recordingId)
      val manifest = URL(recordingUri).readText()
      assertTrue(manifest.contains("ENDLIST")); assertFalse(manifest.contains("private-key")); assertFalse(manifest.contains("main.m3u8"))
      val segment = manifest.lineSequence().first { it.startsWith("segment-") }
      assertEquals("segment-2.bin", segment) // Saved recording outlives rolling-buffer eviction.
      val connection = URL(recordingUri.substringBeforeLast('/') + "/$segment").openConnection()
      connection.setRequestProperty("Range", "bytes=0-6")
      assertEquals("fixture", connection.getInputStream().bufferedReader().readText())
      engine.savePosition(recordingId, 1.2)
      engine.close(); engine = DvrEngine(root)
      val restored = engine.listRecordings().single()
      assertEquals("completed", restored["status"]); assertEquals(1.2, restored["position"])
      assertTrue(URL(engine.recordingSource(recordingId)["uri"] as String).readText().contains("ENDLIST"))
      engine.deleteRecording(recordingId); assertTrue(engine.listRecordings().isEmpty())

      val next = engine.open("write-failure", "channel", "Fixture", "http://127.0.0.1:${provider.localPort}/main.m3u8", mapOf("X-Provider-Key" to "private-key"))
      val nextId = next["sessionId"] as String
      await { engine.snapshot(nextId)["duration"] == 3.0 }
      File(root, "buffers/$nextId/segment-2.bin").delete()
      try { engine.startRecording(nextId, "Cannot copy first segment", 0.0); fail("A failed first copy must reject recording") } catch (_: IllegalStateException) { }
      assertNull(engine.snapshot(nextId)["recordingId"]); assertTrue(engine.listRecordings().isEmpty())
      engine.release("write-failure")

      val timed = engine.open("timed", "channel", "Fixture", "http://127.0.0.1:${provider.localPort}/main.m3u8", mapOf("X-Provider-Key" to "private-key"))
      val timedId = timed["sessionId"] as String
      await { engine.snapshot(timedId)["duration"] == 3.0 }
      engine.startRecording(timedId, "Stop during a frozen source playlist", (System.currentTimeMillis() + 200).toDouble())
      engine.release("timed")
      await { engine.listRecordings().single()["status"] == "completed" }
      assertFalse(engine.hasActiveCapture())
    } finally { engine.close(); provider.close(); root.deleteRecursively() }
  }
  private fun await(condition: () -> Boolean) {
    val end = System.currentTimeMillis() + 8000
    while (!condition() && System.currentTimeMillis() < end) Thread.sleep(25)
    assertTrue("Timed out waiting for ingestion", condition())
  }
}
