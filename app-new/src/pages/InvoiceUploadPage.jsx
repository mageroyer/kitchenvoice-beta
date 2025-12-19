import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';
import { VendorProfileWizard, LineReviewModal } from '../components/invoice';
import { formatFileSize } from '../services/utils/pdfParser';
import { invoiceDB, invoiceLineDB, vendorDB, inventoryItemDB } from '../services/database/indexedDB';
// New intelligent invoice processing
import {
  processInvoice as processInvoiceIntelligent,
  completeOnboarding,
  saveInvoice as saveInvoiceIntelligent,
  PROCESSING_STATUS,
  parsePackageFormat,
  calculateLineValues,
  FORMAT_TYPE
} from '../services/invoice';
import {
  isWeightUnit,
  getUnitFactorForPrice,
} from '../utils/unitConversion';
import styles from '../styles/pages/invoiceupload.module.css';

/**
 * Check if unit is a volume unit
 * @param {string} unit - The unit to check
 * @returns {boolean} True if volume unit
 */
const isVolumeUnitType = (unit) => {
  if (!unit) return false;
  const normalized = unit.toLowerCase().trim();
  // IMPORTANT: 'l' check must exclude 'lb'/'lbs' (weight units)
  const isLitre = normalized === 'l' || normalized === 'litre' || normalized === 'liter';
  return normalized.startsWith('ml') ||
         isLitre ||
         normalized.startsWith('cl') ||
         normalized.startsWith('fl') ||
         normalized.startsWith('gal') ||
         normalized.startsWith('qt') ||
         normalized.startsWith('pt');
};

/**
 * Normalize weight unit to standard abbreviation
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (lb, kg, g, oz)
 */
const normalizeWeightUnit = (unit) => {
  if (!unit) return 'lb';
  const normalized = unit.toLowerCase().trim();
  if (normalized.startsWith('kg') || normalized.startsWith('kilo')) return 'kg';
  if (normalized.startsWith('g') || normalized.startsWith('gram')) return 'g';
  if (normalized.startsWith('oz') || normalized.startsWith('ounce')) return 'oz';
  return 'lb'; // Default to lb
};

/**
 * Normalize volume unit to standard abbreviation
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (ml, l, etc.)
 */
const normalizeVolumeUnit = (unit) => {
  if (!unit) return 'ml';
  const normalized = unit.toLowerCase().trim();
  if (normalized === 'l' || normalized === 'litre' || normalized === 'liter') return 'L';
  if (normalized.startsWith('ml') || normalized === 'millilitre') return 'ml';
  if (normalized.startsWith('cl') || normalized === 'centilitre') return 'cl';
  if (normalized.startsWith('gal')) return 'gal';
  if (normalized.startsWith('qt') || normalized === 'quart') return 'qt';
  if (normalized.startsWith('pt') || normalized === 'pint') return 'pt';
  if (normalized.startsWith('fl')) return 'fl oz';
  return 'ml'; // Default to ml
};

/**
 * Normalize quantity unit to standard abbreviation
 * @param {string} unit - The unit to normalize
 * @returns {string} Normalized unit (pc, case, box, etc.)
 */
const normalizeQuantityUnit = (unit) => {
  if (!unit) return 'pc';
  const normalized = unit.toLowerCase().trim();
  if (normalized.startsWith('case')) return 'case';
  if (normalized.startsWith('box')) return 'box';
  if (normalized.startsWith('bag')) return 'bag';
  if (normalized.startsWith('pack') || normalized === 'pqt') return 'pack';
  if (normalized === 'each' || normalized === 'ea' || normalized === 'unit' || normalized === 'unt') return 'pc';
  if (normalized.startsWith('doz')) return 'doz';
  if (normalized.startsWith('can') || normalized === 'bt') return 'can';
  return unit; // Keep original if not recognized
};

/**
 * Build a display unit string from item fields.
 *
 * Priority: format > unit > packSize+packUnit > default 'pc'
 *
 * @param {Object} item - Invoice line item
 * @returns {string} Display unit string (e.g., "2/5LB", "50lb", "pc")
 */
const buildPackageUnit = (item) => {
  // Use format field if present (e.g., "2/5LB")
  if (item.format) return item.format;

  // Use unit field if present (e.g., "Sac 50lb", "Case")
  if (item.unit) return item.unit;

  // Build from packSize and packUnit (e.g., packSize=2, packUnit="5LB" → "2/5LB")
  if (item.packSize && item.packUnit) {
    return `${item.packSize}/${item.packUnit}`;
  }

  // Use quantityUnit if present
  if (item.quantityUnit) return item.quantityUnit;

  // Default to 'pc' (piece)
  return 'pc';
};

/**
 * Extract weight info from invoice line item using the centralized lineCalculator.
 *
 * This uses calculateLineValues() from lineCalculator.js - the SINGLE SOURCE OF TRUTH
 * for all format parsing and weight calculations.
 *
 * Supports all format types:
 * - "2/5LB" (pack weight: 2 bags × 5lb = 10lb per case)
 * - "4x5lb" (multiplier: 4 × 5lb = 20lb)
 * - "50lb" (simple weight)
 * - "12CT" (count only)
 * - Extracts from description: "CARROT WHOLE CELLO BAG 2/5LB"
 *
 * @param {Object} item - Invoice line item
 * @returns {Object} { hasEmbeddedWeight, weightPerUnit, weightUnit, totalWeight, pricePerG, ... }
 */
const extractWeightFromUnit = (item) => {
  // Use the centralized line calculator - handles ALL format parsing
  const calculated = calculateLineValues({
    quantity: item.quantity || 1,
    format: item.format || item.unit,
    description: item.description || item.name,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
    weight: item.weight || item.totalValue,
    weightUnit: item.weightUnit || item.unit,
  });

  return {
    hasEmbeddedWeight: calculated.isWeightBased,
    weightPerUnit: calculated.weightPerCase || 0,
    weightUnit: calculated.weightUnit || '',
    totalWeight: calculated.totalWeight || 0,
    // Additional data from calculator for downstream use
    pricePerG: calculated.pricePerG,
    pricePerLb: calculated.pricePerLb,
    formatType: calculated.formatType,
    formatFormula: calculated.formatFormula,
    display: calculated.display,
  };
};

/**
 * Calculate normalized price per gram (for solids) or per ml (for liquids)
 *
 * Uses lineCalculator as SINGLE SOURCE OF TRUTH for format parsing.
 *
 * Example for "CARROT WHOLE CELLO BAG 2/5LB", qty: 4, unitPrice: $12.95:
 * - lineCalculator parses: 2/5LB = 10lb per case × 4 cases = 40lb total
 * - Converts to grams: 40lb × 453.592 = 18,143.68g
 * - Calculate pricePerG: $51.80 / 18,143.68g = $0.00285/g
 *
 * @param {Object} item - Invoice line item with unit, quantity, unitPrice, description
 * @returns {Object} { pricePerG: number|null, pricePerML: number|null, totalBaseUnits: number|null }
 */
const calculateNormalizedPrice = (item) => {
  const unitPrice = item.unitPrice || 0;
  const quantity = item.quantity || 1;
  const totalPrice = item.totalPrice || (unitPrice * quantity);

  if (totalPrice <= 0) {
    return { pricePerG: null, pricePerML: null, totalBaseUnits: null, baseUnit: null };
  }

  // Use lineCalculator to parse format and calculate values
  const calculated = calculateLineValues({
    quantity,
    format: item.format || item.unit,
    description: item.description || item.name,
    unitPrice,
    totalPrice
  });

  // If lineCalculator found weight-based format
  if (calculated.isWeightBased && calculated.totalWeightGrams && calculated.pricePerG) {
    return {
      pricePerG: Math.round(calculated.pricePerG * 1000000) / 1000000,
      pricePerML: null,
      totalBaseUnits: calculated.totalWeightGrams,
      baseUnit: 'g'
    };
  }

  // Fallback: Try to parse volume units (lineCalculator doesn't handle volumes yet)
  const unitStr = (item.format || item.unit || '').toString();
  const volumeMatch = unitStr.match(/(\d+[.,]?\d*)\s*(gal|gallon|qt|quart|pt|pint|floz|fl oz|ml|l|cl)/i);

  if (volumeMatch) {
    const qty = parseFloat(volumeMatch[1].replace(',', '.'));
    const unit = volumeMatch[2].toLowerCase();
    const unitInfo = getUnitFactorForPrice(unit);

    if (unitInfo && unitInfo.isVolume) {
      const totalBaseUnits = qty * unitInfo.factor * quantity;
      const pricePerBase = totalPrice / totalBaseUnits;
      return {
        pricePerG: null,
        pricePerML: Math.round(pricePerBase * 1000000) / 1000000,
        totalBaseUnits,
        baseUnit: 'ml'
      };
    }
  }

  // Cannot calculate normalized price
  return { pricePerG: null, pricePerML: null, totalBaseUnits: null, baseUnit: null };
};

// Department options with colors
const DEPARTMENTS = [
  { id: 'default', name: 'Cuisine', color: '#e9ecef' },
  { id: 'hot', name: 'Hot Kitchen', color: '#ffebee' },
  { id: 'cold', name: 'Garde Manger', color: '#e3f2fd' },
  { id: 'pastry', name: 'Pastry', color: '#fff3e0' },
  { id: 'bar', name: 'Bar', color: '#f3e5f5' },
  { id: 'admin', name: 'Administration', color: '#e8f5e9' },
];

/**
 * Invoice Upload Page
 *
 * Upload vendor invoices (PDF/image) and parse them with Claude AI
 * Extracted data populates ingredient database with current prices
 * Supports department assignment and invoice splitting
 */
function InvoiceUploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // State
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(null); // 'pdf' or 'image'
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [parsedInvoice, setParsedInvoice] = useState(null);
  const [saved, setSaved] = useState(false);

  // Invoice pipeline state (Phase 1 & 3)
  const [analysisResult, setAnalysisResult] = useState(null);
  const [mergedInvoice, setMergedInvoice] = useState(null);
  const [showWarnings, setShowWarnings] = useState(false);

  // Department assignment state
  const [selectedItems, setSelectedItems] = useState(new Set()); // Set of selected item indices
  const [itemDepartments, setItemDepartments] = useState({}); // { index: departmentId }
  const [bulkDepartment, setBulkDepartment] = useState(''); // For bulk assignment

  // Manual vendor entry (when AI couldn't extract)
  const [manualVendorName, setManualVendorName] = useState('');

  // Intelligent processing state (new flow)
  const [intelligentResult, setIntelligentResult] = useState(null);
  const [showProfileWizard, setShowProfileWizard] = useState(false);

  // View mode for invoice review table: 'original' shows invoice headers, 'normalized' shows standard fields
  const [tableViewMode, setTableViewMode] = useState('original');

  // Line review modal state (for anomaly flagging)
  const [showLineReviewModal, setShowLineReviewModal] = useState(false);
  const [flaggedLines, setFlaggedLines] = useState([]);

  // Per-item FORMAT corrections - keyed by item identifier (name or itemCode)
  // { "Laitue Romaine": { original: "Caisse 24", corrected: "Caisse 24kg", lineIndex: 0 } }
  const [itemFormatCorrections, setItemFormatCorrections] = useState({});

  // Ref for timer cleanup
  const redirectTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  // ═══════════════════════════════════════════════════════════
  // ADAPTIVE TABLE HELPERS
  // ═══════════════════════════════════════════════════════════

  // Map aiLabel to item field value
  // Uses rawColumns (exact invoice text) as fallback for unmapped columns
  const getItemValueByLabel = (item, aiLabel, currency, colIndex = null) => {
    const fieldMap = {
      'sku': item.itemCode || item.sku,
      'description': item.description || item.name,
      // Quantity: just the number, no unit appended (delivered/invoiced quantity)
      'quantity': item.quantity != null ? String(item.quantity) : null,
      // Ordered quantity: what was originally ordered (may differ from delivered)
      'orderedQuantity': item.orderedQuantity != null ? String(item.orderedQuantity) : null,
      // Weight: value + unit (kg, lb)
      'weight': item.weight != null ? `${item.weight} ${item.weightUnit || 'lb'}`.trim() : null,
      'unitPrice': item.unitPrice != null ? formatCurrency(item.unitPrice, currency) : null,
      'totalPrice': item.totalPrice != null ? formatCurrency(item.totalPrice, currency) : null,
      // Unit of measure (U/M column)
      'unit': item.priceUnit || item.weightUnit,
    };

    // First try the structured field
    const structuredValue = fieldMap[aiLabel];
    if (structuredValue != null && structuredValue !== '') {
      return structuredValue;
    }

    // Fallback to rawColumns if available (for columns like FORMAT, ORIGINE)
    if (colIndex != null && item.rawColumns && item.rawColumns[colIndex] != null) {
      return item.rawColumns[colIndex];
    }

    return '-';
  };

  // Get columns to display based on view mode
  const getDisplayColumns = () => {
    const detectedColumns = intelligentResult?.detectedColumns || [];

    if (tableViewMode === 'original' && detectedColumns.length > 0) {
      // Filter out 'skip' columns and return original headers with column index
      return detectedColumns
        .filter(col => col.aiLabel !== 'skip')
        .map(col => ({
          key: col.aiLabel,
          header: col.headerText, // Original invoice header
          aiLabel: col.aiLabel,
          colIndex: col.index,    // Column index for rawColumns lookup
        }));
    }

    // Normalized view - fixed columns (no colIndex, uses structured fields only)
    return [
      { key: 'item', header: 'Item', aiLabel: 'description', colIndex: null },
      { key: 'category', header: 'Category', aiLabel: null, colIndex: null },
      { key: 'qty', header: 'Qty', aiLabel: 'quantity', colIndex: null },
      { key: 'unitPrice', header: 'Unit Price', aiLabel: 'unitPrice', colIndex: null },
      { key: 'total', header: 'Total', aiLabel: 'totalPrice', colIndex: null },
    ];
  };

  // Validate file
  const validateFile = (selectedFile) => {
    const validTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ];

    if (!selectedFile) return { valid: false, error: 'No file selected' };

    if (!validTypes.includes(selectedFile.type)) {
      return { valid: false, error: 'Invalid file type. Please upload a PDF or image (JPEG, PNG, WebP).' };
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      return { valid: false, error: 'File too large. Maximum size is 10MB.' };
    }

    const type = selectedFile.type === 'application/pdf' ? 'pdf' : 'image';
    return { valid: true, type };
  };

  // Handle file selection
  const handleFileSelect = (selectedFile) => {
    setError('');
    setParsedInvoice(null);
    setSaved(false);

    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error);
      return;
    }

    setFile(selectedFile);
    setFileType(validation.type);
  };

  // Handle drag and drop
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  // Parse invoice with intelligent processing flow
  const handleParseInvoice = async () => {
    if (!file) return;

    setLoading(true);
    setError('');
    setParsedInvoice(null);
    setAnalysisResult(null);
    setMergedInvoice(null);
    setShowWarnings(false);
    setIntelligentResult(null);

    // ═══════════════════════════════════════════════════════════
    // INVOICE PROCESSING (with vendor profiles)
    // ═══════════════════════════════════════════════════════════
    try {
        setLoadingStep('parsing');
        const result = await processInvoiceIntelligent(file);

        if (result.status === PROCESSING_STATUS.ERROR) {
          throw new Error(result.error || 'Failed to process invoice');
        }

        if (result.status === PROCESSING_STATUS.NEEDS_ONBOARDING) {
          // Show the vendor profile wizard
          console.log('[InvoiceUpload] New vendor detected - showing profile wizard');
          setIntelligentResult(result);
          setShowProfileWizard(true);
          setLoading(false);
          setLoadingStep('');
          return;
        }

        // Ready for review - store result and convert to existing format for display
        setIntelligentResult(result);

        // Convert to existing parsedInvoice format for compatibility
        const convertedInvoice = {
          vendor: {
            name: result.vendor?.name,
            invoiceNumber: result.invoice?.invoiceNumber,
            invoiceDate: result.invoice?.invoiceDate,
            ...result.vendorInfo
          },
          totals: {
            subtotal: result.invoice?.subtotal,
            taxAmount: result.invoice?.taxGST,
            totalAmount: result.invoice?.total,
            currency: result.invoice?.currency || 'CAD'
          },
          lineItems: result.lines.map(line => ({
            itemCode: line.itemCode,
            sku: line.itemCode,
            name: line.description || line.name,
            description: line.rawDescription,
            quantity: line.quantity,
            orderedQuantity: line.orderedQuantity, // What was ordered (may differ from delivered)
            unit: line.unit,
            unitPrice: line.unitPrice,
            totalPrice: line.totalPrice,
            category: line.category,
            weight: line.weight,
            weightUnit: line.weightUnit,
            priceUnit: line.priceUnit,
            pricePerG: line.pricePerG,
            pricePerML: line.pricePerML,
            // Pricing type (for highlighting weight-based rows)
            isWeightBasedPricing: line.isWeightBasedPricing || false,
            pricingType: line.pricingType || 'unit',
            // Match info from intelligent matcher
            matchResult: line.matchResult,
            // Raw column values from invoice (for displaying unmapped columns like FORMAT, ORIGINE)
            rawColumns: line.rawColumns,
            // Learned corrections from vendor profile (auto-applied)
            learnedCorrection: line.learnedCorrection || false,
            learnedFormat: line.learnedFormat || null
          })),
          notes: ''
        };

        setParsedInvoice(convertedInvoice);

        // Show matching summary
        if (result.matchingSummary) {
          console.log(`[InvoiceUpload] Matching: ${result.matchingSummary.matched}/${result.matchingSummary.total} items auto-matched`);
        }

        setLoadingStep('');
        setLoading(false);
        return;

      } catch (err) {
        console.error('[InvoiceUpload] Invoice processing failed:', err);
        setError(err.message || 'Failed to process invoice. Please try again.');
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Save invoice and update ingredient prices
  const handleSaveInvoice = async () => {
    if (!parsedInvoice) return;

    // Use merged invoice if available (has accurate pricePerG from Phase 3)
    // Otherwise fall back to raw parsedInvoice
    const usesMergedData = !!mergedInvoice;
    let finalLineItems = usesMergedData ? mergedInvoice.lineItems : (parsedInvoice.lineItems || []);

    // ═══════════════════════════════════════════════════════════
    // Apply inline FORMAT corrections (from yellow-highlighted rows)
    // This extracts weight from corrected format strings like "Caisse 24kg"
    // ═══════════════════════════════════════════════════════════
    console.log('[Save] Checking FORMAT corrections:', Object.keys(itemFormatCorrections).length, 'corrections pending');
    if (Object.keys(itemFormatCorrections).length > 0) {
      console.log('[Save] Corrections to apply:', itemFormatCorrections);
      finalLineItems = finalLineItems.map((item, index) => {
        const itemId = item.itemCode || item.name || item.description;
        const correction = itemFormatCorrections[itemId];
        console.log(`[Save] Checking item "${itemId}" for correction:`, correction ? 'FOUND' : 'not found');

        if (correction?.corrected) {
          // Parse the corrected format string to extract weight
          const parsed = parsePackageFormat(correction.corrected);

          if (parsed.value != null && parsed.unit && parsed.unitType === 'weight') {
            // Apply extracted weight to item for pricePerG calculation
            const unitInfo = getUnitFactorForPrice(parsed.unit);
            const weightInGrams = unitInfo ? parsed.value * unitInfo.factor : parsed.value;

            // Calculate pricePerG from corrected weight
            let pricePerG = null;
            if (weightInGrams > 0 && item.unitPrice > 0) {
              pricePerG = item.unitPrice / weightInGrams;
              pricePerG = Math.round(pricePerG * 1000000) / 1000000;
            }

            console.log(`[Save] Applied correction for "${itemId}": ${correction.original} → ${correction.corrected} (${parsed.value}${parsed.unit} = ${weightInGrams}g, pricePerG=$${pricePerG})`);

            return {
              ...item,
              weight: parsed.value,
              weightUnit: parsed.unit,
              weightInGrams,
              pricePerG,
              packageType: parsed.format,
              formatCorrected: true
            };
          } else if (parsed.value != null && parsed.unit && parsed.unitType === 'volume') {
            // Handle volume units
            const unitInfo = getUnitFactorForPrice(parsed.unit);
            const volumeInML = unitInfo ? parsed.value * unitInfo.factor : parsed.value;

            let pricePerML = null;
            if (volumeInML > 0 && item.unitPrice > 0) {
              pricePerML = item.unitPrice / volumeInML;
              pricePerML = Math.round(pricePerML * 1000000) / 1000000;
            }

            console.log(`[Save] Applied correction for "${itemId}": ${correction.original} → ${correction.corrected} (${parsed.value}${parsed.unit} = ${volumeInML}ml, pricePerML=$${pricePerML})`);

            return {
              ...item,
              volume: parsed.value,
              volumeUnit: parsed.unit,
              pricePerML,
              packageType: parsed.format,
              formatCorrected: true
            };
          }
        }
        return item;
      });
    }

    // Get vendor name - from merged vendor, parsed vendor, or manual entry
    const vendor = usesMergedData ? mergedInvoice.vendor : (parsedInvoice.vendor || {});
    const vendorName = vendor.name?.trim() || manualVendorName.trim();

    // Vendor name is required - guide user if missing
    if (!vendorName) {
      setError('Vendor name is required. Please enter the vendor name above.');
      return;
    }

    setLoading(true);
    setLoadingStep('saving');
    setError('');

    try {
      // 1. Find or create vendor with extracted info (no assumed defaults)
      let vendorId = null;

      // Try to find existing vendor by name
      const existingVendor = await vendorDB.getByName(vendorName);

      if (existingVendor) {
        vendorId = existingVendor.id;

        // Update existing vendor with any new info from invoice (fill empty fields)
        const updates = {};
        if (!existingVendor.legalName && vendor.legalName) updates.legalName = vendor.legalName;
        if (!existingVendor.phone && vendor.phone) updates.phone = vendor.phone;
        if (!existingVendor.fax && vendor.fax) updates.fax = vendor.fax;
        if (!existingVendor.email && vendor.email) updates.email = vendor.email;
        if (!existingVendor.website && vendor.website) updates.website = vendor.website;
        if (!existingVendor.address && vendor.address) updates.address = vendor.address;
        if (!existingVendor.city && vendor.city) updates.city = vendor.city;
        if (!existingVendor.province && vendor.province) updates.province = vendor.province;
        if (!existingVendor.postalCode && vendor.postalCode) updates.postalCode = vendor.postalCode;
        if (!existingVendor.country && vendor.country) updates.country = vendor.country;
        if (!existingVendor.accountNumber && vendor.accountNumber) updates.accountNumber = vendor.accountNumber;
        if (!existingVendor.paymentTerms && vendor.paymentTerms) updates.paymentTerms = vendor.paymentTerms;
        if (!existingVendor.taxNumber && vendor.taxNumber) updates.taxNumber = vendor.taxNumber;

        // Update vendor if we have new info
        if (Object.keys(updates).length > 0) {
          await vendorDB.update(vendorId, updates);
          console.log('Updated vendor with new info:', updates);
        }
      } else {
        // Create new vendor with extracted info only (no assumed defaults)
        vendorId = await vendorDB.create({
          name: vendorName,
          legalName: vendor.legalName || '',
          phone: vendor.phone || '',
          fax: vendor.fax || '',
          email: vendor.email || '',
          website: vendor.website || '',
          address: vendor.address || '',
          city: vendor.city || '',
          province: vendor.province || '',
          postalCode: vendor.postalCode || '',
          country: vendor.country || '',
          accountNumber: vendor.accountNumber || '',
          paymentTerms: vendor.paymentTerms || '',
          taxNumber: vendor.taxNumber || '',
          isActive: true
        });
        console.log('Created new vendor with ID:', vendorId);
      }

      // ═══════════════════════════════════════════════════════════
      // Save FORMAT corrections to vendor profile for learning
      // Next time same item appears, correction will be auto-applied
      // ═══════════════════════════════════════════════════════════
      console.log(`[Save] Vendor profile learning check: corrections=${Object.keys(itemFormatCorrections).length}, vendorId=${vendorId}`);
      if (Object.keys(itemFormatCorrections).length > 0 && vendorId) {
        try {
          const currentVendor = await vendorDB.getById(vendorId);
          console.log(`[Save] Current vendor itemCorrections:`, currentVendor?.itemCorrections);
          const existingCorrections = currentVendor?.itemCorrections || {};

          // Merge new corrections with existing ones
          const updatedCorrections = { ...existingCorrections };
          for (const [itemId, correction] of Object.entries(itemFormatCorrections)) {
            console.log(`[Save] Processing correction for "${itemId}":`, correction);
            if (correction.corrected) {
              const parsed = parsePackageFormat(correction.corrected);
              console.log(`[Save] Parsed correction "${correction.corrected}":`, parsed);
              updatedCorrections[itemId] = {
                format: correction.corrected,
                unit: parsed.unit || null,
                unitType: parsed.unitType || null,
                value: parsed.value || null,
                packageType: parsed.format || null,
                // Pack info for distributor formats like "4/5LB"
                // packCount: number of units in pack (e.g., 4)
                // unitValue: weight/count per unit (e.g., 5lb) - for recipe portioning
                // totalValue: total weight/count (e.g., 20lb) - for pricing
                packCount: parsed.packCount || null,
                unitValue: parsed.unitValue || null,
                totalValue: parsed.totalValue || null,
                // Store both identifiers for flexible matching on future invoices
                itemCode: correction.itemCode || null,
                itemName: correction.itemName || null,
                learnedAt: new Date().toISOString()
              };
            }
          }

          console.log(`[Save] Saving updated corrections to vendor:`, updatedCorrections);
          await vendorDB.update(vendorId, { itemCorrections: updatedCorrections });
          console.log(`[Save] ✓ Saved ${Object.keys(itemFormatCorrections).length} item corrections to vendor profile for learning`);
        } catch (err) {
          console.error('[Save] ✗ Failed to save item corrections to vendor profile:', err);
          // Non-blocking - continue with invoice save
        }
      } else {
        console.log(`[Save] Skipping vendor learning: corrections=${Object.keys(itemFormatCorrections).length}, vendorId=${vendorId}`);
      }

      // 2. Save invoice with correct field names
      // Use merged totals if available, otherwise parsed totals
      const totals = usesMergedData ? mergedInvoice.totals : (parsedInvoice.totals || {});
      const invoiceData = {
        vendorId,
        vendorName,
        invoiceNumber: vendor.invoiceNumber || '',
        invoiceDate: vendor.invoiceDate || new Date().toISOString().split('T')[0],
        subtotal: totals.subtotal || 0,
        taxGST: totals.taxGST || totals.taxAmount || 0,
        total: totals.totalAmount || 0,
        currency: totals.currency || 'CAD',
        status: 'extracted',
        lineCount: finalLineItems.length,
        rawText: '',
        notes: usesMergedData ? mergedInvoice.notes : (parsedInvoice.notes || '')
      };

      const invoiceId = await invoiceDB.create(invoiceData);

      // 3. Save line items to invoiceLineItems table
      // If using merged data, pricePerG/pricePerML are already calculated
      let lineItemIds = [];
      if (finalLineItems.length > 0) {
        const lineItemsForDB = finalLineItems.map((item, index) => {
          // For merged data, use pre-calculated values; otherwise calculate
          const pricePerG = usesMergedData ? item.pricePerG : calculateNormalizedPrice(item).pricePerG;
          const pricePerML = usesMergedData ? item.pricePerML : calculateNormalizedPrice(item).pricePerML;
          const totalBaseUnits = usesMergedData ? item.weightInGrams : calculateNormalizedPrice(item).totalBaseUnits;
          const baseUnit = usesMergedData ? (pricePerML ? 'ml' : 'g') : calculateNormalizedPrice(item).baseUnit;

          // Extract weight from unit (e.g., "Sac 50lb" × qty 2 = 100lb total)
          const weightInfo = extractWeightFromUnit(item);
          console.log(`[InvoiceUpload] Line ${index + 1}: ${item.name || item.description}, qty=${item.quantity}, weightInfo=`, weightInfo);

          return {
            invoiceId,
            lineNumber: index + 1,
            description: item.name || item.description || '',
            rawDescription: item.rawDescription || item.name || item.description || '',
            // Raw data (preserve original values)
            rawQuantity: item.quantity != null ? String(item.quantity) : '',
            rawUnitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
            rawTotal: item.totalPrice != null ? String(item.totalPrice) : '',
            rawUnit: item.unit || item.quantityUnit || '',
            // Parsed/normalized data
            quantity: item.quantity || 0,
            unit: item.unit || buildPackageUnit(item), // Use merged unit or build it
            unitPrice: item.unitPrice || 0,
            totalPrice: item.totalPrice || 0,
            // Weight extraction for inventory (e.g., "Sac 50lb" × 2 = 100lb)
            weight: item.weight || weightInfo.weightPerUnit || 0,
            weightPerUnit: weightInfo.weightPerUnit || item.weightPerUnit || 0,
            totalWeight: weightInfo.totalWeight || item.totalWeight || 0,
            weightUnit: weightInfo.weightUnit || item.weightUnit || '',
            // Normalized price for accurate cost calculations (from merger or calculated)
            pricePerG,
            pricePerML,
            totalBaseUnits,
            baseUnit,
            category: item.category || '',
            matchStatus: 'unmatched'
          };
        });

        lineItemIds = await invoiceLineDB.bulkCreate(invoiceId, lineItemsForDB);
        console.log(`Saved ${finalLineItems.length} line items for invoice ${invoiceId}`);
      }

      // 4. Update inventory items from line items (tracks price history)
      const now = new Date().toISOString();
      for (let itemIndex = 0; itemIndex < finalLineItems.length; itemIndex++) {
        const item = finalLineItems[itemIndex];
        const lineItemId = lineItemIds[itemIndex]; // Corresponding line item ID

        // Get the name (merged data uses 'name', fallback to 'description')
        const itemName = item.name || item.description;
        if (!itemName) continue;

        // Use pre-calculated pricePerG if available (from FORMAT corrections or merged data), otherwise calculate
        // item.pricePerG is set by: 1) inline FORMAT correction, 2) merged invoice data
        const pricePerG = item.pricePerG ?? (usesMergedData ? null : calculateNormalizedPrice(item).pricePerG);
        const pricePerML = item.pricePerML ?? (usesMergedData ? null : calculateNormalizedPrice(item).pricePerML);

        // Check if inventory item exists (by vendor + name)
        let existingItem = null;
        if (vendorId) {
          existingItem = await inventoryItemDB.getByVendorAndName(vendorId, itemName);
        }

        // No fuzzy matching - if item doesn't exist for this vendor, it's a new item
        console.log(`  Processing: ${itemName} for vendor ${vendorId}, existing:`, existingItem?.name || 'NEW ITEM');
        console.log(`    pricePerG: ${pricePerG}, pricePerML: ${pricePerML}, weightInGrams: ${item.weightInGrams || 'N/A'}`);

        // Extract quantity and weight from item
        // Merged data has: quantity, weight (from Claude), weightInGrams (calculated)
        const hasQuantity = item.quantity != null && item.quantity > 0;
        const hasExplicitWeight = (item.weight != null && item.weight > 0) || (item.weightInGrams != null && item.weightInGrams > 0);

        // Check for weight embedded in unit string (e.g., "Sac 50lb", "Caisse 4x5lb")
        const embeddedWeight = extractWeightFromUnit(item);
        const hasEmbeddedWeight = embeddedWeight.hasEmbeddedWeight;

        // hasWeight is true if explicit OR embedded weight exists
        const hasWeight = hasExplicitWeight || hasEmbeddedWeight;

        // For price update, use weightInGrams if available for accuracy
        const priceQty = item.weightInGrams || item.weight || item.quantity || 1;

        if (existingItem) {
          // Capture previous values for tracking
          const previousPrice = existingItem.currentPrice || 0;
          const previousStock = existingItem.currentStock || 0;

          // Update price and add to stock
          await inventoryItemDB.updatePriceFromInvoice(
            existingItem.id,
            item.unitPrice || 0,
            {
              quantity: priceQty,
              invoiceId,
              purchaseDate: invoiceData.invoiceDate
            }
          );

          // Update stock - now can have BOTH quantity AND weight
          const updates = {};

          // Add quantity if present
          if (hasQuantity) {
            updates.stockQuantity = (existingItem.stockQuantity || 0) + item.quantity;
            updates.stockQuantityUnit = normalizeQuantityUnit(item.quantityUnit || 'pc');
          }

          // Add weight/volume if present (explicit or embedded in unit string)
          if (hasWeight) {
            let valueToAdd, unitType;

            if (hasExplicitWeight) {
              // Use explicit weight from Claude parsing
              valueToAdd = item.weight || item.weightInGrams || 0;
              unitType = item.weightUnit || 'g';
            } else {
              // Use embedded weight from unit string (e.g., "Sac 50lb" × 2 = 100lb)
              valueToAdd = embeddedWeight.totalWeight;
              unitType = embeddedWeight.weightUnit;
            }

            const isVolume = isVolumeUnitType(unitType);
            updates.stockWeight = (existingItem.stockWeight || 0) + valueToAdd;
            updates.stockWeightUnit = isVolume
              ? normalizeVolumeUnit(unitType)
              : normalizeWeightUnit(unitType);
          }

          // currentStock - use actual weight if available, else quantity
          const stockAddition = hasWeight ? (embeddedWeight.totalWeight || item.weight || item.quantity || 1) : (item.quantity || 1);
          const newStock = (existingItem.currentStock || 0) + stockAddition;
          updates.currentStock = newStock;

          // Add normalized price for easy recipe cost calculation (use pre-calculated values)
          if (pricePerG != null) {
            updates.pricePerG = pricePerG;
            updates.pricePerML = null; // Clear if previously set
          } else if (pricePerML != null) {
            updates.pricePerML = pricePerML;
            updates.pricePerG = null; // Clear if previously set
          }

          await inventoryItemDB.update(existingItem.id, updates);
          console.log(`  UPDATED: ${existingItem.name} - stock updated, pricePerG: ${updates.pricePerG}, pricePerML: ${updates.pricePerML}`);

          // Update line item with inventory link and tracking info
          if (lineItemId) {
            await invoiceLineDB.update(lineItemId, {
              inventoryItemId: existingItem.id,
              matchStatus: 'auto_matched',
              matchConfidence: 100,
              matchedBy: 'system',
              matchedAt: now,
              addedToInventory: true,
              addedToInventoryAt: now,
              addedToInventoryBy: 'system',
              previousPrice,
              newPrice: item.unitPrice || 0,
              previousStock,
              newStock
            });
          }
        } else {
          // Create new inventory item with initial stock from invoice
          console.log(`  CREATING NEW: ${itemName} for vendor ${vendorName}`);
          const newItem = {
            name: itemName,
            category: item.category || 'Other',
            vendorId: vendorId,
            vendorName: vendorName,
            unit: item.unit || buildPackageUnit(item), // Use merged unit or build it
            currentPrice: item.unitPrice || 0,
            // Normalized price for easy recipe cost calculation (use pre-calculated values)
            pricePerG: pricePerG,
            pricePerML: pricePerML,
            lastPurchaseDate: invoiceData.invoiceDate,
            lastInvoiceId: invoiceId,
            isActive: true
          };

          // Set quantity if present
          if (hasQuantity) {
            newItem.stockQuantity = item.quantity;
            newItem.stockQuantityUnit = normalizeQuantityUnit(item.quantityUnit || 'pc');
            newItem.parQuantity = item.quantity;
          } else {
            newItem.stockQuantity = 0;
            newItem.stockQuantityUnit = 'pc';
            newItem.parQuantity = 0;
          }

          // Set weight/volume if present (explicit or embedded in unit string)
          if (hasWeight) {
            let weightValue, unitType;

            if (hasExplicitWeight) {
              // Use explicit weight from Claude parsing
              weightValue = item.weight || item.weightInGrams || 0;
              unitType = item.weightUnit || 'g';
            } else {
              // Use embedded weight from unit string (e.g., "Sac 50lb" × 2 = 100lb)
              weightValue = embeddedWeight.totalWeight;
              unitType = embeddedWeight.weightUnit;
            }

            const isVolume = isVolumeUnitType(unitType);
            newItem.stockWeight = weightValue;
            newItem.stockWeightUnit = isVolume
              ? normalizeVolumeUnit(unitType)
              : normalizeWeightUnit(unitType);
            newItem.parWeight = weightValue;
          } else {
            newItem.stockWeight = 0;
            newItem.stockWeightUnit = 'g';
            newItem.parWeight = 0;
          }

          // Stock tracking - use actual weight if available, else quantity
          const stockValue = hasWeight ? (embeddedWeight.totalWeight || item.weight || item.quantity || 1) : (item.quantity || 1);
          newItem.currentStock = stockValue;
          newItem.parLevel = stockValue;

          const newItemId = await inventoryItemDB.create(newItem);
          console.log(`  CREATED: ${itemName} with ID ${newItemId}, pricePerG: ${pricePerG}, pricePerML: ${pricePerML}`);

          // Update line item with new inventory item link and tracking info
          if (lineItemId) {
            await invoiceLineDB.update(lineItemId, {
              inventoryItemId: newItemId,
              matchStatus: 'new_item',
              matchConfidence: 100,
              matchedBy: 'system',
              matchedAt: now,
              addedToInventory: true,
              addedToInventoryAt: now,
              addedToInventoryBy: 'system',
              previousPrice: null,
              newPrice: item.unitPrice || 0,
              previousStock: null,
              newStock: stockValue  // Use actual weight, not case count
            });
          }
        }
      }

      setSaved(true);
      console.log('Invoice saved with ID:', invoiceId, '- inventory items processed');

      // Navigate to inventory dashboard after delay to see new items
      redirectTimerRef.current = setTimeout(() => {
        navigate('/inventory');
      }, 1500);

    } catch (err) {
      console.error('Save invoice error:', err);
      setError(err.message || 'Failed to save invoice.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handleReset = () => {
    setFile(null);
    setFileType(null);
    setParsedInvoice(null);
    setError('');
    setSaved(false);
    setSelectedItems(new Set());
    setItemDepartments({});
    setBulkDepartment('');
    setManualVendorName('');
    setIntelligentResult(null);
    setShowProfileWizard(false);
  };

  // Handle vendor profile wizard completion
  const handleProfileWizardComplete = async (vendorData, profile, itemCorrections = null) => {
    setShowProfileWizard(false);
    setLoading(true);
    setLoadingStep('parsing');

    try {
      // Complete onboarding - this creates/updates vendor and re-processes invoice
      // itemCorrections contains Type 2 corrections from wizard Step 4 (line value changes)
      const result = await completeOnboarding(vendorData, profile, intelligentResult, itemCorrections);

      if (result.status === PROCESSING_STATUS.ERROR) {
        throw new Error(result.error || 'Failed to complete vendor setup');
      }

      setIntelligentResult(result);

      // Convert to existing parsedInvoice format for display
      const convertedInvoice = {
        vendor: {
          name: result.vendor?.name,
          invoiceNumber: result.invoice?.invoiceNumber,
          invoiceDate: result.invoice?.invoiceDate,
          ...result.vendorInfo
        },
        totals: {
          subtotal: result.invoice?.subtotal,
          taxAmount: result.invoice?.taxGST,
          totalAmount: result.invoice?.total,
          currency: result.invoice?.currency || 'CAD'
        },
        lineItems: result.lines.map(line => ({
          itemCode: line.itemCode,
          sku: line.itemCode,
          name: line.description || line.name,
          description: line.rawDescription,
          quantity: line.quantity,
          orderedQuantity: line.orderedQuantity, // What was ordered (may differ from delivered)
          unit: line.unit,
          unitPrice: line.unitPrice,
          totalPrice: line.totalPrice,
          category: line.category,
          weight: line.weight,
          weightUnit: line.weightUnit,
          priceUnit: line.priceUnit,
          pricePerG: line.pricePerG,
          pricePerML: line.pricePerML,
          // Pricing type (for highlighting weight-based rows)
          isWeightBasedPricing: line.isWeightBasedPricing || false,
          pricingType: line.pricingType || 'unit',
          matchResult: line.matchResult,
          // Raw column values from invoice (for displaying unmapped columns like FORMAT, ORIGINE)
          rawColumns: line.rawColumns,
          // Learned corrections from vendor profile (auto-applied)
          learnedCorrection: line.learnedCorrection || false,
          learnedFormat: line.learnedFormat || null
        })),
        notes: ''
      };

      setParsedInvoice(convertedInvoice);

      // Show matching summary
      if (result.matchingSummary) {
        console.log(`[InvoiceUpload] After onboarding: ${result.matchingSummary.matched}/${result.matchingSummary.total} items auto-matched`);
      }

    } catch (err) {
      console.error('[InvoiceUpload] Profile wizard completion error:', err);
      setError(err.message || 'Failed to complete vendor setup');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Handle wizard close without completing
  const handleProfileWizardClose = () => {
    setShowProfileWizard(false);
    setIntelligentResult(null);
    // Reset to initial state - user can re-upload or complete wizard next time
    setFile(null);
    setFileType(null);
  };

  // Handle opening line review modal
  const handleOpenLineReview = () => {
    setFlaggedLines(linesNeedingReview);
    setShowLineReviewModal(true);
  };

  // Handle saving line corrections from review modal
  const handleLineCorrectionsave = (updatedLines) => {
    // Update the parsed invoice with corrections
    if (!parsedInvoice?.lineItems) return;

    const newLineItems = [...parsedInvoice.lineItems];
    updatedLines.forEach(line => {
      if (line.lineIndex !== undefined && line.correctedUnit) {
        // Update the line item with the corrected unit
        newLineItems[line.lineIndex] = {
          ...newLineItems[line.lineIndex],
          weightUnit: line.correctedUnit,
          correctedUnit: line.correctedUnit,
          correctedUnitType: line.correctedUnitType
        };
      }
    });

    setParsedInvoice(prev => ({
      ...prev,
      lineItems: newLineItems
    }));
  };

  // Department assignment helpers
  const toggleItemSelection = (index) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!parsedInvoice?.lineItems) return;
    if (selectedItems.size === parsedInvoice.lineItems.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(parsedInvoice.lineItems.map((_, i) => i)));
    }
  };

  const assignDepartmentToSelected = () => {
    if (!bulkDepartment || selectedItems.size === 0) return;
    setItemDepartments(prev => {
      const next = { ...prev };
      selectedItems.forEach(index => {
        next[index] = bulkDepartment;
      });
      return next;
    });
    setSelectedItems(new Set()); // Clear selection after assignment
  };

  const assignDepartmentToItem = (index, departmentId) => {
    setItemDepartments(prev => ({
      ...prev,
      [index]: departmentId
    }));
  };

  // Get department info by ID
  const getDepartment = (id) => DEPARTMENTS.find(d => d.id === id) || DEPARTMENTS[0];

  // Calculate totals by department
  const departmentTotals = useMemo(() => {
    if (!parsedInvoice?.lineItems) return {};
    const totals = {};
    parsedInvoice.lineItems.forEach((item, index) => {
      const deptId = itemDepartments[index] || 'default';
      if (!totals[deptId]) {
        totals[deptId] = { count: 0, total: 0 };
      }
      totals[deptId].count++;
      totals[deptId].total += item.totalPrice || 0;
    });
    return totals;
  }, [parsedInvoice, itemDepartments]);

  // Detect lines that need review (anomaly flagging)
  // Only applies when "Package Format (weight embedded)" is selected
  // If "Package Format (units per case)" is selected, no review needed - all numbers are count
  const linesNeedingReview = useMemo(() => {
    if (!parsedInvoice?.lineItems) return [];

    // profile.columns is an OBJECT: { packageFormat: { index: 3, ... }, description: { index: 1, ... } }
    const profileColumns = intelligentResult?.profile?.columns || {};

    // Check profile.packageFormat.type (set by wizard based on user's column selection)
    const packageFormatType = intelligentResult?.profile?.packageFormat?.type;
    if (packageFormatType === 'units') {
      // User selected "Package Format (units per case)" - no review needed
      return [];
    }

    // Check if user mapped a column as 'packageUnits' (units per case)
    const hasPackageUnitsColumn = !!profileColumns.packageUnits;
    if (hasPackageUnitsColumn) {
      // User selected "units per case" column type - no review needed
      return [];
    }

    // Only flag if user selected "weight embedded" package format column
    const hasPackageFormatColumn = !!profileColumns.packageFormat;
    if (!hasPackageFormatColumn) {
      // No weight-embedded package format column - no flagging needed
      return [];
    }

    // Get the FORMAT column index for rawColumns lookup
    const formatColIndex = profileColumns.packageFormat?.index;

    return parsedInvoice.lineItems
      .map((item, index) => {
        // Skip items that already have learned corrections from vendor profile
        if (item.learnedCorrection && item.learnedFormat) {
          return null;
        }

        // Get FORMAT column value from rawColumns
        const formatString = formatColIndex != null && item.rawColumns
          ? item.rawColumns[formatColIndex]
          : (item.priceUnit || item.unit);

        if (!formatString) return null;

        // Parse the format string to check for anomalies
        const parsed = parsePackageFormat(formatString);

        // Only flag if needs review (bare number, no unit, etc.)
        if (parsed.needsReview) {
          return {
            lineIndex: index,
            ...item,
            formatParsed: parsed
          };
        }
        return null;
      })
      .filter(Boolean);
  }, [parsedInvoice, intelligentResult]);

  // Set of line indices that need review (for quick lookup in table rendering)
  const needsReviewIndices = useMemo(() => {
    return new Set(linesNeedingReview.map(line => line.lineIndex));
  }, [linesNeedingReview]);

  // Get unique item identifier (prefer itemCode, fallback to name)
  const getItemIdentifier = (item) => {
    return item.itemCode || item.name || item.description || `line-${item.lineIndex}`;
  };

  // Handle inline FORMAT correction
  const handleFormatCorrection = (item, lineIndex, newValue) => {
    const itemId = getItemIdentifier(item);
    const profileColumns = intelligentResult?.profile?.columns || {};
    const formatColIndex = profileColumns.packageFormat?.index;

    // Get original value from rawColumns
    const originalValue = formatColIndex != null && item.rawColumns
      ? item.rawColumns[formatColIndex]
      : '';

    setItemFormatCorrections(prev => ({
      ...prev,
      [itemId]: {
        original: originalValue,
        corrected: newValue,
        lineIndex,
        itemCode: item.itemCode,
        itemName: item.name || item.description
      }
    }));
  };

  // Check if item has a correction applied
  const getItemCorrection = (item) => {
    const itemId = getItemIdentifier(item);
    return itemFormatCorrections[itemId] || null;
  };

  // Split invoice by department - saves separate invoices
  const handleSplitByDepartment = async () => {
    if (!parsedInvoice) return;

    // Group items by department
    const itemsByDept = {};
    parsedInvoice.lineItems.forEach((item, index) => {
      const deptId = itemDepartments[index] || 'default';
      if (!itemsByDept[deptId]) {
        itemsByDept[deptId] = [];
      }
      itemsByDept[deptId].push(item);
    });

    // Check if there are multiple departments
    const deptIds = Object.keys(itemsByDept);
    if (deptIds.length <= 1) {
      setError('Items are all in one department. Assign items to different departments first to split.');
      return;
    }

    // Get vendor name - either from AI extraction or manual entry
    const vendor = parsedInvoice.vendor || {};
    const vendorName = vendor.name?.trim() || manualVendorName.trim();

    // Vendor name is required
    if (!vendorName) {
      setError('Vendor name is required. Please enter the vendor name above.');
      return;
    }

    setLoading(true);
    setLoadingStep('saving');
    setError('');

    try {
      // Find or create vendor
      let vendorId = null;

      // Try to find existing vendor by name
      const existingVendor = await vendorDB.getByName(vendorName);

      if (existingVendor) {
        vendorId = existingVendor.id;
      } else {
        vendorId = await vendorDB.create({
          name: vendorName,
          isActive: true
        });
      }

      // Create separate invoice for each department
      const savedInvoices = [];
      for (const deptId of deptIds) {
        const deptItems = itemsByDept[deptId];
        const dept = getDepartment(deptId);
        const deptTotal = deptItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

        const invoiceData = {
          vendorId,
          vendorName,
          invoiceNumber: `${parsedInvoice.vendor?.invoiceNumber || ''}-${dept.name.substring(0, 3).toUpperCase()}`,
          invoiceDate: parsedInvoice.vendor?.invoiceDate || new Date().toISOString().split('T')[0],
          total: deptTotal,
          currency: parsedInvoice.totals?.currency || 'CAD',
          department: deptId,
          departmentName: dept.name,
          status: 'extracted',
          lineCount: deptItems.length,
          parentInvoiceNumber: parsedInvoice.vendor?.invoiceNumber || '',
          notes: `Split from invoice ${parsedInvoice.vendor?.invoiceNumber || ''} - ${dept.name}`
        };

        const invoiceId = await invoiceDB.create(invoiceData);

        // Save line items to invoiceLineItems table (with raw data and normalized prices)
        let lineItemIds = [];
        if (deptItems.length > 0) {
          const lineItemsForDB = deptItems.map((item, index) => {
            const normalizedPrice = calculateNormalizedPrice(item);
            // Extract weight from unit (e.g., "Sac 50lb" × qty 2 = 100lb total)
            const weightInfo = extractWeightFromUnit(item);
            return {
              invoiceId,
              lineNumber: index + 1,
              description: item.name || '',
              rawDescription: item.name || '',
              rawQuantity: item.quantity != null ? String(item.quantity) : '',
              rawUnitPrice: item.unitPrice != null ? String(item.unitPrice) : '',
              rawTotal: item.totalPrice != null ? String(item.totalPrice) : '',
              rawUnit: item.unit || item.quantityUnit || '',
              quantity: item.quantity || item.weight || 0,
              unit: buildPackageUnit(item),
              unitPrice: item.unitPrice || 0,
              totalPrice: item.totalPrice || 0,
              // Weight extraction for inventory (e.g., "Sac 50lb" × 2 = 100lb)
              weight: item.weight || weightInfo.weightPerUnit || 0,
              weightPerUnit: weightInfo.weightPerUnit || item.weightPerUnit || 0,
              totalWeight: weightInfo.totalWeight || item.totalWeight || 0,
              weightUnit: weightInfo.weightUnit || item.weightUnit || '',
              pricePerG: normalizedPrice.pricePerG,
              pricePerML: normalizedPrice.pricePerML,
              totalBaseUnits: normalizedPrice.totalBaseUnits,
              baseUnit: normalizedPrice.baseUnit,
              category: item.category || '',
              matchStatus: 'unmatched'
            };
          });
          lineItemIds = await invoiceLineDB.bulkCreate(invoiceId, lineItemsForDB);
        }

        savedInvoices.push({ invoiceId, department: dept.name, itemCount: deptItems.length, total: deptTotal });

        // Update inventory items and link line items
        const now = new Date().toISOString();
        for (let itemIndex = 0; itemIndex < deptItems.length; itemIndex++) {
          const item = deptItems[itemIndex];
          const lineItemId = lineItemIds[itemIndex];
          if (!item.name) continue;

          // Calculate normalized price per gram/ml for this item
          const normalizedPrice = calculateNormalizedPrice(item);

          // Check if inventory item exists (by vendor + name)
          let existingItem = null;
          if (vendorId) {
            existingItem = await inventoryItemDB.getByVendorAndName(vendorId, item.name);
          }

          // If not found by vendor, try fuzzy search
          if (!existingItem) {
            const searchResults = await inventoryItemDB.search(item.name, { limit: 1 });
            if (searchResults.length > 0 && searchResults[0].name.toLowerCase() === item.name.toLowerCase()) {
              existingItem = searchResults[0];
            }
          }

          // Determine if this is a weight, volume, or quantity based on unit
          const itemUnit = buildPackageUnit(item);
          const itemQty = item.quantity || 1;
          const unitIsWeight = isWeightUnit(itemUnit);
          const unitIsVolume = isVolumeUnitType(itemUnit);

          // Check for embedded weight in unit string (e.g., "Sac 50lb", "Caisse 4x5lb")
          const embeddedWeightInfo = extractWeightFromUnit(item);
          const hasEmbeddedWeight = embeddedWeightInfo.hasEmbeddedWeight;

          if (existingItem) {
            const previousPrice = existingItem.currentPrice || 0;
            const previousStock = existingItem.currentStock || 0;

            await inventoryItemDB.updatePriceFromInvoice(
              existingItem.id,
              item.unitPrice || 0,
              {
                quantity: itemQty,
                invoiceId,
                purchaseDate: invoiceData.invoiceDate
              }
            );

            // Update stock - add to appropriate field based on unit type
            const updates = {};

            // Always set quantity for package-type items (sac, caisse, etc.)
            if (!unitIsWeight && !unitIsVolume) {
              updates.stockQuantity = (existingItem.stockQuantity || 0) + itemQty;
              updates.stockQuantityUnit = normalizeQuantityUnit(item.quantityUnit || itemUnit);
            }

            // Set weight if unit is weight/volume OR if weight is embedded in unit string
            if (unitIsWeight || unitIsVolume) {
              updates.stockWeight = (existingItem.stockWeight || 0) + itemQty;
              updates.stockWeightUnit = unitIsVolume
                ? normalizeVolumeUnit(itemUnit)
                : normalizeWeightUnit(itemUnit);
            } else if (hasEmbeddedWeight) {
              // Extract weight from unit string (e.g., "Sac 50lb" × 2 = 100lb)
              updates.stockWeight = (existingItem.stockWeight || 0) + embeddedWeightInfo.totalWeight;
              updates.stockWeightUnit = normalizeWeightUnit(embeddedWeightInfo.weightUnit);
            }
            const newStock = (existingItem.currentStock || 0) + itemQty;
            updates.currentStock = newStock;

            // Add normalized price for easy recipe cost calculation
            if (normalizedPrice.pricePerG != null) {
              updates.pricePerG = normalizedPrice.pricePerG;
              updates.pricePerML = null;
            } else if (normalizedPrice.pricePerML != null) {
              updates.pricePerML = normalizedPrice.pricePerML;
              updates.pricePerG = null;
            }

            await inventoryItemDB.update(existingItem.id, updates);

            // Update line item with inventory link
            if (lineItemId) {
              await invoiceLineDB.update(lineItemId, {
                inventoryItemId: existingItem.id,
                matchStatus: 'auto_matched',
                matchConfidence: 100,
                matchedBy: 'system',
                matchedAt: now,
                addedToInventory: true,
                addedToInventoryAt: now,
                addedToInventoryBy: 'system',
                previousPrice,
                newPrice: item.unitPrice || 0,
                previousStock,
                newStock
              });
            }
          } else {
            const newItem = {
              name: item.name,
              category: item.category || 'Other',
              vendorId: vendorId,
              vendorName: vendorName,
              unit: itemUnit,
              currentPrice: item.unitPrice || 0,
              // Normalized price for easy recipe cost calculation
              pricePerG: normalizedPrice.pricePerG,
              pricePerML: normalizedPrice.pricePerML,
              lastPurchaseDate: invoiceData.invoiceDate,
              lastInvoiceId: invoiceId,
              isActive: true
            };

            if (unitIsWeight || unitIsVolume) {
              // Pure weight/volume unit (e.g., "kg", "lb", "ml")
              newItem.stockWeight = itemQty;
              newItem.stockWeightUnit = unitIsVolume
                ? normalizeVolumeUnit(itemUnit)
                : normalizeWeightUnit(itemUnit);
              newItem.parWeight = itemQty;
              newItem.stockQuantity = 0;
              newItem.stockQuantityUnit = 'pc';
            } else if (hasEmbeddedWeight) {
              // Package with embedded weight (e.g., "Sac 50lb" × 2)
              // Set BOTH quantity (2 sacs) AND weight (100lb)
              newItem.stockQuantity = itemQty;
              newItem.stockQuantityUnit = normalizeQuantityUnit(item.quantityUnit || 'sac');
              newItem.parQuantity = itemQty;
              newItem.stockWeight = embeddedWeightInfo.totalWeight;
              newItem.stockWeightUnit = normalizeWeightUnit(embeddedWeightInfo.weightUnit);
              newItem.parWeight = embeddedWeightInfo.totalWeight;
            } else {
              // Pure quantity unit (e.g., "pc", "case", "doz")
              newItem.stockQuantity = itemQty;
              newItem.stockQuantityUnit = normalizeQuantityUnit(itemUnit);
              newItem.parQuantity = itemQty;
              newItem.stockWeight = 0;
              newItem.stockWeightUnit = 'g';
            }
            newItem.currentStock = itemQty;
            newItem.parLevel = itemQty;

            const newItemId = await inventoryItemDB.create(newItem);

            // Update line item with new inventory item link
            if (lineItemId) {
              await invoiceLineDB.update(lineItemId, {
                inventoryItemId: newItemId,
                matchStatus: 'new_item',
                matchConfidence: 100,
                matchedBy: 'system',
                matchedAt: now,
                addedToInventory: true,
                addedToInventoryAt: now,
                addedToInventoryBy: 'system',
                previousPrice: null,
                newPrice: item.unitPrice || 0,
                previousStock: null,
                newStock: itemQty
              });
            }
          }
        }
      }

      console.log('Split invoices saved:', savedInvoices);
      setSaved(true);

      redirectTimerRef.current = setTimeout(() => {
        navigate('/invoices/list');
      }, 2000);

    } catch (err) {
      console.error('Split invoice error:', err);
      setError(err.message || 'Failed to split and save invoices.');
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  // Format currency
  const formatCurrency = (amount, currency = 'CAD') => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency
    }).format(amount || 0);
  };

  return (
    <div className={styles.invoicePage}>
      <div className={styles.header}>
        <h1>Upload Invoice</h1>
        <p>Upload vendor invoices to automatically extract items and update ingredient prices</p>
      </div>

      {error && (
        <Alert variant="danger" dismissible onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {saved && (
        <Alert variant="success">
          Invoice saved! Ingredient prices updated. Redirecting...
        </Alert>
      )}

      {/* Lines Needing Review Info */}
      {parsedInvoice && linesNeedingReview.length > 0 && (
        <Alert variant="warning">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              <strong>{linesNeedingReview.length} yellow row{linesNeedingReview.length !== 1 ? 's' : ''}</strong> need unit info.
              Edit the FORMAT column directly (e.g., "Caisse 24" → "Caisse 24kg"). Changes are saved per item.
            </span>
            {Object.keys(itemFormatCorrections).length > 0 && (
              <span style={{ marginLeft: '12px', color: '#059669', fontWeight: 500 }}>
                ✓ {Object.keys(itemFormatCorrections).length} corrected
              </span>
            )}
          </div>
        </Alert>
      )}

      {/* Upload Section */}
      {!parsedInvoice && (
        <Card>
          <h2>Upload Invoice File</h2>

          {!file ? (
            <div
              className={`${styles.dropZone} ${isDragging ? styles.dragging : ''}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={styles.dropIcon}>📄</div>
              <p className={styles.dropText}>Drag and drop an invoice here</p>
              <p className={styles.dropSubtext}>or click to browse</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"
                onChange={(e) => handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
              <p className={styles.dropHint}>Supports PDF and images (JPEG, PNG) up to 10MB</p>
            </div>
          ) : (
            <>
              <div className={styles.fileInfo}>
                <div className={styles.fileIcon}>
                  {fileType === 'pdf' ? '📄' : '🖼️'}
                </div>
                <div className={styles.fileDetails}>
                  <h3>{file.name}</h3>
                  <p>Size: {formatFileSize(file.size)} | Type: {fileType.toUpperCase()}</p>
                </div>
                <div className={styles.fileActions}>
                  <Button variant="secondary" onClick={handleReset} disabled={loading}>
                    Remove
                  </Button>
                  <Button variant="primary" onClick={handleParseInvoice} loading={loading}>
                    {loading ? 'Processing...' : 'Parse Invoice'}
                  </Button>
                </div>
              </div>

              {/* Progress */}
              {loading && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressSteps}>
                    {fileType === 'pdf' && (
                      <>
                        <div className={`${styles.progressStep} ${loadingStep === 'extracting' ? styles.active : ''} ${loadingStep === 'parsing' || loadingStep === 'saving' ? styles.completed : ''}`}>
                          <div className={styles.stepIcon}>
                            {loadingStep === 'parsing' || loadingStep === 'saving' ? '✓' : '1'}
                          </div>
                          <div className={styles.stepLabel}>Extract text</div>
                        </div>
                        <div className={styles.progressLine}></div>
                      </>
                    )}
                    <div className={`${styles.progressStep} ${loadingStep === 'parsing' ? styles.active : ''} ${loadingStep === 'saving' ? styles.completed : ''}`}>
                      <div className={styles.stepIcon}>
                        {loadingStep === 'saving' ? '✓' : fileType === 'pdf' ? '2' : '1'}
                      </div>
                      <div className={styles.stepLabel}>AI parsing</div>
                    </div>
                    <div className={styles.progressLine}></div>
                    <div className={`${styles.progressStep} ${loadingStep === 'saving' ? styles.active : ''}`}>
                      <div className={styles.stepIcon}>{fileType === 'pdf' ? '3' : '2'}</div>
                      <div className={styles.stepLabel}>Save</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* Parsed Invoice Review */}
      {parsedInvoice && (
        <Card>
          <div className={styles.reviewHeader}>
            <h2>Review Parsed Invoice</h2>
            <div className={styles.reviewActions}>
              <Button variant="secondary" onClick={handleReset} disabled={loading}>
                Upload Different
              </Button>
              <Button variant="primary" onClick={handleSaveInvoice} loading={loading}>
                {loading ? 'Saving...' : 'Save Invoice'}
              </Button>
            </div>
          </div>

          {/* Vendor Info */}
          <div className={styles.section}>
            <h3>Vendor Information</h3>
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <label>Vendor {!parsedInvoice.vendor?.name && <span style={{ color: '#dc3545' }}>*</span>}</label>
                {parsedInvoice.vendor?.name ? (
                  <span>{parsedInvoice.vendor.name}</span>
                ) : (
                  <input
                    type="text"
                    value={manualVendorName}
                    onChange={(e) => setManualVendorName(e.target.value)}
                    placeholder="Enter vendor name (required)"
                    className={styles.vendorInput}
                    style={{
                      padding: '8px 12px',
                      border: '2px solid #dc3545',
                      borderRadius: '4px',
                      fontSize: '14px',
                      width: '100%',
                      maxWidth: '300px'
                    }}
                  />
                )}
              </div>
              <div className={styles.infoItem}>
                <label>Invoice #</label>
                <span>{parsedInvoice.vendor?.invoiceNumber || '-'}</span>
              </div>
              <div className={styles.infoItem}>
                <label>Date</label>
                <span>{parsedInvoice.vendor?.invoiceDate || '-'}</span>
              </div>
              <div className={styles.infoItem}>
                <label>PO #</label>
                <span>{parsedInvoice.vendor?.poNumber || '-'}</span>
              </div>
            </div>
          </div>

          {/* Totals */}
          <div className={styles.section}>
            <h3>Totals</h3>
            <div className={styles.totalsGrid}>
              <div className={styles.totalItem}>
                <label>Subtotal</label>
                <span>{formatCurrency(parsedInvoice.totals?.subtotal, parsedInvoice.totals?.currency)}</span>
              </div>
              <div className={styles.totalItem}>
                <label>Tax</label>
                <span>{formatCurrency(parsedInvoice.totals?.taxAmount, parsedInvoice.totals?.currency)}</span>
              </div>
              <div className={`${styles.totalItem} ${styles.totalHighlight}`}>
                <label>Total</label>
                <span>{formatCurrency(parsedInvoice.totals?.totalAmount, parsedInvoice.totals?.currency)}</span>
              </div>
            </div>
          </div>

          {/* Analysis Warnings Panel */}
          {showWarnings && mergedInvoice && mergedInvoice.summary.totalIssues > 0 && (
            <div className={styles.section}>
              <div className={styles.warningsPanel}>
                <div className={styles.warningsHeader}>
                  <h3>
                    Analysis Results
                    {mergedInvoice.summary.errorCount > 0 && (
                      <span className={styles.errorBadge}>{mergedInvoice.summary.errorCount} errors</span>
                    )}
                    {mergedInvoice.summary.warningCount > 0 && (
                      <span className={styles.warningBadge}>{mergedInvoice.summary.warningCount} warnings</span>
                    )}
                  </h3>
                  <Button
                    variant="ghost"
                    onClick={() => setShowWarnings(false)}
                    style={{ padding: '4px 8px', fontSize: '12px' }}
                  >
                    Dismiss
                  </Button>
                </div>

                {/* Weight Extraction Stats */}
                {analysisResult && (
                  <div className={styles.analysisStats}>
                    <span className={styles.statItem}>
                      Weight extracted: {analysisResult.lineItems.summary.linesWithWeight}/{analysisResult.lineItems.summary.totalLines} lines
                      ({analysisResult.lineItems.summary.weightExtractionRate}%)
                    </span>
                  </div>
                )}

                {/* Invoice Reconciliation Summary */}
                {mergedInvoice?.summary?.byType && (
                  <div className={styles.reconciliationPanel}>
                    <h4 className={styles.reconciliationTitle}>Invoice Breakdown</h4>
                    <div className={styles.reconciliationGrid}>
                      {/* Products */}
                      <div className={styles.reconciliationRow}>
                        <span className={styles.reconciliationLabel}>
                          Products ({mergedInvoice.summary.byType.product?.count || 0} items)
                        </span>
                        <span className={styles.reconciliationValue}>
                          {formatCurrency(mergedInvoice.summary.byType.product?.total || 0, parsedInvoice.totals?.currency)}
                        </span>
                      </div>

                      {/* Deposits - only show if present */}
                      {mergedInvoice.summary.byType.deposit?.count > 0 && (
                        <div className={styles.reconciliationRow}>
                          <span className={styles.reconciliationLabel}>
                            Deposits ({mergedInvoice.summary.byType.deposit.count} items)
                            <span className={styles.reconciliationHint}> - tracked separately</span>
                          </span>
                          <span className={styles.reconciliationValue}>
                            {formatCurrency(mergedInvoice.summary.byType.deposit.total, parsedInvoice.totals?.currency)}
                          </span>
                        </div>
                      )}

                      {/* Fees - only show if present */}
                      {mergedInvoice.summary.byType.fee?.count > 0 && (
                        <div className={styles.reconciliationRow}>
                          <span className={styles.reconciliationLabel}>
                            Fees ({mergedInvoice.summary.byType.fee.count} items)
                          </span>
                          <span className={styles.reconciliationValue}>
                            {formatCurrency(mergedInvoice.summary.byType.fee.total, parsedInvoice.totals?.currency)}
                          </span>
                        </div>
                      )}

                      {/* Credits - only show if present */}
                      {mergedInvoice.summary.byType.credit?.count > 0 && (
                        <div className={styles.reconciliationRow}>
                          <span className={styles.reconciliationLabel}>
                            Credits ({mergedInvoice.summary.byType.credit.count} items)
                          </span>
                          <span className={`${styles.reconciliationValue} ${styles.creditValue}`}>
                            {formatCurrency(mergedInvoice.summary.byType.credit.total, parsedInvoice.totals?.currency)}
                          </span>
                        </div>
                      )}

                      {/* Zero items - only show if present */}
                      {mergedInvoice.summary.byType.zero?.count > 0 && (
                        <div className={styles.reconciliationRow}>
                          <span className={styles.reconciliationLabel}>
                            Zero/Info ({mergedInvoice.summary.byType.zero.count} items)
                            <span className={styles.reconciliationHint}> - excluded</span>
                          </span>
                          <span className={styles.reconciliationValue}>
                            $0.00
                          </span>
                        </div>
                      )}

                      {/* Divider */}
                      <div className={styles.reconciliationDivider}></div>

                      {/* Calculated Subtotal */}
                      <div className={styles.reconciliationRow}>
                        <span className={styles.reconciliationLabel}>Calculated Subtotal</span>
                        <span className={styles.reconciliationValue}>
                          {formatCurrency(mergedInvoice.summary.calculatedSubtotal, parsedInvoice.totals?.currency)}
                        </span>
                      </div>

                      {/* QuickBooks effective total */}
                      <div className={`${styles.reconciliationRow} ${styles.qbTotal}`}>
                        <span className={styles.reconciliationLabel}>
                          <span className={styles.qbIcon}>QB</span>
                          QuickBooks will receive
                        </span>
                        <span className={styles.reconciliationValue}>
                          {formatCurrency(mergedInvoice.summary.effectiveSubtotal, parsedInvoice.totals?.currency)}
                        </span>
                      </div>

                      {/* Balance check */}
                      {mergedInvoice.summary.byType.deposit?.count > 0 && (
                        <div className={styles.reconciliationNote}>
                          <span className={styles.checkIcon}>✓</span>
                          Subtotal difference of {formatCurrency(mergedInvoice.summary.depositTotal, parsedInvoice.totals?.currency)} explained by deposits
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {mergedInvoice.issues.errors.length > 0 && (
                  <div className={styles.issuesList}>
                    <h4 className={styles.errorTitle}>Errors (blocking)</h4>
                    {mergedInvoice.issues.errors.map((issue, idx) => (
                      <div key={idx} className={styles.issueError}>
                        <span className={styles.issueIcon}>!</span>
                        <span>{issue.message}</span>
                        {issue.lineNumber && <span className={styles.lineRef}>Line {issue.lineNumber}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Warnings */}
                {mergedInvoice.issues.warnings.length > 0 && (
                  <div className={styles.issuesList}>
                    <h4 className={styles.warningTitle}>Warnings</h4>
                    {mergedInvoice.issues.warnings.slice(0, 10).map((issue, idx) => (
                      <div
                        key={idx}
                        className={`${styles.issueWarning} ${styles.clickable}`}
                        onClick={() => {
                          if (issue.lineNumber) {
                            const lineElement = document.getElementById(`line-item-${issue.lineNumber - 1}`);
                            if (lineElement) {
                              lineElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              lineElement.classList.add(styles.highlighted);
                              setTimeout(() => lineElement.classList.remove(styles.highlighted), 2000);
                            }
                          }
                        }}
                        title="Click to scroll to this item"
                      >
                        <span className={styles.issueIcon}>!</span>
                        <div className={styles.issueContent}>
                          {issue.name && <span className={styles.issueName}>{issue.name}</span>}
                          <span className={styles.issueMessage}>{issue.message}</span>
                        </div>
                        {issue.lineNumber && <span className={styles.lineRef}>Line {issue.lineNumber}</span>}
                      </div>
                    ))}
                    {mergedInvoice.issues.warnings.length > 10 && (
                      <div className={styles.moreIssues}>
                        +{mergedInvoice.issues.warnings.length - 10} more warnings
                      </div>
                    )}
                  </div>
                )}

                {/* Zero Price Items */}
                {mergedInvoice.lineItems.filter(l => l.isZeroPrice).length > 0 && (
                  <div className={styles.issuesList}>
                    <h4 className={styles.infoTitle}>Zero Price Items (likely unavailable)</h4>
                    {mergedInvoice.lineItems.filter(l => l.isZeroPrice).map((item, idx) => (
                      <div key={idx} className={styles.issueInfo}>
                        <span className={styles.issueIcon}>*</span>
                        <span>{item.name || item.description} (qty: {item.quantity})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Department Assignment Toolbar */}
          <div className={styles.section}>
            <div className={styles.departmentToolbar}>
              <div className={styles.toolbarLeft}>
                <h3>Line Items ({parsedInvoice.lineItems?.length || 0})</h3>
                {selectedItems.size > 0 && (
                  <span className={styles.selectedCount}>{selectedItems.size} selected</span>
                )}
                {/* View Mode Toggle */}
                {intelligentResult?.detectedColumns?.length > 0 && (
                  <div className={styles.viewToggle}>
                    <button
                      className={`${styles.toggleBtn} ${tableViewMode === 'original' ? styles.active : ''}`}
                      onClick={() => setTableViewMode('original')}
                      title="Show original invoice column headers"
                    >
                      Original
                    </button>
                    <button
                      className={`${styles.toggleBtn} ${tableViewMode === 'normalized' ? styles.active : ''}`}
                      onClick={() => setTableViewMode('normalized')}
                      title="Show normalized field names"
                    >
                      Normalized
                    </button>
                  </div>
                )}
              </div>
              <div className={styles.toolbarRight}>
                <select
                  value={bulkDepartment}
                  onChange={(e) => setBulkDepartment(e.target.value)}
                  className={styles.departmentSelect}
                >
                  <option value="">Assign to department...</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept.id} value={dept.id}>{dept.name}</option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  onClick={assignDepartmentToSelected}
                  disabled={!bulkDepartment || selectedItems.size === 0}
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                >
                  Assign Selected
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSplitByDepartment}
                  disabled={loading || Object.keys(departmentTotals).length <= 1}
                  style={{ padding: '8px 12px', fontSize: '13px' }}
                >
                  Split by Department
                </Button>
              </div>
            </div>

            {/* Department Summary */}
            {Object.keys(departmentTotals).length > 1 && (
              <div className={styles.departmentSummary}>
                {Object.entries(departmentTotals).map(([deptId, data]) => {
                  const dept = getDepartment(deptId);
                  return (
                    <div
                      key={deptId}
                      className={styles.departmentChip}
                      style={{ backgroundColor: dept.color }}
                    >
                      <span className={styles.chipName}>{dept.name}</span>
                      <span className={styles.chipCount}>{data.count} items</span>
                      <span className={styles.chipTotal}>{formatCurrency(data.total, parsedInvoice.totals?.currency)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Items Table - Adaptive based on view mode */}
            <div className={styles.itemsTable}>
              {(() => {
                const displayColumns = getDisplayColumns();
                const currency = parsedInvoice.totals?.currency;
                return (
                  <>
                    <div className={styles.tableHeader} style={{ gridTemplateColumns: `40px repeat(${displayColumns.length}, 1fr)${intelligentResult ? ' 80px' : ''}` }}>
                      <span className={styles.checkboxCol}>
                        <input
                          type="checkbox"
                          checked={selectedItems.size === parsedInvoice.lineItems?.length && parsedInvoice.lineItems?.length > 0}
                          onChange={toggleSelectAll}
                          title="Select all"
                        />
                      </span>
                      {displayColumns.map((col, idx) => (
                        <span key={idx} title={tableViewMode === 'original' ? `Mapped to: ${col.aiLabel}` : undefined}>
                          {col.header}
                        </span>
                      ))}
                      {intelligentResult && <span>Match</span>}
                    </div>
                    {parsedInvoice.lineItems?.map((item, index) => {
                      const dept = getDepartment(itemDepartments[index]);
                      // Highlight rows with weight/volume pricing (pricePerG/pricePerML calculated)
                      const isWeightPriced = item.isWeightBasedPricing || item.pricingType === 'weight' || item.pricePerG || item.pricePerML;
                      // Check if row needs FORMAT review (yellow highlight)
                      const needsReview = needsReviewIndices.has(index);
                      const itemCorrection = getItemCorrection(item);
                      const hasCorrection = !!itemCorrection?.corrected;
                      // Row is resolved if corrected or has weight pricing
                      const isResolved = hasCorrection || isWeightPriced;
                      return (
                        <div
                          key={index}
                          id={`line-item-${index}`}
                          className={`${styles.tableRow} ${selectedItems.has(index) ? styles.selectedRow : ''} ${isWeightPriced ? styles.weightBasedRow : ''} ${needsReview && !isResolved ? styles.needsReviewRow : ''}`}
                          style={{
                            backgroundColor: itemDepartments[index] ? dept.color : (needsReview && !isResolved ? 'rgba(251, 191, 36, 0.15)' : (isWeightPriced ? 'rgba(0, 0, 0, 0.04)' : 'transparent')),
                            gridTemplateColumns: `40px repeat(${displayColumns.length}, 1fr)${intelligentResult ? ' 80px' : ''}`
                          }}
                          onClick={() => toggleItemSelection(index)}
                          title={needsReview && !isResolved ? 'Click FORMAT cell to add unit (e.g., kg, lb)' : (isWeightPriced ? `Price per unit weight calculated${item.pricePerG ? ` ($${item.pricePerG.toFixed(4)}/g)` : item.pricePerML ? ` ($${item.pricePerML.toFixed(4)}/ml)` : ''}` : '')}
                        >
                          <span className={styles.checkboxCol} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedItems.has(index)}
                              onChange={() => toggleItemSelection(index)}
                            />
                          </span>
                          {displayColumns.map((col, colIdx) => {
                            // Check if this is the FORMAT column and row needs review
                            const isFormatColumn = col.aiLabel === 'packageFormat' || col.key === 'packageFormat';
                            // If learned correction was applied, row doesn't need review
                            const hasLearnedCorrection = item.learnedCorrection && item.learnedFormat;
                            const isEditableFormat = isFormatColumn && needsReview && !hasLearnedCorrection;
                            // Priority: user correction > learned format > raw column value
                            const rawFormatValue = item.rawColumns && col.colIndex != null
                              ? item.rawColumns[col.colIndex]
                              : '';
                            const formatValue = isFormatColumn
                              ? (itemCorrection?.corrected || item.learnedFormat || rawFormatValue || '')
                              : null;

                            return (
                              <span key={colIdx} className={`${col.aiLabel === 'description' ? styles.itemName : ''} ${isEditableFormat ? styles.editableCell : ''}`}>
                                {col.key === 'category' ? (
                                  item.category || '-'
                                ) : col.aiLabel === 'description' ? (
                                  <>
                                    <strong>{item.name}</strong>
                                    {item.description && item.description !== item.name && <small>{item.description}</small>}
                                  </>
                                ) : isEditableFormat ? (
                                  <>
                                    <input
                                      type="text"
                                      value={itemCorrection?.corrected ?? formatValue ?? ''}
                                      onChange={(e) => handleFormatCorrection(item, index, e.target.value)}
                                      onClick={(e) => e.stopPropagation()}
                                      placeholder="e.g., Caisse 24kg"
                                      title="Add unit: kg, lb, g, L, ml, etc."
                                    />
                                    {hasCorrection && <span className={styles.correctedBadge}>✓</span>}
                                  </>
                                ) : isFormatColumn && hasLearnedCorrection ? (
                                  // Display learned correction with checkmark
                                  <>
                                    {item.learnedFormat}
                                    <span className={styles.correctedBadge} title="Auto-applied from vendor profile">✓</span>
                                  </>
                                ) : (
                                  getItemValueByLabel(item, col.aiLabel, currency, col.colIndex)
                                )}
                              </span>
                            );
                          })}
                          {intelligentResult && (
                            <span className={styles.matchStatus}>
                              {item.matchResult?.autoApplied ? (
                                <span className={styles.matchSuccess} title={`Matched to: ${item.matchResult?.bestMatch?.name || 'Unknown'}`}>
                                  ✓ {Math.round((item.matchResult?.bestMatch?.score || 0) * 100)}%
                                </span>
                              ) : item.matchResult?.bestMatch ? (
                                <span className={styles.matchPending} title={`Best match: ${item.matchResult?.bestMatch?.name || 'Unknown'}`}>
                                  ? {Math.round((item.matchResult?.bestMatch?.score || 0) * 100)}%
                                </span>
                              ) : (
                                <span className={styles.matchNew} title="New item - no match found">
                                  New
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Notes */}
          {parsedInvoice.notes && (
            <div className={styles.section}>
              <h3>Notes</h3>
              <p className={styles.notes}>{parsedInvoice.notes}</p>
            </div>
          )}
        </Card>
      )}

      {/* Help */}
      <Card variant="outlined" style={{ marginTop: '20px' }}>
        <h3>How Invoice Parsing Works</h3>
        <ol style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
          <li><strong>Upload:</strong> Drop a PDF or photo of your vendor invoice</li>
          <li><strong>AI Extract:</strong> Claude AI reads and extracts vendor, items, and prices</li>
          <li><strong>Review:</strong> Verify the extracted data before saving</li>
          <li><strong>Save:</strong> Data is saved and ingredient prices are automatically updated</li>
        </ol>
        <p style={{ marginTop: '15px', color: '#666', fontSize: '14px' }}>
          <strong>Tip:</strong> For best results, use clear photos or text-based PDFs.
          Handwritten invoices may not parse accurately.
        </p>
      </Card>

      {/* Vendor Profile Wizard - shown for new vendors */}
      <VendorProfileWizard
        open={showProfileWizard}
        vendorInfo={intelligentResult?.vendorInfo}
        suggestedProfile={intelligentResult?.suggestedProfile}
        sampleLines={intelligentResult?.sampleLines || intelligentResult?.lines?.slice(0, 5) || []}
        detectedColumns={intelligentResult?.detectedColumns || []}
        autoCorrections={intelligentResult?.autoCorrections}
        onClose={handleProfileWizardClose}
        onComplete={handleProfileWizardComplete}
      />

      {/* Line Review Modal - for reviewing flagged lines (per-item corrections, not per-tag) */}
      <LineReviewModal
        open={showLineReviewModal}
        flaggedLines={flaggedLines}
        onClose={() => setShowLineReviewModal(false)}
        onSave={handleLineCorrectionsave}
      />
    </div>
  );
}

export default InvoiceUploadPage;
