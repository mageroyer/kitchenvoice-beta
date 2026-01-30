/**
 * DocsModal - Modal for downloading various documentation PDFs
 */

import React from 'react';
import styles from '../../styles/components/docsmodal.module.css';

const DOCS = [
  {
    id: 'user-guide',
    title: 'User Guide',
    description: 'Complete guide to all KitchenCommand features',
    icon: '📖',
  },
  {
    id: 'security-overview',
    title: 'Security Overview',
    description: 'How we protect your data',
    icon: '🔒',
  },
  {
    id: 'terms-of-service',
    title: 'Terms of Service',
    description: 'Legal agreement and usage terms',
    icon: '📜',
  },
  {
    id: 'patch-report',
    title: 'Patch Report',
    description: 'Latest updates and changes',
    icon: '📋',
  },
];

/**
 * @component
 * Modal component that displays a list of downloadable documentation PDFs including user guide, security overview, terms of service, and patch reports.
 * 
 * @param {Object} props - The component props
 * @param {boolean} props.isOpen - Controls whether the modal is visible
 * @param {Function} props.onClose - Callback function to close the modal
 * @param {Function} props.onDownload - Callback function to handle document downloads, receives document id as parameter
 * @returns {JSX.Element|null} The modal component or null if not open
 * 
 * @example
 * <DocsModal 
 *   isOpen={showDocs} 
 *   onClose={() => setShowDocs(false)}
 *   onDownload={(docId) => downloadDocument(docId)}
 * />
 */
export default function DocsModal({ isOpen, onClose, onDownload }) {
  if (!isOpen) return null;

  const handleDownload = (docId) => {
    onDownload(docId);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>Documentation</h2>
          <button className={styles.closeBtn} onClick={onClose}>
            &times;
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.subtitle}>Download guides and reports</p>

          <div className={styles.docsList}>
            {DOCS.map((doc) => (
              <button
                key={doc.id}
                className={styles.docItem}
                onClick={() => handleDownload(doc.id)}
              >
                <span className={styles.docIcon}>{doc.icon}</span>
                <div className={styles.docInfo}>
                  <span className={styles.docTitle}>{doc.title}</span>
                  <span className={styles.docDesc}>{doc.description}</span>
                </div>
                <span className={styles.downloadIcon}>⬇</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
