/**
 * StomachOrgan - The digestive system (Invoice Processing)
 *
 * The stomach digests incoming invoices:
 * - Receives raw PDF/image data (food)
 * - Breaks it down via AI parsing (digestion)
 * - Extracts nutrients (line items, prices, quantities)
 * - Passes nutrients to the bloodstream (inventory updates)
 *
 * @module organism/organs/StomachOrgan
 */

import { Organ } from './Organ';
import { Signal, SIGNAL_TYPES, INTENSITY } from '../signals/Signal';
import { getMetabolism } from '../systems/Metabolism';
import { getImmuneSystem } from '../systems/ImmuneSystem';

/**
 * Digestion states
 */
export const DIGESTION_STATE = {
  EMPTY: 'empty',           // Nothing to process
  RECEIVING: 'receiving',   // Receiving input
  DIGESTING: 'digesting',   // AI parsing in progress
  ABSORBING: 'absorbing',   // Processing line items
  COMPLETE: 'complete',     // Done processing
  SICK: 'sick'              // Error state
};

/**
 * StomachOrgan class
 */
export class StomachOrgan extends Organ {
  constructor() {
    super('stomach', {
      metaphor: 'The Digestive System',
      icon: '🫃',
      description: 'Digests invoices into usable data'
    });

    this.digestionState = DIGESTION_STATE.EMPTY;
    this.processingQueue = [];
    this.processedCount = 0;
    this.errorCount = 0;
    this.lastMeal = null;

    // Register additional signal handlers
    this.registerSignalHandler(SIGNAL_TYPES.FLOW_START, this.onFlowStart.bind(this));
  }

  /**
   * Initialize the stomach
   */
  async initialize() {
    await super.initialize();

    // Connect to existing invoice service (if available)
    try {
      // Dynamic import to avoid circular dependencies
      const visionParser = await import('../../invoice/vision');
      this.visionParser = visionParser;
    } catch (error) {
      console.warn('[Stomach] Vision parser not available:', error.message);
    }
  }

  /**
   * Handle flow start signals (someone wants to feed us)
   */
  onFlowStart(signal) {
    if (signal.data?.type === 'invoice') {
      this.setDigestionState(DIGESTION_STATE.RECEIVING);
    }
    return { ready: true };
  }

  /**
   * Feed the stomach (receive invoice data)
   */
  async eat(invoiceData) {
    this.lastMeal = Date.now();
    this.setDigestionState(DIGESTION_STATE.RECEIVING);

    // Add to processing queue
    this.processingQueue.push({
      data: invoiceData,
      receivedAt: Date.now()
    });

    // Start digestion
    return this.digest();
  }

  /**
   * Digest the invoice (AI parsing)
   */
  async digest() {
    if (this.processingQueue.length === 0) {
      this.setDigestionState(DIGESTION_STATE.EMPTY);
      return null;
    }

    const meal = this.processingQueue.shift();
    this.setDigestionState(DIGESTION_STATE.DIGESTING);

    // Emit digestion signal
    await this.emit(new Signal(
      SIGNAL_TYPES.DIGESTION,
      INTENSITY.MEDIUM,
      this.name,
      { status: 'started', invoiceId: meal.data?.id }
    ));

    try {
      let nutrients;

      // Check if vision parser is available
      if (this.visionParser && meal.data?.file) {
        // Use AI vision parsing
        const result = await this.visionParser.processInvoice(meal.data.file);
        nutrients = result;
      } else if (meal.data?.parsed) {
        // Already parsed data
        nutrients = meal.data.parsed;
      } else {
        // Raw data - minimal processing
        nutrients = this.basicDigestion(meal.data);
      }

      // Immune check on nutrients
      const immune = getImmuneSystem();
      const healResult = await immune.heal(nutrients, 'invoice');

      if (healResult.quarantined) {
        throw new Error('Invoice data failed validation and was quarantined');
      }

      nutrients = healResult.entity;

      // Absorption phase - process line items
      this.setDigestionState(DIGESTION_STATE.ABSORBING);
      const absorbed = await this.absorb(nutrients);

      // Complete
      this.setDigestionState(DIGESTION_STATE.COMPLETE);
      this.processedCount++;
      this.updateHealth(5); // Successful digestion improves health

      // Emit completion
      await this.emit(Signal.flowComplete(this.name, {
        invoiceId: nutrients.id,
        lineCount: absorbed.lineItems?.length || 0,
        total: nutrients.total
      }));

      // Signal satiation
      await this.emit(new Signal(
        SIGNAL_TYPES.SATIATION,
        INTENSITY.MEDIUM,
        this.name,
        { nutrients: absorbed }
      ));

      // Reset to empty after brief pause
      setTimeout(() => {
        if (this.processingQueue.length === 0) {
          this.setDigestionState(DIGESTION_STATE.EMPTY);
        }
      }, 1000);

      return absorbed;

    } catch (error) {
      console.error('[Stomach] 🤢 Digestion failed:', error);
      this.setDigestionState(DIGESTION_STATE.SICK);
      this.errorCount++;
      this.updateHealth(-10);

      // Emit pain signal
      await this.emitPain(INTENSITY.HIGH, {
        error: error.message,
        invoiceData: meal.data?.id
      });

      // Recovery after a pause
      setTimeout(() => {
        this.setDigestionState(DIGESTION_STATE.EMPTY);
      }, 5000);

      throw error;
    }
  }

