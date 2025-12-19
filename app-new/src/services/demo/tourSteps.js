/**
 * Guided Tour Steps Configuration
 *
 * Centralized configuration for all tour steps.
 * Easy to maintain and extend as the app grows.
 *
 * TOUR NARRATIVE (3 Phases):
 * 1. Recipe Import & Standardization - "From chaos to consistency"
 * 2. Ingredient Database & Cost Tracking - "Know your costs"
 * 3. Task Management & Team Coordination - "Organize your kitchen"
 *
 * Each step uses data-tour="step-id" selectors for stability.
 * If UI changes, just update the data-tour attribute on the component.
 */

// Tour step locale (French)
export const TOUR_LOCALE = {
  back: 'Précédent',
  close: 'Fermer',
  last: 'Terminer',
  next: 'Suivant',
  open: 'Ouvrir',
  skip: 'Passer la visite'
};

// Styles for the tour
export const TOUR_STYLES = {
  options: {
    primaryColor: '#3498db',
    zIndex: 10000,
    arrowColor: '#fff',
    backgroundColor: '#fff',
    textColor: '#333',
    overlayColor: 'rgba(0, 0, 0, 0.5)',
  },
  tooltipContainer: {
    textAlign: 'left',
  },
  tooltipTitle: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '10px',
  },
  tooltipContent: {
    fontSize: '14px',
    lineHeight: '1.6',
  },
  buttonNext: {
    backgroundColor: '#3498db',
    borderRadius: '6px',
    padding: '8px 16px',
  },
  buttonBack: {
    color: '#666',
    marginRight: '10px',
  },
  buttonSkip: {
    color: '#999',
  },
};

/**
 * Main Demo Tour Steps
 *
 * 3-Phase narrative flow:
 * Phase 1: Recipe Import & Standardization
 * Phase 2: Ingredient Database & Cost Tracking
 * Phase 3: Task Management & Team Coordination
 */
