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
  downloadPDF,
  getPDFBlob,
  getPDFDataURL,
  openPDFInNewTab,
};
