
import React, {useEffect, useState} from 'react';
import RNFS from 'react-native-fs';
import JSZip from 'jszip';
import {extractAllText} from 'react-native-pdf-text-extractor';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { PdfPageImage } from '@dariyd/react-native-pdf-page-image';
import {
  saveDocument,
  getSavedDocuments,
  deleteDocument,
  saveDocumentChunks,
} from '../database/database';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';

import {
  pick,
  keepLocalCopy,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';

type SelectedFile = {
  id?: number;
  name: string;
  uri: string;
  size?: number | null;
  extractedText?: string | null;
  type?: string | null;
};

const supportedTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'image/png',
  'image/jpeg',
];
// Convert XML special characters into normal text
const decodeXmlEntities = (text: string) => {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCharCode(Number(code)),
    )
    .replace(/&#x([\da-fA-F]+);/g, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
};

// Extract text inside XML tags
const getXmlText = (xml: string, tagName: string) => {
  const regex = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    'g',
  );

  const texts: string[] = [];
  let match;

  while ((match = regex.exec(xml)) !== null) {
    texts.push(decodeXmlEntities(match[1]));
  }

  return texts;
};

// Read TXT file
const extractTxtText = async (uri: string) => {
  const filePath = uri.replace(/^file:\/\//, '');
  return await RNFS.readFile(filePath, 'utf8');
};

// Extract DOCX text
const extractDocxText = async (uri: string) => {
  const filePath = uri.replace(/^file:\/\//, '');
  const base64 = await RNFS.readFile(filePath, 'base64');

  const zip = await JSZip.loadAsync(base64, {
    base64: true,
  });

  const documentFile = zip.file('word/document.xml');

  if (!documentFile) {
    throw new Error('DOCX document content not found.');
  }

  const xml = await documentFile.async('text');
  const paragraphs = getXmlText(xml, 'w:p');

  return paragraphs
    .map(paragraph =>
      getXmlText(paragraph, 'w:t').join(''),
    )
    .filter(text => text.trim().length > 0)
    .join('\n');
};

// Extract PPTX text
const extractPptxText = async (uri: string) => {
  const filePath = uri.replace(/^file:\/\//, '');
  const base64 = await RNFS.readFile(filePath, 'base64');

  const zip = await JSZip.loadAsync(base64, {
    base64: true,
  });

  const slideFiles = zip
    .file(/^ppt\/slides\/slide\d+\.xml$/)
    .sort((a, b) => {
      const numberA = Number(
        a.name.match(/slide(\d+)\.xml$/)?.[1] || 0,
      );
      const numberB = Number(
        b.name.match(/slide(\d+)\.xml$/)?.[1] || 0,
      );

      return numberA - numberB;
    });

  const slideTexts: string[] = [];

  for (let index = 0; index < slideFiles.length; index++) {
    const xml = await slideFiles[index].async('text');

    const paragraphs = getXmlText(xml, 'a:p');

    const slideText = paragraphs
      .map(paragraph =>
        getXmlText(paragraph, 'a:t').join(''),
      )
      .filter(text => text.trim().length > 0)
      .join('\n');

    slideTexts.push(`Slide ${index + 1}\n${slideText}`);
  }

  return slideTexts.join('\n\n');
};
export default function DocumentUpload({
  onBack,
  colors,
  isDark,
  onToggleTheme,
}: {
  onBack: () => void;
  colors: any;
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  useEffect(() => {
  const loadSavedDocuments = async () => {
    const result = await getSavedDocuments();

    console.log('Saved documents result:', result);
    if (result.success) {

   const files = result.documents.map((document: any) => ({
  id: document.id,
  name: document.file_name,
  uri: document.file_path,
  extractedText: document.extracted_text ?? null,
  type: document.file_type,
  size: document.file_size ?? null,
}));

      setSelectedFiles(files);
    } else {
      Alert.alert('Error', 'Could not load saved documents.');
    }
  };

  loadSavedDocuments().catch(error => {
  console.error('LOAD DOCUMENTS FAILED:', error);
  Alert.alert(
    'Document Loading Error',
    String(error),
  );
});
}, []);
const handleDelete = async (file: SelectedFile) => {
  if (file.id == null) {
    Alert.alert('Error', 'Document ID not found.');
    return;
  }

  Alert.alert(
    'Delete Document',
    `Are you sure you want to delete ${file.name}?`,
    [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Step 1: Delete actual file from app storage
            const filePath = file.uri.replace('file://', '');

            const fileExists = await RNFS.exists(filePath);

            if (fileExists) {
              await RNFS.unlink(filePath);
            }

            // Step 2: Delete record from SQLite
            const result = await deleteDocument(file.id!);

            if (result.success) {
              // Step 3: Update screen
              setSelectedFiles(previousFiles =>
                previousFiles.filter(item => item.id !== file.id),
              );

              Alert.alert(
                'Success',
                'Document and its database record deleted successfully.',
              );
            } else {
              Alert.alert('Database Error', result.message);
            }
          } catch (error) {
            console.error('DOCUMENT DELETE ERROR:', error);

            Alert.alert(
              'Delete Error',
              'Could not delete the document. Please try again.',
            );
          }
        },
      },
    ],
  );
};

const handleViewText = (file: SelectedFile) => {
  if (!file.extractedText) {
    Alert.alert(
      'No Text Found',
      'No extracted text is available for this document.',
    );
    return;
  }

  Alert.alert(
    'Extracted PDF Text',
    file.extractedText,
  );
};
const extractImageText = async (imageUri: string) => {
  try {
    const result = await TextRecognition.recognize(imageUri);

    const extractedText = result.text;

    console.log('OCR EXTRACTED TEXT:', extractedText);

    return extractedText;
  } catch (error) {
    console.error('IMAGE OCR ERROR:', error);
    Alert.alert('OCR Error', 'Could not read text from this image.');

    return '';
  }
};
   const selectFiles = async (multiple: boolean) => {
  try {
    const results = await pick({
      type: supportedTypes,
      allowMultiSelection: multiple,
    });

    // Copy selected files to permanent app storage
   
 if (results.length === 0) {
  return;
}

const copyResults = await keepLocalCopy({
  files: [
    ...results.map(file => ({
      uri: file.uri,
      fileName: file.name || 'Unnamed file',
    })),
  ] as [
    {uri: string; fileName: string},
    ...{uri: string; fileName: string}[],
  ],
  destination: 'documentDirectory',
});
const extractedTexts: (string | null)[] = results.map(() => null);
// Extract text from selected images using OCR
for (let index = 0; index < results.length; index++) {
  const originalFile = results[index];
  const copiedFile = copyResults[index];

  if (
    originalFile.type?.startsWith('image/') &&
    copiedFile.status === 'success'
  ) {
    const imageText = await extractImageText(
      copiedFile.localUri,
    );

    extractedTexts[index] = imageText;
  }
}
// Extract text from selected PDF files
for (let index = 0; index < results.length; index++) {
  const originalFile = results[index];
  const copiedFile = copyResults[index];

  if (
    originalFile.type === 'application/pdf' &&
    copiedFile.status === 'success'
  ) {
    let pdfOpened = false;

    try {
      const pages = await extractAllText(copiedFile.localUri, {
        normalize: true,
      });
      console.log('PDF EXTRACTED PAGES:', pages);
console.log('PDF EXTRACTED PAGES COUNT:', pages.length);

      const pageTexts = [...pages];

     // Check each PDF page for missing text using OCR
try {
  console.log('PDF LOCAL URI:', copiedFile.localUri);
console.log('PDF COPIED FILE:', copiedFile);
const pdfPath = decodeURIComponent(
  copiedFile.localUri.replace('file://', ''),
);

console.log('DECODED PDF PATH:', pdfPath);
console.log('PDF FILE EXISTS:', await RNFS.exists(pdfPath));  
const pdfInfo = await PdfPageImage.open(
  copiedFile.sourceUri,
);

  pdfOpened = true;

  for (
    let pageIndex = 0;
    pageIndex < pdfInfo.pageCount;
    pageIndex++
  ) {
    if (!pageTexts[pageIndex]?.trim()) {
      const pageImage = await PdfPageImage.generate(
  copiedFile.sourceUri,
  pageIndex,
  1.5,
);

      const ocrResult = await TextRecognition.recognize(
        pageImage.uri,
      );

      pageTexts[pageIndex] = ocrResult.text;
    }
  }
} catch (ocrError) {
  console.error('PDF OCR ERROR:', ocrError);
}

      const extractedText = pageTexts
        .map(
          (page, pageIndex) =>
            `Page ${pageIndex + 1}\n${page || 'No text found on this page.'}`,
        )
        .join('\n\n');

      extractedTexts[index] = extractedText;

      console.log('EXTRACTED PDF TEXT:', extractedText);
      console.log('TOTAL PDF PAGES:', pageTexts.length);

      Alert.alert(
        'PDF Text Extraction Result',
        extractedText
          ? extractedText.slice(0, 500)
          : 'No text found in this PDF.',
      );
    } catch (error) {
      console.error('PDF TEXT/OCR ERROR:', error);
      Alert.alert(
        'PDF Error',
        'Could not extract text from this PDF.',
      );
    } finally {
      if (pdfOpened) {
        try {
          await PdfPageImage.close(copiedFile.localUri);
        } catch (error) {
          console.error('PDF CLOSE ERROR:', error);
        }
      }
    }
  }
}
// Extract text from selected TXT, DOCX and PPTX files
for (let index = 0; index < results.length; index++) {
const originalFile = results[index];
const copiedFile = copyResults[index];

if (copiedFile.status !== 'success') {
  continue;
}

if (
  originalFile.type !== 'text/plain' &&
  originalFile.type !==
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' &&
  originalFile.type !==
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
) {
  continue;
}

  try {
    let extractedText = '';

    if (originalFile.type === 'text/plain') {
      extractedText = await extractTxtText(
        copiedFile.localUri,
      );
    } else if (
      originalFile.type ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      extractedText = await extractDocxText(
        copiedFile.localUri,
      );
    } else if (
      originalFile.type ===
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ) {
      extractedText = await extractPptxText(
        copiedFile.localUri,
      );
    }

    extractedTexts[index] = extractedText;

    console.log(
      `EXTRACTED TEXT: ${originalFile.name}`,
      extractedText,
    );
  } catch (error) {
    console.error(
      `TEXT EXTRACTION ERROR: ${originalFile.name}`,
      error,
    );

    extractedTexts[index] = null;

    Alert.alert(
      'Extraction Error',
      `Could not extract text from ${originalFile.name}.`,
    );
  }
}
    const files = results
      .map((file, index) => {
        const copiedFile = copyResults[index];
console.log('COPIED PDF FILE:', copiedFile);
        if (copiedFile.status !== 'success') {
          console.error(
            'FILE COPY FAILED:',
            file.name,
            copiedFile.copyError,
          );
          return null;
        }

        return {
          name: file.name || 'Unnamed file',
          uri: copiedFile.localUri,
          extractedText: extractedTexts[index] ?? null,
          size: file.size ?? null,
          type: file.type,
        };
      })
      .filter(file => file !== null);

    if (files.length === 0) {
      Alert.alert('Copy Error', 'Could not copy selected files.');
      return;
    }

    setSelectedFiles(previousFiles => [...previousFiles, ...files]);

    // Save copied file paths in SQLite
// Save documents and their text chunks in SQLite

  for (const file of files) {
  console.log(
    'TEXT BEFORE SQLITE:',
    file.name,
    'Length:',
    file.extractedText?.length,
    'Preview:',
    file.extractedText?.slice(0, 150),
  );
const result = await saveDocument(
    file.name,
    file.type || null,
    file.uri,
    file.size,
    file.extractedText ?? undefined,
  );

  console.log('SAVE DOCUMENT RESULT:', result);

  if (!result.success) {
    Alert.alert('Save Error', result.message);
    continue;
  }

  // Save extracted text as smaller chunks
  if (file.extractedText?.trim() && result.documentId) {
    const chunkResult = await saveDocumentChunks(
      result.documentId,
      file.extractedText,
    );

    console.log('CHUNK SAVE RESULT:', chunkResult);

    if (!chunkResult.success) {
      Alert.alert('Chunk Save Error', chunkResult.message);
    }
  }
}
// Reload documents with their database IDs
const savedResult = await getSavedDocuments();

if (savedResult.success) {
  const savedFiles = savedResult.documents.map((document: any) => ({
    id: document.id,
    name: document.file_name,
    uri: document.file_path,
    extractedText: document.extracted_text ?? null,
    type: document.file_type,
    size: document.file_size ?? null,
  }));

  setSelectedFiles(savedFiles);
}

} catch (error) {
  if (
    isErrorWithCode(error) &&
    error.code === errorCodes.OPERATION_CANCELED
  ) {
    return;
  }

  Alert.alert('Error', 'Unable to select or copy files.');
  console.error('Document picker error:', error);
}
};

  

  return (
    <ScrollView
  style={[styles.container, {backgroundColor: colors.background}]}
  contentContainerStyle={styles.content}>
<View
  style={{
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 15,
marginTop: 10,
marginBottom: 30,
  }}>
  <View
    style={{
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: '#7856E8',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
    <Text style={{color: '#FFFFFF', fontSize: 27}}>✦</Text>
  </View>

  <View style={{flex: 1, marginLeft: 12}}>
    <Text
      style={{
        color: colors.text,
        fontSize: 21,
        fontWeight: 'bold',
      }}>
      Cognify <Text style={{color: '#A78BFA'}}>AI</Text>
    </Text>

    <Text
      style={{
        color: colors.secondary,
        fontSize: 8,
        letterSpacing: 1,
        marginTop: 4,
      }}>
      INTELLIGENT LEARNING EXPERIENCE
    </Text>
  </View>

  <TouchableOpacity
    onPress={onToggleTheme}
    style={{
      width: 46,
      height: 46,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
    <Text style={{fontSize: 22}}>
      {isDark ? '☀️' : '🌙'}
    </Text>
  </TouchableOpacity>
</View>
  <TouchableOpacity
  style={styles.backHomeButton}
  onPress={onBack}>
  <Text style={styles.backArrow}>‹</Text>
  <Text style={styles.backHomeText}>Back to Home</Text>
</TouchableOpacity>

      <TouchableOpacity
        style={styles.uploadButton}
        onPress={() => selectFiles(false)}>
        <Text style={[styles.buttonTitle, {color: '#FFFFFF'}]}>
  ＋ Select Single File
</Text>
        <Text style={[styles.buttonDescription, {color: '#E5DFFF'}]}>
  Choose one document from your phone
</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.uploadButton}
        onPress={() => selectFiles(true)}>
        <Text style={styles.buttonTitle}>＋ Select Multiple Files</Text>
        <Text style={styles.buttonDescription}>
          Choose multiple documents together
        </Text>
      </TouchableOpacity>

     <Text
  style={[
    styles.sectionTitle,
    {color: colors.text},
  ]}>
  Selected Documents ({selectedFiles.length})
</Text>

      {selectedFiles.length === 0 ? (
      <Text
  style={[
    styles.emptyText,
    {color: colors.secondary},
  ]}>
  No documents selected yet.
</Text>
      ) : (
        selectedFiles.map((file, index) => (
  <View
  key={`${file.uri}-${index}`}
  style={[
    styles.fileCard,
    {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderWidth: 1,
    },
  ]}>
    <Text style={styles.fileIcon}>📄</Text>

    <View style={styles.fileInfo}>
 <Text style={[styles.fileName, {color: colors.text}]}>
  {file.name}
</Text>
  <Text style={[styles.fileSize, {color: colors.secondary}]}>
    {file.size != null
      ? `${(file.size / 1024).toFixed(1)} KB`
      : 'Size unavailable'}
  </Text>

  <TouchableOpacity
    onPress={() => handleViewText(file)}>
    <Text style={{color: '#A78BFA', marginTop: 8}}>
      View Extracted Text
    </Text>
  </TouchableOpacity>
</View>

    <TouchableOpacity
      style={styles.deleteButton}
      onPress={() => handleDelete(file)}>
      <Text style={styles.deleteButtonText}>Delete</Text>
    </TouchableOpacity>
  </View>
))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#10132B',
  },
  content: {
    padding: 22,
    paddingBottom: 40,
  },
  backButton: {
    marginBottom: 28,
  },
  backText: {
    color: '#A78BFA',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
  color: '#FFFFFF',
  fontSize: 26,
  fontWeight: 'bold',
},
  description: {
    color: '#B8B9CC',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 22,
  },
  supportBox: {
    backgroundColor: '#1B2042',
    borderRadius: 14,
    padding: 16,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#39315F',
  },
  supportTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 9,
  },
  formats: {
    color: '#C4B5FD',
    fontSize: 12,
    lineHeight: 21,
  },
  uploadButton: {
    backgroundColor: '#7856E8',
    borderRadius: 15,
    padding: 18,
    marginBottom: 15,
  },
  buttonTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonDescription: {
    color: '#E5DFFF',
    fontSize: 12,
    marginTop: 6,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 22,
    marginBottom: 14,
  },
  emptyText: {
    color: '#A9AABD',
    fontSize: 13,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B2042',
    borderRadius: 12,
    padding: 13,
    marginBottom: 10,
  },
  fileIcon: {
    fontSize: 25,
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  fileSize: {
    color: '#A9AABD',
    fontSize: 11,
    marginTop: 5,
  },
  backHomeButton: {
  alignSelf: 'flex-start',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#7856E8',
  paddingHorizontal: 16,
  paddingVertical: 11,
  borderRadius: 12,
  marginTop: 15,
  marginBottom: 30,
  gap: 9,
},

backArrow: {
  color: '#FFFFFF',
  fontSize: 30,
  fontWeight: '800',
  marginRight: 5,
  lineHeight: 25,
  includeFontPadding: false,
},
backHomeText: {
  color: '#FFFFFF',
  fontSize: 13,
  fontWeight: 'bold',
},
deleteButton: {
  backgroundColor: '#7856E8',
  paddingVertical: 8,
  paddingHorizontal: 12,
  borderRadius: 8,
  marginLeft: 8,
},

deleteButtonText: {
  color: '#ffffff',
  fontSize: 13,
  fontWeight: '600',
},
});


