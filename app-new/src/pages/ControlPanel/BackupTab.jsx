/**
 * Control Panel - Backup/Export Tab
 *
 * Handles JSON backup/restore and PDF exports.
 * This component is heavy due to PDF generation.
 * Extracted from ControlPanelPage for code splitting.
 */

import { useCallback, useMemo } from 'react';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import styles from '../../styles/pages/controlpanelpage.module.css';

// PDF styles - kept internal to this component
const getPDFStyles = () => `
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    padding: 20px;
    max-width: 800px;
    margin: 0 auto;
  }
  h1, h2, h3 {
    border-bottom: 2px solid #333;
    padding-bottom: 8px;
  }
  .recipe {
    page-break-inside: avoid;
    margin-bottom: 40px;
  }
  .meta {
    display: flex;
    gap: 20px;
    margin: 16px 0;
    color: #666;
  }
  .ingredients {
    background: #f5f5f5;
    padding: 16px;
    border-radius: 8px;
    margin: 16px 0;
  }
  .ingredient-item {
    margin: 8px 0;
    display: flex;
    gap: 8px;
  }
  .metric {
    font-weight: bold;
    min-width: 80px;
  }
  .tool {
    color: #666;
    font-style: italic;
  }
  .spec {
    color: #888;
  }
  .method {
    margin: 16px 0;
  }
  .method-step {
    margin: 12px 0;
    padding-left: 24px;
    position: relative;
  }
  .method-step::before {
    content: counter(step);
    counter-increment: step;
    position: absolute;
    left: 0;
    font-weight: bold;
    color: #333;
  }
  .method-list {
    counter-reset: step;
  }
`;

// Format ingredient for PDF display
const formatIngredientForPDF = (ing) => {
  const parts = [];
  if (ing.metric) {
    parts.push(`<span class="metric">${ing.metric}</span>`);
  }
  if (ing.toolMeasure) {
    parts.push(`<span class="tool">(${ing.toolMeasure})</span>`);
  }
  if (ing.name) {
    parts.push(`<span class="name">${ing.name}</span>`);
  }
  if (ing.specification) {
    parts.push(`<span class="spec">- ${ing.specification}</span>`);
  }
  return parts.join(' ');
};

// Generate PDF content for a single recipe
const generateRecipePDFContent = (recipe) => {
  const methodSteps = Array.isArray(recipe.method)
    ? recipe.method.map((step, i) => {
        const stepText = typeof step === 'string' ? step : step.text || '';
        return `<div class="method-step">${stepText}</div>`;
      }).join('')
    : `<p>${recipe.method || 'No method provided'}</p>`;

  return `
    <div class="recipe">
      <h2>${recipe.name}</h2>
      <div class="meta">
        <span><strong>Department:</strong> ${recipe.department || 'None'}</span>
        <span><strong>Category:</strong> ${recipe.category || 'None'}</span>
        <span><strong>Portions:</strong> ${recipe.portions || 1}</span>
      </div>

      ${recipe.ingredients?.length ? `
        <div class="ingredients">
          <h3>Ingredients</h3>
          ${recipe.ingredients.map(ing => `
            <div class="ingredient-item">
              ${formatIngredientForPDF(ing)}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <div class="method">
        <h3>Method</h3>
        <div class="method-list">
          ${methodSteps}
        </div>
      </div>

      ${recipe.notes?.length ? `
        <div class="notes">
          <h3>Notes</h3>
          ${recipe.notes.map((note, i) => `<p>${i + 1}. ${note}</p>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
};

function BackupTab({
  recipes,
  departments,
  categories,
  getRecipesByDepartment,
}) {
  // Export JSON backup
  const handleExportJSON = useCallback(() => {
    const data = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      recipes,
      departments,
      categories
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `smartcookbook-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [recipes, departments, categories]);

  // Import JSON backup
  const handleImportJSON = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.recipes || !data.departments || !data.categories) {
        alert('Invalid backup file format');
        return;
      }

      if (confirm(`This will import ${data.recipes.length} recipes, ${data.departments.length} departments, and ${data.categories.length} categories. Continue?`)) {
        console.log('Import data:', data);
        alert('Import functionality will be fully implemented in production. Data logged to console.');
      }
    } catch (error) {
      console.error('Error importing file:', error);
      alert('Error reading backup file');
    }

    event.target.value = '';
  }, []);

  // Export all recipes to PDF
  const handleExportAllPDF = useCallback(() => {
    if (recipes.length === 0) {
      alert('No recipes to export');
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>All Recipes</title>
          <style>${getPDFStyles()}</style>
        </head>
        <body>
          <h1 style="text-align: center; border: none;">SmartCookBook - All Recipes</h1>
          <p style="text-align: center; color: #666;">
            Exported on ${new Date().toLocaleDateString()}
          </p>
          ${recipes.map(recipe => generateRecipePDFContent(recipe)).join('')}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  }, [recipes]);

  // Export department recipes to PDF
  const handleExportDepartmentPDF = useCallback((dept) => {
    const deptRecipes = getRecipesByDepartment(dept.name);
    if (deptRecipes.length === 0) {
      alert('No recipes in this department');
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>${dept.name} - Recipes</title>
          <style>${getPDFStyles()}</style>
        </head>
        <body>
          <h1 style="text-align: center; border: none;">${dept.name}</h1>
          <p style="text-align: center; color: #666;">
            ${deptRecipes.length} recipes - Exported on ${new Date().toLocaleDateString()}
          </p>
          ${deptRecipes.map(recipe => generateRecipePDFContent(recipe)).join('')}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  }, [getRecipesByDepartment]);

  return (
    <div className={styles.backupTab}>
      <div className={styles.backupSection}>
        <Card title="Local Backup" className={styles.backupCard}>
          <p>Download a complete backup of your recipes, departments, and categories.</p>
          <div className={styles.backupActions}>
            <Button variant="primary" onClick={handleExportJSON}>
              Download Backup (JSON)
            </Button>
          </div>
          <div className={styles.backupInfo}>
            <span>{recipes.length} recipes</span>
            <span>{departments.length} departments</span>
            <span>{categories.length} categories</span>
          </div>
        </Card>

        <Card title="Restore from Backup" className={styles.backupCard}>
          <p>Import a previously exported backup file.</p>
          <div className={styles.backupActions}>
            <label className={styles.fileInputLabel}>
              <input
                type="file"
                accept=".json"
                onChange={handleImportJSON}
                style={{ display: 'none' }}
              />
              <Button variant="secondary" as="span">
                Select Backup File
              </Button>
            </label>
          </div>
        </Card>
      </div>

      <div className={styles.exportSection}>
        <Card title="PDF Export" className={styles.backupCard}>
          <p>Generate printable PDF versions of your recipes.</p>
          <div className={styles.backupActions}>
            <Button variant="primary" onClick={handleExportAllPDF}>
              Print All Recipes
            </Button>
          </div>
          <p className={styles.hint}>
            Tip: You can also print individual recipes from the Recipes tab
          </p>
        </Card>

        <Card title="Export by Department" className={styles.backupCard}>
          <p>Export recipes from a specific department.</p>
          <div className={styles.exportDepts}>
            {departments.map(dept => {
              const count = getRecipesByDepartment(dept.name).length;
              return (
                <Button
                  key={dept.id}
                  variant="outline"
                  size="small"
                  onClick={() => handleExportDepartmentPDF(dept)}
                  disabled={count === 0}
                >
                  {dept.name} ({count})
                </Button>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default BackupTab;
