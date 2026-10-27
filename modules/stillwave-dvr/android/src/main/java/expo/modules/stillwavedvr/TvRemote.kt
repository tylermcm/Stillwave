package expo.modules.stillwavedvr

import android.app.UiModeManager
import android.content.Context
import android.content.res.Configuration
import android.view.KeyEvent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

object TvRemote {
  @Volatile var enabled = false
  @Volatile var listener: ((String) -> Unit)? = null
  fun dispatch(event: KeyEvent): Boolean {
    if (!enabled || listener == null) return false
    val key = when (event.keyCode) {
      KeyEvent.KEYCODE_DPAD_UP -> "up"
      KeyEvent.KEYCODE_DPAD_DOWN -> "down"
      KeyEvent.KEYCODE_DPAD_LEFT -> "left"
      KeyEvent.KEYCODE_DPAD_RIGHT -> "right"
      KeyEvent.KEYCODE_DPAD_CENTER, KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER, KeyEvent.KEYCODE_BUTTON_A -> "select"
      KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_BUTTON_B -> "back"
      KeyEvent.KEYCODE_MENU -> "menu"
      KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE, KeyEvent.KEYCODE_MEDIA_PLAY, KeyEvent.KEYCODE_MEDIA_PAUSE -> "playPause"
      KeyEvent.KEYCODE_MEDIA_REWIND -> "rewind"
      KeyEvent.KEYCODE_MEDIA_FAST_FORWARD -> "fastForward"
      KeyEvent.KEYCODE_CHANNEL_UP -> "channelUp"
      KeyEvent.KEYCODE_CHANNEL_DOWN -> "channelDown"
      KeyEvent.KEYCODE_R, KeyEvent.KEYCODE_PROG_RED, KeyEvent.KEYCODE_1, KeyEvent.KEYCODE_MEDIA_RECORD -> "record"
      KeyEvent.KEYCODE_S, KeyEvent.KEYCODE_PROG_GREEN, KeyEvent.KEYCODE_2 -> "series"
      KeyEvent.KEYCODE_X, KeyEvent.KEYCODE_PROG_YELLOW, KeyEvent.KEYCODE_3 -> "delete"
      KeyEvent.KEYCODE_D, KeyEvent.KEYCODE_PROG_BLUE, KeyEvent.KEYCODE_4 -> "dvr"
      KeyEvent.KEYCODE_G, KeyEvent.KEYCODE_GUIDE, KeyEvent.KEYCODE_5 -> "guide"
      else -> return false
    }
    if (event.action == KeyEvent.ACTION_DOWN && (event.repeatCount == 0 || key in listOf("up", "down", "left", "right", "rewind", "fastForward"))) listener?.invoke(key)
    return true
  }
}

class StillwaveTvModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StillwaveTv")
    Events("remoteKey")
    Constants {
      val context = appContext.reactContext
      val manager = context?.getSystemService(Context.UI_MODE_SERVICE) as? UiModeManager
      mapOf("isTv" to (manager?.currentModeType == Configuration.UI_MODE_TYPE_TELEVISION))
    }
    OnStartObserving { TvRemote.listener = { key -> sendEvent("remoteKey", mapOf("key" to key)) } }
    OnStopObserving { TvRemote.listener = null }
    Function("setRemoteEnabled") { enabled: Boolean -> TvRemote.enabled = enabled }
    OnDestroy { TvRemote.enabled = false; TvRemote.listener = null }
  }
}
