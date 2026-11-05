package com.cognify.deviceprobe

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File
import java.io.IOException

/**
 * JSON files for quiz history, the unfinished quiz, and the document library.
 * Names are restricted. Paths outside this app's files are not read.
 * File contents are not logged.
 * The GGUF model is not stored here and is not deleted by [remove].
 */
class LocalStoreModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  @ReactMethod
  fun read(name: String, promise: Promise) {
    try {
      val file = namedFile(name)
      if (file == null) {
        promise.reject("INVALID_NAME", "The local store name is not allowed.")
        return
      }
      promise.resolve(readStored(file))
    } catch (error: Exception) {
      promise.reject("READ_FAILED", error.message ?: "The local file could not be read.")
    }
  }

  @ReactMethod
  fun write(name: String, contents: String, promise: Promise) {
    try {
      val file = namedFile(name)
      if (file == null) {
        promise.reject("INVALID_NAME", "The local store name is not allowed.")
        return
      }
      writeAtomically(file, contents)
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("WRITE_FAILED", error.message ?: "The local file could not be written.")
    }
  }

  @ReactMethod
  fun remove(name: String, promise: Promise) {
    try {
      val file = namedFile(name)
      if (file == null) {
        promise.reject("INVALID_NAME", "The local store name is not allowed.")
        return
      }
      val parent = file.parentFile
      if (file.exists() && !file.delete()) {
        promise.reject("REMOVE_FAILED", "The local file could not be deleted.")
        return
      }
      if (parent != null) {
        File(parent, file.name + ".tmp").delete()
        File(parent, file.name + ".bak").delete()
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("REMOVE_FAILED", error.message ?: "The local file could not be deleted.")
    }
  }

  @ReactMethod
  fun fileInfo(path: String, promise: Promise) {
    val map = Arguments.createMap()
    try {
      val file = File(path)
      val canonical = file.canonicalPath
      if (!allowed(canonical)) {
        map.putBoolean("exists", false)
        map.putDouble("sizeBytes", 0.0)
        map.putBoolean("readable", false)
        map.putString("note", "This path is outside the app files this screen is allowed to check.")
        promise.resolve(map)
        return
      }
      val exists = file.exists() && file.isFile
      map.putBoolean("exists", exists)
      map.putDouble("sizeBytes", if (exists) file.length().toDouble() else 0.0)
      map.putBoolean("readable", exists && file.canRead())
      if (!exists) {
        map.putString("note", "No file is at this path.")
      } else if (file.length() == 0L) {
        map.putBoolean("ggufMagic", false)
        map.putString("note", "The file is empty, so it will not be loaded.")
      } else if (file.canRead()) {
        val magic = hasGgufMagic(file)
        map.putBoolean("ggufMagic", magic)
        if (!magic) {
          map.putString("note", "The file does not start with the GGUF magic bytes, so it will not be loaded.")
        }
      }
      promise.resolve(map)
    } catch (error: Exception) {
      map.putBoolean("exists", false)
      map.putDouble("sizeBytes", 0.0)
      map.putBoolean("readable", false)
      map.putString("note", error.message ?: "The file could not be checked.")
      promise.resolve(map)
    }
  }

  /**
   * Write a temp file in the same directory, move the current file aside, then
   * move the temp file into place. A crash during the temp write leaves the
   * previous file. A crash after the move-aside leaves the backup for [readStored].
   */
  private fun writeAtomically(file: File, contents: String) {
    val dir = file.parentFile ?: throw IOException("The local store directory is missing.")
    if (!dir.exists() && !dir.mkdirs()) {
      throw IOException("The local store directory could not be created.")
    }
    val temp = File(dir, file.name + ".tmp")
    val backup = File(dir, file.name + ".bak")
    temp.writeText(contents, Charsets.UTF_8)
    if (file.exists()) {
      if (backup.exists() && !backup.delete()) {
        temp.delete()
        throw IOException("The previous backup could not be replaced.")
      }
      if (!file.renameTo(backup)) {
        temp.delete()
        throw IOException("The current file could not be moved aside.")
      }
    }
    if (!temp.renameTo(file)) {
      if (!file.exists() && backup.exists()) {
        backup.renameTo(file)
      }
      temp.delete()
      throw IOException("The new file could not be put in place. The previous copy was kept when it was still available.")
    }
    if (backup.exists()) {
      backup.delete()
    }
  }

  /** Non-empty main file, otherwise a non-empty backup. Contents are not logged. */
  private fun readStored(file: File): String? {
    val parent = file.parentFile
    val backup = if (parent == null) null else File(parent, file.name + ".bak")
    if (file.exists() && file.length() > 0L) {
      return file.readText(Charsets.UTF_8)
    }
    if (backup != null && backup.exists() && backup.length() > 0L) {
      return backup.readText(Charsets.UTF_8)
    }
    return null
  }

  private fun hasGgufMagic(file: File): Boolean {
    val header = ByteArray(4)
    file.inputStream().use { input ->
      if (input.read(header) != 4) {
        return false
      }
    }
    return header[0] == 'G'.code.toByte() &&
      header[1] == 'G'.code.toByte() &&
      header[2] == 'U'.code.toByte() &&
      header[3] == 'F'.code.toByte()
  }

  private fun namedFile(name: String): File? {
    if (!name.matches(Regex("^[a-z0-9][a-z0-9._-]{0,63}$"))) {
      return null
    }
    val dir = File(context.filesDir, "cognify")
    return File(dir, name)
  }

  private fun allowed(canonical: String): Boolean {
    val normalized = canonical.replace('\\', '/')
    val files = context.filesDir.canonicalPath.replace('\\', '/')
    if (normalized == files || normalized.startsWith("$files/")) {
      return true
    }
    val external = context.getExternalFilesDir(null)?.canonicalPath?.replace('\\', '/')
    return external != null && (normalized == external || normalized.startsWith("$external/"))
  }

  companion object {
    const val NAME = "LocalStore"
  }
}
