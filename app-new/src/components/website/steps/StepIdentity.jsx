/**
 * Step 2: Business Identity
 */

import React, { useRef, useState } from 'react';
import { uploadDishPhoto } from '../../../services/storage/imageStorage';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepIdentity({ data, updateField }) {
  const logoInputRef = useRef(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    try {
      const logoUrl = await uploadDishPhoto(file, 'website-logo', {
        maxWidth: 500,
        maxHeight: 500,
      });
      updateField('identity.logo', logoUrl);
    } catch (err) {
      console.error('Logo upload failed:', err);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <div className={styles.stepIdentity}>
      <div className={styles.formSection}>
        <h3>Logo</h3>
        <div className={styles.logoUpload}>
          <div
            className={`${styles.logoPreview} ${data.identity?.logo ? styles.hasLogo : ''}`}
            onClick={() => logoInputRef.current?.click()}
          >
            {uploadingLogo ? (
              <span className={styles.uploading}>Uploading...</span>
            ) : data.identity?.logo ? (
              <img src={data.identity.logo} alt="Logo" />
            ) : (
              <div className={styles.logoPlaceholder}>
                <span>📷</span>
                <span>Click to upload logo</span>
              </div>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/*"
            onChange={handleLogoUpload}
            style={{ display: 'none' }}
          />
          <p className={styles.hint}>
            Recommended: Square image, at least 500x500 pixels
          </p>
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Business Name *</h3>
        <input
          type="text"
          className={styles.textInput}
          value={data.identity?.name || ''}
          onChange={(e) => updateField('identity.name', e.target.value)}
          placeholder="e.g., La Marmite"
          maxLength={100}
        />
        <p className={styles.hint}>
          This is your main business name that will appear on your website
        </p>
      </div>

      <div className={styles.formSection}>
        <h3>Legal Business Name</h3>
        <input
          type="text"
          className={styles.textInput}
          value={data.identity?.legalName || ''}
          onChange={(e) => updateField('identity.legalName', e.target.value)}
          placeholder="e.g., La Marmite Inc."
          maxLength={150}
        />
        <p className={styles.hint}>
          Optional: Your registered business name (for footer/legal)
        </p>
      </div>

      <div className={styles.formSection}>
        <h3>Tagline / Slogan</h3>
        <input
          type="text"
          className={styles.textInput}
          value={data.identity?.tagline || ''}
          onChange={(e) => updateField('identity.tagline', e.target.value)}
          placeholder="e.g., Fait maison, avec amour"
          maxLength={150}
        />
        <p className={styles.hint}>
          A short phrase that captures what makes you special
        </p>
      </div>

      <div className={styles.formSection}>
        <h3>Year Established</h3>
        <input
          type="number"
          className={styles.numberInput}
          value={data.identity?.yearEstablished || ''}
          onChange={(e) => updateField('identity.yearEstablished', e.target.value ? parseInt(e.target.value) : null)}
          placeholder="e.g., 1985"
          min={1800}
          max={new Date().getFullYear()}
        />
        <p className={styles.hint}>
          Optional: Show your history and experience
        </p>
      </div>
    </div>
  );
}
