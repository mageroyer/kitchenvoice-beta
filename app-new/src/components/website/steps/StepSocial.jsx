/**
 * Step 7: Social & Marketing
 */

import React from 'react';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepSocial({ data, updateField }) {
  const SocialInput = ({ icon, label, field, placeholder }) => (
    <div className={styles.socialInputRow}>
      <span className={styles.socialIcon}>{icon}</span>
      <div className={styles.socialField}>
        <label>{label}</label>
        <input
          type="url"
          className={styles.textInput}
          value={data.social?.[field] || ''}
          onChange={(e) => updateField(`social.${field}`, e.target.value)}
          placeholder={placeholder}
        />
      </div>
    </div>
  );

  return (
    <div className={styles.stepSocial}>
      <div className={styles.formSection}>
        <h3>Social Media</h3>
        <p className={styles.sectionDesc}>
          Connect your social media accounts. These will appear on your website and help customers find you.
        </p>

        <div className={styles.socialGrid}>
          <SocialInput
            icon="📘"
            label="Facebook"
            field="facebook"
            placeholder="https://facebook.com/yourbusiness"
          />
          <SocialInput
            icon="📸"
            label="Instagram"
            field="instagram"
            placeholder="https://instagram.com/yourbusiness"
          />
          <SocialInput
            icon="🐦"
            label="Twitter / X"
            field="twitter"
            placeholder="https://twitter.com/yourbusiness"
          />
          <SocialInput
            icon="📺"
            label="YouTube"
            field="youtube"
            placeholder="https://youtube.com/@yourbusiness"
          />
          <SocialInput
            icon="🎵"
            label="TikTok"
            field="tiktok"
            placeholder="https://tiktok.com/@yourbusiness"
          />
          <SocialInput
            icon="💼"
            label="LinkedIn"
            field="linkedin"
            placeholder="https://linkedin.com/company/yourbusiness"
          />
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Review Platforms</h3>
        <p className={styles.sectionDesc}>
          Link to your business profiles on review sites to build trust.
        </p>

        <div className={styles.socialGrid}>
          <SocialInput
            icon="🌟"
            label="Google Business"
            field="googleBusiness"
            placeholder="https://g.page/yourbusiness"
          />
          <SocialInput
            icon="🔴"
            label="Yelp"
            field="yelp"
            placeholder="https://yelp.com/biz/yourbusiness"
          />
          <SocialInput
            icon="🦉"
            label="TripAdvisor"
            field="tripadvisor"
            placeholder="https://tripadvisor.com/..."
          />
        </div>
      </div>

      <div className={styles.formSection}>
        <h3>Newsletter Signup</h3>
        <p className={styles.sectionDesc}>
          Let customers subscribe to receive updates, promotions, and news.
        </p>

        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={data.social?.newsletter?.enabled}
            onChange={(e) => updateField('social.newsletter.enabled', e.target.checked)}
          />
          <span>Enable newsletter signup on website</span>
        </label>

        {data.social?.newsletter?.enabled && (
          <div className={styles.newsletterOptions}>
            <div className={styles.formField}>
              <label>Provider</label>
              <select
                className={styles.selectInput}
                value={data.social?.newsletter?.provider || ''}
                onChange={(e) => updateField('social.newsletter.provider', e.target.value)}
              >
                <option value="">Select provider...</option>
                <option value="mailchimp">Mailchimp</option>
                <option value="constantcontact">Constant Contact</option>
                <option value="sendinblue">Brevo (Sendinblue)</option>
                <option value="custom">Custom / Other</option>
              </select>
            </div>

            <div className={styles.formField}>
              <label>Form Embed URL or Code</label>
              <input
                type="text"
                className={styles.textInput}
                value={data.social?.newsletter?.formUrl || ''}
                onChange={(e) => updateField('social.newsletter.formUrl', e.target.value)}
                placeholder="Paste your signup form URL..."
              />
            </div>

            <div className={styles.formField}>
              <label>Signup Call-to-Action Text</label>
              <input
                type="text"
                className={styles.textInput}
                value={data.social?.newsletter?.signupText || ''}
                onChange={(e) => updateField('social.newsletter.signupText', e.target.value)}
                placeholder="e.g., Subscribe to our newsletter for specials!"
              />
            </div>
          </div>
        )}
      </div>

      <div className={styles.formSection}>
        <h3>Instagram Feed</h3>
        <p className={styles.sectionDesc}>
          Display your latest Instagram posts on your website.
        </p>

        <label className={styles.toggleLabel}>
          <input
            type="checkbox"
            checked={data.social?.instagramFeed?.enabled}
            onChange={(e) => updateField('social.instagramFeed.enabled', e.target.checked)}
          />
          <span>Show Instagram feed on website</span>
        </label>

        {data.social?.instagramFeed?.enabled && (
          <div className={styles.formField}>
            <label>Instagram Username</label>
            <input
              type="text"
              className={styles.textInput}
              value={data.social?.instagramFeed?.username || ''}
              onChange={(e) => updateField('social.instagramFeed.username', e.target.value.replace('@', ''))}
              placeholder="yourusername (without @)"
            />
          </div>
        )}
      </div>
    </div>
  );
}
