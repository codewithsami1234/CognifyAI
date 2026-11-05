package com.cognify.deviceprobe

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteStatement
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import java.io.File

/**
 * One local SQLite file for study history, embeddings, and plans.
 * It does not open a network connection and it does not delete JSON library files.
 */
class CognifyDbModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = NAME

  private val gate = Any()
  private var database: SQLiteDatabase? = null

  @ReactMethod
  fun open(promise: Promise) {
    try {
      synchronized(gate) {
        if (database?.isOpen != true) {
          val dir = File(context.filesDir, "cognify")
          if (!dir.exists() && !dir.mkdirs()) {
            promise.reject("OPEN_FAILED", "The local database folder could not be created.")
            return
          }
          val file = File(dir, "cognify.db")
          val opened = SQLiteDatabase.openOrCreateDatabase(file, null)
          opened.execSQL("PRAGMA foreign_keys = ON")
          database = opened
        }
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("OPEN_FAILED", error.message ?: "The local database could not be opened.")
    }
  }

  @ReactMethod
  fun exec(sql: String, params: ReadableArray?, promise: Promise) {
    try {
      synchronized(gate) {
        val db = openDatabase()
        val values = params ?: Arguments.createArray()
        if (values.size() == 0) {
          db.execSQL(sql)
        } else {
          val statement = db.compileStatement(sql)
          try {
            bind(statement, values)
            statement.execute()
          } finally {
            statement.close()
          }
        }
      }
      promise.resolve(true)
    } catch (error: Exception) {
      promise.reject("EXEC_FAILED", error.message ?: "The database statement failed.")
    }
  }

  @ReactMethod
  fun query(sql: String, params: ReadableArray?, promise: Promise) {
    try {
      val rows: WritableArray
      synchronized(gate) {
        val db = openDatabase()
        val cursor = select(db, sql, params)
        cursor.use {
          rows = Arguments.createArray()
          val names = it.columnNames
          while (it.moveToNext()) {
            val row = Arguments.createMap()
            for (index in names.indices) {
              putColumn(row, names[index], it, index)
            }
            rows.pushMap(row)
          }
        }
      }
      promise.resolve(rows)
    } catch (error: Exception) {
      promise.reject("QUERY_FAILED", error.message ?: "The database query failed.")
    }
  }

  @ReactMethod
  fun databaseBytes(promise: Promise) {
    try {
      val file = File(File(context.filesDir, "cognify"), "cognify.db")
      val size = if (file.isFile) file.length().toDouble() else 0.0
      promise.resolve(size)
    } catch (error: Exception) {
      promise.reject("SIZE_FAILED", error.message ?: "The database size could not be read.")
    }
  }

  @ReactMethod
  fun close() {
    synchronized(gate) {
      database?.close()
      database = null
    }
  }

  private fun openDatabase(): SQLiteDatabase {
    val current = database
    if (current != null && current.isOpen) {
      return current
    }
    throw IllegalStateException("The local database is not open.")
  }

  private fun bind(statement: SQLiteStatement, params: ReadableArray) {
    for (index in 0 until params.size()) {
      val position = index + 1
      if (params.isNull(index)) {
        statement.bindNull(position)
      } else if (params.getType(index) == ReadableType.Number) {
        statement.bindDouble(position, params.getDouble(index))
      } else if (params.getType(index) == ReadableType.Boolean) {
        statement.bindLong(position, if (params.getBoolean(index)) 1 else 0)
      } else {
        statement.bindString(position, params.getString(index))
      }
    }
  }

  /**
   * rawQuery cannot bind a SQL NULL. Null placeholders are written as NULL.
   * Question marks inside the statement are only used as placeholders.
   */
  private fun select(db: SQLiteDatabase, sql: String, params: ReadableArray?): Cursor {
    if (params == null || params.size() == 0) {
      return db.rawQuery(sql, emptyArray())
    }
    val bound = ArrayList<String>()
    val rewritten = StringBuilder()
    var parameter = 0
    for (character in sql) {
      if (character == '?' && parameter < params.size()) {
        if (params.isNull(parameter)) {
          rewritten.append("NULL")
        } else if (params.getType(parameter) == ReadableType.Number) {
          rewritten.append('?')
          bound.add(params.getDouble(parameter).toString())
        } else if (params.getType(parameter) == ReadableType.Boolean) {
          rewritten.append('?')
          bound.add(if (params.getBoolean(parameter)) "1" else "0")
        } else {
          rewritten.append('?')
          bound.add(params.getString(parameter) ?: "")
        }
        parameter += 1
      } else {
        rewritten.append(character)
      }
    }
    return db.rawQuery(rewritten.toString(), bound.toTypedArray())
  }

  private fun putColumn(row: WritableMap, name: String, cursor: Cursor, index: Int) {
    when (cursor.getType(index)) {
      Cursor.FIELD_TYPE_NULL -> row.putNull(name)
      Cursor.FIELD_TYPE_INTEGER -> row.putDouble(name, cursor.getLong(index).toDouble())
      Cursor.FIELD_TYPE_FLOAT -> row.putDouble(name, cursor.getDouble(index))
      Cursor.FIELD_TYPE_STRING -> row.putString(name, cursor.getString(index))
      else -> row.putString(name, "")
    }
  }

  companion object {
    const val NAME = "CognifyDb"
  }
}
