
import {open} from '@op-engineering/op-sqlite';
import 'react-native-get-random-values';
import bcrypt from 'bcryptjs';

// Open local Cognify AI database
export const db = open({
  name: 'cognify.db',
});

// Create required database tables
export const initializeDatabase = async () => {
  try {
    // Documents table
    await db.execute('PRAGMA foreign_keys = ON;');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT NOT NULL,
        file_type TEXT,
        file_path TEXT,
        file_size INTEGER,
        extracted_text TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
// Add file_size column to existing databases
try {
  await db.execute(
    `ALTER TABLE documents ADD COLUMN file_size INTEGER;`
  );
} catch (error) {
  // Column may already exist
}
    // Document chunks table
    await db.execute(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        chunk_text TEXT NOT NULL,
        page_number INTEGER,
        FOREIGN KEY (document_id)
          REFERENCES documents(id)
          ON DELETE CASCADE
      );
    `);
// Users table for Login and Create Account
await db.execute(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);
    console.log('Cognify AI database connected successfully!');
  } catch (error) {
    console.error('Database initialization error:', error);
  }
};

// Create a new user account
export const registerUser = async (
  fullName: string,
  email: string,
  password: string,
) => {
  try {
    const cleanName = fullName.trim();
    const cleanEmail = email.trim().toLowerCase();

    const passwordHash = await bcrypt.hash(password, 10);

    await db.execute(
      `INSERT INTO users (full_name, email, password_hash)
       VALUES (?, ?, ?)`,
      [cleanName, cleanEmail, passwordHash],
    );

    return {success: true, message: 'Account created successfully!'};
  } catch (error) {
    console.error('Registration error:', error);
    return {success: false, message: 'Email may already be registered.'};
  }
};

// Login existing user
export const loginUser = async (
  email: string,
  password: string,
) => {
  try {
    const cleanEmail = email.trim().toLowerCase();

    const result = await db.execute(
      `SELECT id, full_name, email, password_hash
       FROM users
       WHERE email = ?`,
      [cleanEmail],
    );

    const user = result.rows?.[0];

    if (!user) {
      return {success: false, message: 'Account not found.'};
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash as string,
    );

    if (!passwordMatches) {
      return {success: false, message: 'Incorrect password.'};
    }

    return {
      success: true,
      message: 'Login successful!',
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
      },
    };
  } catch (error) {
    console.error('Login error:', error);
    return {success: false, message: 'Login failed.'};
  }
};
// Save selected document information in SQLite
// Save document information, size and extracted text in SQLite
export const saveDocument = async (
  fileName: string,
  fileType: string | null,
  filePath: string,
  fileSize?: number | null,
  extractedText?: string,
) => {
  try {
    await db.execute(
      `INSERT INTO documents
       (file_name, file_type, file_path, file_size, extracted_text)
       VALUES (?, ?, ?, ?, ?)`,
      [
        fileName,
        fileType,
        filePath,
        fileSize ?? null,
        extractedText || null,
      ],
    );

    // Get the ID of the newly saved document
    const idResult = await db.execute(
      `SELECT last_insert_rowid() AS id`,
    );

    const documentId = Number(idResult.rows?.[0]?.id);

    return {
      success: true,
      message: 'Document saved successfully!',
      documentId,
    };
  } catch (error) {
    console.error('Document save error:', error);

    return {
      success: false,
      message: 'Unable to save document.',
      documentId: null,
    };
  }
};
// Get all saved documents from SQLite
console.log('DB OBJECT:', db);
console.log('DB EXECUTE TYPE:', typeof db.execute);
export const getSavedDocuments = async () => {
  try {
    const result = await db.execute(
      `SELECT id, file_name, file_type, file_path, file_size,
        extracted_text, created_at
 FROM documents
 ORDER BY id DESC`,
    );

    return {
      success: true,
      documents: result.rows || [],
    };
  } catch (error) {
    console.error('Get documents error:', error);

    return {
      success: false,
      documents: [],
    };
  }
};
// Delete document from SQLite
export const deleteDocument = async (documentId: number) => {
  try {
    await db.execute(
      `DELETE FROM documents WHERE id = ?`,
      [documentId],
    );

    return {
      success: true,
      message: 'Document deleted successfully!',
    };
  } catch (error) {
    console.error('Delete document error:', error);

    return {
      success: false,
      message: 'Unable to delete document.',
    };
  }
};
// Split extracted text into smaller chunks and save in SQLite
export const saveDocumentChunks = async (
  documentId: number,
  extractedText: string,
) => {
  try {
    // Divide text into chunks of 1000 characters
    const chunkSize = 1000;
    const chunks = [];

    for (let i = 0; i < extractedText.length; i += chunkSize) {
      chunks.push(extractedText.slice(i, i + chunkSize));
    }

    // Save each chunk in SQLite
    for (const chunk of chunks) {
      await db.execute(
        `INSERT INTO document_chunks
         (document_id, chunk_text)
         VALUES (?, ?)`,
        [documentId, chunk],
      );
    }

    return {
      success: true,
      message: 'Document chunks saved successfully!',
    };
  } catch (error) {
    console.error('Document chunk saving error:', error);

    return {
      success: false,
      message: 'Unable to save document chunks.',
    };
  }
};
// Get all text chunks of a document
export const getDocumentChunks = async (documentId: number) => {
  try {
    const result = await db.execute(
      `SELECT id, document_id, chunk_text, page_number
       FROM document_chunks
       WHERE document_id = ?
       ORDER BY id ASC`,
      [documentId],
    );

    return {
      success: true,
      chunks: result.rows || [],
    };
  } catch (error) {
    console.error('Get document chunks error:', error);

    return {
      success: false,
      chunks: [],
    };
  }
};
// Search document chunks using keywords
export const searchDocumentChunks = async (keyword: string) => {
  try {
    const stopWords = [
  'what', 'the', 'is', 'are', 'was', 'were',
  'how', 'why', 'when', 'where', 'who',
  'can', 'could', 'would', 'should', 'does',
  'do', 'did', 'and', 'for', 'from', 'with',
  'this', 'that', 'these', 'those'
];

const keywords = keyword
  .trim()
  .toLowerCase()
  .split(/\s+/)
  .filter(
    word => word.length > 2 && !stopWords.includes(word),
  );
    if (keywords.length === 0) {
      return {
        success: true,
        chunks: [],
      };
    }

    const conditions = keywords
      .map(() => 'LOWER(chunk_text) LIKE ?')
      .join(' OR ');

    const searchValues = keywords.map(word => `%${word}%`);

   const result = await db.execute(
  `SELECT
     document_chunks.id,
     document_chunks.document_id,
     document_chunks.chunk_text,
     document_chunks.page_number,
     documents.file_name
   FROM document_chunks
   INNER JOIN documents
     ON documents.id = document_chunks.document_id
   WHERE ${conditions}
   ORDER BY document_chunks.id ASC`,
  searchValues,
);

    return {
      success: true,
      chunks: result.rows || [],
    };
  } catch (error) {
    console.error('Chunk search error:', error);

    return {
      success: false,
      chunks: [],
    };
  }
};