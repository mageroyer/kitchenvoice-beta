/**
 * Control Panel - Recipes Tab
 *
 * Tree view of recipes organized by department and category.
 * Includes PDF export functionality for single recipes, departments, and categories.
 * Extracted from ControlPanelPage for code splitting.
 */

import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../../components/common/Button';
import Badge from '../../components/common/Badge';
import styles from '../../styles/pages/controlpanelpage.module.css';

// Helper to format ingredient for PDF display
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

// Common PDF styles
const getPDFStyles = () => `
  body { font-family: Arial, sans-serif; padding: 20px; }
  .recipe { page-break-after: always; max-width: 800px; margin: 0 auto; }
  .recipe:last-child { page-break-after: auto; }
  h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; margin-bottom: 15px; }
  h2 { color: #34495e; margin-top: 15px; margin-bottom: 5px; font-size: 16px; }
  .ingredients { background: #f8f9fa; padding: 10px 15px; border-radius: 8px; }
  .ingredient { padding: 4px 0; font-size: 14px; border-bottom: 1px solid #ecf0f1; display: flex; gap: 8px; align-items: baseline; }
  .ingredient:last-child { border-bottom: none; }
  .ingredient .metric { font-weight: bold; color: #2c3e50; min-width: 60px; }
  .ingredient .tool { color: #7f8c8d; font-style: italic; }
  .ingredient .name { color: #2c3e50; }
  .ingredient .spec { color: #95a5a6; font-style: italic; }
  .method { line-height: 1.6; font-size: 14px; }
  .step { margin-bottom: 8px; padding: 8px; background: #fff; border-left: 3px solid #3498db; }
  .simple-list { line-height: 1.4; }
  .simple-item { padding: 2px 0; color: #2c3e50; }
`;

// Generate PDF content for a single recipe
const generateRecipePDFContent = (recipe) => {
  return `
    <div class="recipe">
      <h1>${recipe.name}</h1>
      <h2>Ingredients</h2>
      <div class="ingredients">
        ${(recipe.ingredients || []).map(ing =>
          `<div class="ingredient">${formatIngredientForPDF(ing)}</div>`
        ).join('')}
      </div>
      <h2>Method</h2>
      <div class="method">
        ${Array.isArray(recipe.method)
          ? recipe.method.map((step, i) => `<div class="step"><strong>${i + 1}.</strong> ${step}</div>`).join('')
          : `<p>${recipe.method || 'No method provided'}</p>`
        }
      </div>
      ${recipe.platingInstructions?.length ? `
        <h2>Plating</h2>
        <div class="simple-list">
          ${recipe.platingInstructions.map((inst, i) => `<div class="simple-item">${i + 1}. ${inst}</div>`).join('')}
        </div>
      ` : ''}
      ${recipe.notes?.length ? `
        <h2>Notes</h2>
        <div class="simple-list">
          ${recipe.notes.map((note, i) => `<div class="simple-item">${i + 1}. ${note}</div>`).join('')}
        </div>
      ` : ''}
    </div>
  `;
};

