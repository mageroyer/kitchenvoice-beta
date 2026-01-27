/**
 * Field Variation Maintenance Page
 *
 * DEV tool to analyze Vision API field name variations.
 * Upload test invoices, run multiple parses, discover new field aliases.
 *
 * Access: /dev/field-variations (dev mode only)
 */

import { useState, useCallback } from 'react';
import { runFieldVariationAnalysis, KNOWN_ALIASES } from '../services/invoice/vision/fieldVariationService';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import styles from '../styles/pages/fieldvariationpage.module.css';

function FieldVariationPage() {
  const [files, setFiles] = useState([]);
  const [runsPerFile, setRunsPerFile] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = useCallback((e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
    setReport(null);
    setError(null);
  }, []);

  const handleRunAnalysis = useCallback(async () => {
    if (files.length === 0) {
      setError('Please select at least one invoice file');
      return;
    }

    setIsRunning(true);
    setError(null);
    setReport(null);

    try {
      const result = await runFieldVariationAnalysis(files, runsPerFile, setProgress);
      setReport(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  }, [files, runsPerFile]);

  const handleCopySnippet = useCallback(() => {
    if (report?.codeSnippet) {
      navigator.clipboard.writeText(report.codeSnippet);
    }
  }, [report]);

  return (
    <div className={styles.container}>
      <h1>Field Variation Analysis</h1>
      <p className={styles.subtitle}>
        Maintenance tool to discover Vision API field name variations.
        Run test invoices multiple times to find new aliases needed in jsonNormalizer.js
      </p>

      {/* File Selection */}
      <Card title="1. Select Test Invoices" className={styles.card}>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          multiple
          onChange={handleFileSelect}
          className={styles.fileInput}
        />
        {files.length > 0 && (
          <div className={styles.fileList}>
            <strong>Selected files:</strong>
            <ul>
              {files.map((f, i) => (
                <li key={i}>{f.name} ({(f.size / 1024).toFixed(1)} KB)</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Configuration */}
      <Card title="2. Configure Analysis" className={styles.card}>
        <div className={styles.config}>
          <label>
            Runs per file:
            <input
              type="number"
              min="1"
              max="20"
              value={runsPerFile}
              onChange={(e) => setRunsPerFile(parseInt(e.target.value) || 5)}
              className={styles.numberInput}
            />
          </label>
          <p className={styles.hint}>
            Each file will be parsed {runsPerFile} times to catch variations.
            Total API calls: {files.length * runsPerFile}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleRunAnalysis}
          disabled={isRunning || files.length === 0}
        >
          {isRunning ? 'Running Analysis...' : 'Run Analysis'}
        </Button>
      </Card>

      {/* Progress */}
      {isRunning && progress && (
        <Card title="Progress" className={styles.card}>
          <div className={styles.progress}>
            <p>
              File {progress.file}/{progress.totalFiles}: <strong>{progress.fileName}</strong>
            </p>
            {progress.run && (
              <p>Run {progress.run}/{progress.total} - {progress.status}</p>
            )}
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{
                  width: `${((progress.file - 1) * runsPerFile + (progress.run || 0)) / (files.length * runsPerFile) * 100}%`
                }}
              />
            </div>
          </div>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Card title="Error" className={`${styles.card} ${styles.errorCard}`}>
          <p className={styles.error}>{error}</p>
        </Card>
      )}

      {/* Results */}
      {report && (
        <>
          {/* Summary */}
          <Card title="3. Analysis Summary" className={styles.card}>
            <div className={styles.summary}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{report.summary.totalFiles}</span>
                <span className={styles.statLabel}>Files</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{report.summary.totalRuns}</span>
                <span className={styles.statLabel}>Runs</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{report.summary.uniqueLineItemFields}</span>
                <span className={styles.statLabel}>Unique Fields</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{report.summary.unknownFieldCount}</span>
                <span className={styles.statLabel}>Unknown Fields</span>
              </div>
              <div className={`${styles.stat} ${report.summary.newAliasesNeeded > 0 ? styles.statWarning : styles.statSuccess}`}>
                <span className={styles.statValue}>{report.summary.newAliasesNeeded}</span>
                <span className={styles.statLabel}>New Aliases Needed</span>
              </div>
            </div>
          </Card>

          {/* New Aliases Needed */}
          {report.aliasUpdateSuggestions.length > 0 && (
            <Card title="4. New Aliases Needed" className={`${styles.card} ${styles.warningCard}`}>
              <p>These fields were found but are not in the current alias lists:</p>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Field Name</th>
                    <th>Suggested Category</th>
                    <th>Occurrences</th>
                  </tr>
                </thead>
                <tbody>
                  {report.aliasUpdateSuggestions.map((s, i) => (
                    <tr key={i}>
                      <td><code>{s.field}</code></td>
                      <td>{s.category}</td>
                      <td>{s.occurrences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Code Snippet */}
          {report.codeSnippet && report.aliasUpdateSuggestions.length > 0 && (
            <Card title="5. Code to Add" className={styles.card}>
              <p>Copy this to jsonNormalizer.js:</p>
              <pre className={styles.codeBlock}>{report.codeSnippet}</pre>
              <Button variant="secondary" onClick={handleCopySnippet}>
                Copy to Clipboard
              </Button>
            </Card>
          )}

          {/* All Line Item Fields */}
          <Card title="All Line Item Fields Found" className={styles.card}>
            <div className={styles.fieldList}>
              {report.allLineItemFields.map((field, i) => {
                const isKnown = Object.values(KNOWN_ALIASES).flat().some(
                  a => a.toLowerCase() === field.toLowerCase()
                );
                return (
                  <span
                    key={i}
                    className={`${styles.fieldTag} ${isKnown ? styles.fieldKnown : styles.fieldUnknown}`}
                  >
                    {field}
                  </span>
                );
              })}
            </div>
            <p className={styles.legend}>
              <span className={`${styles.fieldTag} ${styles.fieldKnown}`}>Known</span>
              <span className={`${styles.fieldTag} ${styles.fieldUnknown}`}>Unknown</span>
            </p>
          </Card>

          {/* Per-File Results */}
          <Card title="Per-File Details" className={styles.card}>
            {report.results.map((result, i) => (
              <details key={i} className={styles.fileDetails}>
                <summary>
                  {result.fileName}
                  {result.errors.length > 0 && ` (${result.errors.length} errors)`}
                </summary>
                <div className={styles.fileContent}>
                  <p>Runs: {result.runsCompleted}/{result.totalRuns}</p>
                  <p>Line item fields: {result.lineItemFields.join(', ')}</p>
                  {result.errors.length > 0 && (
                    <div className={styles.errors}>
                      <strong>Errors:</strong>
                      <ul>
                        {result.errors.map((e, j) => (
                          <li key={j}>Run {e.run}: {e.error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </Card>

          {/* Raw JSON */}
          <Card title="Raw Report JSON" className={styles.card}>
            <details>
              <summary>View full report JSON</summary>
              <pre className={styles.rawJson}>
                {JSON.stringify(report, null, 2)}
              </pre>
            </details>
          </Card>
        </>
      )}

      {/* Current Aliases Reference */}
      <Card title="Current Known Aliases" className={styles.card}>
        <details>
          <summary>View current alias configuration</summary>
          <pre className={styles.rawJson}>
            {JSON.stringify(KNOWN_ALIASES, null, 2)}
          </pre>
        </details>
      </Card>
    </div>
  );
}

export default FieldVariationPage;
