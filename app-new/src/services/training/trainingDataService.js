/**
 * Training Data Service
 *
 * Captures invoice PDFs and parsed data when users consent to help improve the AI parser.
 * Data is stored locally and can be picked up by external training pipeline.
 */

import { openDB } from 'idb';

const DB_NAME = 'training-data';
const DB_VERSION = 1;
const STORE_NAME = 'invoices';

/**
 * Initialize the training data IndexedDB
 */
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp');
        store.createIndex('exported', 'exported');
      }
    },
  });
}

/**
 * Save training data (PDF + parsed data + corrections)
 *
 * @param {Object} data - Training data object
 * @param {File|Blob} data.pdfFile - Original PDF file
 * @param {string} data.pdfName - Original filename
 * @param {Object} data.visionResponse - Raw Vision API response
 * @param {Array} data.parsedLines - Parsed line items
 * @param {Array} data.correctedLines - Lines after user corrections
 * @param {string} data.invoiceType - Detected invoice type
 * @param {Object} data.invoiceHeader - Invoice header data (vendor, date, etc.)
 * @param {number} data.pageCount - Number of pages
 * @returns {Promise<number>} - ID of saved record
 */
export async function saveTrainingData(data) {
  const db = await getDB();

  // Convert PDF to base64 for storage
  let pdfBase64 = null;
  if (data.pdfFile) {
    pdfBase64 = await fileToBase64(data.pdfFile);
  }

  const record = {
    timestamp: new Date().toISOString(),
    exported: false,
    pdfBase64,
    pdfName: data.pdfName || 'invoice.pdf',
    pdfSize: data.pdfFile?.size || 0,
    pageCount: data.pageCount || 1,
    invoiceType: data.invoiceType || 'unknown',
    invoiceHeader: data.invoiceHeader || {},
    visionResponse: data.visionResponse || null,
    parsedLines: data.parsedLines || [],
    correctedLines: data.correctedLines || [],
    // Track what corrections were made
    corrections: computeCorrections(data.parsedLines, data.correctedLines),
  };

  const id = await db.add(STORE_NAME, record);
  console.log(`[TrainingData] Saved invoice for training (ID: ${id})`);
  return id;
}

/**
 * Convert File/Blob to base64 string
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Compute what corrections the user made
 */
function computeCorrections(original, corrected) {
  if (!original || !corrected) return [];

  const corrections = [];

  corrected.forEach((line, index) => {
    const orig = original[index];
    if (!orig) return;

    const changes = {};
    const fieldsToCheck = ['description', 'quantity', 'unit', 'unitPrice', 'total', 'boxingFormat'];

    fieldsToCheck.forEach(field => {
      if (line[field] !== orig[field]) {
        changes[field] = {
          from: orig[field],
          to: line[field]
        };
      }
    });

    if (Object.keys(changes).length > 0) {
      corrections.push({
        lineIndex: index,
        changes
      });
    }
  });

  return corrections;
}

/**
 * Get all training data records
 */
export async function getAllTrainingData() {
  const db = await getDB();
  return db.getAll(STORE_NAME);
}

/**
 * Get unexported training data
 */
export async function getUnexportedTrainingData() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);
  return all.filter(record => !record.exported);
}

/**
 * Mark records as exported
 */
export async function markAsExported(ids) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');

  for (const id of ids) {
    const record = await tx.store.get(id);
    if (record) {
      record.exported = true;
      await tx.store.put(record);
    }
  }

  await tx.done;
}

/**
 * Export training data as JSON file (for manual export)
 */
export async function exportTrainingDataAsJSON() {
  const records = await getUnexportedTrainingData();

  if (records.length === 0) {
    console.log('[TrainingData] No unexported records');
    return null;
  }

  const exportData = {
    exportedAt: new Date().toISOString(),
    recordCount: records.length,
    records: records.map(r => ({
      ...r,
      // Don't include the full base64 in JSON export, just metadata
      pdfBase64: r.pdfBase64 ? '[BASE64_DATA]' : null,
      hasPdf: !!r.pdfBase64,
    }))
  };

  // Create downloadable JSON
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-data-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);

  // Mark as exported
  await markAsExported(records.map(r => r.id));

  return records.length;
}

/**
 * Export a single record with PDF
 */
export async function exportSingleRecord(id) {
  const db = await getDB();
  const record = await db.get(STORE_NAME, id);

  if (!record) return null;

  // Export PDF
  if (record.pdfBase64) {
    const link = document.createElement('a');
    link.href = record.pdfBase64;
    link.download = record.pdfName;
    link.click();
  }

  // Export metadata
  const metadata = { ...record, pdfBase64: undefined };
  const blob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${record.pdfName.replace('.pdf', '')}-metadata.json`;
  a.click();
  URL.revokeObjectURL(url);

  return record;
}

/**
 * Get training data statistics
 */
export async function getTrainingStats() {
  const db = await getDB();
  const all = await db.getAll(STORE_NAME);

  const stats = {
    totalRecords: all.length,
    unexported: all.filter(r => !r.exported).length,
    byType: {},
    totalCorrections: 0,
    totalSize: 0,
  };

  all.forEach(record => {
    // Count by type
    const type = record.invoiceType || 'unknown';
    stats.byType[type] = (stats.byType[type] || 0) + 1;

    // Count corrections
    stats.totalCorrections += record.corrections?.length || 0;

    // Total size
    stats.totalSize += record.pdfSize || 0;
  });

  return stats;
}

/**
 * Clear all training data
 */
export async function clearTrainingData() {
  const db = await getDB();
  await db.clear(STORE_NAME);
  console.log('[TrainingData] All training data cleared');
}
