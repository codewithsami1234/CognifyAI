package com.cognify.deviceprobe

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Xml
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.pdmodel.encryption.InvalidPasswordException
import com.tom_roush.pdfbox.rendering.ImageType
import com.tom_roush.pdfbox.rendering.PDFRenderer
import com.tom_roush.pdfbox.text.PDFTextStripper
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.charset.CodingErrorAction
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.zip.ZipInputStream

/**
 * Local document picker and text extraction. Nothing is uploaded.
 * The byte cap matches MAX_STUDY_DOCUMENT_BYTES in src/ai/studyImport.ts.
 */
class StudyDocumentModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()
  private var pending: Promise? = null
  private var pdfReady = false

  private val activityListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode != REQUEST_CODE) {
        return
      }
      val promise = pending
      pending = null
      if (promise == null) {
        return
      }
      if (resultCode != Activity.RESULT_OK || data?.data == null) {
        promise.resolve(mapOfKind("cancelled"))
        return
      }
      val uri = data.data!!
      executor.execute {
        try {
          promise.resolve(extract(uri))
        } catch (error: Exception) {
          promise.resolve(
            mapOfKind(
              "error",
              message = error.message ?: "The document could not be read on this device.",
            ),
          )
        }
      }
    }
  }

  init {
    reactContext.addActivityEventListener(activityListener)
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun openAndExtract(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.resolve(mapOfKind("error", message = "The document picker has no open screen."))
      return
    }
    if (pending != null) {
      promise.resolve(mapOfKind("error", message = "A document import is already in progress."))
      return
    }
    pending = promise
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = "*/*"
      putExtra(
        Intent.EXTRA_MIME_TYPES,
        arrayOf(
          "text/plain",
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "image/png",
          "image/jpeg",
        ),
      )
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    try {
      activity.startActivityForResult(intent, REQUEST_CODE)
    } catch (error: Exception) {
      pending = null
      promise.resolve(mapOfKind("error", message = error.message ?: "The document picker did not open."))
    }
  }

  private fun extract(uri: Uri): WritableMap {
    val resolver = reactApplicationContext.contentResolver
    val display = queryDisplay(uri)
    val name = display.name
    val mime = resolver.getType(uri) ?: ""
    val kind = classify(name, mime)
    if (kind == "unsupported") {
      return mapOfKind(
        "unsupported",
        name,
        display.sizeBytes,
        "Only .txt, .pdf, .docx, .pptx, .png, .jpg, and .jpeg files can be imported. The file was not added.",
      )
    }
    if (display.sizeBytes > MAX_BYTES) {
      return mapOfKind(
        "too_large",
        name,
        display.sizeBytes,
        "The document is larger than $MAX_BYTES bytes. It was not imported.",
      )
    }

    resolver.openInputStream(uri).use { input ->
      if (input == null) {
        return mapOfKind("error", name, display.sizeBytes, "The document could not be opened.")
      }
      val bytes = readCapped(input)
      if (bytes == null) {
        return mapOfKind(
          "too_large",
          name,
          display.sizeBytes,
          "The document is larger than $MAX_BYTES bytes. It was not imported.",
        )
      }
      if (bytes.isEmpty()) {
        return mapOfKind("empty", name, bytes.size.toLong(), "The document has no text to study. It was not imported.")
      }
      if (kind == "pdf") {
        return try {
          extractPdf(bytes, name)
        } catch (error: InvalidPasswordException) {
          mapOfKind("error", name, bytes.size.toLong(), "This PDF is encrypted. It was not imported.")
        }
      }
      if (kind == "docx") {
        return extractDocx(bytes, name)
      }
      if (kind == "pptx") {
        return extractPptx(bytes, name)
      }
      if (kind == "image") {
        return extractImage(bytes, name)
      }
      val text = StandardCharsets.UTF_8
        .newDecoder()
        .onMalformedInput(CodingErrorAction.REPLACE)
        .onUnmappableCharacter(CodingErrorAction.REPLACE)
        .decode(java.nio.ByteBuffer.wrap(bytes))
        .toString()
      if (text.isBlank()) {
        return mapOfKind("empty", name, bytes.size.toLong(), "The document has no text to study. It was not imported.")
      }
      val pages = Arguments.createArray()
      val page = Arguments.createMap()
      page.putString("text", text)
      pages.pushMap(page)
      return mapOfKind("text", name, bytes.size.toLong(), pages = pages)
    }
  }

  private fun extractPdf(bytes: ByteArray, name: String?): WritableMap {
    if (!pdfReady) {
      PDFBoxResourceLoader.init(reactApplicationContext)
      pdfReady = true
    }
    PDDocument.load(bytes).use { document ->
      val pageCount = document.numberOfPages
      val pages = Arguments.createArray()
      var anyText = false
      var ocrFailed = false
      val stripper = PDFTextStripper()
      val renderer = PDFRenderer(document)
      for (pageNumber in 1..pageCount) {
        stripper.startPage = pageNumber
        stripper.endPage = pageNumber
        var text = stripper.getText(document)
        if (text.isBlank()) {
          var bitmap: Bitmap? = null
          try {
            bitmap = renderer.renderImageWithDPI(pageNumber - 1, 120f, ImageType.RGB)
            text = ocrBitmap(bitmap)
          } catch (error: Exception) {
            ocrFailed = true
            text = ""
          } finally {
            bitmap?.recycle()
          }
        }
        val page = Arguments.createMap()
        page.putString("text", text)
        page.putInt("pageNumber", pageNumber)
        pages.pushMap(page)
        if (text.isNotBlank()) {
          anyText = true
        }
      }
      if (!anyText) {
        if (ocrFailed) {
          return mapOfKind(
            "ocr_failed",
            name,
            bytes.size.toLong(),
            "On-device OCR failed. The file was not imported, and the previous study text was kept.",
          )
        }
        return mapOfKind(
          "scanned",
          name,
          bytes.size.toLong(),
          "No text could be read from this file. On-device OCR did not find any words, so it was not imported.",
        )
      }
      return mapOfKind("pdf", name, bytes.size.toLong(), pages = pages)
    }
  }

  private fun extractDocx(bytes: ByteArray, name: String?): WritableMap {
    val xml = try {
      zipEntry(bytes, "word/document.xml")
    } catch (error: Exception) {
      return mapOfKind("error", name, bytes.size.toLong(), "This DOCX could not be opened. It was not imported.")
    }
    if (xml == null) {
      return mapOfKind("error", name, bytes.size.toLong(), "This DOCX has no document text. It was not imported.")
    }
    val text = readOfficeText(xml)
    if (text.isBlank()) {
      return mapOfKind("empty", name, bytes.size.toLong(), "The document has no text to study. It was not imported.")
    }
    val pages = Arguments.createArray()
    val page = Arguments.createMap()
    page.putString("text", text)
    pages.pushMap(page)
    return mapOfKind("docx", name, bytes.size.toLong(), pages = pages)
  }

  private fun extractPptx(bytes: ByteArray, name: String?): WritableMap {
    val slides = try {
      zipSlides(bytes)
    } catch (error: Exception) {
      return mapOfKind("error", name, bytes.size.toLong(), "This PPTX could not be opened. It was not imported.")
    }
    if (slides.isEmpty()) {
      return mapOfKind("error", name, bytes.size.toLong(), "This PPTX has no slides. It was not imported.")
    }
    val pages = Arguments.createArray()
    var anyText = false
    for ((slideNumber, xml) in slides) {
      val text = readOfficeText(xml)
      val page = Arguments.createMap()
      page.putString("text", text)
      page.putInt("pageNumber", slideNumber)
      pages.pushMap(page)
      if (text.isNotBlank()) {
        anyText = true
      }
    }
    if (!anyText) {
      return mapOfKind("empty", name, bytes.size.toLong(), "The document has no text to study. It was not imported.")
    }
    return mapOfKind("pptx", name, bytes.size.toLong(), pages = pages)
  }

  private fun extractImage(bytes: ByteArray, name: String?): WritableMap {
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
      ?: return mapOfKind("error", name, bytes.size.toLong(), "This image could not be decoded. It was not imported.")
    val working = scaleForOcr(bitmap)
    val text = try {
      ocrBitmap(working)
    } catch (error: Exception) {
      return mapOfKind(
        "ocr_failed",
        name,
        bytes.size.toLong(),
        "On-device OCR failed. The file was not imported, and the previous study text was kept.",
      )
    } finally {
      if (working !== bitmap) {
        working.recycle()
      }
      if (!bitmap.isRecycled) {
        bitmap.recycle()
      }
    }
    if (text.isBlank()) {
      return mapOfKind(
        "scanned",
        name,
        bytes.size.toLong(),
        "No text could be read from this file. On-device OCR did not find any words, so it was not imported.",
      )
    }
    val pages = Arguments.createArray()
    val page = Arguments.createMap()
    page.putString("text", text)
    pages.pushMap(page)
    return mapOfKind("image", name, bytes.size.toLong(), pages = pages)
  }

  private fun ocrBitmap(bitmap: Bitmap): String {
    val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    try {
      val image = InputImage.fromBitmap(bitmap, 0)
      val result = Tasks.await(recognizer.process(image), 30, TimeUnit.SECONDS)
      return result.text ?: ""
    } finally {
      recognizer.close()
    }
  }

  private fun scaleForOcr(bitmap: Bitmap): Bitmap {
    val longest = maxOf(bitmap.width, bitmap.height)
    if (longest <= 2000) {
      return bitmap
    }
    val scale = 2000f / longest
    return Bitmap.createScaledBitmap(
      bitmap,
      (bitmap.width * scale).toInt().coerceAtLeast(1),
      (bitmap.height * scale).toInt().coerceAtLeast(1),
      true,
    )
  }

  private fun zipEntry(bytes: ByteArray, entryName: String): ByteArray? {
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
      while (true) {
        val entry = zip.nextEntry ?: return null
        if (entry.name == entryName) {
          return zip.readBytes()
        }
      }
    }
  }

  private fun zipSlides(bytes: ByteArray): List<Pair<Int, ByteArray>> {
    val slides = mutableListOf<Pair<Int, ByteArray>>()
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
      while (true) {
        val entry = zip.nextEntry ?: break
        val match = SLIDE_PATH.matchEntire(entry.name) ?: continue
        val number = match.groupValues[1].toIntOrNull() ?: continue
        slides.add(number to zip.readBytes())
      }
    }
    slides.sortBy { it.first }
    return slides
  }

  private fun readOfficeText(xml: ByteArray): String {
    val parser = Xml.newPullParser()
    parser.setInput(ByteArrayInputStream(xml), "UTF-8")
    val out = StringBuilder()
    var event = parser.eventType
    while (event != XmlPullParser.END_DOCUMENT) {
      if (event == XmlPullParser.START_TAG) {
        when (parser.name) {
          "t" -> out.append(parser.nextText())
          "tab" -> out.append('\t')
          "br", "cr" -> out.append('\n')
        }
      } else if (event == XmlPullParser.END_TAG && (parser.name == "p" || parser.name == "tr")) {
        out.append('\n')
      }
      event = parser.next()
    }
    return out.toString()
  }

  private fun classify(name: String?, mime: String): String {
    val lowerName = name?.lowercase() ?: ""
    val lowerMime = mime.lowercase()
    if (lowerName.endsWith(".pdf") || lowerMime == "application/pdf") {
      return "pdf"
    }
    if (lowerName.endsWith(".docx") || lowerMime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      return "docx"
    }
    if (lowerName.endsWith(".pptx") || lowerMime == "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
      return "pptx"
    }
    if (lowerName.endsWith(".png") || lowerMime == "image/png") {
      return "image"
    }
    if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerMime == "image/jpeg") {
      return "image"
    }
    if (lowerName.endsWith(".txt") || lowerMime == "text/plain") {
      return "text"
    }
    return "unsupported"
  }

  private fun queryDisplay(uri: Uri): Display {
    var name: String? = null
    var size = -1L
    reactApplicationContext.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)
      ?.use { cursor ->
        if (cursor.moveToFirst()) {
          val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
          val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
          if (nameIndex >= 0) {
            name = cursor.getString(nameIndex)
          }
          if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
            size = cursor.getLong(sizeIndex)
          }
        }
      }
    return Display(name, size)
  }

  private fun readCapped(input: java.io.InputStream): ByteArray? {
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(16 * 1024)
    var total = 0
    while (true) {
      val read = input.read(buffer)
      if (read < 0) {
        break
      }
      total += read
      if (total > MAX_BYTES) {
        return null
      }
      output.write(buffer, 0, read)
    }
    return output.toByteArray()
  }

  private fun mapOfKind(
    kind: String,
    fileName: String? = null,
    sizeBytes: Long = -1,
    message: String? = null,
    pages: WritableArray? = null,
  ): WritableMap {
    val map = Arguments.createMap()
    map.putString("kind", kind)
    if (fileName != null) {
      map.putString("fileName", fileName)
    }
    if (sizeBytes >= 0) {
      map.putDouble("sizeBytes", sizeBytes.toDouble())
    }
    if (message != null) {
      map.putString("message", message)
    }
    if (pages != null) {
      map.putArray("pages", pages)
    }
    return map
  }

  private data class Display(val name: String?, val sizeBytes: Long)

  companion object {
    const val NAME = "StudyDocument"
    private const val REQUEST_CODE = 48121
    const val MAX_BYTES = 8 * 1024 * 1024
    private val SLIDE_PATH = Regex("ppt/slides/slide(\\d+)\\.xml")
  }
}
