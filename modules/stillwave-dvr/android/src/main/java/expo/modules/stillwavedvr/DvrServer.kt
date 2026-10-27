package expo.modules.stillwavedvr

import java.io.File
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.util.UUID
import java.util.concurrent.Executors

/** Loopback-only playback. Capability URLs expose neither provider URLs nor filesystem paths. */
class DvrServer(private val source: (String) -> Pair<File, String>?) {
  private val token = UUID.randomUUID().toString()
  private val socket = ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"))
  private val clients = Executors.newFixedThreadPool(4)
  init {
    Thread({
      while (!socket.isClosed) try { val client = socket.accept(); clients.execute { serve(client) } } catch (_: Exception) { }
    }, "Stillwave DVR playback").apply { isDaemon = true; start() }
  }
  fun url(id: String) = "http://127.0.0.1:${socket.localPort}/$token/$id/index.m3u8"
  fun close() { socket.close(); clients.shutdownNow() }
  private fun serve(client: Socket) {
    client.use {
      try {
        client.soTimeout = 8000
        val input = client.getInputStream().bufferedReader(Charsets.US_ASCII)
        val request = input.readLine()?.takeIf { it.length < 4096 }?.split(' ') ?: return
        if (request.size < 2 || request[0] !in listOf("GET", "HEAD")) return
        val headers = mutableMapOf<String, String>(); var count = 0
        while (true) {
          val line = input.readLine() ?: break
          count += line.length; if (count > 8192) return
          if (line.isEmpty()) break
          headers[line.substringBefore(':').lowercase()] = line.substringAfter(':').trim()
        }
        val path = request[1].substringBefore('?').split('/').filter { it.isNotEmpty() }
        val out = client.getOutputStream()
        if (path.size != 3 || path[0] != token || !path[1].matches(Regex("[a-f0-9-]{36}")) || !path[2].matches(Regex("index\\.m3u8|segment-[0-9]+\\.bin|init-[0-9]+\\.bin"))) {
          out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".toByteArray()); return
        }
        val source = source(path[1]) ?: run { out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray()); return }
        val playlist = path[2] == "index.m3u8"
        val bytes = if (playlist) source.second.toByteArray(Charsets.UTF_8) else null
        val file = File(source.first, path[2])
        if (!playlist && !file.isFile) { out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".toByteArray()); return }
        val length = bytes?.size?.toLong() ?: file.length()
        val range = headers["range"]?.let { Regex("bytes=(\\d+)-(\\d*)").matchEntire(it) }
        val start = range?.groupValues?.get(1)?.toLongOrNull() ?: 0L
        val end = range?.groupValues?.get(2)?.toLongOrNull()?.coerceAtMost(length - 1) ?: (length - 1)
        if (start > end || start >= length) { out.write("HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */$length\r\nContent-Length: 0\r\n\r\n".toByteArray()); return }
        val size = end - start + 1
        out.write(buildString {
          append(if (range == null) "HTTP/1.1 200 OK\r\n" else "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes $start-$end/$length\r\n")
          append("Content-Type: ${if (playlist) "application/vnd.apple.mpegurl" else "application/octet-stream"}\r\nContent-Length: $size\r\nAccept-Ranges: bytes\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n")
        }.toByteArray())
        if (request[0] == "HEAD") return
        if (bytes != null) out.write(bytes, start.toInt(), size.toInt())
        else file.inputStream().use { stream ->
          stream.skip(start); var left = size; val data = ByteArray(64 * 1024)
          while (left > 0) { val n = stream.read(data, 0, minOf(data.size.toLong(), left).toInt()); if (n < 0) break; out.write(data, 0, n); left -= n }
        }
        out.flush()
      } catch (_: Exception) { /* A seek or player release can close a request early. */ }
    }
  }
}
