package expo.modules.stillwavedvr

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

class UpdateFileProvider : FileProvider()

class StillwaveUpdatesModule : Module() {
  private val busy = AtomicBoolean(false)
  override fun definition() = ModuleDefinition {
    Name("StillwaveUpdates")
    AsyncFunction("install") { address: String, digest: String ->
      check(busy.compareAndSet(false, true)) { "An update is already in progress." }
      try { install(address, digest) } finally { busy.set(false) }
    }
  }
  private fun install(address: String, expectedDigest: String): String {
    val context = appContext.reactContext?.applicationContext ?: error("The app is not ready.")
    val initial = URL(address)
    require(initial.protocol == "https" && initial.host == "github.com" && initial.userInfo == null && initial.port == -1 && initial.path.startsWith("/tylermcm/Stillwave/releases/download/") && initial.path.endsWith(".apk")) { "Updates must come from the StillWave GitHub releases." }
    require(expectedDigest.isEmpty() || expectedDigest.matches(Regex("[a-f0-9]{64}"))) { "Invalid update checksum." }
    if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) {
      try { context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      catch (_: android.content.ActivityNotFoundException) { context.startActivity(Intent(Settings.ACTION_SECURITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
      return "permission"
    }
    val directory = File(context.cacheDir, "updates").apply { mkdirs() }
    val temporary = File(directory, "update.next.apk")
    val apk = File(directory, "update.apk")
    try {
      var url = initial
      var connection: HttpURLConnection? = null
      for (redirect in 0..5) {
        require(url.protocol == "https" && url.userInfo == null && url.port == -1 && (url.host == "github.com" || url.host.endsWith(".githubusercontent.com"))) { "Unexpected update redirect." }
        val request = (url.openConnection() as HttpURLConnection).apply { connectTimeout = 15000; readTimeout = 20000; instanceFollowRedirects = false; setRequestProperty("User-Agent", "StillWave updater"); setRequestProperty("Accept", "application/octet-stream") }
        val status = request.responseCode
        if (status in listOf(301, 302, 303, 307, 308)) {
          val next = request.getHeaderField("Location") ?: error("Update redirect missing destination.")
          request.disconnect(); url = URL(url, next); continue
        }
        if (status != 200) { request.disconnect(); error("Update download failed (HTTP $status).") }
        connection = request; break
      }
      val request = connection ?: error("Too many update redirects.")
      val checksum = MessageDigest.getInstance("SHA-256")
      try {
        require(request.contentLengthLong <= 150L * 1024 * 1024) { "Update file is too large." }
        request.inputStream.use { input -> temporary.outputStream().use { output ->
          val buffer = ByteArray(64 * 1024); var total = 0L
          while (true) { val count = input.read(buffer); if (count < 0) break; total += count; require(total <= 150L * 1024 * 1024) { "Update file is too large." }; output.write(buffer, 0, count); checksum.update(buffer, 0, count) }
        } }
      } finally { request.disconnect() }
      val hash = checksum.digest().joinToString("") { "%02x".format(it) }
      require(expectedDigest.isEmpty() || hash == expectedDigest) { "Update checksum did not match. Try downloading again." }
      verifyApk(context, temporary)
      if (apk.exists()) check(apk.delete()) { "Could not replace the previous update file." }
      check(temporary.renameTo(apk)) { "Could not prepare the update." }
      val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", apk)
      context.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION))
      return "installer"
    } finally { temporary.delete() }
  }
  @Suppress("DEPRECATION")
  private fun verifyApk(context: Context, file: File) {
    val manager = context.packageManager
    val flags = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
    val candidate = manager.getPackageArchiveInfo(file.absolutePath, flags) ?: error("Downloaded file is not a valid APK.")
    val current = manager.getPackageInfo(context.packageName, flags)
    require(candidate.packageName == context.packageName) { "Update is for a different app." }
    fun code(info: PackageInfo) = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
    require(code(candidate) > code(current)) { "This APK is not newer than the installed version." }
    fun certificates(info: PackageInfo): Set<String> {
      val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
      return signatures?.map { signature -> MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) } }?.toSet() ?: emptySet()
    }
    val expected = setOf("0ba646c4573a26633392f443c9891b371891fb655a863fedfcdefb59fe732060")
    require(certificates(candidate) == expected && certificates(current) == expected) { "Update signing identity did not match StillWave." }
    require((candidate.applicationInfo?.minSdkVersion ?: Int.MAX_VALUE) <= Build.VERSION.SDK_INT) { "This update requires a newer Android version." }
  }
}
