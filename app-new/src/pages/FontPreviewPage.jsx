import { useState } from 'react';
import styles from '../styles/pages/fontpreview.module.css';

/**
 * FontPreviewPage
 *
 * Preview different font options for readability testing
 */

const FONT_OPTIONS = [
  {
    name: 'Inter (Current)',
    family: "'Inter', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap",
    description: 'Clean, modern, compact'
  },
  {
    name: 'Nunito',
    family: "'Nunito', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap",
    description: 'Rounded, friendly, very readable'
  },
  {
    name: 'Open Sans',
    family: "'Open Sans', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap",
    description: 'Wide, clean, excellent readability'
  },
  {
    name: 'Roboto',
    family: "'Roboto', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap",
    description: 'Google standard, very legible'
  },
  {
    name: 'Source Sans 3',
    family: "'Source Sans 3', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700&display=swap",
    description: 'Adobe, designed for UI readability'
  },
  {
    name: 'Lato',
    family: "'Lato', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&display=swap",
    description: 'Warm, stable, professional'
  },
  {
    name: 'Poppins',
    family: "'Poppins', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap",
    description: 'Geometric, modern, bold presence'
  },
  {
    name: 'Quicksand',
    family: "'Quicksand', sans-serif",
    import: "https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap",
    description: 'Rounded, soft, very friendly'
  }
];

const SIZE_OPTIONS = [
  { label: 'Small (16px)', base: 16 },
  { label: 'Medium (18px)', base: 18 },
  { label: 'Large (20px)', base: 20 },
  { label: 'Extra Large (22px)', base: 22 },
];

const WEIGHT_OPTIONS = [
  { label: 'Normal (400)', value: 400 },
  { label: 'Medium (500)', value: 500 },
  { label: 'Semi-Bold (600)', value: 600 },
  { label: 'Bold (700)', value: 700 },
];

const SPACING_OPTIONS = [
  { label: 'None (0)', value: '0' },
  { label: 'Slight (0.3px)', value: '0.3px' },
  { label: 'Medium (0.5px)', value: '0.5px' },
  { label: 'Wide (0.8px)', value: '0.8px' },
];

// Sample recipe content for preview
const SAMPLE_RECIPE = {
  name: 'Crème Brûlée',
  category: 'Desserts',
  portions: 6,
  ingredients: [
    { metric: '500ml', name: 'Heavy cream', specification: '35% fat' },
    { metric: '100g', name: 'Sugar', specification: 'granulated' },
    { metric: '5', name: 'Egg yolks', specification: 'large, room temp' },
    { metric: '1', name: 'Vanilla bean', specification: 'split lengthwise' },
  ],
  method: [
    'Preheat oven to 325°F (165°C). Place ramekins in a deep baking dish.',
    'Heat cream and vanilla in a saucepan until just simmering.',
    'Whisk egg yolks and sugar until pale and thick.',
    'Slowly pour hot cream into egg mixture, whisking constantly.',
  ]
};

