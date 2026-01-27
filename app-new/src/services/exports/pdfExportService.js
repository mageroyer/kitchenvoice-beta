/**
 * PDF Export Service
 *
 * Generates PDF documents for purchase orders and inventory reports.
 * Uses jsPDF for PDF generation with Canadian locale formatting.
 *
 * @module services/exports/pdfExportService
 */

import { jsPDF } from 'jspdf';

// ============================================
// Constants
// ============================================

const COLORS = {
  primary: [41, 128, 185],      // Blue
  secondary: [52, 73, 94],      // Dark gray
  success: [39, 174, 96],       // Green
  warning: [243, 156, 18],      // Orange
  danger: [231, 76, 60],        // Red
  light: [236, 240, 241],       // Light gray
  dark: [44, 62, 80],           // Dark
  white: [255, 255, 255],
  black: [0, 0, 0],
  gray: [149, 165, 166],
  tableHeader: [52, 73, 94],
  tableStripe: [245, 247, 250],
};

const FONTS = {
  normal: 'helvetica',
  bold: 'helvetica',
};

const PAGE = {
  width: 210,       // A4 width in mm
  height: 297,      // A4 height in mm
  marginLeft: 15,
  marginRight: 15,
  marginTop: 15,
  marginBottom: 20,
};

const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight;

// ============================================
// Formatting Helpers
// ============================================

/**
 * Format currency in Canadian format
 * @param {number} value - Amount to format
 * @returns {string} Formatted currency string
 */
function formatCurrency(value) {
  if (value == null || isNaN(value)) return '$0.00';
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(value);
}

/**
 * Format date in Canadian format
 * @param {string|Date} dateString - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format date and time
 * @param {string|Date} dateString - DateTime to format
 * @returns {string} Formatted datetime string
 */
function formatDateTime(dateString) {
  if (!dateString) return '—';
  const date = new Date(dateString);
  return date.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Get status display properties
 * @param {string} status - Order status
 * @returns {Object} Status color and label
 */
function getStatusDisplay(status) {
  const statusMap = {
    draft: { color: COLORS.gray, label: 'Draft' },
    pending_approval: { color: COLORS.warning, label: 'Pending Approval' },
    approved: { color: COLORS.primary, label: 'Approved' },
    sent: { color: COLORS.success, label: 'Sent' },
    confirmed: { color: COLORS.success, label: 'Confirmed' },
    partially_received: { color: COLORS.warning, label: 'Partially Received' },
    received: { color: COLORS.success, label: 'Received' },
    cancelled: { color: COLORS.danger, label: 'Cancelled' },
    closed: { color: COLORS.secondary, label: 'Closed' },
  };
  return statusMap[status] || { color: COLORS.gray, label: status };
}

/**
 * Get stock status display properties
 * @param {string} status - Stock status
 * @returns {Object} Status color and label
 */
function getStockStatusDisplay(status) {
  const statusMap = {
    critical: { color: COLORS.danger, label: 'Critical' },
    low: { color: COLORS.warning, label: 'Low' },
    warning: { color: COLORS.warning, label: 'Warning' },
    optimal: { color: COLORS.success, label: 'OK' },
    ok: { color: COLORS.success, label: 'OK' },
  };
  return statusMap[status] || { color: COLORS.gray, label: status };
}

// ============================================
// PDF Helper Functions
// ============================================

/**
 * Add page header with business info
 * @param {jsPDF} doc - PDF document
 * @param {Object} businessInfo - Business information
 * @param {string} title - Document title
 * @returns {number} Y position after header
 */
function addHeader(doc, businessInfo, title) {
  let y = PAGE.marginTop;

  // Business name (large, bold)
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...COLORS.dark);
  doc.text(businessInfo?.businessName || 'SmartCookBook', PAGE.marginLeft, y);

  // Document title (right aligned)
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.primary);
  doc.text(title, PAGE.width - PAGE.marginRight, y, { align: 'right' });

  y += 8;

  // Business contact info
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);

  if (businessInfo?.address) {
    doc.text(businessInfo.address, PAGE.marginLeft, y);
    y += 4;
  }

  const cityProvince = [businessInfo?.city, businessInfo?.province, businessInfo?.postalCode]
    .filter(Boolean)
    .join(', ');
  if (cityProvince) {
    doc.text(cityProvince, PAGE.marginLeft, y);
    y += 4;
  }

  const contact = [businessInfo?.phone, businessInfo?.email].filter(Boolean).join(' | ');
  if (contact) {
    doc.text(contact, PAGE.marginLeft, y);
    y += 4;
  }

  // Divider line
  y += 3;
  doc.setDrawColor(...COLORS.light);
  doc.setLineWidth(0.5);
  doc.line(PAGE.marginLeft, y, PAGE.width - PAGE.marginRight, y);

  return y + 8;
}

/**
 * Add page footer with page number
 * @param {jsPDF} doc - PDF document
 * @param {number} pageNum - Current page number
 * @param {number} totalPages - Total pages
 */
function addFooter(doc, pageNum, totalPages) {
  const y = PAGE.height - 10;

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);

  // Generated date (left)
  doc.text(`Generated: ${formatDateTime(new Date())}`, PAGE.marginLeft, y);

  // Page number (center)
  doc.text(`Page ${pageNum} of ${totalPages}`, PAGE.width / 2, y, { align: 'center' });

  // App name (right)
  doc.text('SmartCookBook', PAGE.width - PAGE.marginRight, y, { align: 'right' });
}

/**
 * Add a section title
 * @param {jsPDF} doc - PDF document
 * @param {string} title - Section title
 * @param {number} y - Y position
 * @returns {number} Y position after title
 */
function addSectionTitle(doc, title, y) {
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.secondary);
  doc.text(title, PAGE.marginLeft, y);
  return y + 6;
}

/**
 * Add info row (label: value)
 * @param {jsPDF} doc - PDF document
 * @param {string} label - Label text
 * @param {string} value - Value text
 * @param {number} y - Y position
 * @param {number} labelWidth - Width for label column
 * @returns {number} Y position after row
 */
function addInfoRow(doc, label, value, y, labelWidth = 35) {
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text(label + ':', PAGE.marginLeft, y);

  doc.setFont(FONTS.normal, 'normal');
  doc.setTextColor(...COLORS.dark);
  doc.text(String(value || '—'), PAGE.marginLeft + labelWidth, y);

  return y + 5;
}

/**
 * Check if we need a new page
 * @param {jsPDF} doc - PDF document
 * @param {number} y - Current Y position
 * @param {number} needed - Space needed
 * @returns {number} New Y position (after page break if needed)
 */
function checkPageBreak(doc, y, needed = 30) {
  if (y + needed > PAGE.height - PAGE.marginBottom) {
    doc.addPage();
    return PAGE.marginTop;
  }
  return y;
}

// ============================================
// Purchase Order PDF Generation
// ============================================

/**
 * Generate Purchase Order PDF
 *
 * @param {Object} order - Purchase order data
 * @param {Object[]} lineItems - Order line items
 * @param {Object} vendor - Vendor information
 * @param {Object} businessInfo - Business information for letterhead
 * @returns {jsPDF} Generated PDF document
 */
