/**
 * Vision Parser Test Page
 *
 * Test page for the new Vision-based invoice parsing pipeline.
 * Upload a PDF and see the raw JSON, normalized data, and DB format.
 *
 * Route: /invoice/vision-test
 */

import React, { useState, useCallback } from 'react';
import { processInvoice } from '../services/invoice/vision';

// Styles
const styles = {
  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '20px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  header: {
    marginBottom: '20px',
    paddingBottom: '10px',
    borderBottom: '2px solid #e0e0e0'
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#333',
    margin: '0 0 5px 0'
  },
  subtitle: {
    fontSize: '14px',
    color: '#666',
    margin: 0
  },
  uploadArea: {
    border: '2px dashed #ccc',
    borderRadius: '8px',
    padding: '40px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s',
    marginBottom: '20px',
    backgroundColor: '#fafafa'
  },
  uploadAreaDragOver: {
    borderColor: '#4CAF50',
    backgroundColor: '#e8f5e9'
  },
  uploadAreaHasFile: {
    borderColor: '#2196F3',
    backgroundColor: '#e3f2fd'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px'
  },
  panel: {
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  panelHeader: {
    backgroundColor: '#f5f5f5',
    padding: '10px 15px',
    borderBottom: '1px solid #e0e0e0',
    fontWeight: 'bold',
    fontSize: '14px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  panelContent: {
    padding: '15px',
    maxHeight: '500px',
    overflow: 'auto'
  },
  jsonPre: {
    margin: 0,
    fontSize: '12px',
    lineHeight: '1.4',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    fontFamily: 'Consolas, Monaco, monospace'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px'
  },
  th: {
    textAlign: 'left',
    padding: '8px',
    backgroundColor: '#f5f5f5',
    borderBottom: '1px solid #e0e0e0',
    fontWeight: '600'
  },
  td: {
    padding: '8px',
    borderBottom: '1px solid #f0f0f0'
  },
  badge: {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 'bold'
  },
  badgeSuccess: {
    backgroundColor: '#e8f5e9',
    color: '#2e7d32'
  },
  badgeWarning: {
    backgroundColor: '#fff3e0',
    color: '#ef6c00'
  },
  badgeError: {
    backgroundColor: '#ffebee',
    color: '#c62828'
  },
  badgeInfo: {
    backgroundColor: '#e3f2fd',
    color: '#1565c0'
  },
  warning: {
    backgroundColor: '#fff3e0',
    border: '1px solid #ffcc80',
    borderRadius: '4px',
    padding: '10px',
    marginBottom: '10px'
  },
  warningTitle: {
    fontWeight: 'bold',
    color: '#ef6c00',
    marginBottom: '5px'
  },
  meta: {
    display: 'flex',
    gap: '20px',
    marginBottom: '20px',
    flexWrap: 'wrap'
  },
  metaItem: {
    backgroundColor: '#f5f5f5',
    padding: '10px 15px',
    borderRadius: '4px'
  },
  metaLabel: {
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase'
  },
  metaValue: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: '#333'
  },
  loading: {
    textAlign: 'center',
    padding: '40px'
  },
  spinner: {
    border: '4px solid #f3f3f3',
    borderTop: '4px solid #3498db',
    borderRadius: '50%',
    width: '40px',
    height: '40px',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 15px'
  },
  error: {
    backgroundColor: '#ffebee',
    border: '1px solid #ef9a9a',
    borderRadius: '4px',
    padding: '15px',
    color: '#c62828',
    marginBottom: '20px'
  },
  tabs: {
    display: 'flex',
    gap: '5px',
    marginBottom: '20px'
  },
  tab: {
    padding: '10px 20px',
    border: '1px solid #e0e0e0',
    borderRadius: '4px 4px 0 0',
    backgroundColor: '#f5f5f5',
    cursor: 'pointer',
    fontSize: '14px'
  },
  tabActive: {
    backgroundColor: '#fff',
    borderBottom: '1px solid #fff',
    fontWeight: 'bold'
  },
  fullWidth: {
    gridColumn: '1 / -1'
  }
};

// Add keyframes for spinner
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
if (!document.head.querySelector('style[data-vision-test]')) {
  spinnerStyle.setAttribute('data-vision-test', 'true');
  document.head.appendChild(spinnerStyle);
}

