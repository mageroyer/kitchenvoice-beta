/**
 * Organ exports
 *
 * Each organ represents a functional unit of the SmartCookBook organism.
 *
 * @module organism/organs
 */

export { Organ, HEALTH_THRESHOLDS } from './Organ';
export { StomachOrgan, createStomachOrgan, DIGESTION_STATE } from './StomachOrgan';

// Future organs to be wired:
// export { BloodstreamOrgan } from './BloodstreamOrgan';  // Invoice → Inventory flow
// export { CellsOrgan } from './CellsOrgan';              // Inventory state
// export { DNAOrgan } from './DNAOrgan';                  // Recipe library
// export { MuscleOrgan } from './MuscleOrgan';            // Task execution