export function generatePurchaseOrderPDF(order, lineItems, vendor, businessInfo) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = PAGE.marginTop;

  // ---- Header ----
  y = addHeader(doc, businessInfo, 'PURCHASE ORDER');

  // ---- Order Info Box ----
  // Left column: Order details
  const col1X = PAGE.marginLeft;
  const col2X = PAGE.width / 2 + 5;

  // Order Number (prominent)
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text(`PO #: ${order.orderNumber || '—'}`, col1X, y);

  // Status badge
  const status = getStatusDisplay(order.status);
  doc.setFillColor(...status.color);
  doc.roundedRect(col2X + 50, y - 4, 30, 6, 1, 1, 'F');
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);
  doc.text(status.label.toUpperCase(), col2X + 65, y - 0.5, { align: 'center' });

  y += 10;

  // Order dates
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);

  y = addInfoRow(doc, 'Order Date', formatDate(order.createdAt), y);
  if (order.expectedDeliveryDate) {
    y = addInfoRow(doc, 'Expected Delivery', formatDate(order.expectedDeliveryDate), y);
  }
  if (order.sentAt) {
    y = addInfoRow(doc, 'Sent Date', formatDate(order.sentAt), y);
  }

  y += 5;

  // ---- Vendor Information Box ----
  // Draw box
  doc.setFillColor(...COLORS.tableStripe);
  doc.roundedRect(col2X, y - 45, CONTENT_WIDTH / 2 - 5, 40, 2, 2, 'F');

  let vendorY = y - 42;
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.secondary);
  doc.text('VENDOR', col2X + 3, vendorY);

  vendorY += 6;
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text(vendor?.name || order.vendorName || '—', col2X + 3, vendorY);

  vendorY += 5;
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);

  if (vendor?.contactName) {
    doc.text(`Attn: ${vendor.contactName}`, col2X + 3, vendorY);
    vendorY += 4;
  }
  if (vendor?.address) {
    doc.text(vendor.address, col2X + 3, vendorY);
    vendorY += 4;
  }
  const vendorCityProv = [vendor?.city, vendor?.province, vendor?.postalCode]
    .filter(Boolean)
    .join(', ');
  if (vendorCityProv) {
    doc.text(vendorCityProv, col2X + 3, vendorY);
    vendorY += 4;
  }
  if (vendor?.phone || vendor?.orderPhone) {
    doc.text(`Tel: ${vendor.orderPhone || vendor.phone}`, col2X + 3, vendorY);
    vendorY += 4;
  }
  if (vendor?.email || vendor?.orderEmail) {
    doc.text(vendor.orderEmail || vendor.email, col2X + 3, vendorY);
  }

  y += 5;

  // ---- Line Items Table ----
  y = addSectionTitle(doc, 'ORDER ITEMS', y);

  // Table header
  const tableX = PAGE.marginLeft;
  const colWidths = {
    item: 70,
    sku: 25,
    qty: 20,
    unit: 15,
    price: 25,
    total: 25,
  };

  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(tableX, y, CONTENT_WIDTH, 7, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.white);

  let headerX = tableX + 2;
  doc.text('Item', headerX, y + 5);
  headerX += colWidths.item;
  doc.text('SKU', headerX, y + 5);
  headerX += colWidths.sku;
  doc.text('Qty', headerX, y + 5, { align: 'right' });
  headerX += colWidths.qty;
  doc.text('Unit', headerX + 2, y + 5);
  headerX += colWidths.unit;
  doc.text('Unit Price', headerX + colWidths.price - 2, y + 5, { align: 'right' });
  headerX += colWidths.price;
  doc.text('Total', headerX + colWidths.total - 2, y + 5, { align: 'right' });

  y += 9;

  // Table rows
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);

  (lineItems || []).forEach((item, index) => {
    y = checkPageBreak(doc, y, 8);

    // Alternate row background
    if (index % 2 === 1) {
      doc.setFillColor(...COLORS.tableStripe);
      doc.rect(tableX, y - 4, CONTENT_WIDTH, 7, 'F');
    }

    doc.setTextColor(...COLORS.dark);

    let rowX = tableX + 2;

    // Item name (truncate if too long)
    const itemName = (item.inventoryItemName || item.name || '—').substring(0, 40);
    doc.text(itemName, rowX, y);
    rowX += colWidths.item;

    // SKU
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.text(item.inventoryItemSku || item.sku || '—', rowX, y);
    rowX += colWidths.sku;

    // Quantity
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    doc.text(String(item.quantity || 0), rowX - 2, y, { align: 'right' });
    rowX += colWidths.qty;

    // Unit
    doc.text(item.unit || '—', rowX + 2, y);
    rowX += colWidths.unit;

    // Unit price
    doc.text(formatCurrency(item.unitPrice), rowX + colWidths.price - 2, y, { align: 'right' });
    rowX += colWidths.price;

    // Line total
    doc.setFont(FONTS.bold, 'bold');
    doc.text(formatCurrency(item.lineTotal || item.quantity * item.unitPrice), rowX + colWidths.total - 2, y, { align: 'right' });
    doc.setFont(FONTS.normal, 'normal');

    y += 7;
  });

  // ---- Totals Section ----
  y += 5;
  y = checkPageBreak(doc, y, 35);

  // Totals box
  const totalsX = PAGE.width - PAGE.marginRight - 60;
  const totalsWidth = 60;

  // Subtotal
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text('Subtotal:', totalsX, y);
  doc.setTextColor(...COLORS.dark);
  doc.text(formatCurrency(order.subtotal), totalsX + totalsWidth - 2, y, { align: 'right' });
  y += 5;

  // GST
  doc.setTextColor(...COLORS.gray);
  doc.text('GST (5%):', totalsX, y);
  doc.setTextColor(...COLORS.dark);
  doc.text(formatCurrency(order.taxGST), totalsX + totalsWidth - 2, y, { align: 'right' });
  y += 5;

  // QST
  doc.setTextColor(...COLORS.gray);
  doc.text('QST (9.975%):', totalsX, y);
  doc.setTextColor(...COLORS.dark);
  doc.text(formatCurrency(order.taxQST), totalsX + totalsWidth - 2, y, { align: 'right' });
  y += 3;

  // Divider
  doc.setDrawColor(...COLORS.gray);
  doc.setLineWidth(0.3);
  doc.line(totalsX, y, totalsX + totalsWidth, y);
  y += 5;

  // Total
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);
  doc.text('TOTAL:', totalsX, y);
  doc.setTextColor(...COLORS.primary);
  doc.text(formatCurrency(order.total), totalsX + totalsWidth - 2, y, { align: 'right' });

  y += 15;

  // ---- Notes Section ----
  if (order.deliveryInstructions || order.internalNotes) {
    y = checkPageBreak(doc, y, 25);

    if (order.deliveryInstructions) {
      y = addSectionTitle(doc, 'Delivery Instructions', y);
      doc.setFont(FONTS.normal, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.dark);

      const instructions = doc.splitTextToSize(order.deliveryInstructions, CONTENT_WIDTH);
      doc.text(instructions, PAGE.marginLeft, y);
      y += instructions.length * 4 + 5;
    }

    if (order.internalNotes) {
      y = checkPageBreak(doc, y, 15);
      y = addSectionTitle(doc, 'Notes', y);
      doc.setFont(FONTS.normal, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...COLORS.dark);

      const notes = doc.splitTextToSize(order.internalNotes, CONTENT_WIDTH);
      doc.text(notes, PAGE.marginLeft, y);
    }
  }

  // ---- Footer ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }

  return doc;
}

// ============================================
// Inventory Report PDF Generation
// ============================================

/**
 * Generate Inventory Report PDF
 *
 * @param {Object[]} items - Inventory items
 * @param {Object} summary - Inventory summary statistics
 * @param {Object} businessInfo - Business information for letterhead
 * @param {Object} options - Report options
 * @param {string} options.title - Report title
 * @param {string} options.filterDescription - Description of applied filters
 * @param {boolean} options.includeValue - Include inventory value
 * @param {boolean} options.groupByCategory - Group items by category
 * @param {boolean} options.groupByVendor - Group items by vendor
 * @returns {jsPDF} Generated PDF document
 */
