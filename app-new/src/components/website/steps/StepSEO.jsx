/**
 * Step 9: SEO & Domain
 */

import React, { useState, useEffect } from 'react';
import { checkSlugAvailable } from '../../../services/database/websiteDB';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepSEO({ data, updateField }) {
  const [slugStatus, setSlugStatus] = useState({ checking: false, available: null });
  const [slugInput, setSlugInput] = useState(data.slug || '');

  // Generate suggested slug from business name
  useEffect(() => {
    if (!data.slug && data.identity?.name) {
      const suggested = data.identity.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 30);
      setSlugInput(suggested);
    }
  }, [data.identity?.name]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!slugInput || slugInput.length < 3) {
      setSlugStatus({ checking: false, available: null });
      return;
    }

    const timer = setTimeout(async () => {
      setSlugStatus({ checking: true, available: null });
      try {
        const available = await checkSlugAvailable(slugInput);
        setSlugStatus({ checking: false, available });

        // Auto-update the data if available
        if (available) {
          updateField('slug', slugInput);
        }
      } catch (err) {
        setSlugStatus({ checking: false, available: false });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [slugInput]);

  const handleSlugChange = (e) => {
    const value = e.target.value
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 50);
    setSlugInput(value);
  };

  // Generate SEO title suggestion
  const suggestedTitle = () => {
    const name = data.identity?.name || '';
    const type = data.businessType || '';
    const city = data.contact?.address?.city || '';

    if (name && city) {
      const typeLabel = {
        butcher: 'Boucherie',
        bakery: 'Boulangerie',
        deli: 'Charcuterie',
        grocery: 'Épicerie',
        caterer: 'Traiteur',
      }[type] || '';

      return `${name}${typeLabel ? ` | ${typeLabel}` : ''} à ${city}`;
    }
    return name;
  };

  // Generate SEO description suggestion
  const suggestedDescription = () => {
    const name = data.identity?.name || 'Our business';
    const tagline = data.identity?.tagline || '';
    const city = data.contact?.address?.city || '';

    let desc = `${name}`;
    if (tagline) desc += ` - ${tagline}`;
    if (city) desc += `. Visitez-nous à ${city}.`;

    return desc.slice(0, 160);
  };

  return (
    <div className={styles.stepSEO}>
      <div className={styles.formSection}>
        <h3>Website URL *</h3>
        <p className={styles.sectionDesc}>
          Choose your website address. This is how customers will find you online.
        </p>

        <div className={styles.slugInputContainer}>
          <span className={styles.slugPrefix}>kitchencommand.io/</span>
          <input
            type="text"
            className={styles.slugInput}
            value={slugInput}
            onChange={handleSlugChange}
            placeholder="your-business-name"
          />
        </div>

        <div className={styles.slugStatus}>
          {slugInput.length > 0 && slugInput.length < 3 && (
            <span className={styles.slugHint}>Minimum 3 characters</span>
          )}
          {slugStatus.checking && (
            <span className={styles.slugChecking}>⏳ Checking availability...</span>
          )}
          {!slugStatus.checking && slugStatus.available === true && (
            <span className={styles.slugAvailable}>✓ Available!</span>
          )}
          {!slugStatus.checking && slugStatus.available === false && (
            <span className={styles.slugTaken}>✗ Already taken - try another</span>
          )}
        </div>

        <div className={styles.urlPreview}>
          <strong>Your website will be at:</strong>
          <a
            href={`https://kitchencommand.io/${slugInput || 'your-business'}`}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.previewLink}
          >
            https://kitchencommand.io/{slugInput || 'your-business'}
          </a>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Custom Domain</h3>
        <p className={styles.sectionDesc}>
          Want to use your own domain like "www.yourbusiness.com"?
          This is a premium feature coming soon.
        </p>

        <div className={styles.premiumFeature}>
          <span className={styles.premiumBadge}>Coming Soon</span>
          <p>Custom domain support will be available in a future update.</p>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Search Engine Optimization (SEO)</h3>
        <p className={styles.sectionDesc}>
          Help customers find you on Google and other search engines.
        </p>

        <div className={styles.formField}>
          <label>Page Title</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.seo?.title || ''}
            onChange={(e) => updateField('seo.title', e.target.value)}
            placeholder={suggestedTitle()}
            maxLength={60}
          />
          <div className={styles.fieldMeta}>
            <span className={styles.charCount}>
              {(data.seo?.title || '').length}/60 characters
            </span>
            {!data.seo?.title && (
              <button
                type="button"
                className={styles.suggestionBtn}
                onClick={() => updateField('seo.title', suggestedTitle())}
              >
                Use suggestion
              </button>
            )}
          </div>
          <p className={styles.hint}>
            This appears in browser tabs and Google search results
          </p>
        </div>

        <div className={styles.formField}>
          <label>Meta Description</label>
          <textarea
            className={styles.textArea}
            value={data.seo?.description || ''}
            onChange={(e) => updateField('seo.description', e.target.value)}
            placeholder={suggestedDescription()}
            rows={3}
            maxLength={160}
          />
          <div className={styles.fieldMeta}>
            <span className={styles.charCount}>
              {(data.seo?.description || '').length}/160 characters
            </span>
            {!data.seo?.description && (
              <button
                type="button"
                className={styles.suggestionBtn}
                onClick={() => updateField('seo.description', suggestedDescription())}
              >
                Use suggestion
              </button>
            )}
          </div>
          <p className={styles.hint}>
            A brief description that appears in search results
          </p>
        </div>

        <div className={styles.formField}>
          <label>Keywords</label>
          <input
            type="text"
            className={styles.textInput}
            value={(data.seo?.keywords || []).join(', ')}
            onChange={(e) => {
              const keywords = e.target.value
                .split(',')
                .map(k => k.trim())
                .filter(k => k);
              updateField('seo.keywords', keywords);
            }}
            placeholder="boucherie, viande, montreal, local"
          />
          <p className={styles.hint}>
            Comma-separated keywords that describe your business
          </p>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Google Search Preview</h3>
        <div className={styles.searchPreview}>
          <div className={styles.searchPreviewTitle}>
            {data.seo?.title || suggestedTitle() || 'Your Business Name'}
          </div>
          <div className={styles.searchPreviewUrl}>
            https://kitchencommand.io/{slugInput || 'your-business'}
          </div>
          <div className={styles.searchPreviewDesc}>
            {data.seo?.description || suggestedDescription() || 'Add a description to appear here...'}
          </div>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Analytics (Optional)</h3>
        <p className={styles.sectionDesc}>
          Track visitor statistics with Google Analytics.
        </p>

        <div className={styles.formField}>
          <label>Google Analytics ID</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.analytics?.googleAnalyticsId || ''}
            onChange={(e) => updateField('analytics.googleAnalyticsId', e.target.value)}
            placeholder="G-XXXXXXXXXX or UA-XXXXXXXX-X"
          />
        </div>

        <div className={styles.formField}>
          <label>Facebook Pixel ID</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.analytics?.facebookPixelId || ''}
            onChange={(e) => updateField('analytics.facebookPixelId', e.target.value)}
            placeholder="XXXXXXXXXXXXXXXX"
          />
        </div>
      </div>
    </div>
  );
}
