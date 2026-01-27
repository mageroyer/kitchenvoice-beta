/**
 * Step 10: Review & Publish
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BUSINESS_TYPES, TEMPLATES, CERTIFICATIONS } from '../../../services/database/websiteSchema';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepReview({ data, onPublish, saving }) {
  const navigate = useNavigate();
  const [showPreview, setShowPreview] = useState(false);

  const getBusinessTypeLabel = (id) => {
    return BUSINESS_TYPES.find(t => t.id === id)?.label || id;
  };

  const getTemplateLabel = (id) => {
    return TEMPLATES.find(t => t.id === id)?.name || id;
  };

  const getCertificationLabels = (ids) => {
    return (ids || []).map(id => CERTIFICATIONS.find(c => c.id === id)?.label || id);
  };

  const completionStatus = () => {
    const checks = [
      { label: 'Business type selected', done: !!data.businessType },
      { label: 'Business name entered', done: !!data.identity?.name },
      { label: 'Template selected', done: !!data.design?.template },
      { label: 'Contact phone added', done: !!data.contact?.phone },
      { label: 'Address entered', done: !!data.contact?.address?.street },
      { label: 'URL slug chosen', done: !!data.slug && data.slug.length >= 3 },
    ];

    const completed = checks.filter(c => c.done).length;
    return { checks, completed, total: checks.length };
  };

  const status = completionStatus();
  const canPublish = status.completed >= 4 && data.slug; // Minimum requirements

  const SummarySection = ({ title, children, editStep }) => (
    <div className={styles.summarySection}>
      <div className={styles.summarySectionHeader}>
        <h4>{title}</h4>
        {editStep !== undefined && (
          <button
            className={styles.editBtn}
            onClick={() => window.scrollTo(0, 0)}
          >
            Edit
          </button>
        )}
      </div>
      <div className={styles.summarySectionContent}>
        {children}
      </div>
    </div>
  );

  const SummaryItem = ({ label, value, placeholder = 'Not set' }) => (
    <div className={styles.summaryItem}>
      <span className={styles.summaryLabel}>{label}:</span>
      <span className={value ? styles.summaryValue : styles.summaryPlaceholder}>
        {value || placeholder}
      </span>
    </div>
  );

  return (
    <div className={styles.stepReview}>
      {/* Completion Status */}
      <div className={styles.completionCard}>
        <div className={styles.completionHeader}>
          <h3>Setup Progress</h3>
          <span className={styles.completionPercent}>
            {Math.round((status.completed / status.total) * 100)}%
          </span>
        </div>
        <div className={styles.completionBar}>
          <div
            className={styles.completionFill}
            style={{ width: `${(status.completed / status.total) * 100}%` }}
          />
        </div>
        <div className={styles.completionChecks}>
          {status.checks.map((check, i) => (
            <div
              key={i}
              className={`${styles.completionCheck} ${check.done ? styles.done : ''}`}
            >
              <span className={styles.checkIcon}>{check.done ? '✓' : '○'}</span>
              <span>{check.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Website Preview Card */}
      <div className={styles.previewCard}>
        <div className={styles.previewHeader}>
          <h3>Your Website</h3>
          <span className={styles.statusBadge}>
            {data.status === 'published' ? '🟢 Live' : '⚪ Draft'}
          </span>
        </div>

        <div className={styles.previewUrl}>
          <span className={styles.urlLabel}>Public URL:</span>
          <a
            href={`https://kitchencommand-website.vercel.app/${data.slug || ''}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.urlLink}
          >
            kitchencommand-website.vercel.app/{data.slug || 'your-business'}
          </a>
        </div>

        {data.status === 'published' && data.publishedAt && (
          <p className={styles.publishedAt}>
            Published: {new Date(data.publishedAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {/* Summary Sections */}
      <div className={styles.summaryGrid}>
        <SummarySection title="Business" editStep={0}>
          <SummaryItem label="Type" value={getBusinessTypeLabel(data.businessType)} />
          <SummaryItem label="Name" value={data.identity?.name} />
          <SummaryItem label="Tagline" value={data.identity?.tagline} />
          <SummaryItem label="Established" value={data.identity?.yearEstablished} />
          {data.identity?.logo && (
            <div className={styles.summaryLogo}>
              <img src={data.identity.logo} alt="Logo" />
            </div>
          )}
        </SummarySection>

        <SummarySection title="Design" editStep={2}>
          <SummaryItem label="Template" value={getTemplateLabel(data.design?.template)} />
          <div className={styles.colorPreview}>
            <span
              className={styles.colorSwatch}
              style={{ backgroundColor: data.design?.colors?.primary }}
              title="Primary"
            />
            <span
              className={styles.colorSwatch}
              style={{ backgroundColor: data.design?.colors?.accent }}
              title="Accent"
            />
            <span
              className={styles.colorSwatch}
              style={{ backgroundColor: data.design?.colors?.background }}
              title="Background"
            />
          </div>
        </SummarySection>

        <SummarySection title="Contact" editStep={4}>
          <SummaryItem label="Phone" value={data.contact?.phone} />
          <SummaryItem label="Email" value={data.contact?.email} />
          <SummaryItem
            label="Address"
            value={data.contact?.address?.street ?
              `${data.contact.address.street}, ${data.contact.address.city}` : null}
          />
        </SummarySection>

        <SummarySection title="Services" editStep={5}>
          {data.services?.catering?.enabled && <span className={styles.serviceBadge}>🍽️ Catering</span>}
          {data.services?.delivery?.enabled && <span className={styles.serviceBadge}>🚚 Delivery</span>}
          {data.services?.customOrders?.enabled && <span className={styles.serviceBadge}>📝 Custom Orders</span>}
          {data.services?.giftCards?.enabled && <span className={styles.serviceBadge}>🎁 Gift Cards</span>}
          {!Object.values(data.services || {}).some(s => s?.enabled) && (
            <span className={styles.summaryPlaceholder}>No services enabled</span>
          )}
        </SummarySection>

        <SummarySection title="Social" editStep={6}>
          {data.social?.facebook && <span className={styles.socialBadge}>📘 Facebook</span>}
          {data.social?.instagram && <span className={styles.socialBadge}>📸 Instagram</span>}
          {data.social?.googleBusiness && <span className={styles.socialBadge}>🌟 Google</span>}
          {!data.social?.facebook && !data.social?.instagram && (
            <span className={styles.summaryPlaceholder}>No social links added</span>
          )}
        </SummarySection>

        <SummarySection title="Gallery" editStep={7}>
          <SummaryItem
            label="Store photos"
            value={`${(data.gallery?.storefront?.length || 0) + (data.gallery?.interior?.length || 0)} photos`}
          />
          <SummaryItem
            label="Product photos"
            value={`${data.gallery?.products?.length || 0} photos`}
          />
          <SummaryItem
            label="Hero images"
            value={Object.values(data.gallery?.hero || {}).filter(Boolean).length > 0 ? 'Set' : null}
          />
        </SummarySection>
      </div>

      {/* Certifications */}
      {(data.about?.certifications?.length > 0) && (
        <div className={styles.certificationsPreview}>
          <h4>Certifications & Badges</h4>
          <div className={styles.certBadges}>
            {getCertificationLabels(data.about.certifications).map((label, i) => (
              <span key={i} className={styles.certBadge}>{label}</span>
            ))}
          </div>
        </div>
      )}

      {/* Publish Section */}
      <div className={styles.publishSection}>
        {!canPublish ? (
          <div className={styles.publishWarning}>
            <span className={styles.warningIcon}>⚠️</span>
            <div>
              <strong>Almost there!</strong>
              <p>Complete the required fields above to publish your website.</p>
            </div>
          </div>
        ) : (
          <div className={styles.publishReady}>
            <span className={styles.readyIcon}>🚀</span>
            <div>
              <strong>Ready to go live!</strong>
              <p>Your website is ready to publish. Click the button below to make it live.</p>
            </div>
          </div>
        )}

        <div className={styles.publishActions}>
          <button
            className={styles.previewBtn}
            onClick={() => navigate('/website-preview')}
          >
            👁️ Preview Website
          </button>

          <button
            className={styles.publishBtn}
            onClick={onPublish}
            disabled={!canPublish || saving}
          >
            {saving ? (
              'Publishing...'
            ) : data.status === 'published' ? (
              '✓ Update Website'
            ) : (
              '🚀 Publish Website'
            )}
          </button>
        </div>

        {data.status === 'published' && (
          <p className={styles.publishNote}>
            Your website is live at{' '}
            <a
              href={`https://kitchencommand-website.vercel.app/${data.slug}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              kitchencommand-website.vercel.app/{data.slug}
            </a>
          </p>
        )}
      </div>
    </div>
  );
}