export function generateInventoryReportPDF(items, summary, businessInfo, options = {}) {
  const {
    title = 'Inventory Report',
    filterDescription = '',
    includeValue = true,
    groupByCategory = false,
    groupByVendor = false,
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = PAGE.marginTop;

  // ---- Header ----
  y = addHeader(doc, businessInfo, title.toUpperCase());

  // ---- Report Info ----
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text(`Report Date: ${formatDateTime(new Date())}`, PAGE.marginLeft, y);

  if (filterDescription) {
    y += 4;
    doc.text(`Filters: ${filterDescription}`, PAGE.marginLeft, y);
  }

  y += 8;

  // ---- Summary Cards ----
  y = addSectionTitle(doc, 'SUMMARY', y);

  const cardWidth = (CONTENT_WIDTH - 10) / 4;
  const cardHeight = 18;
  const cards = [
    { label: 'Total Items', value: summary?.totalItems || items.length, color: COLORS.primary },
    { label: 'Critical', value: summary?.criticalCount || 0, color: COLORS.danger },
    { label: 'Low Stock', value: summary?.lowCount || 0, color: COLORS.warning },
    { label: 'OK', value: summary?.optimalCount || 0, color: COLORS.success },
  ];

  cards.forEach((card, index) => {
    const cardX = PAGE.marginLeft + (cardWidth + 3) * index;

    // Card background
    doc.setFillColor(...COLORS.tableStripe);
    doc.roundedRect(cardX, y, cardWidth, cardHeight, 2, 2, 'F');

    // Card value
    doc.setFont(FONTS.bold, 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...card.color);
    doc.text(String(card.value), cardX + cardWidth / 2, y + 10, { align: 'center' });

    // Card label
    doc.setFont(FONTS.normal, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.gray);
    doc.text(card.label, cardX + cardWidth / 2, y + 15, { align: 'center' });
  });

  y += cardHeight + 8;

  // Total inventory value
  if (includeValue && summary?.totalValue) {
    doc.setFont(FONTS.bold, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...COLORS.dark);
    doc.text(`Total Inventory Value: ${formatCurrency(summary.totalValue)}`, PAGE.marginLeft, y);
    y += 8;
  }

  // ---- Items Table ----
  y = addSectionTitle(doc, 'INVENTORY ITEMS', y);

  // Group items if requested
  let groupedItems = items;
  if (groupByCategory) {
    groupedItems = groupItemsByField(items, 'category');
  } else if (groupByVendor) {
    groupedItems = groupItemsByField(items, 'vendorName');
  }

  // Table header
  const tableX = PAGE.marginLeft;
  const colWidths = {
    item: 55,
    category: 25,
    vendor: 30,
    stock: 20,
    par: 20,
    status: 18,
    value: 22,
  };

  const drawTableHeader = (yPos) => {
    doc.setFillColor(...COLORS.tableHeader);
    doc.rect(tableX, yPos, CONTENT_WIDTH, 7, 'F');

    doc.setFont(FONTS.bold, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...COLORS.white);

    let headerX = tableX + 2;
    doc.text('Item', headerX, yPos + 5);
    headerX += colWidths.item;
    doc.text('Category', headerX, yPos + 5);
    headerX += colWidths.category;
    doc.text('Vendor', headerX, yPos + 5);
    headerX += colWidths.vendor;
    doc.text('Stock', headerX + colWidths.stock - 2, yPos + 5, { align: 'right' });
    headerX += colWidths.stock;
    doc.text('Par', headerX + colWidths.par - 2, yPos + 5, { align: 'right' });
    headerX += colWidths.par;
    doc.text('Status', headerX, yPos + 5);
    if (includeValue) {
      headerX += colWidths.status;
      doc.text('Value', headerX + colWidths.value - 2, yPos + 5, { align: 'right' });
    }

    return yPos + 9;
  };

  y = drawTableHeader(y);

  // Render items (grouped or flat)
  const renderItems = (itemList, startY) => {
    let currentY = startY;

    itemList.forEach((item, index) => {
      // Check for page break
      if (currentY + 8 > PAGE.height - PAGE.marginBottom) {
        doc.addPage();
        currentY = PAGE.marginTop;
        currentY = drawTableHeader(currentY);
      }

      // Alternate row background
      if (index % 2 === 1) {
        doc.setFillColor(...COLORS.tableStripe);
        doc.rect(tableX, currentY - 4, CONTENT_WIDTH, 7, 'F');
      }

      doc.setFont(FONTS.normal, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...COLORS.dark);

      let rowX = tableX + 2;

      // Item name
      const itemName = (item.name || '—').substring(0, 30);
      doc.text(itemName, rowX, currentY);
      rowX += colWidths.item;

      // Category
      doc.text((item.category || '—').substring(0, 12), rowX, currentY);
      rowX += colWidths.category;

      // Vendor
      doc.text((item.vendorName || '—').substring(0, 15), rowX, currentY);
      rowX += colWidths.vendor;

      // Stock
      doc.text(`${item.currentStock || 0} ${item.unit || ''}`, rowX + colWidths.stock - 2, currentY, { align: 'right' });
      rowX += colWidths.stock;

      // Par level
      doc.text(`${item.parLevel || 0}`, rowX + colWidths.par - 2, currentY, { align: 'right' });
      rowX += colWidths.par;

      // Status badge
      const status = getStockStatusDisplay(item.stockStatus);
      doc.setFillColor(...status.color);
      doc.roundedRect(rowX, currentY - 3, 15, 5, 1, 1, 'F');
      doc.setFontSize(6);
      doc.setTextColor(...COLORS.white);
      doc.text(status.label, rowX + 7.5, currentY, { align: 'center' });

      // Value
      if (includeValue) {
        rowX += colWidths.status;
        doc.setFontSize(8);
        doc.setTextColor(...COLORS.dark);
        doc.text(formatCurrency(item.inventoryValue || 0), rowX + colWidths.value - 2, currentY, { align: 'right' });
      }

      currentY += 7;
    });

    return currentY;
  };

  // Render grouped or flat
  if (Array.isArray(groupedItems)) {
    y = renderItems(groupedItems, y);
  } else {
    // Grouped by category/vendor
    Object.entries(groupedItems).forEach(([groupName, groupItems]) => {
      // Group header
      y = checkPageBreak(doc, y, 15);

      doc.setFont(FONTS.bold, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...COLORS.secondary);
      doc.text(groupName || 'Uncategorized', PAGE.marginLeft, y);
      y += 6;

      y = renderItems(groupItems, y);
      y += 5;
    });
  }

  // ---- Footer ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }

  return doc;
}

/**
 * Group items by a field
 * @param {Object[]} items - Items to group
 * @param {string} field - Field name to group by
 * @returns {Object} Grouped items
 */
function groupItemsByField(items, field) {
  return items.reduce((groups, item) => {
    const key = item[field] || 'Other';
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {});
}

// ============================================
// Low Stock Report PDF
// ============================================

/**
 * Generate Low Stock Alert Report PDF
 *
 * @param {Object[]} items - Low stock items
 * @param {Object} businessInfo - Business information
 * @returns {jsPDF} Generated PDF document
 */
export function generateLowStockReportPDF(items, businessInfo) {
  return generateInventoryReportPDF(
    items,
    {
      totalItems: items.length,
      criticalCount: items.filter(i => i.stockStatus === 'critical').length,
      lowCount: items.filter(i => i.stockStatus === 'low').length,
      warningCount: items.filter(i => i.stockStatus === 'warning').length,
      optimalCount: 0,
      totalValue: items.reduce((sum, i) => sum + (i.inventoryValue || 0), 0),
    },
    businessInfo,
    {
      title: 'Low Stock Alert Report',
      filterDescription: 'Items below reorder point',
      includeValue: true,
      groupByVendor: true,
    }
  );
}

// ============================================
// User Guide PDF Generation
// ============================================

/**
 * Generate User Guide PDF
 * A comprehensive guide to all KitchenCommand.IO features
 *
 * @param {Object} businessInfo - Business information for letterhead
 * @returns {jsPDF} Generated PDF document
 */
export function generateUserGuidePDF(businessInfo) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = PAGE.marginTop;

  // ---- Cover Page ----
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE.width, 80, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);
  doc.text('KitchenCommand.IO', PAGE.width / 2, 35, { align: 'center' });

  doc.setFontSize(16);
  doc.text('User Guide', PAGE.width / 2, 50, { align: 'center' });

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(10);
  doc.text('Professional Kitchen Management', PAGE.width / 2, 62, { align: 'center' });

  if (businessInfo?.businessName) {
    doc.setFontSize(12);
    doc.setTextColor(...COLORS.dark);
    doc.text(`Prepared for: ${businessInfo.businessName}`, PAGE.width / 2, 100, { align: 'center' });
  }

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.gray);
  doc.text('Version 2.0', PAGE.width / 2, 120, { align: 'center' });
  doc.text(formatDate(new Date()), PAGE.width / 2, 126, { align: 'center' });

  // Table of Contents
  y = 150;
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...COLORS.dark);
  doc.text('Table of Contents', PAGE.marginLeft, y);

  y += 10;
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(10);

  const tocItems = [
    { num: '1', title: 'Getting Started', page: 2 },
    { num: '2', title: 'Invoice Management (QuickBooks Ready)', page: 3 },
    { num: '3', title: 'Inventory Management', page: 5 },
    { num: '4', title: 'Recipe Management', page: 6 },
    { num: '5', title: 'Task Management', page: 8 },
    { num: '6', title: 'Purchase Orders (Coming Soon)', page: 9 },
    { num: '7', title: 'Settings & Control Panel', page: 10 },
    { num: '8', title: 'Tips & Best Practices', page: 11 },
  ];

  tocItems.forEach(item => {
    doc.setTextColor(...COLORS.primary);
    doc.text(`${item.num}.`, PAGE.marginLeft, y);
    doc.setTextColor(...COLORS.dark);
    doc.text(item.title, PAGE.marginLeft + 10, y);
    doc.setTextColor(...COLORS.gray);
    doc.text(`Page ${item.page}`, PAGE.width - PAGE.marginRight, y, { align: 'right' });
    y += 7;
  });

  // ---- Section 1: Getting Started ----
  doc.addPage();
  y = addGuideHeader(doc, '1. Getting Started');

  y = addGuideSubsection(doc, '1.1 Accessing the Application', y);
  y = addGuideParagraph(doc, 'KitchenCommand.IO is a web-based application accessible from any modern browser.', y);

  y = addGuideSteps(doc, [
    'Open your browser and go to KitchenCommand.IO',
    'Login with your credentials provided by your administrator',
    'If you are the owner, you can register a new business account',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '1.2 Dashboard Overview', y);
  y = addGuideParagraph(doc, 'After logging in, you will see the main navigation menu:', y);

  y = addGuideTableWide(doc, [
    ['Menu Item', 'Description'],
    ['Recipes', 'View, create, and manage all your recipes'],
    ['Inventory', 'Track stock levels, costs, and par levels'],
    ['Invoices', 'Upload supplier invoices for automatic processing'],
    ['Tasks', 'Assign and track daily production tasks'],
    ['Orders', 'Manage purchase orders (Coming Soon)'],
    ['Settings', 'Configure account and business preferences'],
  ], y, [50, 130]);

  // ---- Section 2: Invoice Management ----
  doc.addPage();
  y = addGuideHeader(doc, '2. Invoice Management');

  y = addGuideParagraph(doc, 'KitchenCommand.IO uses AI-powered Vision parsing to automatically extract data from your supplier invoices. All invoices are QuickBooks-ready for seamless accounting integration.', y);

  y = addGuideSubsection(doc, '2.1 Uploading an Invoice', y);
  y = addGuideSteps(doc, [
    'Click "Invoices" in the menu',
    'Click "Upload Invoice"',
    'Select a PDF file or drag and drop',
    'Wait for Vision AI processing (5-15 seconds)',
    'Review the extracted line items and verify accuracy',
    'Click "Save to Inventory" to update your stock and prices',
  ], y);

  y += 3;
  y = addGuideTip(doc, 'Invoices are tagged for QuickBooks export. Connect your QuickBooks account in Settings to enable automatic bill creation.', y);

  y += 5;
  y = addGuideSubsection(doc, '2.2 What Gets Extracted', y);
  y = addGuideParagraph(doc, 'The Vision AI extracts comprehensive data from each invoice line:', y);

  y = addGuideTableWide(doc, [
    ['Field', 'Description'],
    ['Vendor Info', 'Supplier name, address, contact details'],
    ['Invoice #/Date', 'Invoice number and billing date'],
    ['Line Items', 'Product descriptions with SKU codes'],
    ['Boxing Format', 'Case format (e.g., 1/50LB, 6x500ML, 12CT)'],
    ['Package Format', 'Unit packaging details'],
    ['Price per Gram', 'Normalized cost ($/g) for weight items'],
    ['Price per Litre', 'Normalized cost ($/L) for volume items'],
    ['Price per Unit', 'Cost per each ($/ea) for count items'],
    ['Quebec Taxes', 'TPS (5%) and TVQ (9.975%) separated'],
  ], y, [45, 135]);

  y += 5;
  y = addGuideSubsection(doc, '2.3 Invoice Types', y);
  y = addGuideParagraph(doc, 'The system automatically detects and handles different invoice types:', y);

  y = addGuideTableWide(doc, [
    ['Type', 'Examples', 'Special Handling'],
    ['Food Supply', 'Produce, meat, seafood, dairy', 'Calculates $/kg, $/lb, $/g'],
    ['Packaging', 'Containers, bags, labels, foil', 'Tracks units/case, dimensions'],
    ['Utilities', 'Electric, gas, water, telecom', 'Coming Soon'],
    ['Services', 'Repairs, maintenance, cleaning', 'Coming Soon'],
  ], y, [35, 55, 90]);

  // ---- Section 3: Inventory Management ----
  doc.addPage();
  y = addGuideHeader(doc, '3. Inventory Management');

  y = addGuideSubsection(doc, '3.1 Viewing Your Inventory', y);
  y = addGuideParagraph(doc, 'Click "Inventory" to see all stock items. Use the view tabs to organize your data:', y);

  y = addGuideTableWide(doc, [
    ['View', 'Description'],
    ['By Item', 'Alphabetical list of all inventory items'],
    ['By Vendor', 'Items grouped by supplier'],
    ['By Category', 'Items grouped by food category (Produce, Meat, etc.)'],
    ['In-House', 'Items produced internally from recipes'],
  ], y, [40, 140]);

  y += 5;
  y = addGuideSubsection(doc, '3.2 Understanding Stock Display', y);
  y = addGuideParagraph(doc, 'Each inventory item displays comprehensive information:', y);
  y = addGuideCodeBlock(doc, 'CARROTS      2 × 1/50LB = 100 pc | $1.43/kg  ████████░░', y);

  y = addGuideTableWide(doc, [
    ['Element', 'Meaning'],
    ['2 × 1/50LB', 'Quantity × Boxing format (2 cases of 50 lb each)'],
    ['= 100 pc', 'Total pieces/units in stock'],
    ['$1.43/kg', 'Normalized price ($/kg, $/L, or $/ea)'],
    ['Progress bar', 'Visual stock level compared to par level'],
  ], y, [45, 135]);

  y += 5;
  y = addGuideSubsection(doc, '3.3 Stock Status Colors', y);

  y = addGuideTableWide(doc, [
    ['Color', 'Status', 'Stock Level'],
    ['Green', 'Optimal', 'Above 50% of par level'],
    ['Yellow', 'Warning', '25-50% of par level'],
    ['Orange', 'Low', '10-25% of par level'],
    ['Red', 'Critical', 'Below 10% of par level'],
  ], y, [30, 40, 110]);

  // ---- Section 4: Recipe Management ----
  doc.addPage();
  y = addGuideHeader(doc, '4. Recipe Management');

  y = addGuideSubsection(doc, '4.1 Creating a Recipe', y);
  y = addGuideParagraph(doc, 'Create recipes with voice dictation support for hands-free operation:', y);

  y = addGuideSteps(doc, [
    'Click "Recipes" in the menu, then click the "+" button',
    'Enter recipe name, category, and department',
    'Set yield (portions or total weight/volume)',
    'Use voice dictation: Click the microphone to speak recipe details',
    'Voice edit: Click mic on any field to modify with speech',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '4.2 Adding Ingredients', y);
  y = addGuideParagraph(doc, 'Ingredients link directly to your inventory database from invoices:', y);

  y = addGuideSteps(doc, [
    'Click "Add Ingredient" in the Ingredients section',
    'Search for an inventory item (populated from your invoices)',
    'The app suggests measurement tools based on boxing/packaging type',
    'Create custom tool measures (e.g., "hotel pan", "lexan container")',
    'Enter quantity using your preferred unit',
    'Click link icon to connect ingredient to inventory item',
  ], y);

  y += 3;
  y = addGuideTip(doc, 'Link all ingredients to inventory items for automatic cost calculation and stock deduction when tasks are completed.', y);

  y += 5;
  y = addGuideSubsection(doc, '4.3 Recipe Costing', y);
  y = addGuideParagraph(doc, 'Recipe costs update automatically from your invoice database:', y);

  y = addGuideTableWide(doc, [
    ['Field', 'Description'],
    ['Ingredient Cost', 'Real-time sum based on current inventory prices'],
    ['Cost per Portion', 'Total cost divided by yield'],
    ['Price Change Alert', 'Highlighted when ingredient prices change'],
    ['Food Cost %', 'Ingredient cost as percentage of selling price'],
  ], y, [50, 130]);

  y += 3;
  y = addGuideTip(doc, 'When prices change from new invoices, affected recipes show a price change indicator. Review and acknowledge to keep costs accurate.', y);

  y += 5;
  y = addGuideSubsection(doc, '4.4 Method Steps & Timers', y);
  y = addGuideSteps(doc, [
    'Click "Add Step" to add cooking instructions',
    'Use voice dictation for hands-free step entry',
    'Click timer icon to add countdown timer to any step',
    'Timers alert when complete during task execution',
  ], y);

  // ---- Section 5: Task Management ----
  doc.addPage();
  y = addGuideHeader(doc, '5. Task Management');

  y = addGuideParagraph(doc, 'Tasks connect recipes to daily production. When tasks complete, inventory is automatically updated.', y);

  y = addGuideSubsection(doc, '5.1 Creating a Task', y);
  y = addGuideSteps(doc, [
    'Open a recipe and click "Create Task" or "Assign"',
    'Select team member to assign the task',
    'Set due date and time',
    'Enter quantity (batches or portions to produce)',
    'System checks ingredient availability automatically',
    'Click "Create Task"',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '5.2 Task Dependencies & Inventory Link', y);
  y = addGuideParagraph(doc, 'Tasks are linked to recipes which are linked to inventory. The system ensures ingredients are available:', y);

  y = addGuideBullets(doc, [
    'Recipe ingredients are checked against current inventory levels',
    'If in-house ingredients are low, system warns about shortfalls',
    'Click "Create Prerequisites" to auto-generate prep tasks',
    'Prerequisite tasks must complete before dependent tasks can start',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '5.3 Executing & Completing Tasks', y);
  y = addGuideSteps(doc, [
    'Click on task to open execution view',
    'Click "Start Task" to begin',
    'Follow recipe steps, check off completed ones',
    'Use integrated timers as needed',
    'Click "Complete Task" when finished',
  ], y);

  y += 3;
  y = addGuideParagraph(doc, 'On completion: ingredients are deducted from inventory, produced items (for prep recipes) are added to inventory, and task is logged for reporting.', y);

  // ---- Section 6: Purchase Orders ----
  doc.addPage();
  y = addGuideHeader(doc, '6. Purchase Orders');

  y = addGuideWarning(doc, 'Purchase Order functionality is coming soon. The features below describe planned capabilities.', y);

  y += 5;
  y = addGuideSubsection(doc, '6.1 Auto-Generating Orders (Planned)', y);
  y = addGuideParagraph(doc, 'KitchenCommand will automatically create purchase orders based on inventory levels:', y);

  y = addGuideSteps(doc, [
    'Go to Inventory dashboard',
    'Click "Generate Orders" button',
    'System identifies items below reorder point',
    'Review order preview with suggested quantities',
    'Orders are grouped by vendor automatically',
    'Approve and send to vendors',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '6.2 Order Workflow (Planned)', y);

  y = addGuideTableWide(doc, [
    ['Status', 'Description'],
    ['Draft', 'Order created, ready for review'],
    ['Sent', 'Order transmitted to vendor'],
    ['Confirmed', 'Vendor acknowledged receipt'],
    ['Received', 'Items received, inventory updated'],
  ], y, [40, 140]);

  // ---- Section 7: Settings & Control Panel ----
  doc.addPage();
  y = addGuideHeader(doc, '7. Settings & Control Panel');

  y = addGuideSubsection(doc, '7.1 User Management', y);
  y = addGuideParagraph(doc, 'Manage team access from Control Panel → Users:', y);

  y = addGuideTableWide(doc, [
    ['Role', 'Access Level'],
    ['Owner', 'Full access including billing and system settings'],
    ['Admin', 'Full operational access, no billing'],
    ['Manager', 'Most features, cannot modify system settings'],
    ['Staff', 'Basic operations: view recipes, execute tasks'],
  ], y, [40, 140]);

  y += 5;
  y = addGuideSubsection(doc, '7.2 QuickBooks Integration', y);
  y = addGuideSteps(doc, [
    'Go to Settings → Integrations',
    'Click "Connect QuickBooks"',
    'Authorize KitchenCommand access to your QuickBooks account',
    'Configure account mappings (expense accounts, vendors)',
    'Enable automatic bill creation from invoices',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '7.3 Backup & Restore', y);
  y = addGuideSteps(doc, [
    'Go to Control Panel → Backup',
    'Click "Create Backup" to download your data',
    'Click "Restore Backup" to restore from a backup file',
  ], y);

  y += 3;
  y = addGuideWarning(doc, 'Restoring a backup will overwrite all current data. Use with caution.', y);

  y += 5;
  y = addGuideSubsection(doc, '7.4 API Credits', y);
  y = addGuideParagraph(doc, 'AI-powered features use monthly credits (50 credits/month per user):', y);

  y = addGuideTableWide(doc, [
    ['Feature', 'Cost'],
    ['Invoice Vision Parsing', '5 credits per invoice'],
    ['Recipe Image Parsing', '5 credits per image'],
    ['Recipe Text Parsing', '2 credits per recipe'],
    ['Translation', '1 credit per translation'],
    ['Bulk Task Dictation', '3 credits per session'],
  ], y, [70, 110]);

  // ---- Section 8: Tips & Best Practices ----
  doc.addPage();
  y = addGuideHeader(doc, '8. Tips & Best Practices');

  y = addGuideSubsection(doc, '8.1 Invoice Processing Tips', y);
  y = addGuideBullets(doc, [
    'Use clear, high-resolution PDF scans for best AI accuracy',
    'Process invoices promptly to keep ingredient prices current',
    'Review all extracted data before saving to inventory',
    'Keep vendor names consistent for automatic matching',
    'Check boxing formats are correctly parsed (e.g., 6x500ML, 1/50LB)',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '8.2 Inventory Best Practices', y);
  y = addGuideBullets(doc, [
    'Set realistic par levels based on actual usage patterns',
    'Verify physical counts weekly against system counts',
    'Link ALL recipe ingredients to inventory for accurate costing',
    'Use "In-House" view to track items produced from recipes',
    'Review price changes regularly and update recipes as needed',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '8.3 Recipe Management Tips', y);
  y = addGuideBullets(doc, [
    'Break complex dishes into sub-recipes (sauces, bases, etc.)',
    'Use voice dictation for faster recipe entry',
    'Include ALL ingredients, even small amounts, for accurate costs',
    'Create custom tool measures that match your kitchen equipment',
    'Add timers to method steps for consistent execution',
  ], y);

  y += 5;
  y = addGuideSubsection(doc, '8.4 Recommended Daily Workflow', y);
  y = addGuideSteps(doc, [
    'Morning: Review assigned tasks, check for dependency warnings',
    'Pre-Service: Execute prep tasks, mark steps complete as you go',
    'Post-Service: Log any additional prep completed',
    'End of Day: Review completed tasks, plan tomorrow\'s production',
  ], y);

  // ---- Back Cover ----
  doc.addPage();
  y = 100;

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...COLORS.primary);
  doc.text('KitchenCommand.IO', PAGE.width / 2, y, { align: 'center' });

  y += 12;
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...COLORS.dark);
  doc.text('Professional Kitchen Management', PAGE.width / 2, y, { align: 'center' });

  y += 25;
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.primary);
  doc.text('www.KitchenCommand.IO', PAGE.width / 2, y, { align: 'center' });

  y += 35;
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.gray);
  doc.text('Built with care for culinary professionals', PAGE.width / 2, y, { align: 'center' });

  // ---- Add Page Numbers ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }

  return doc;
}

// ---- User Guide Helper Functions ----

function addGuideHeader(doc, title) {
  let y = PAGE.marginTop;

  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, PAGE.width, 25, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...COLORS.white);
  doc.text(title, PAGE.marginLeft, 16);

  return y + 20;
}

function addGuideSubsection(doc, title, y) {
  y = checkPageBreak(doc, y, 15);
  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.secondary);
  doc.text(title, PAGE.marginLeft, y);
  return y + 7;
}

function addGuideParagraph(doc, text, y) {
  y = checkPageBreak(doc, y, 15);
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  doc.text(lines, PAGE.marginLeft, y);
  return y + lines.length * 4 + 3;
}

function addGuideSteps(doc, steps, y) {
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);

  steps.forEach((step, index) => {
    y = checkPageBreak(doc, y, 8);
    doc.setTextColor(...COLORS.primary);
    doc.text(`${index + 1}.`, PAGE.marginLeft + 3, y);
    doc.setTextColor(...COLORS.dark);
    // Wrap long steps
    const stepLines = doc.splitTextToSize(step, CONTENT_WIDTH - 15);
    doc.text(stepLines, PAGE.marginLeft + 12, y);
    y += stepLines.length * 4 + 1;
  });

  return y + 2;
}