function RecipesTab({
  recipes,
  departments,
  categories,
  expandedDepts,
  expandedCats,
  onToggleDept,
  onToggleCat,
}) {
  const navigate = useNavigate();

  // Get recipes by department
  const getRecipesByDepartment = useCallback((deptName) => {
    return recipes.filter(r => r.department === deptName);
  }, [recipes]);

  // Get categories for department
  const getCategoriesForDept = useCallback((deptId) => {
    return categories.filter(c => c.departmentId === deptId);
  }, [categories]);

  // Get recipes by category
  const getRecipesByCategory = useCallback((catName) => {
    return recipes.filter(r => r.category === catName);
  }, [recipes]);

  // Export single recipe to PDF
  const handleExportRecipePDF = useCallback((recipe) => {
    const printContent = `
      <html>
        <head>
          <title>${recipe.name}</title>
          <style>${getPDFStyles()}</style>
        </head>
        <body>
          ${generateRecipePDFContent(recipe)}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  }, []);

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
          <h1 style="text-align: center; border: none; margin-bottom: 30px;">${dept.name}</h1>
          ${deptRecipes.map(recipe => generateRecipePDFContent(recipe)).join('')}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  }, [getRecipesByDepartment]);

  // Export category recipes to PDF
  const handleExportCategoryPDF = useCallback((catName) => {
    const catRecipes = getRecipesByCategory(catName);
    if (catRecipes.length === 0) {
      alert('No recipes in this category');
      return;
    }

    const printContent = `
      <html>
        <head>
          <title>${catName} - Recipes</title>
          <style>${getPDFStyles()}</style>
        </head>
        <body>
          <h1 style="text-align: center; border: none; margin-bottom: 30px;">${catName}</h1>
          ${catRecipes.map(recipe => generateRecipePDFContent(recipe)).join('')}
        </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  }, [getRecipesByCategory]);

  return (
    <div className={styles.recipesTab}>
      <div className={styles.treeView}>
        {departments.map(dept => {
          const deptRecipes = getRecipesByDepartment(dept.name);
          const deptCategories = getCategoriesForDept(dept.id);
          const isExpanded = expandedDepts[dept.id];

          return (
            <div key={dept.id} className={styles.treeNode}>
              <div className={styles.treeHeader}>
                <div
                  className={styles.treeHeaderLeft}
                  onClick={() => onToggleDept(dept.id)}
                >
                  <span className={styles.expandIcon}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <span className={styles.deptIcon}>🏢</span>
                  <span className={styles.treeName}>{dept.name}</span>
                  <Badge variant="secondary" size="small">
                    {deptRecipes.length} recipes
                  </Badge>
                </div>
                {deptRecipes.length > 0 && (
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExportDepartmentPDF(dept);
                    }}
                    title={`Export all ${dept.name} recipes to PDF`}
                  >
                    🖨️
                  </Button>
                )}
              </div>

              {isExpanded && (
                <div className={styles.treeChildren}>
                  {deptCategories.map(cat => {
                    const catRecipes = deptRecipes.filter(r => r.category === cat.name);
                    const isCatExpanded = expandedCats[cat.name];

                    return (
                      <div key={cat.id} className={styles.categoryNode}>
                        <div className={styles.categoryHeader}>
                          <div
                            className={styles.categoryHeaderLeft}
                            onClick={() => onToggleCat(cat.name)}
                          >
                            <span className={styles.expandIcon}>
                              {isCatExpanded ? '▼' : '▶'}
                            </span>
                            <span className={styles.catIcon}>📁</span>
                            <span className={styles.treeName}>{cat.name}</span>
                            <Badge variant="info" size="small">
                              {catRecipes.length}
                            </Badge>
                          </div>
                          {catRecipes.length > 0 && (
                            <Button
                              variant="ghost"
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExportCategoryPDF(cat.name);
                              }}
                              title={`Export all ${cat.name} recipes to PDF`}
                            >
                              🖨️
                            </Button>
                          )}
                        </div>

                        {isCatExpanded && catRecipes.length > 0 && (
                          <div className={styles.recipeList}>
                            {catRecipes.map(recipe => (
                              <div
                                key={recipe.id}
                                className={styles.recipeItem}
                                onClick={() => navigate(`/recipes/${recipe.id}/edit`)}
                              >
                                <span className={styles.recipeIcon}>📄</span>
                                <span>{recipe.name}</span>
                                <Button
                                  variant="ghost"
                                  size="small"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleExportRecipePDF(recipe);
                                  }}
                                >
                                  🖨️
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Uncategorized recipes in this department */}
                  {deptRecipes.filter(r => !deptCategories.some(c => c.name === r.category)).length > 0 && (
                    <div className={styles.categoryNode}>
                      <div className={styles.categoryHeader}>
                        <span className={styles.expandIcon}>•</span>
                        <span className={styles.catIcon}>📁</span>
                        <span className={styles.treeName}>Uncategorized</span>
                      </div>
                      <div className={styles.recipeList}>
                        {deptRecipes
                          .filter(r => !deptCategories.some(c => c.name === r.category))
                          .map(recipe => (
                            <div
                              key={recipe.id}
                              className={styles.recipeItem}
                              onClick={() => navigate(`/recipes/${recipe.id}/edit`)}
                            >
                              <span className={styles.recipeIcon}>📄</span>
                              <span>{recipe.name}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {departments.length === 0 && (
          <p className={styles.emptyText}>No departments created yet</p>
        )}
      </div>
    </div>
  );
}

export default RecipesTab;