export const MAIN_TOUR_STEPS = [
  // ==========================================
  // WELCOME
  // ==========================================
  {
    target: 'body',
    content: `Bienvenue dans SmartCookBook!

Cette visite vous montrera comment transformer le chaos de vos recettes en un système organisé et professionnel.

En 3 étapes:
• Importation & standardisation des recettes
• Base de données d'ingrédients & suivi des coûts
• Gestion des tâches & coordination d'équipe`,
    title: 'Bienvenue Chef!',
    placement: 'center',
    disableBeacon: true,
  },

  // ==========================================
  // PHASE 1: RECIPE IMPORT & STANDARDIZATION
  // ==========================================
  {
    target: 'body',
    content: `**PHASE 1: Du chaos à la consistance**

Importez vos recettes de N'IMPORTE QUELLE source:
• PDF de recettes existantes
• Photos de fiches recettes
• Dictée vocale

L'IA convertit automatiquement tout en format standardisé!`,
    title: '📥 Importation de Recettes',
    placement: 'center',
    disableBeacon: true,
  },

  // Recipe list - show standardized format
  {
    target: '[data-tour="recipe-list"]',
    content: `Voici vos recettes, toutes dans un **format uniforme**:

• Nom, catégorie, portions
• Temps de préparation/cuisson
• Ingrédients avec quantités normalisées
• Méthode étape par étape
• Notes du chef

Cliquez sur une recette pour voir les détails!`,
    title: 'Format Standardisé',
    placement: 'right',
    disableBeacon: true,
  },

  // Menu button - import options
  {
    target: '[data-tour="menu-button"]',
    content: `Depuis ce menu, importez des recettes:

📄 **Import PDF** - Téléchargez un PDF, l'IA extrait la recette
📷 **Import Image** - Photographiez une fiche recette
📸 **Prendre Photo** - Utilisez la caméra directement

Toutes les sources → Un seul format!`,
    title: 'Sources Multiples',
    placement: 'left',
    disableBeacon: true,
  },

  // Voice toggle - dictation
  {
    target: '[data-tour="voice-toggle"]',
    content: `**Dictez vos recettes!**

Activez le micro et parlez:
"Poulet rôti, 4 portions, 1 heure 30..."

L'IA comprend et structure automatiquement:
• Convertit les abréviations (c. à soupe → 15ml)
• Normalise les unités pour le scaling
• Organise en sections logiques

Parfait quand vous avez les mains occupées!`,
    title: 'Dictée Vocale',
    placement: 'bottom',
    disableBeacon: true,
  },

  // Add recipe button
  {
    target: '[data-tour="add-recipe-button"]',
    content: `Créez une nouvelle recette manuellement.

**Édition facile:**
• Cliquez sur n'importe quel champ pour modifier
• Dictez une nouvelle méthode ou des notes
• Les quantités sont prêtes pour le scaling automatique

Essayez de cliquer sur une recette démo pour voir!`,
    title: 'Création & Édition',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ==========================================
  // PHASE 2: INGREDIENTS & COST TRACKING
  // ==========================================
  {
    target: 'body',
    content: `**PHASE 2: Connaissez vos coûts**

Construisez votre base de données d'ingrédients à partir de vos factures fournisseurs!

• Importez une facture (PDF/photo)
• L'IA extrait les articles et prix
• Liez aux ingrédients de vos recettes
• Calculez automatiquement le coût de chaque recette`,
    title: '💰 Gestion des Coûts',
    placement: 'center',
    disableBeacon: true,
  },

  // Menu - accounting/invoices
  {
    target: '[data-tour="menu-button"]',
    content: `Dans **Paramètres** ou **Control Panel**, accédez à:

📊 **Comptabilité** - Importez vos factures fournisseurs
🧾 **Liste des factures** - Historique des achats
🥕 **Ingrédients** - Base de données avec prix

L'IA extrait automatiquement les items et prix de vos factures!`,
    title: 'Import de Factures',
    placement: 'left',
    disableBeacon: true,
  },

  // Ingredient linking concept
  {
    target: '[data-tour="recipe-list"]',
    content: `**Liez vos ingrédients!**

Dans chaque recette, liez les ingrédients à votre inventaire:
• "Poulet" → Poulet entier @ 8.99$/kg
• "Beurre" → Beurre non-salé @ 9.99$/kg

Résultat:
✅ Coût de recette calculé automatiquement
✅ Inventaire qui baisse avec les tâches complétées (bientôt!)
✅ Liste de commandes suggérées`,
    title: 'Liaison Ingrédients',
    placement: 'right',
    disableBeacon: true,
  },

  // ==========================================
  // PHASE 3: TASK MANAGEMENT
  // ==========================================
  {
    target: 'body',
    content: `**PHASE 3: Organisez votre cuisine**

Assignez des recettes comme tâches à votre équipe:
• Définissez les priorités et heures de service
• L'équipe peut réclamer et compléter les tâches
• Suivez la progression en temps réel

Bientôt: Dictée AI de tâches en lot!
"Préparer 20 salades César, 15 saumons pour 18h"`,
    title: '📋 Gestion des Tâches',
    placement: 'center',
    disableBeacon: true,
  },

  // Tasks button
  {
    target: '[data-tour="tasks-button"]',
    content: `Accédez aux **tâches de l'équipe**:

• Voir toutes les tâches assignées
• Filtrer par station (Grill, Garde-manger, etc.)
• Réclamer une tâche disponible
• Marquer comme complétée

Parfait pour coordonner le service!`,
    title: 'Tâches d\'Équipe',
    placement: 'bottom',
    disableBeacon: true,
  },

  // Department selector
  {
    target: '[data-tour="department-selector"]',
    content: `**Organisez par département/station:**

• Cuisine Chaude
• Cuisine Froide
• Pâtisserie
• etc.

Chaque département voit ses propres tâches et recettes assignées.`,
    title: 'Départements',
    placement: 'bottom',
    disableBeacon: true,
  },

  // ==========================================
  // ADDITIONAL FEATURES
  // ==========================================
  {
    target: '[data-tour="search-bar"]',
    content: `**Recherche rapide:**

Tapez ou dictez pour trouver une recette instantanément.

Filtrez aussi par catégorie (entrées, plats, desserts...) avec le menu déroulant à côté.`,
    title: 'Recherche',
    placement: 'bottom',
    disableBeacon: true,
  },

  // Feedback button
  {
    target: '[data-tour="feedback"]',
    content: `**Nous sommes en bêta!**

Vous avez trouvé un bug? Une idée d'amélioration?

Cliquez ici pour nous envoyer vos commentaires directement. Votre feedback nous aide à construire l'outil parfait pour les chefs!`,
    title: 'Vos Commentaires',
    placement: 'top',
    disableBeacon: true,
  },

  // ==========================================
  // CLOSING
  // ==========================================
  {
    target: 'body',
    content: `**Vous êtes prêt à explorer!**

Récapitulatif:
1. 📥 **Importez** vos recettes (PDF, photo, dictée)
2. 💰 **Liez** les ingrédients pour calculer les coûts
3. 📋 **Assignez** des tâches à votre équipe

Cliquez sur une recette démo pour découvrir l'éditeur!

Bonne exploration, Chef! 👨‍🍳`,
    title: 'C\'est Parti!',
    placement: 'center',
    disableBeacon: true,
  },
];

/**
 * Recipe Editor Tour Steps
 * Shown when user first opens the recipe editor
 */
export const RECIPE_EDITOR_TOUR_STEPS = [
  {
    target: '[data-tour="recipe-name-input"]',
    content: 'Commencez par le nom de votre recette. Cliquez pour modifier à tout moment.',
    title: 'Nom de la Recette',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="recipe-portions"]',
    content: `**Scaling automatique!**

Changez le nombre de portions et toutes les quantités se recalculent.
4 portions → 40 portions en un clic!`,
    title: 'Portions & Scaling',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="ingredients-section"]',
    content: `**Ingrédients standardisés:**

• Quantités normalisées (prêtes pour scaling)
• Liez à votre inventaire pour les coûts
• Dictez pour ajouter rapidement`,
    title: 'Ingrédients',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="method-section"]',
    content: `**Méthode étape par étape:**

• Cochez les étapes pendant la préparation
• Dictez de nouvelles étapes
• Réorganisez par glisser-déposer`,
    title: 'Méthode',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="recipe-cost"]',
    content: `**Coût calculé automatiquement!**

Basé sur les ingrédients liés à votre base de données.
Mettez à jour les prix via l'import de factures.`,
    title: 'Coût de Recette',
    placement: 'left',
    disableBeacon: true,
  },
  {
    target: '[data-tour="save-recipe-button"]',
    content: 'N\'oubliez pas de sauvegarder vos modifications!',
    title: 'Sauvegarder',
    placement: 'bottom',
    disableBeacon: true,
  },
];