function addGuideBullets(doc, items, y) {
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);

  items.forEach(item => {
    y = checkPageBreak(doc, y, 8);
    doc.text('•', PAGE.marginLeft + 3, y);
    const itemLines = doc.splitTextToSize(item, CONTENT_WIDTH - 12);
    doc.text(itemLines, PAGE.marginLeft + 10, y);
    y += itemLines.length * 4 + 1;
  });

  return y + 2;
}

/**
 * Add table with custom column widths for better rendering
 */
function addGuideTableWide(doc, rows, y, colWidths) {
  if (rows.length === 0) return y;

  const tableX = PAGE.marginLeft;
  const cellPadding = 2;
  const lineHeight = 4;
  const minRowHeight = 8;

  // Calculate row heights based on wrapped text
  function getRowHeight(row, isHeader) {
    doc.setFontSize(9);
    doc.setFont(isHeader ? FONTS.bold : FONTS.normal, isHeader ? 'bold' : 'normal');

    let maxLines = 1;
    row.forEach((cell, i) => {
      const colWidth = colWidths[i] - (cellPadding * 2);
      const wrapped = doc.splitTextToSize(String(cell), colWidth);
      maxLines = Math.max(maxLines, wrapped.length);
    });
    return Math.max(minRowHeight, maxLines * lineHeight + cellPadding * 2);
  }

  // Draw header row
  const headerHeight = getRowHeight(rows[0], true);
  y = checkPageBreak(doc, y, headerHeight + 10);

  doc.setFillColor(...COLORS.tableHeader);
  doc.rect(tableX, y, CONTENT_WIDTH, headerHeight, 'F');

  // Draw header borders
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.rect(tableX, y, CONTENT_WIDTH, headerHeight, 'S');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.white);

  let xPos = tableX;
  rows[0].forEach((cell, i) => {
    const colWidth = colWidths[i];
    const wrapped = doc.splitTextToSize(String(cell), colWidth - cellPadding * 2);
    wrapped.forEach((line, lineIdx) => {
      doc.text(line, xPos + cellPadding, y + cellPadding + 3 + (lineIdx * lineHeight));
    });
    // Draw vertical line
    if (i < rows[0].length - 1) {
      doc.setDrawColor(255, 255, 255);
      doc.line(xPos + colWidth, y + 1, xPos + colWidth, y + headerHeight - 1);
    }
    xPos += colWidth;
  });

  y += headerHeight;

  // Draw data rows
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);

  rows.slice(1).forEach((row, rowIndex) => {
    const rowHeight = getRowHeight(row, false);
    y = checkPageBreak(doc, y, rowHeight);

    // Alternating row background
    if (rowIndex % 2 === 0) {
      doc.setFillColor(...COLORS.tableStripe);
      doc.rect(tableX, y, CONTENT_WIDTH, rowHeight, 'F');
    }

    // Row border
    doc.setDrawColor(220, 220, 220);
    doc.rect(tableX, y, CONTENT_WIDTH, rowHeight, 'S');

    xPos = tableX;
    row.forEach((cell, i) => {
      const colWidth = colWidths[i];
      const wrapped = doc.splitTextToSize(String(cell), colWidth - cellPadding * 2);
      wrapped.forEach((line, lineIdx) => {
        doc.text(line, xPos + cellPadding, y + cellPadding + 3 + (lineIdx * lineHeight));
      });
      // Draw vertical cell border
      if (i < row.length - 1) {
        doc.setDrawColor(220, 220, 220);
        doc.line(xPos + colWidth, y, xPos + colWidth, y + rowHeight);
      }
      xPos += colWidth;
    });
    y += rowHeight;
  });

  return y + 5;
}

