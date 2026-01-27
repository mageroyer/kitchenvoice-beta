/**
 * Step 6: Services
 */

import React from 'react';
import styles from '../../../styles/components/websitebuilder.module.css';

export default function StepServices({ data, updateField }) {
  const ServiceToggle = ({ serviceKey, title, icon, children }) => {
    const service = data.services?.[serviceKey] || {};
    const isEnabled = service.enabled;

    return (
      <div className={`${styles.serviceCard} ${isEnabled ? styles.enabled : ''}`}>
        <div className={styles.serviceHeader}>
          <span className={styles.serviceIcon}>{icon}</span>
          <h4>{title}</h4>
          <label className={styles.toggleSwitch}>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={(e) => updateField(`services.${serviceKey}.enabled`, e.target.checked)}
            />
            <span className={styles.slider}></span>
          </label>
        </div>
        {isEnabled && (
          <div className={styles.serviceDetails}>
            {children}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={styles.stepServices}>
      <p className={styles.stepIntro}>
        Tell customers about the services you offer. Only enabled services will appear on your website.
      </p>

      <ServiceToggle serviceKey="catering" title="Catering" icon="🍽️">
        <div className={styles.formField}>
          <label>Description</label>
          <textarea
            className={styles.textArea}
            value={data.services?.catering?.description || ''}
            onChange={(e) => updateField('services.catering.description', e.target.value)}
            placeholder="Describe your catering services..."
            rows={3}
          />
        </div>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label>Minimum Order ($)</label>
            <input
              type="number"
              className={styles.numberInput}
              value={data.services?.catering?.minimumOrder || ''}
              onChange={(e) => updateField('services.catering.minimumOrder', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="e.g., 100"
            />
          </div>
          <div className={styles.formField}>
            <label>Lead Time Required</label>
            <input
              type="text"
              className={styles.textInput}
              value={data.services?.catering?.leadTime || ''}
              onChange={(e) => updateField('services.catering.leadTime', e.target.value)}
              placeholder="e.g., 48 hours notice"
            />
          </div>
        </div>
      </ServiceToggle>

      <ServiceToggle serviceKey="delivery" title="Delivery" icon="🚚">
        <div className={styles.formField}>
          <label>Description</label>
          <textarea
            className={styles.textArea}
            value={data.services?.delivery?.description || ''}
            onChange={(e) => updateField('services.delivery.description', e.target.value)}
            placeholder="Describe your delivery service..."
            rows={2}
          />
        </div>
        <div className={styles.formField}>
          <label>Delivery Areas</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.services?.delivery?.areas || ''}
            onChange={(e) => updateField('services.delivery.areas', e.target.value)}
            placeholder="e.g., Montreal, Laval, South Shore"
          />
        </div>
        <div className={styles.formRow}>
          <div className={styles.formField}>
            <label>Minimum Order ($)</label>
            <input
              type="number"
              className={styles.numberInput}
              value={data.services?.delivery?.minimumOrder || ''}
              onChange={(e) => updateField('services.delivery.minimumOrder', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="e.g., 25"
            />
          </div>
          <div className={styles.formField}>
            <label>Delivery Fee ($)</label>
            <input
              type="number"
              className={styles.numberInput}
              value={data.services?.delivery?.fee || ''}
              onChange={(e) => updateField('services.delivery.fee', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="e.g., 5"
            />
          </div>
          <div className={styles.formField}>
            <label>Free Delivery Above ($)</label>
            <input
              type="number"
              className={styles.numberInput}
              value={data.services?.delivery?.freeAbove || ''}
              onChange={(e) => updateField('services.delivery.freeAbove', e.target.value ? parseFloat(e.target.value) : null)}
              placeholder="e.g., 75"
            />
          </div>
        </div>
      </ServiceToggle>

      <ServiceToggle serviceKey="customOrders" title="Custom Orders" icon="📝">
        <div className={styles.formField}>
          <label>Description</label>
          <textarea
            className={styles.textArea}
            value={data.services?.customOrders?.description || ''}
            onChange={(e) => updateField('services.customOrders.description', e.target.value)}
            placeholder="What custom orders do you accept?"
            rows={2}
          />
        </div>
        <div className={styles.formField}>
          <label>Examples</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.services?.customOrders?.examples || ''}
            onChange={(e) => updateField('services.customOrders.examples', e.target.value)}
            placeholder="e.g., Custom cakes, party platters, special cuts"
          />
        </div>
      </ServiceToggle>

      <ServiceToggle serviceKey="wholesale" title="Wholesale / B2B" icon="📦">
        <div className={styles.formField}>
          <label>Description</label>
          <textarea
            className={styles.textArea}
            value={data.services?.wholesale?.description || ''}
            onChange={(e) => updateField('services.wholesale.description', e.target.value)}
            placeholder="Describe your wholesale offering..."
            rows={2}
          />
        </div>
        <div className={styles.formField}>
          <label>Contact Email for Wholesale</label>
          <input
            type="email"
            className={styles.textInput}
            value={data.services?.wholesale?.contactEmail || ''}
            onChange={(e) => updateField('services.wholesale.contactEmail', e.target.value)}
            placeholder="wholesale@yourbusiness.com"
          />
        </div>
      </ServiceToggle>

      <ServiceToggle serviceKey="giftCards" title="Gift Cards" icon="🎁">
        <div className={styles.formField}>
          <label>Description</label>
          <textarea
            className={styles.textArea}
            value={data.services?.giftCards?.description || ''}
            onChange={(e) => updateField('services.giftCards.description', e.target.value)}
            placeholder="Describe your gift card options..."
            rows={2}
          />
        </div>
        <div className={styles.formField}>
          <label>Purchase Link (optional)</label>
          <input
            type="url"
            className={styles.textInput}
            value={data.services?.giftCards?.purchaseUrl || ''}
            onChange={(e) => updateField('services.giftCards.purchaseUrl', e.target.value)}
            placeholder="https://..."
          />
        </div>
      </ServiceToggle>

      <ServiceToggle serviceKey="loyalty" title="Loyalty Program" icon="⭐">
        <div className={styles.formField}>
          <label>Program Name</label>
          <input
            type="text"
            className={styles.textInput}
            value={data.services?.loyalty?.name || ''}
            onChange={(e) => updateField('services.loyalty.name', e.target.value)}
            placeholder="e.g., La Carte Fidélité"
          />
        </div>
        <div className={styles.formField}>
          <label>Description</label>
          <textarea
            className={styles.textArea}
            value={data.services?.loyalty?.description || ''}
            onChange={(e) => updateField('services.loyalty.description', e.target.value)}
            placeholder="How does your loyalty program work?"
            rows={2}
          />
        </div>
      </ServiceToggle>
    </div>
  );
}
