/**
 * Organism Architecture - The Living System
 *
 * SmartCookBook is not a collection of services. It's a living organism.
 *
 * Components:
 * - Organism: The whole system
 * - Organs: Functional units (Invoice, Inventory, Recipe, Task)
 * - Systems: Coordination (Nervous, Metabolism, Homeostasis, Immune)
 * - Signals: Communication between components
 *
 * @module organism
 */

// Core
export { Organism, getOrganism, awakenOrganism, ORGANISM_STATE } from './core/Organism';

// Signals
export { Signal, SIGNAL_TYPES, INTENSITY } from './signals/Signal';

// Systems
export { NervousSystem, getNervousSystem } from './systems/NervousSystem';
export { Metabolism, getMetabolism, METABOLIC_STATE } from './systems/Metabolism';
export { Homeostasis, getHomeostasis, TARGET_RANGES } from './systems/Homeostasis';
export { ImmuneSystem, getImmuneSystem, THREAT_TYPES, SEVERITY } from './systems/ImmuneSystem';

// Base Organ
export { Organ, HEALTH_THRESHOLDS } from './organs/Organ';

/**
 * Quick start the organism
 *
 * @example
 * import { startOrganism } from './services/organism';
 *
 * // In your app initialization
 * const organism = await startOrganism();
 *
 * // Listen to heartbeats
 * organism.on('onHeartbeat', (vitals) => {
 *   console.log('Organism health:', vitals.health);
 * });
 *
 * // Feed it data
 * await organism.ingest(invoiceData, 'invoice');
 */
export async function startOrganism() {
  const { awakenOrganism } = await import('./core/Organism');
  return awakenOrganism();
}

/**
 * Usage in React:
 *
 * @example
 * // In App.jsx or a context provider
 * import { startOrganism, getOrganism } from './services/organism';
 *
 * useEffect(() => {
 *   const initOrganism = async () => {
 *     await startOrganism();
 *
 *     const organism = getOrganism();
 *     organism.on('onHealthChange', (health) => {
 *       setOrganismHealth(health);
 *     });
 *   };
 *
 *   initOrganism();
 *
 *   return () => {
 *     getOrganism().sleep();
 *   };
 * }, []);
 */