  /**
   * Basic digestion for pre-parsed data
   */
  basicDigestion(data) {
    return {
      id: data.id || `inv_${Date.now()}`,
      vendor: data.vendor || data.vendorName,
      date: data.invoiceDate || data.date || new Date().toISOString(),
      total: data.total || 0,
      lineItems: data.lineItems || data.items || [],
      raw: data
    };
  }

  /**
   * Absorb nutrients (process line items)
   */
  async absorb(nutrients) {
    const metabolism = getMetabolism();

    // Process each line item through metabolism
    const processedLines = await metabolism.processBatch(
      nutrients.lineItems || [],
      async (line) => {
        // Each line becomes a nutrient for the cells (inventory)
        return {
          ...line,
          absorbed: true,
          absorbedAt: Date.now()
        };
      },
      'invoice'
    );

    return {
      ...nutrients,
      lineItems: processedLines.filter(r => r.success).map(r => r.result)
    };
  }

  /**
   * Set digestion state
   */
  setDigestionState(state) {
    this.digestionState = state;
    this.setState({ digestionState: state });
  }

  /**
   * Pulse - regular health check
   */
  async pulse() {
    const baseHealth = 70;
    let health = baseHealth;

    // Adjust based on state
    if (this.digestionState === DIGESTION_STATE.SICK) {
      health -= 30;
    }

    // Recent activity is healthy
    if (this.lastMeal && (Date.now() - this.lastMeal) < 86400000) { // 24 hours
      health += 10;
    }

    // Errors reduce health
    const errorRatio = this.processedCount > 0
      ? this.errorCount / (this.processedCount + this.errorCount)
      : 0;
    health -= Math.round(errorRatio * 20);

    // Queue backup reduces health
    if (this.processingQueue.length > 5) {
      health -= 10;
    }

    this.health = Math.max(0, Math.min(100, health));

    return {
      organ: this.name,
      health: this.health,
      status: this.getHealthStatus(),
      digestionState: this.digestionState,
      queueLength: this.processingQueue.length,
      processedCount: this.processedCount,
      errorCount: this.errorCount,
      lastMeal: this.lastMeal
    };
  }
}

// Factory function
/**
 * Creates and initializes a new StomachOrgan instance for invoice processing.
 * The stomach organ handles the digestion of raw PDF/image invoice data through
 * AI parsing to extract structured information.
 * 
 * @returns {StomachOrgan} A new initialized StomachOrgan instance ready for invoice processing
 * 
 * @example
 * const stomach = createStomachOrgan();
 * stomach.digest(invoicePdfData);
 */
export function createStomachOrgan() {
  const stomach = new StomachOrgan();
  stomach.initialize();
  return stomach;
}

export default StomachOrgan;