export default function VisionParserTestPage() {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState('normalized');

  const handleFile = useCallback(async (selectedFile) => {
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }

    setFile(selectedFile);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const processResult = await processInvoice(selectedFile);
      setResult(processResult);
    } catch (err) {
      console.error('Processing error:', err);
      setError(err.message || 'Failed to process invoice');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFile(droppedFile);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleInputChange = useCallback((e) => {
    handleFile(e.target.files[0]);
  }, [handleFile]);

  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Vision Parser Test</h1>
        <p style={styles.subtitle}>
          Test the new Claude Vision-based invoice parsing pipeline
        </p>
      </div>

      {/* Upload Area */}
      <div
        style={{
          ...styles.uploadArea,
          ...(dragOver ? styles.uploadAreaDragOver : {}),
          ...(file ? styles.uploadAreaHasFile : {})
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".pdf"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {file ? (
          <div>
            <div style={{ fontSize: '18px', marginBottom: '5px' }}>{file.name}</div>
            <div style={{ color: '#666' }}>{formatBytes(file.size)}</div>
            <div style={{ marginTop: '10px', color: '#2196F3' }}>Click or drop to replace</div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '18px', marginBottom: '10px' }}>
              Drop invoice PDF here or click to browse
            </div>
            <div style={{ color: '#666' }}>Supports multi-page PDFs</div>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={styles.loading}>
          <div style={styles.spinner}></div>
          <div>Processing invoice with Claude Vision...</div>
          <div style={{ color: '#666', fontSize: '14px', marginTop: '5px' }}>
            This may take a few seconds
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <>
          {/* Meta */}
          <div style={styles.meta}>
            <div style={styles.metaItem}>
              <div style={styles.metaLabel}>Pages</div>
              <div style={styles.metaValue}>{result.meta.pageCount}</div>
            </div>
            <div style={styles.metaItem}>
              <div style={styles.metaLabel}>Parse Time</div>
              <div style={styles.metaValue}>{(result.meta.parseTimeMs / 1000).toFixed(2)}s</div>
            </div>
            <div style={styles.metaItem}>
              <div style={styles.metaLabel}>Line Items</div>
              <div style={styles.metaValue}>{result.lineItems.length}</div>
            </div>
            <div style={styles.metaItem}>
              <div style={styles.metaLabel}>Vendor Match</div>
              <div style={styles.metaValue}>
                {result.vendor ? (
                  <span style={{...styles.badge, ...styles.badgeSuccess}}>Matched</span>
                ) : (
                  <span style={{...styles.badge, ...styles.badgeWarning}}>Not Found</span>
                )}
              </div>
            </div>
            <div style={styles.metaItem}>
              <div style={styles.metaLabel}>Warnings</div>
              <div style={styles.metaValue}>
                {result.warnings.length === 0 ? (
                  <span style={{...styles.badge, ...styles.badgeSuccess}}>None</span>
                ) : (
                  <span style={{...styles.badge, ...styles.badgeWarning}}>{result.warnings.length}</span>
                )}
              </div>
            </div>
          </div>

          {/* Warnings */}
          {result.warnings.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              {result.warnings.map((w, i) => (
                <div key={i} style={styles.warning}>
                  <div style={styles.warningTitle}>{w.type}</div>
                  <div>{w.message}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tabs */}
          <div style={styles.tabs}>
            {['normalized', 'lineItems', 'rawJson', 'dbFormat'].map(tab => (
              <div
                key={tab}
                style={{
                  ...styles.tab,
                  ...(activeTab === tab ? styles.tabActive : {})
                }}
                onClick={() => setActiveTab(tab)}
              >
                {tab === 'normalized' && 'Invoice Header'}
                {tab === 'lineItems' && `Line Items (${result.lineItems.length})`}
                {tab === 'rawJson' && 'Raw Vision JSON'}
                {tab === 'dbFormat' && 'DB Format'}
              </div>
            ))}
          </div>

          {/* Tab Content */}
          <div style={styles.grid}>
            {activeTab === 'normalized' && (
              <>
                {/* Invoice Header */}
                <div style={styles.panel}>
                  <div style={styles.panelHeader}>Invoice Details</div>
                  <div style={styles.panelContent}>
                    <table style={styles.table}>
                      <tbody>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold', width: '40%'}}>Invoice #</td>
                          <td style={styles.td}>{result.invoice.invoiceNumber || '-'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>Date</td>
                          <td style={styles.td}>{result.invoice.date || '-'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>Payment Terms</td>
                          <td style={styles.td}>{result.invoice.paymentTerms || '-'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>PO Number</td>
                          <td style={styles.td}>{result.invoice.poNumber || '-'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>Subtotal</td>
                          <td style={styles.td}>${result.invoice.subtotal?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>TPS (GST)</td>
                          <td style={styles.td}>${result.invoice.taxTPS?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>TVQ (QST)</td>
                          <td style={styles.td}>${result.invoice.taxTVQ?.toFixed(2) || '0.00'}</td>
                        </tr>
                        <tr>
                          <td style={{...styles.td, fontWeight: 'bold'}}>Total</td>
                          <td style={{...styles.td, fontWeight: 'bold', fontSize: '16px'}}>
                            ${result.invoice.total?.toFixed(2) || '0.00'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Vendor & Customer */}
                <div style={styles.panel}>
                  <div style={styles.panelHeader}>
                    Vendor & Customer
                    {result.vendor && (
                      <span style={{...styles.badge, ...styles.badgeSuccess}}>
                        DB Match: {result.vendor.name}
                      </span>
                    )}
                  </div>
                  <div style={styles.panelContent}>
                    <div style={{ marginBottom: '15px' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#1565c0' }}>
                        Vendor
                      </div>
                      <div>{result.invoice.vendorName || '-'}</div>
                      <div style={{ color: '#666', fontSize: '13px' }}>
                        {result.invoice.vendorAddress || '-'}
                      </div>
                      <div style={{ color: '#666', fontSize: '13px' }}>
                        {result.invoice.vendorPhone || '-'}
                      </div>
                      {result.invoice.vendorTaxTPS && (
                        <div style={{ fontSize: '12px', marginTop: '5px' }}>
                          TPS: {result.invoice.vendorTaxTPS}
                        </div>
                      )}
                      {result.invoice.vendorTaxTVQ && (
                        <div style={{ fontSize: '12px' }}>
                          TVQ: {result.invoice.vendorTaxTVQ}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', color: '#2e7d32' }}>
                        Customer
                      </div>
                      <div>{result.invoice.customerName || '-'}</div>
                      <div style={{ color: '#666', fontSize: '13px' }}>
                        {result.invoice.customerAddress || '-'}
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'lineItems' && (
              <div style={{...styles.panel, ...styles.fullWidth}}>
                <div style={styles.panelHeader}>
                  Line Items ({result.lineItems.length})
                </div>
                <div style={{...styles.panelContent, maxHeight: '600px'}}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>#</th>
                        <th style={styles.th}>SKU</th>
                        <th style={styles.th}>Description</th>
                        <th style={styles.th}>Qty</th>
                        <th style={styles.th}>Unit</th>
                        <th style={styles.th}>Unit Price</th>
                        <th style={styles.th}>Total</th>
                        <th style={styles.th}>Format</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.lineItems.map((item, i) => (
                        <tr key={i}>
                          <td style={styles.td}>{item.lineNumber}</td>
                          <td style={styles.td}>
                            <code style={{ fontSize: '11px', backgroundColor: '#f5f5f5', padding: '2px 4px' }}>
                              {item.sku || '-'}
                            </code>
                          </td>
                          <td style={styles.td}>{item.description}</td>
                          <td style={styles.td}>
                            {item.quantity}
                            {item.quantityOrdered && item.quantityOrdered !== item.quantity && (
                              <div style={{ fontSize: '11px', color: '#666' }}>
                                (ord: {item.quantityOrdered})
                              </div>
                            )}
                          </td>
                          <td style={styles.td}>{item.unit || '-'}</td>
                          <td style={styles.td}>${item.unitPrice?.toFixed(2)}</td>
                          <td style={styles.td}>${item.totalPrice?.toFixed(2)}</td>
                          <td style={styles.td}>
                            {item.format && (
                              <span style={{...styles.badge, ...styles.badgeInfo}}>
                                {item.format}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="6" style={{...styles.td, textAlign: 'right', fontWeight: 'bold'}}>
                          Calculated Total:
                        </td>
                        <td style={{...styles.td, fontWeight: 'bold'}}>
                          ${result.lineItems.reduce((sum, i) => sum + i.totalPrice, 0).toFixed(2)}
                        </td>
                        <td style={styles.td}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {activeTab === 'rawJson' && (
              <div style={{...styles.panel, ...styles.fullWidth}}>
                <div style={styles.panelHeader}>
                  Raw Vision API Response
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(result.rawJson, null, 2))}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div style={{...styles.panelContent, maxHeight: '600px'}}>
                  <pre style={styles.jsonPre}>
                    {JSON.stringify(result.rawJson, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {activeTab === 'dbFormat' && (
              <div style={{...styles.panel, ...styles.fullWidth}}>
                <div style={styles.panelHeader}>
                  Database Format (ready for invoiceDB.create())
                  <button
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(result.dbFormat, null, 2))}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    Copy
                  </button>
                </div>
                <div style={{...styles.panelContent, maxHeight: '600px'}}>
                  <pre style={styles.jsonPre}>
                    {JSON.stringify(result.dbFormat, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
