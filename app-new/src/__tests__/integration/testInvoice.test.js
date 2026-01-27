import { describe, it, expect } from 'vitest';
import { processLineV2 } from '../../services/invoice/handlers/foodSupplyHandler.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Process Real Invoice', () => {
  it('process Les Dépendances invoice', () => {
    const invoicePath = path.join(__dirname, '../../../../docs/files/jasonInvoice.txt');
    const rawJson = JSON.parse(fs.readFileSync(invoicePath, 'utf8'));

    console.log('\n=== PROCESSING LES DÉPENDANCES INVOICE ===\n');
    console.log(`Total items: ${rawJson.items.length}`);
    console.log(`Invoice total: $${rawJson.summary.total}\n`);

    const results = rawJson.items.slice(0, 15).map(item => {
      const result = processLineV2(item);
      return {
        desc: item.description.substring(0, 35).padEnd(35),
        rawQty: String(item.qty_invoiced).padStart(6),
        unit: item.unit.padEnd(3),
        qty: String(result.quantity?.value ?? 'NULL').padStart(6),
        weight: result.weight?.total ? result.weight.total.toFixed(2).padStart(8) : '    null',
        wUnit: (result.weight?.unit || '').padEnd(2),
        type: (result.pricing?.type || '').padEnd(6),
        priceG: result.pricing?.pricePerG ? ('$' + result.pricing.pricePerG.toFixed(4)).padStart(9) : '     null',
        math: result.math?.valid ? '✓' : '✗',
        conf: String(result.validation?.overallConfidence || 0).padStart(3) + '%'
      };
    });

    console.log('DESC                               | RAW_QTY | U/M | EXT_QTY | WEIGHT   | U  | TYPE   | $/g       | M | CONF');
    console.log('─'.repeat(120));
    results.forEach(r => {
      console.log(`${r.desc} | ${r.rawQty} | ${r.unit} | ${r.qty} | ${r.weight} | ${r.wUnit} | ${r.type} | ${r.priceG} | ${r.math} | ${r.conf}`);
    });

    // Check specific items
    const unitItem = rawJson.items.find(i => i.unit.toLowerCase() === 'un' && i.description.includes('0,15kg'));
    const kgItem = rawJson.items.find(i => i.unit.toLowerCase() === 'kg');

    if (unitItem) {
      const unitResult = processLineV2(unitItem);
      console.log('\n--- UNIT-PRICED ITEM ANALYSIS ---');
      console.log(`Item: ${unitItem.description}`);
      console.log(`Raw: qty_invoiced=${unitItem.qty_invoiced}, unit=${unitItem.unit}, unit_price=$${unitItem.unit_price}, amount=$${unitItem.amount}`);
      console.log(`Extracted: qty=${unitResult.quantity?.value}, weight=${unitResult.weight?.total}${unitResult.weight?.unit}`);
      console.log(`Expected: qty=${unitItem.qty_invoiced}, totalWeight=${unitItem.qty_invoiced * 0.15}kg`);
      console.log(`Pricing: type=${unitResult.pricing?.type}, pricePerG=$${unitResult.pricing?.pricePerG?.toFixed(4)}`);
      console.log(`Math: valid=${unitResult.math?.valid}, diff=$${unitResult.math?.difference?.toFixed(2)}`);
    }

    if (kgItem) {
      const kgResult = processLineV2(kgItem);
      console.log('\n--- KG-PRICED ITEM ANALYSIS ---');
      console.log(`Item: ${kgItem.description}`);
      console.log(`Raw: qty_invoiced=${kgItem.qty_invoiced}, unit=${kgItem.unit}, unit_price=$${kgItem.unit_price}/kg, amount=$${kgItem.amount}`);
      console.log(`Extracted: qty=${kgResult.quantity?.value}, weight=${kgResult.weight?.total}${kgResult.weight?.unit}`);
      console.log(`Context: unitType=${kgResult._context?.unitType}, expectedFormula=${kgResult._context?.expectedFormula}`);
      console.log(`Pricing: type=${kgResult.pricing?.type}, pricePerG=$${kgResult.pricing?.pricePerG?.toFixed(4)}`);
      console.log(`Math: valid=${kgResult.math?.valid}, formula=${kgResult.math?.formula}, diff=$${kgResult.math?.difference?.toFixed(2)}`);
    }

    expect(results.length).toBeGreaterThan(0);
  });
});