// Legacy table function for backwards compatibility
function addGuideTable(doc, rows, y) {
  const colCount = rows[0]?.length || 2;
  const defaultWidths = Array(colCount).fill(CONTENT_WIDTH / colCount);
  return addGuideTableWide(doc, rows, y, defaultWidths);
}

function addGuideCodeBlock(doc, code, y) {
  y = checkPageBreak(doc, y, 12);

  doc.setFillColor(245, 245, 245);
  doc.roundedRect(PAGE.marginLeft, y - 3, CONTENT_WIDTH, 10, 1, 1, 'F');

  doc.setFont('courier', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.text(code, PAGE.marginLeft + 3, y + 3);

  doc.setFont(FONTS.normal, 'normal');
  return y + 12;
}

function addGuideTip(doc, text, y) {
  y = checkPageBreak(doc, y, 18);

  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 22);
  const boxHeight = Math.max(12, lines.length * 4 + 6);

  doc.setFillColor(232, 245, 233);
  doc.roundedRect(PAGE.marginLeft, y - 3, CONTENT_WIDTH, boxHeight, 2, 2, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.success);
  doc.text('TIP:', PAGE.marginLeft + 3, y + 3);

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.text(lines, PAGE.marginLeft + 18, y + 3);

  return y + boxHeight + 3;
}

