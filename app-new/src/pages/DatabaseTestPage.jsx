import { useState, useEffect } from 'react';
import { recipeDB } from '../services/database/indexedDB';
import Button from '../components/common/Button';
import Card from '../components/common/Card';
import Alert from '../components/common/Alert';

/**
 * Database Test Page
 *
 * Utility page for testing database operations
 */
function DatabaseTestPage() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Auto-load recipes on mount
  useEffect(() => {
    loadAllRecipes();
  }, []);

  const createTestRecipe = async () => {
    setLoading(true);
    setMessage('');

    try {
      const testRecipe = {
        name: 'Classic Chocolate Cake',
        category: 'Desserts',
        portions: 8,
        department: 'Pastry Kitchen',
        ingredients: [
          { grouped: false, metric: '240g', quantity: '2', unit: 'cups', name: 'all-purpose flour', specification: 'sifted' },
          { grouped: false, metric: '400g', quantity: '2', unit: 'cups', name: 'granulated sugar', specification: '' },
          { grouped: false, metric: '85g', quantity: '3/4', unit: 'cup', name: 'cocoa powder', specification: 'unsweetened' },
          { grouped: false, metric: '12g', quantity: '1.5', unit: 'tsp', name: 'baking powder', specification: '' },
          { grouped: false, metric: '8g', quantity: '1.5', unit: 'tsp', name: 'baking soda', specification: '' },
          { grouped: false, metric: '6g', quantity: '1', unit: 'tsp', name: 'salt', specification: '' },
          { grouped: true, metric: '100g', quantity: '2', unit: '', name: 'large eggs', specification: 'room temperature' },
          { grouped: true, metric: '240ml', quantity: '1', unit: 'cup', name: 'whole milk', specification: '' },
          { grouped: true, metric: '120ml', quantity: '1/2', unit: 'cup', name: 'vegetable oil', specification: '' },
          { grouped: true, metric: '10ml', quantity: '2', unit: 'tsp', name: 'vanilla extract', specification: '' },
          { grouped: true, metric: '240ml', quantity: '1', unit: 'cup', name: 'boiling water', specification: '' },
        ],
        method: `Preheat oven to 350°F (175°C). Grease and flour two 9-inch round baking pans.
In a large mixing bowl, sift together the flour, sugar, cocoa powder, baking powder, baking soda, and salt.
Add eggs, milk, oil, and vanilla extract. Beat on medium speed for 2 minutes.
Stir in the boiling water (batter will be thin). This is normal - don't worry!
Pour batter evenly into the prepared pans.
Bake for 30-35 minutes, or until a toothpick inserted in the center comes out clean.
Cool in pans for 10 minutes, then remove to wire racks to cool completely.
Frost with your favorite chocolate frosting when completely cool.`,
        platingInstructions: [
          'Place first cake layer on serving plate',
          'Spread 1 cup of frosting evenly on top',
          'Add second cake layer',
          'Frost top and sides of entire cake',
          'Use offset spatula for smooth finish',
          'Optional: pipe decorative border with remaining frosting',
          'Garnish with chocolate shavings or fresh berries'
        ],
        notes: [
          'Coffee can be used instead of boiling water for richer chocolate flavor',
          'Cake layers can be wrapped and frozen for up to 2 months',
          'Best served at room temperature',
          'Store covered at room temperature for up to 3 days'
        ],
        updatedAt: new Date().toISOString(),
      };

      const id = await recipeDB.add(testRecipe);
      setMessage(`✅ Test recipe created with ID: ${id}`);
      await loadAllRecipes();
    } catch (error) {
      console.error('Error creating test recipe:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const loadAllRecipes = async () => {
    setLoading(true);
    try {
      const allRecipes = await recipeDB.getAll();
      setRecipes(allRecipes);
      setMessage(`📊 Found ${allRecipes.length} recipe(s) in database`);
    } catch (error) {
      console.error('Error loading recipes:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const clearAllRecipes = async () => {
    if (!confirm('Are you sure you want to delete ALL recipes?')) return;

    setLoading(true);
    try {
      await recipeDB.clear();
      setRecipes([]);
      setMessage('🗑️ All recipes deleted');
    } catch (error) {
      console.error('Error clearing recipes:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportToJSON = async () => {
    setLoading(true);
    try {
      const allRecipes = await recipeDB.getAll();

      if (allRecipes.length === 0) {
        setMessage('⚠️ No recipes to export');
        setLoading(false);
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        recipeCount: allRecipes.length,
        recipes: allRecipes
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `recipes-export-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);

      setMessage(`✅ Exported ${allRecipes.length} recipes to JSON file`);
    } catch (error) {
      console.error('Error exporting recipes:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const importFromJSON = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.recipes || !Array.isArray(data.recipes)) {
        throw new Error('Invalid JSON format. Expected { recipes: [...] }');
      }

      let imported = 0;
      for (const recipe of data.recipes) {
        // Remove old ID to get new auto-increment ID
        const { id, ...recipeData } = recipe;
        await recipeDB.add(recipeData);
        imported++;
      }

      await loadAllRecipes();
      setMessage(`✅ Imported ${imported} recipes successfully!`);
    } catch (error) {
      console.error('Error importing recipes:', error);
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
      event.target.value = ''; // Reset file input
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Database Test Page</h1>
      <p>View existing recipes from IndexedDB or create test data</p>

      <Alert variant="info" style={{ marginTop: '15px' }}>
        <strong>Instructions:</strong> This page shows recipes currently in your IndexedDB database.
        Click "Edit Recipe" to load any recipe into the RecipeEditor.
      </Alert>

      {message && (
        <Alert variant={message.includes('❌') ? 'danger' : 'success'} style={{ marginTop: '20px' }}>
          {message}
        </Alert>
      )}

      <Card style={{ marginTop: '20px' }}>
        <h2 style={{ marginBottom: '15px' }}>Database Operations</h2>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button
            variant="primary"
            onClick={createTestRecipe}
            loading={loading}
          >
            Create Test Recipe
          </Button>

          <Button
            variant="secondary"
            onClick={loadAllRecipes}
            loading={loading}
          >
            Load All Recipes
          </Button>

          <Button
            variant="danger"
            onClick={clearAllRecipes}
            loading={loading}
          >
            Clear All Recipes
          </Button>
        </div>

        <div style={{ marginTop: '15px', paddingTop: '15px', borderTop: '1px solid #ddd' }}>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Import/Export</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="outline"
              onClick={exportToJSON}
              loading={loading}
            >
              📥 Export to JSON
            </Button>

            <label style={{ display: 'inline-block' }}>
              <Button
                variant="outline"
                onClick={() => document.getElementById('import-file').click()}
                loading={loading}
              >
                📤 Import from JSON
              </Button>
              <input
                id="import-file"
                type="file"
                accept=".json"
                onChange={importFromJSON}
                style={{ display: 'none' }}
              />
            </label>

            <span style={{ fontSize: '13px', color: '#666' }}>
              Use these to transfer recipes between apps or browsers
            </span>
          </div>
        </div>
      </Card>

      {recipes.length > 0 && (
        <Card style={{ marginTop: '20px' }}>
          <h2 style={{ marginBottom: '15px' }}>Recipes in Database ({recipes.length})</h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {recipes.map((recipe) => (
              <div
                key={recipe.id}
                style={{
                  padding: '15px',
                  border: '1px solid #ddd',
                  borderRadius: '8px',
                  background: '#f9f9f9'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 5px 0' }}>{recipe.name}</h3>
                    <p style={{ margin: '0 0 5px 0', color: '#666', fontSize: '14px' }}>
                      <strong>ID:</strong> {recipe.id} |
                      <strong> Category:</strong> {recipe.category} |
                      <strong> Portions:</strong> {recipe.portions} |
                      <strong> Department:</strong> {recipe.department || 'N/A'}
                    </p>
                    <p style={{ margin: '0', color: '#999', fontSize: '13px' }}>
                      📝 {recipe.ingredients?.length || 0} ingredients |
                      🔪 {Array.isArray(recipe.method) ? recipe.method.length : (recipe.method ? recipe.method.split('\n').filter(s => s.trim()).length : 0)} method steps |
                      {recipe.platingInstructions ? ` 🎨 ${recipe.platingInstructions.length} plating steps |` : ''}
                      {recipe.notes ? ` 📌 ${recipe.notes.length} notes` : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => window.location.href = `/recipes/${recipe.id}/edit`}
                  >
                    Edit Recipe
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {recipes.length === 0 && !loading && (
        <Card variant="outlined" style={{ marginTop: '20px', textAlign: 'center', padding: '40px' }}>
          <p style={{ color: '#999', margin: 0 }}>
            No recipes in database. Click "Create Test Recipe" to add one!
          </p>
        </Card>
      )}
    </div>
  );
}

export default DatabaseTestPage;
