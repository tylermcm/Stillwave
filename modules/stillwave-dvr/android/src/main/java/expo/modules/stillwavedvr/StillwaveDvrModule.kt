package expo.modules.stillwavedvr

import android.content.Context
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

object DvrRuntime {
  @Volatile private var instance: DvrEngine? = null
  fun engine(context: Context): DvrEngine = instance ?: synchronized(this) {
    instance ?: DvrEngine(File(context.filesDir, "dvr")).also { instance = it }
  }
}

class StillwaveDvrModule : Module() {
  private fun context() = appContext.reactContext?.applicationContext ?: throw IllegalStateException("The application is not ready.")
  override fun definition() = ModuleDefinition {
    Name("StillwaveDvr")
    AsyncFunction("open") { owner: String, channelId: String, name: String, url: String, headers: Map<String, String> ->
      val context = context()
      val engine = DvrRuntime.engine(context)
      val snapshot = engine.open(owner, channelId, name, url, headers)
      if (snapshot["cancelled"] != true) try {
        context.startForegroundService(Intent(context, DvrService::class.java))
      } catch (e: Exception) { engine.release(owner); throw IllegalStateException("Android could not start the DVR service. Open the app and try again.") }
      snapshot
    }
    Function("release") { owner: String -> DvrRuntime.engine(context()).release(owner) }
    AsyncFunction("snapshot") { id: String -> DvrRuntime.engine(context()).snapshot(id) }
    AsyncFunction("tuningConflict") { id: String -> DvrRuntime.engine(context()).tuningConflict(id) }
    AsyncFunction("startRecording") { id: String, title: String, stopAt: Double -> DvrRuntime.engine(context()).startRecording(id, title, stopAt) }
    AsyncFunction("stopRecording") { id: String -> DvrRuntime.engine(context()).stopRecording(id) }
    AsyncFunction("listRecordings") { DvrRuntime.engine(context()).listRecordings() }
    AsyncFunction("recordingSource") { id: String -> DvrRuntime.engine(context()).recordingSource(id) }
    AsyncFunction("savePosition") { id: String, seconds: Double -> DvrRuntime.engine(context()).savePosition(id, seconds) }
    AsyncFunction("deleteRecording") { id: String -> DvrRuntime.engine(context()).deleteRecording(id) }
  }
}