function addGuideWarning(doc, text, y) {
  y = checkPageBreak(doc, y, 18);

  const lines = doc.splitTextToSize(text, CONTENT_WIDTH - 30);
  const boxHeight = Math.max(12, lines.length * 4 + 6);

  doc.setFillColor(255, 243, 224);
  doc.roundedRect(PAGE.marginLeft, y - 3, CONTENT_WIDTH, boxHeight, 2, 2, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.warning);
  doc.text('NOTE:', PAGE.marginLeft + 3, y + 3);

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.dark);
  doc.text(lines, PAGE.marginLeft + 22, y + 3);

  return y + boxHeight + 3;
}

// ============================================
// Security Overview PDF
// ============================================

/**
 * Generate Security Overview PDF for users
 * Explains actual security implementations in user-friendly language
 */
export function generateSecurityOverviewPDF() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = PAGE.marginTop;

  // ---- Cover Page ----
  doc.setFillColor(39, 174, 96); // Green for security
  doc.rect(0, 0, PAGE.width, 80, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);
  doc.text('KitchenCommand.IO', PAGE.width / 2, 35, { align: 'center' });

  doc.setFontSize(16);
  doc.text('Security Overview', PAGE.width / 2, 50, { align: 'center' });

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(10);
  doc.text('How We Protect Your Data', PAGE.width / 2, 62, { align: 'center' });

  doc.setFontSize(12);
  doc.setTextColor(...COLORS.dark);
  doc.text('Enterprise-Grade Security for Your Business', PAGE.width / 2, 100, { align: 'center' });

  doc.setFontSize(10);
  doc.setTextColor(...COLORS.gray);
  doc.text(formatDate(new Date()), PAGE.width / 2, 120, { align: 'center' });

  // Summary Box
  y = 140;
  doc.setFillColor(236, 253, 245); // Light green
  doc.rect(PAGE.marginLeft, y, CONTENT_WIDTH, 40, 'F');
  doc.setDrawColor(39, 174, 96);
  doc.setLineWidth(0.5);
  doc.rect(PAGE.marginLeft, y, CONTENT_WIDTH, 40, 'S');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(39, 174, 96);
  doc.text('YOUR DATA IS PROTECTED BY:', PAGE.marginLeft + 5, y + 8);

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.dark);
  const summaryPoints = [
    'Google Firebase Infrastructure (Same security as Gmail)',
    'Bank-Level Encryption (TLS 1.3 + AES-256)',
    'SOC 2 & ISO 27001 Certified Systems',
    'Quebec Law 25 Compliant Privacy Practices',
  ];
  summaryPoints.forEach((point, i) => {
    doc.text(`• ${point}`, PAGE.marginLeft + 5, y + 18 + (i * 5));
  });

  // ---- Section 1: Overview ----
  doc.addPage();
  y = addGuideHeader(doc, '1. Security at a Glance');

  y = addGuideParagraph(doc, 'KitchenCommand.IO protects your sensitive restaurant data through multiple layers of enterprise-grade security. Here is the current status of our security implementations:', y);

  y = addGuideTableWide(doc, [
    ['Security Area', 'Status', 'Details'],
    ['Authentication', 'Secure', 'Firebase Auth with bcrypt password hashing'],
    ['Data in Transit', 'Encrypted', 'TLS 1.3 encryption (bank-level)'],
    ['Data at Rest', 'Encrypted', 'Google Cloud AES-256 encryption'],
    ['API Protection', 'Secured', 'Token-based authentication required'],
    ['Access Control', 'Enforced', 'Role-based (Owner, Manager, Staff)'],
    ['Legal Compliance', 'Active', 'Privacy Policy & Terms of Service deployed'],
  ], y, [45, 30, 105]);

  // ---- Section 2: What We Protect ----
  y += 10;
  y = addGuideSubsection(doc, '2. What Data We Protect', y);

  y = addGuideTableWide(doc, [
    ['Data Type', 'Sensitivity', 'Protection'],
    ['Passwords', 'Critical', 'Hashed with bcrypt (irreversible)'],
    ['Business Financials', 'High', 'Encrypted at rest and in transit'],
    ['Vendor Information', 'High', 'Encrypted at rest and in transit'],
    ['Inventory Data', 'Medium', 'Encrypted at rest and in transit'],
    ['Recipes', 'Medium', 'Encrypted at rest and in transit'],
  ], y, [50, 35, 95]);

  y += 3;
  y = addGuideTip(doc, 'We NEVER store passwords in readable form. Even if someone accessed the database, they could not see passwords.', y);

  // ---- Section 3: 5 Layers of Protection ----
  doc.addPage();
  y = addGuideHeader(doc, '3. Five Layers of Protection');

  // Layer 1
  y = addGuideSubsection(doc, 'Layer 1: User Authentication', y);
  y = addGuideBullets(doc, [
    'Firebase Authentication (powered by Google)',
    'Email/password with strength requirements',
    'PIN-based access control for staff members',
    'Session management with automatic timeout',
  ], y);

  // Layer 2
  y += 3;
  y = addGuideSubsection(doc, 'Layer 2: Network Security', y);
  y = addGuideBullets(doc, [
    'HTTPS only - All data encrypted in transit',
    'TLS 1.3 - Latest encryption (same as banks use)',
    'HSTS - Forces secure connections',
    'No unencrypted HTTP connections allowed',
  ], y);

  // Layer 3
  y += 3;
  y = addGuideSubsection(doc, 'Layer 3: Cloud Infrastructure', y);
  y = addGuideBullets(doc, [
    'Google Firebase - SOC 2 & ISO 27001 certified',
    'Data centers with 24/7 physical security',
    'Automatic encrypted backups',
    'Built-in DDoS protection',
  ], y);

  // Layer 4
  y += 3;
  y = addGuideSubsection(doc, 'Layer 4: API Security', y);
  y = addGuideBullets(doc, [
    'Claude AI Proxy - Authenticated access only',
    'Firebase ID token verification on every request',
    'Unauthorized requests rejected automatically',
    'No direct API key exposure to browsers',
  ], y);

  // Layer 5
  y += 3;
  y = addGuideSubsection(doc, 'Layer 5: Application Security', y);
  y = addGuideBullets(doc, [
    'Role-based access (Owner, Manager, Staff)',
    'Department-level data isolation',
    'Audit logging for sensitive operations',
    'Each business only sees their own data',
  ], y);

  // ---- Section 4: Encryption Details ----
  doc.addPage();
  y = addGuideHeader(doc, '4. Encryption Details');

  y = addGuideSubsection(doc, '4.1 Password Protection', y);
  y = addGuideCodeBlock(doc, 'Method: bcrypt (industry standard)\nResult: One-way hash - cannot be reversed\nEven we cannot see your passwords', y);

  y += 5;
  y = addGuideSubsection(doc, '4.2 Data in Transit (Internet)', y);
  y = addGuideCodeBlock(doc, 'Protocol: TLS 1.3\nCipher: AES-256-GCM\nStatus: All connections encrypted\nSame encryption level as online banking', y);

  y += 5;
  y = addGuideSubsection(doc, '4.3 Data at Rest (Storage)', y);
  y = addGuideCodeBlock(doc, 'Cloud (Firestore): AES-256 encryption by Google\nLocal (IndexedDB): Browser-managed storage\nBackups: Encrypted by Google Cloud', y);

  // ---- Section 5: Access Control ----
  y += 10;
  y = addGuideSubsection(doc, '5. Who Can Access What', y);

  y = addGuideTableWide(doc, [
    ['Role', 'Recipes', 'Inventory', 'Invoices', 'Settings', 'Users'],
    ['Owner', 'Full', 'Full', 'Full', 'Full', 'Full'],
    ['Manager', 'Full', 'Full', 'Full', 'Limited', 'View'],
    ['Staff', 'View', 'Department', 'None', 'None', 'None'],
  ], y, [30, 30, 30, 30, 30, 30]);

  // ---- Section 6: Third-Party Certifications ----
  doc.addPage();
  y = addGuideHeader(doc, '6. Third-Party Security Certifications');

  y = addGuideParagraph(doc, 'We rely on enterprise providers with proven security records:', y);

  y = addGuideTableWide(doc, [
    ['Provider', 'Service', 'Certifications'],
    ['Google Firebase', 'Auth, Database, Hosting', 'SOC 2, ISO 27001, ISO 27017, GDPR'],
    ['Anthropic', 'Claude AI (Invoice Parsing)', 'SOC 2 Type II'],
  ], y, [45, 55, 80]);

  y += 5;
  y = addGuideParagraph(doc, 'What these certifications mean:', y);
  y = addGuideBullets(doc, [
    'Independent auditors verify their security annually',
    'They meet standards required by banks and healthcare',
    'They have dedicated security teams monitoring 24/7',
    'Google has never had a major Firebase breach',
  ], y);

  // ---- Section 7: AI & Invoice Security ----
  y += 10;
  y = addGuideSubsection(doc, '7. AI & Invoice Security', y);

  y = addGuideParagraph(doc, 'When you upload an invoice for AI parsing:', y);
  y = addGuideSteps(doc, [
    'Invoice is sent encrypted to Claude AI (Anthropic)',
    'Claude extracts the text and returns structured data',
    'The image is NOT stored on their servers after processing',
    'Anthropic does NOT train their AI on your data',
    'All communication uses TLS 1.3 encryption',
  ], y);

  y += 3;
  y = addGuideTip(doc, 'Your invoice images only exist temporarily during processing. They are not stored permanently by the AI service.', y);

  // ---- Section 8: Common Questions ----
  doc.addPage();
  y = addGuideHeader(doc, '8. Common Security Questions');

  const qaItems = [
    {
      q: 'Can employees see each other\'s passwords?',
      a: 'No. Passwords are hashed with bcrypt. Nobody can see them, including us.',
    },
    {
      q: 'Is my data encrypted?',
      a: 'Yes. Both in transit (TLS 1.3) and at rest (AES-256) - same as banks.',
    },
    {
      q: 'What if someone steals a password?',
      a: 'Passwords are hashed (unusable). Users can reset via email. Owners can revoke access instantly.',
    },
    {
      q: 'Can the AI (Claude) see my data?',
      a: 'Claude processes invoices but doesn\'t store them. Anthropic is SOC 2 certified and doesn\'t train on customer data.',
    },
    {
      q: 'Do you sell my data?',
      a: 'Absolutely not. We will never sell, rent, or share your business data with third parties.',
    },
    {
      q: 'What if an employee leaves?',
      a: 'Owner can disable their PIN immediately. Access is revoked within seconds.',
    },
    {
      q: 'What if your company shuts down?',
      a: 'Your data belongs to you. Export all data anytime. The app works offline too.',
    },
  ];

  qaItems.forEach((item) => {
    y = checkPageBreak(doc, y, 20);

    doc.setFont(FONTS.bold, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.primary);
    doc.text(`Q: ${item.q}`, PAGE.marginLeft, y);
    y += 5;

    doc.setFont(FONTS.normal, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);
    const answerLines = doc.splitTextToSize(`A: ${item.a}`, CONTENT_WIDTH);
    doc.text(answerLines, PAGE.marginLeft, y);
    y += answerLines.length * 4 + 5;
  });

  // ---- Section 9: Legal Compliance ----
  doc.addPage();
  y = addGuideHeader(doc, '9. Legal Compliance');

  y = addGuideSubsection(doc, '9.1 Quebec Law 25 (Privacy Law)', y);
  y = addGuideTableWide(doc, [
    ['Requirement', 'Status'],
    ['Privacy Policy published', 'Complete'],
    ['User consent at registration', 'Complete'],
    ['Data stored in identifiable systems', 'Complete (Firebase)'],
    ['Breach notification process', 'Documented'],
    ['Privacy Officer designation', 'Mage Royer'],
  ], y, [100, 80]);

  y += 5;
  y = addGuideSubsection(doc, '9.2 PIPEDA (Federal Canada)', y);
  y = addGuideTableWide(doc, [
    ['Principle', 'Status'],
    ['Accountability', 'Owner responsible for data'],
    ['Consent', 'Explicit consent at signup'],
    ['Limited Collection', 'Only business data collected'],
    ['Safeguards', 'Encryption + authentication'],
    ['Openness', 'Privacy policy published'],
  ], y, [80, 100]);

  // ---- Final Page: Summary ----
  doc.addPage();
  y = addGuideHeader(doc, '10. Summary');

  y = addGuideParagraph(doc, 'KitchenCommand.IO uses enterprise-grade security to protect your business:', y);

  y = addGuideBullets(doc, [
    'Google Firebase - Same infrastructure as Gmail and YouTube',
    'Bank-level encryption - TLS 1.3 + AES-256',
    'Secure authentication - bcrypt hashing, token verification',
    'Legal compliance - Privacy Policy, Terms of Service, consent',
    'Access control - Role-based, department-level isolation',
    'Data ownership - Your data belongs to you, export anytime',
  ], y);

  y += 10;

  // Final reassurance box
  doc.setFillColor(236, 253, 245);
  doc.rect(PAGE.marginLeft, y, CONTENT_WIDTH, 25, 'F');
  doc.setDrawColor(39, 174, 96);
  doc.setLineWidth(0.5);
  doc.rect(PAGE.marginLeft, y, CONTENT_WIDTH, 25, 'S');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(39, 174, 96);
  const finalMsg = 'Your data is protected by the same security standards used by major tech companies and financial institutions.';
  const finalLines = doc.splitTextToSize(finalMsg, CONTENT_WIDTH - 10);
  doc.text(finalLines, PAGE.width / 2, y + 10, { align: 'center' });

  // Footer
  y += 35;
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text('For questions about security, contact: mageroyer@hotmail.com', PAGE.width / 2, y, { align: 'center' });
  doc.text('KitchenCommand.IO - Professional Kitchen Management', PAGE.width / 2, y + 5, { align: 'center' });

  return doc;
}