function FontPreviewPage() {
  const [selectedFont, setSelectedFont] = useState(FONT_OPTIONS[0]);
  const [baseSize, setBaseSize] = useState(18);
  const [fontWeight, setFontWeight] = useState(500);
  const [letterSpacing, setLetterSpacing] = useState('0.3px');
  const [fontsLoaded, setFontsLoaded] = useState(['Inter']);

  // Load font when selected
  const handleFontChange = (font) => {
    if (!fontsLoaded.includes(font.name)) {
      const link = document.createElement('link');
      link.href = font.import;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
      setFontsLoaded([...fontsLoaded, font.name]);
    }
    setSelectedFont(font);
  };

  const previewStyle = {
    fontFamily: selectedFont.family,
    letterSpacing: letterSpacing,
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Font Preview</h1>
      <p className={styles.subtitle}>Compare fonts and sizes for readability</p>

      {/* Controls */}
      <div className={styles.controls}>
        {/* Font Selection */}
        <div className={styles.controlGroup}>
          <label>Font Family:</label>
          <div className={styles.fontButtons}>
            {FONT_OPTIONS.map((font) => (
              <button
                key={font.name}
                className={`${styles.fontButton} ${selectedFont.name === font.name ? styles.active : ''}`}
                onClick={() => handleFontChange(font)}
              >
                <span className={styles.fontName}>{font.name}</span>
                <span className={styles.fontDesc}>{font.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Size, Weight, Spacing */}
        <div className={styles.controlRow}>
          <div className={styles.controlItem}>
            <label>Base Size:</label>
            <select value={baseSize} onChange={(e) => setBaseSize(Number(e.target.value))}>
              {SIZE_OPTIONS.map((opt) => (
                <option key={opt.base} value={opt.base}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.controlItem}>
            <label>Font Weight:</label>
            <select value={fontWeight} onChange={(e) => setFontWeight(Number(e.target.value))}>
              {WEIGHT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.controlItem}>
            <label>Letter Spacing:</label>
            <select value={letterSpacing} onChange={(e) => setLetterSpacing(e.target.value)}>
              {SPACING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Preview Area */}
      <div className={styles.previewArea} style={previewStyle}>
        <div className={styles.previewHeader}>
          <h2 style={{ fontSize: baseSize + 8, fontWeight: 700 }}>Preview: {selectedFont.name}</h2>
          <p style={{ fontSize: baseSize - 2 }}>Base: {baseSize}px | Weight: {fontWeight} | Spacing: {letterSpacing}</p>
        </div>

        {/* Recipe Card Preview */}
        <div className={styles.recipeCard}>
          <h3 style={{ fontSize: baseSize + 4, fontWeight: 700 }}>{SAMPLE_RECIPE.name}</h3>
          <div className={styles.recipeMeta} style={{ fontSize: baseSize - 2, fontWeight: 500 }}>
            <span>{SAMPLE_RECIPE.category}</span>
            <span>•</span>
            <span>{SAMPLE_RECIPE.portions} portions</span>
          </div>

          {/* Ingredients */}
          <div className={styles.section}>
            <h4 style={{ fontSize: baseSize + 2, fontWeight: 600 }}>Ingredients</h4>
            <ul className={styles.ingredientList}>
              {SAMPLE_RECIPE.ingredients.map((ing, i) => (
                <li key={i} style={{ fontSize: baseSize, fontWeight: fontWeight }}>
                  <span className={styles.metric} style={{ fontWeight: 600 }}>{ing.metric}</span>
                  <span className={styles.ingName}>{ing.name}</span>
                  <span className={styles.spec} style={{ fontSize: baseSize - 2 }}>{ing.specification}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Method */}
          <div className={styles.section}>
            <h4 style={{ fontSize: baseSize + 2, fontWeight: 600 }}>Method</h4>
            <ol className={styles.methodList}>
              {SAMPLE_RECIPE.method.map((step, i) => (
                <li key={i} style={{ fontSize: baseSize, fontWeight: fontWeight }}>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Text Samples */}
        <div className={styles.textSamples}>
          <h4 style={{ fontSize: baseSize + 2, fontWeight: 600 }}>Text Samples</h4>

          <div className={styles.sampleRow}>
            <span className={styles.sampleLabel}>Heading (XL):</span>
            <span style={{ fontSize: baseSize + 8, fontWeight: 700 }}>Recipe Collection</span>
          </div>

          <div className={styles.sampleRow}>
            <span className={styles.sampleLabel}>Title (LG):</span>
            <span style={{ fontSize: baseSize + 4, fontWeight: 600 }}>Chocolate Soufflé</span>
          </div>

          <div className={styles.sampleRow}>
            <span className={styles.sampleLabel}>Body (Base):</span>
            <span style={{ fontSize: baseSize, fontWeight: fontWeight }}>Whisk the egg whites until stiff peaks form.</span>
          </div>

          <div className={styles.sampleRow}>
            <span className={styles.sampleLabel}>Small (SM):</span>
            <span style={{ fontSize: baseSize - 2, fontWeight: fontWeight }}>Updated 2 hours ago • 45 min prep time</span>
          </div>

          <div className={styles.sampleRow}>
            <span className={styles.sampleLabel}>Label:</span>
            <span style={{ fontSize: baseSize - 2, fontWeight: 600 }}>CATEGORY: DESSERTS</span>
          </div>
        </div>

        {/* Numbers Test */}
        <div className={styles.numbersTest}>
          <h4 style={{ fontSize: baseSize + 2, fontWeight: 600 }}>Numbers & Measurements</h4>
          <div style={{ fontSize: baseSize, fontWeight: fontWeight }}>
            <p>250g flour • 125ml milk • 2.5 tbsp sugar • 350°F oven</p>
            <p>1/2 cup butter • 3-4 eggs • 15-20 minutes • pH 6.5</p>
          </div>
        </div>
      </div>

      {/* Current Settings Summary */}
      <div className={styles.summary}>
        <h3>Selected Configuration</h3>
        <code>
          {`font-family: ${selectedFont.family};
font-size: ${baseSize}px;
font-weight: ${fontWeight};
letter-spacing: ${letterSpacing};`}
        </code>
      </div>
    </div>
  );
}

export default FontPreviewPage;
