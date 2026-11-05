package com.cognify.deviceprobe

import android.os.StatFs
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

/**
 * Optional embedding-file download. The chat GGUF is never written or deleted here.
 * Only one HTTPS URL and one file name are accepted.
 */
class ModelFilesModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  private val running = AtomicBoolean(false)
  private val cancel = AtomicBoolean(false)
  private val status = AtomicReference("idle")
  private val received = java.util.concurrent.atomic.AtomicLong(0)
  private val total = java.util.concurrent.atomic.AtomicLong(-1)
  private val error = AtomicReference("")

  @ReactMethod
  fun embeddingPath(promise: Promise) {
    promise.resolve(embeddingFile().absolutePath)
  }

  @ReactMethod
  fun availableBytes(promise: Promise) {
    try {
      val stats = StatFs(context.filesDir.absolutePath)
      promise.resolve(stats.availableBytes.toDouble())
    } catch (failure: Exception) {
      promise.reject("STORAGE_FAILED", failure.message ?: "Available storage could not be read.")
    }
  }

  @ReactMethod
  fun downloadStatus(promise: Promise) {
    val map = Arguments.createMap()
    map.putString("status", status.get())
    map.putDouble("bytes", received.get().toDouble())
    map.putDouble("total", total.get().toDouble())
    map.putString("error", error.get())
    promise.resolve(map)
  }

  @ReactMethod
  fun startDownload(url: String, fileName: String, promise: Promise) {
    if (url != ALLOWED_URL) {
      promise.reject("URL_REJECTED", "Only the listed embedding-model URL can be downloaded.")
      return
    }
    if (fileName != ALLOWED_FILE) {
      promise.reject("NAME_REJECTED", "Only the optional embedding file can be downloaded.")
      return
    }
    if (!running.compareAndSet(false, true)) {
      promise.reject("BUSY", "A download is already running.")
      return
    }
    cancel.set(false)
    status.set("running")
    error.set("")
    thread(name = "cognify-model-download") {
      try {
        download()
      } finally {
        running.set(false)
      }
    }
    promise.resolve(true)
  }

  @ReactMethod
  fun cancelDownload(promise: Promise) {
    cancel.set(true)
    promise.resolve(true)
  }

  @ReactMethod
  fun deleteEmbedding(fileName: String, promise: Promise) {
    if (fileName != ALLOWED_FILE) {
      promise.reject("NAME_REJECTED", "This screen can delete only the optional embedding file.")
      return
    }
    if (running.get()) {
      promise.reject("BUSY", "The download is still running.")
      return
    }
    embeddingFile().delete()
    partialFile().delete()
    status.set("idle")
    received.set(0)
    total.set(-1)
    promise.resolve(true)
  }

  private fun download() {
    val destination = embeddingFile()
    val partial = partialFile()
    destination.parentFile?.mkdirs()
    if (destination.isFile && destination.length() > 0) {
      received.set(destination.length())
      total.set(destination.length())
      status.set("complete")
      return
    }
    var connection: HttpURLConnection? = null
    try {
      val startAt = if (partial.isFile) partial.length() else 0L
      received.set(startAt)
      connection = open(ALLOWED_URL, startAt, 0)
      val code = connection.responseCode
      if (code != HttpURLConnection.HTTP_OK && code != HttpURLConnection.HTTP_PARTIAL) {
        status.set("failed")
        error.set("The download server returned HTTP $code. The file was not saved.")
        return
      }
      val append = startAt > 0 && code == HttpURLConnection.HTTP_PARTIAL
      if (!append) {
        received.set(0)
      }
      val lengthHeader = connection.getHeaderField("Content-Length")
      val length = lengthHeader?.toLongOrNull()
      total.set(if (length == null) -1 else received.get() + length)
      connection.inputStream.use { input ->
        FileOutputStream(partial, append).use { output ->
          val buffer = ByteArray(16 * 1024)
          while (true) {
            if (cancel.get()) {
              status.set("cancelled")
              error.set("The download was cancelled. The partial file is kept so it can resume.")
              return
            }
            val count = input.read(buffer)
            if (count < 0) {
              break
            }
            output.write(buffer, 0, count)
            received.addAndGet(count.toLong())
          }
        }
      }
      if (destination.exists() && !destination.delete()) {
        status.set("failed")
        error.set("The previous embedding file could not be replaced.")
        return
      }
      if (!partial.renameTo(destination)) {
        status.set("failed")
        error.set("The downloaded file could not be moved into place.")
        return
      }
      status.set("complete")
      error.set("")
    } catch (failure: Exception) {
      status.set("failed")
      error.set(failure.message ?: "The download failed. The partial file is kept when it exists.")
    } finally {
      connection?.disconnect()
    }
  }

  private fun open(url: String, startAt: Long, redirects: Int): HttpURLConnection {
    val connection = URL(url).openConnection() as HttpURLConnection
    connection.instanceFollowRedirects = false
    connection.connectTimeout = 20000
    connection.readTimeout = 20000
    connection.setRequestProperty("User-Agent", "CognifyAI")
    if (startAt > 0) {
      connection.setRequestProperty("Range", "bytes=$startAt-")
    }
    connection.connect()
    val code = connection.responseCode
    if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP || code == 307 || code == 308) {
      val location = connection.getHeaderField("Location") ?: ""
      connection.disconnect()
      if (redirects >= 3) {
        throw IllegalStateException("The download redirected too many times.")
      }
      if (!location.startsWith("https://")) {
        throw IllegalStateException("The download redirect was not HTTPS, so it was refused.")
      }
      return open(location, startAt, redirects + 1)
    }
    return connection
  }

  private fun embeddingFile(): File = File(modelsDir(), ALLOWED_FILE)

  private fun partialFile(): File = File(modelsDir(), "$ALLOWED_FILE.partial")

  private fun modelsDir(): File = File(File(context.filesDir, "cognify"), "models")

  companion object {
    const val NAME = "ModelFiles"
    const val ALLOWED_FILE = "all-MiniLM-L6-v2-Q8_0.gguf"
    const val ALLOWED_URL =
      "https://huggingface.co/second-state/All-MiniLM-L6-v2-Embedding-GGUF/resolve/main/all-MiniLM-L6-v2-Q8_0.gguf"
  }
}