// ============================================
// Terms of Service PDF
// ============================================

/**
 * Generate Terms of Service PDF
 */
export function generateTermsOfServicePDF() {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  let y = PAGE.marginTop;

  // ---- Cover Page ----
  doc.setFillColor(...COLORS.secondary);
  doc.rect(0, 0, PAGE.width, 70, 'F');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(28);
  doc.setTextColor(...COLORS.white);
  doc.text('KitchenCommand.IO', PAGE.width / 2, 30, { align: 'center' });

  doc.setFontSize(18);
  doc.text('Terms of Service', PAGE.width / 2, 48, { align: 'center' });

  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  doc.text('Last Updated: January 2026', PAGE.width / 2, 85, { align: 'center' });

  // Helper to add legal section
  const addLegalSection = (title, content, startY) => {
    let currentY = startY;
    currentY = checkPageBreak(doc, currentY, 20);

    doc.setFont(FONTS.bold, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.primary);
    doc.text(title, PAGE.marginLeft, currentY);
    currentY += 6;

    doc.setFont(FONTS.normal, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.dark);

    if (Array.isArray(content)) {
      content.forEach(item => {
        currentY = checkPageBreak(doc, currentY, 8);
        if (typeof item === 'string') {
          const lines = doc.splitTextToSize(item, CONTENT_WIDTH);
          doc.text(lines, PAGE.marginLeft, currentY);
          currentY += lines.length * 4 + 2;
        } else if (item.subtitle) {
          doc.setFont(FONTS.bold, 'bold');
          doc.setFontSize(9);
          doc.text(item.subtitle, PAGE.marginLeft, currentY);
          currentY += 5;
          doc.setFont(FONTS.normal, 'normal');
          const lines = doc.splitTextToSize(item.text, CONTENT_WIDTH);
          doc.text(lines, PAGE.marginLeft, currentY);
          currentY += lines.length * 4 + 2;
        } else if (item.bullets) {
          item.bullets.forEach(bullet => {
            currentY = checkPageBreak(doc, currentY, 5);
            const bulletLines = doc.splitTextToSize(`• ${bullet}`, CONTENT_WIDTH - 5);
            doc.text(bulletLines, PAGE.marginLeft + 3, currentY);
            currentY += bulletLines.length * 4;
          });
          currentY += 2;
        }
      });
    }

    return currentY + 3;
  };

  // Start content
  y = 100;

  // Section 1
  y = addLegalSection('1. Agreement to Terms', [
    'By accessing or using KitchenCommand.IO ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these terms, you may not access the Service.',
    'These Terms constitute a legally binding agreement between you and KitchenCommand.IO ("we", "us", "our") governing your use of our restaurant inventory management application.',
  ], y);

  // Section 2
  y = addLegalSection('2. Description of Service', [
    'KitchenCommand.IO provides:',
    { bullets: [
      'Restaurant inventory management tools',
      'Recipe costing and management',
      'AI-powered invoice parsing',
      'Vendor management',
      'Purchase order generation',
      'Optional cloud synchronization',
      'Optional QuickBooks integration',
    ]},
    'The Service is provided "as is" and we reserve the right to modify, suspend, or discontinue any feature at any time.',
  ], y);

  // Section 3
  doc.addPage();
  y = PAGE.marginTop;
  y = addLegalSection('3. User Accounts', [
    { subtitle: '3.1 Account Creation', text: 'To use certain features, you must create an account. You agree to provide accurate, current, and complete information, maintain the security of your password, accept responsibility for all activities under your account, and notify us immediately of any unauthorized use.' },
    { subtitle: '3.2 Account Requirements', text: 'You must be at least 18 years old to create an account. By creating an account, you represent that you are at least 18 years of age.' },
    { subtitle: '3.3 Account Termination', text: 'We may suspend or terminate your account if you violate these Terms or engage in any conduct that we determine is harmful to the Service or other users. You may delete your account at any time through the Settings page.' },
  ], y);

  // Section 4
  y = addLegalSection('4. Acceptable Use', [
    'You agree NOT to:',
    { bullets: [
      'Use the Service for any illegal purpose',
      'Attempt to gain unauthorized access to the Service or its systems',
      'Interfere with or disrupt the Service or servers',
      'Upload malicious content, viruses, or harmful code',
      'Scrape, crawl, or use automated tools to access the Service',
      'Impersonate another person or entity',
      'Resell or redistribute the Service without authorization',
      'Circumvent any security features or access controls',
      'Use the AI features to process data you don\'t have rights to',
    ]},
  ], y);

  // Section 5
  doc.addPage();
  y = PAGE.marginTop;
  y = addLegalSection('5. Your Data and Content', [
    { subtitle: '5.1 Ownership', text: 'You retain all ownership rights to the data and content you input into KitchenCommand.IO ("Your Content"). This includes recipes, inventory data, vendor information, and uploaded invoices.' },
    { subtitle: '5.2 License to Us', text: 'By using the Service, you grant us a limited license to process, store, and transmit Your Content solely for the purpose of providing the Service to you. We do not claim ownership of Your Content.' },
    { subtitle: '5.3 Your Responsibilities', text: 'You are responsible for ensuring you have the right to upload any content, maintaining backups of your important data, the accuracy of the information you input, and compliance with applicable laws regarding your business data.' },
    { subtitle: '5.4 Data Export', text: 'You may export your data at any time through the Settings page. We provide data in standard formats (JSON, CSV) to ensure portability.' },
  ], y);

  // Section 6
  y = addLegalSection('6. AI-Powered Features', [
    { subtitle: '6.1 Invoice Parsing', text: 'KitchenCommand.IO uses artificial intelligence (Claude by Anthropic) to parse invoice documents. AI parsing may contain errors and requires human verification. You are responsible for reviewing and correcting parsed data. Invoice images are processed but not permanently stored. Parsed data is not used to train AI models.' },
    { subtitle: '6.2 No Guarantee of Accuracy', text: 'AI-generated results are provided for convenience and should not be relied upon for critical business decisions without verification. We do not guarantee the accuracy of any AI-processed data.' },
  ], y);

  // Section 7
  doc.addPage();
  y = PAGE.marginTop;
  y = addLegalSection('7. Fees and Payment', [
    { subtitle: '7.1 Current Pricing', text: 'KitchenCommand.IO is currently offered free of charge during the beta period. We reserve the right to introduce paid features or subscription plans in the future.' },
    { subtitle: '7.2 Future Changes', text: 'If we introduce paid features, we will provide at least 30 days notice. Free features at the time of your registration will remain available, but new features may require payment.' },
  ], y);

  // Section 8
  y = addLegalSection('8. Third-Party Services', [
    'KitchenCommand.IO integrates with third-party services including:',
    { bullets: [
      'Google Firebase: Authentication and data storage',
      'Anthropic Claude: AI invoice processing',
      'Intuit QuickBooks: Accounting integration (optional)',
    ]},
    'Your use of these integrations is subject to their respective terms of service. We are not responsible for the availability, accuracy, or policies of third-party services.',
  ], y);

  // Section 9
  y = addLegalSection('9. Intellectual Property', [
    { subtitle: '9.1 Our Rights', text: 'KitchenCommand.IO and its original content, features, and functionality are owned by us and are protected by copyright, trademark, and other intellectual property laws.' },
    { subtitle: '9.2 Limited License', text: 'We grant you a limited, non-exclusive, non-transferable license to use the Service for your internal business purposes, subject to these Terms.' },
  ], y);

  // Section 10
  doc.addPage();
  y = PAGE.marginTop;
  y = addLegalSection('10. Disclaimers', [
    { subtitle: '10.1 "As Is" Provision', text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.' },
    { subtitle: '10.2 No Guarantees', text: 'We do not guarantee that the Service will be uninterrupted or error-free, that defects will be corrected, that the Service or servers are free of viruses, or that results from the Service will be accurate or reliable.' },
    { subtitle: '10.3 Business Decisions', text: 'KitchenCommand.IO is a tool to assist with inventory management. You are solely responsible for all business decisions made using information from the Service. We are not liable for any business losses resulting from your use of or reliance on the Service.' },
  ], y);

  // Section 11
  y = addLegalSection('11. Limitation of Liability', [
    'TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL KITCHENCOMMAND.IO, ITS DIRECTORS, EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING WITHOUT LIMITATION:',
    { bullets: [
      'Loss of profits, revenue, or data',
      'Business interruption',
      'Cost of substitute services',
      'Any damages arising from your use of the Service',
    ]},
    'OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM THESE TERMS OR YOUR USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED CANADIAN DOLLARS (CAD $100), WHICHEVER IS GREATER.',
  ], y);

  // Section 12
  doc.addPage();
  y = PAGE.marginTop;
  y = addLegalSection('12. Indemnification', [
    'You agree to indemnify, defend, and hold harmless KitchenCommand.IO and its officers, directors, employees, and agents from and against any claims, liabilities, damages, losses, and expenses (including legal fees) arising out of or in any way connected with your use of the Service, your violation of these Terms, your violation of any rights of another party, or Your Content uploaded to the Service.',
  ], y);

  // Section 13
  y = addLegalSection('13. Governing Law and Disputes', [
    { subtitle: '13.1 Governing Law', text: 'These Terms shall be governed by and construed in accordance with the laws of the Province of Quebec and the federal laws of Canada applicable therein, without regard to conflict of law principles.' },
    { subtitle: '13.2 Jurisdiction', text: 'Any disputes arising from these Terms or your use of the Service shall be resolved exclusively in the courts located in Montreal, Quebec, Canada. You consent to the personal jurisdiction of such courts.' },
    { subtitle: '13.3 Informal Resolution', text: 'Before filing any claim, you agree to first contact us at mageroyer@hotmail.com to attempt to resolve the dispute informally. We will attempt to resolve disputes within 30 days.' },
  ], y);

  // Section 14
  y = addLegalSection('14. Changes to Terms', [
    'We reserve the right to modify these Terms at any time. We will provide notice of material changes by posting the updated Terms on this page, updating the "Last Updated" date, and sending an email notification for significant changes.',
    'Your continued use of the Service after changes become effective constitutes acceptance of the revised Terms. If you do not agree to the new Terms, you must stop using the Service.',
  ], y);

  // Section 15 & 16
  doc.addPage();
  y = PAGE.marginTop;
  y = addLegalSection('15. Severability', [
    'If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.',
  ], y);

  y = addLegalSection('16. Entire Agreement', [
    'These Terms, together with our Privacy Policy, constitute the entire agreement between you and KitchenCommand.IO regarding your use of the Service and supersede all prior agreements and understandings.',
  ], y);

  // Section 17 - Contact
  y = addLegalSection('17. Contact Information', [
    'For questions about these Terms of Service, contact:',
  ], y);

  // Contact box
  doc.setFillColor(...COLORS.light);
  doc.rect(PAGE.marginLeft, y, CONTENT_WIDTH, 25, 'F');
  doc.setDrawColor(...COLORS.gray);
  doc.rect(PAGE.marginLeft, y, CONTENT_WIDTH, 25, 'S');

  doc.setFont(FONTS.bold, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...COLORS.dark);
  doc.text('KitchenCommand.IO', PAGE.marginLeft + 5, y + 7);
  doc.setFont(FONTS.normal, 'normal');
  doc.setFontSize(9);
  doc.text('4640 rue Adam, Montreal, QC H1V 1V3', PAGE.marginLeft + 5, y + 13);
  doc.text('Email: mageroyer@hotmail.com', PAGE.marginLeft + 5, y + 19);

  // Footer
  y += 35;
  doc.setFontSize(8);
  doc.setTextColor(...COLORS.gray);
  doc.text('KitchenCommand.IO - Professional Kitchen Management', PAGE.width / 2, y, { align: 'center' });

  return doc;
}

// ============================================
// Download Helpers
// ============================================

/**
 * Download PDF document
 * @param {jsPDF} doc - PDF document
 * @param {string} filename - Download filename
 */
export function downloadPDF(doc, filename) {
  doc.save(filename);
}

/**
 * Get PDF as Blob
 * @param {jsPDF} doc - PDF document
 * @returns {Blob} PDF blob
 */
export function getPDFBlob(doc) {
  return doc.output('blob');
}

/**
 * Get PDF as data URL
 * @param {jsPDF} doc - PDF document
 * @returns {string} Data URL
 */
export function getPDFDataURL(doc) {
  return doc.output('dataurlstring');
}

/**
 * Open PDF in new tab
 * @param {jsPDF} doc - PDF document
 */
export function openPDFInNewTab(doc) {
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// ============================================
// Export
// ============================================

export default {
  generatePurchaseOrderPDF,
  generateInventoryReportPDF,
  generateLowStockReportPDF,
  generateUserGuidePDF,
  generateSecurityOverviewPDF,
  generateTermsOfServicePDF,
  downloadPDF,
  getPDFBlob,
  getPDFDataURL,
  openPDFInNewTab,
};
