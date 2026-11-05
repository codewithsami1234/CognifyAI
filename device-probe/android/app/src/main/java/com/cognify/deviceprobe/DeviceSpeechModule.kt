package com.cognify.deviceprobe

import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.Locale

/**
 * Android text-to-speech. Speech stays on the device.
 * Pause reports a character offset only on API 26 and newer.
 */
class DeviceSpeechModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  private var engine: TextToSpeech? = null
  private var ready = false
  private var spokenCharacters = 0

  @ReactMethod
  fun available(promise: Promise) {
    if (engine != null) {
      promise.resolve(ready)
      return
    }
    engine =
      TextToSpeech(context) { status ->
        finishEngine(status, promise)
      }
  }

  private fun finishEngine(status: Int, promise: Promise) {
    val current = engine
    if (current == null) {
      ready = false
      promise.resolve(false)
      return
    }
    ready = status == TextToSpeech.SUCCESS
    if (ready) {
      val language = current.setLanguage(Locale.getDefault())
      if (language == TextToSpeech.LANG_MISSING_DATA || language == TextToSpeech.LANG_NOT_SUPPORTED) {
        ready = false
      }
    }
    if (ready && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      current.setOnUtteranceProgressListener(
        object : UtteranceProgressListener() {
          override fun onStart(utteranceId: String?) {
            spokenCharacters = 0
          }

          override fun onRangeStart(utteranceId: String?, start: Int, end: Int, frame: Int) {
            spokenCharacters = start
          }

          override fun onDone(utteranceId: String?) = Unit

          @Deprecated("Required by UtteranceProgressListener")
          override fun onError(utteranceId: String?) = Unit
        },
      )
    }
    if (!ready) {
      current.shutdown()
      engine = null
    }
    promise.resolve(ready)
  }

  @ReactMethod
  fun speak(text: String, promise: Promise) {
    val current = engine
    if (!ready || current == null) {
      promise.resolve(false)
      return
    }
    spokenCharacters = 0
    val params = Bundle()
    val queued = current.speak(text, TextToSpeech.QUEUE_FLUSH, params, UTTERANCE)
    promise.resolve(queued == TextToSpeech.SUCCESS)
  }

  @ReactMethod
  fun stop(promise: Promise) {
    engine?.stop()
    promise.resolve(spokenCharacters.toDouble())
  }

  companion object {
    const val NAME = "DeviceSpeech"
    private const val UTTERANCE = "cognify-speech"
  }
}
