// Recipe Database Module
import { db, getCloudSync } from './db.js';

/**
 * Recipe Database
 * Handles recipe CRUD operations with auto-sync to cloud
 */
export const recipeDB = {
  /**
   * Get all recipes (use sparingly for large datasets - prefer paginated)
   */
  async getAll() {
    return await db.recipes.toArray();
  },

  /**
   * Get recipes with pagination support
   * @param {Object} options - Pagination options
   * @param {number} options.page - Page number (1-based)
   * @param {number} options.pageSize - Items per page (default: 20)
   * @param {string} options.sortBy - Field to sort by (default: 'updatedAt')
   * @param {boolean} options.sortDesc - Sort descending (default: true)
   * @returns {Promise<{recipes: Array, total: number, page: number, pageSize: number, totalPages: number}>}
   */
  async getPaginated({ page = 1, pageSize = 20, sortBy = 'updatedAt', sortDesc = true } = {}) {
    const total = await db.recipes.count();
    const totalPages = Math.ceil(total / pageSize);
    const offset = (page - 1) * pageSize;

    let collection = db.recipes.orderBy(sortBy);
    if (sortDesc) {
      collection = collection.reverse();
    }

    const recipes = await collection
      .offset(offset)
      .limit(pageSize)
      .toArray();

    return {
      recipes,
      total,
      page,
      pageSize,
      totalPages
    };
  },

  async getById(id) {
    return await db.recipes.get(id);
  },

  /**
   * Check if a recipe name already exists (uses indexed nameLower field)
   * @param {string} name - Recipe name to check
   * @param {number} excludeId - Optional ID to exclude (for updates)
   * @returns {Promise<boolean>} True if name exists
   */
  async nameExists(name, excludeId = null) {
    const normalizedName = name.trim().toLowerCase();

    // Use indexed query instead of filter for better performance
    const recipe = await db.recipes
      .where('nameLower')
      .equals(normalizedName)
      .first();

    if (!recipe) return false;

    if (excludeId !== null && excludeId !== undefined) {
      return Number(recipe.id) !== Number(excludeId);
    }
    return true;
  },

  async add(recipe) {
    // Check for duplicate name
    const nameExists = await this.nameExists(recipe.name);
    if (nameExists) {
      throw new Error(`A recipe with the name "${recipe.name}" already exists.`);
    }

    const recipeData = {
      ...recipe,
      nameLower: (recipe.name || '').toLowerCase().trim(), // Add nameLower for indexed search
      updatedAt: new Date().toISOString()
    };
    const id = await db.recipes.add(recipeData);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.pushRecipe({ ...recipeData, id });

    return id;
  },

  async update(id, updates) {
    // Check for duplicate name (excluding current recipe)
    if (updates.name) {
      const nameExists = await this.nameExists(updates.name, id);
      if (nameExists) {
        throw new Error(`A recipe with the name "${updates.name}" already exists.`);
      }
    }

    const updatedData = {
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // Update nameLower if name changed
    if (updates.name) {
      updatedData.nameLower = updates.name.toLowerCase().trim();
    }

    await db.recipes.update(id, updatedData);

    // Auto-sync to cloud
    const recipe = await db.recipes.get(id);
    if (recipe) {
      const sync = await getCloudSync();
      sync.pushRecipe(recipe);
    }
  },

  async delete(id) {
    await db.recipes.delete(id);

    // Auto-sync to cloud
    const sync = await getCloudSync();
    sync.deleteRecipeFromCloud(id);
  },

  /**
   * Search recipes by name (uses indexed nameLower for prefix matching)
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @param {number} options.limit - Max results (default: 50)
   * @returns {Promise<Array>} Matching recipes
   */
  async search(query, { limit = 50 } = {}) {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return [];
    }

    // Use indexed startsWith for prefix matching (fast)
    // Then filter for contains matching (handles mid-string matches)
    const prefixMatches = await db.recipes
      .where('nameLower')
      .startsWith(normalizedQuery)
      .limit(limit)
      .toArray();

    // If we have enough prefix matches, return them
    if (prefixMatches.length >= limit) {
      return prefixMatches;
    }

    // Otherwise, also search for contains (slower but more complete)
    const containsMatches = await db.recipes
      .filter(recipe =>
        recipe.nameLower?.includes(normalizedQuery) &&
        !prefixMatches.some(p => p.id === recipe.id)
      )
      .limit(limit - prefixMatches.length)
      .toArray();

    return [...prefixMatches, ...containsMatches];
  },

  /**
   * Get recipes by category (indexed query)
   */
  async getByCategory(category) {
    return await db.recipes
      .where('category')
      .equals(category)
      .toArray();
  },

  /**
   * Get recipes by department (indexed query)
   */
  async getByDepartment(department) {
    return await db.recipes
      .where('department')
      .equals(department)
      .toArray();
  },

  /**
   * Get recipes by department and category (compound index query - very fast)
   */
  async getByDepartmentAndCategory(department, category) {
    return await db.recipes
      .where('[department+category]')
      .equals([department, category])
      .toArray();
  },

  /**
   * Get recipe count by category (faster than fetching all records)
   */
  async countByCategory(category) {
    return await db.recipes
      .where('category')
      .equals(category)
      .count();
  },

  /**
   * Get total recipe count
   */
  async count() {
    return await db.recipes.count();
  },

  async clear() {
    await db.recipes.clear();
  }
};