/**
 * Accounting/Invoice Tour Steps
 */
export const ACCOUNTING_TOUR_STEPS = [
  {
    target: '[data-tour="upload-invoice"]',
    content: `**Importez vos factures:**

Téléchargez un PDF ou une photo de facture.
L'IA extrait automatiquement:
• Nom du fournisseur
• Articles et quantités
• Prix unitaires et totaux`,
    title: 'Import de Facture',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    target: '[data-tour="invoice-list"]',
    content: 'Consultez l\'historique de vos factures importées et leur statut.',
    title: 'Historique',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="ingredients-prices"]',
    content: `**Base de données d'ingrédients:**

Les prix sont mis à jour automatiquement depuis vos factures.
Liez-les à vos recettes pour calculer les coûts!`,
    title: 'Prix Ingrédients',
    placement: 'top',
    disableBeacon: true,
  },
  {
    target: '[data-tour="quickbooks-connect"]',
    content: `**Intégration QuickBooks:**

Connectez votre compte pour synchroniser automatiquement les factures avec votre comptabilité.`,
    title: 'QuickBooks',
    placement: 'left',
    disableBeacon: true,
  },
];

/**
 * Get tour steps by tour name
 */
export function getTourSteps(tourName) {
  switch (tourName) {
    case 'main':
      return MAIN_TOUR_STEPS;
    case 'recipe-editor':
      return RECIPE_EDITOR_TOUR_STEPS;
    case 'accounting':
      return ACCOUNTING_TOUR_STEPS;
    default:
      return MAIN_TOUR_STEPS;
  }
}

/**
 * Check if a tour has been completed
 */
export function isTourCompleted(tourName) {
  try {
    const completed = localStorage.getItem(`smartcookbook_tour_${tourName}_completed`);
    return completed === 'true';
  } catch {
    return false;
  }
}

/**
 * Mark a tour as completed
 */
export function markTourCompleted(tourName) {
  try {
    localStorage.setItem(`smartcookbook_tour_${tourName}_completed`, 'true');
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset a tour (allow it to be shown again)
 */
export function resetTour(tourName) {
  try {
    localStorage.removeItem(`smartcookbook_tour_${tourName}_completed`);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Reset all tours
 */
export function resetAllTours() {
  resetTour('main');
  resetTour('recipe-editor');
  resetTour('accounting');
}

export default {
  MAIN_TOUR_STEPS,
  RECIPE_EDITOR_TOUR_STEPS,
  ACCOUNTING_TOUR_STEPS,
  TOUR_LOCALE,
  TOUR_STYLES,
  getTourSteps,
  isTourCompleted,
  markTourCompleted,
  resetTour,
  resetAllTours,
};
