/**
 * Demo Mode Sample Data
 *
 * Pre-populated recipes, ingredients, and invoices for demo mode
 */

// Sample ingredients with prices (Quebec suppliers)
export const DEMO_INGREDIENTS = [
  // Proteins
  { id: 1, name: 'Poulet entier', category: 'Viandes', unit: 'kg', price: 8.99, vendor: 'Sysco' },
  { id: 2, name: 'Poitrine de poulet', category: 'Viandes', unit: 'kg', price: 13.99, vendor: 'Sysco' },
  { id: 3, name: 'Boeuf haché mi-maigre', category: 'Viandes', unit: 'kg', price: 11.99, vendor: 'Sysco' },
  { id: 4, name: 'Filet de saumon', category: 'Poissons', unit: 'kg', price: 28.99, vendor: 'Poissonnerie Falero' },
  { id: 5, name: 'Crevettes 21-25', category: 'Poissons', unit: 'kg', price: 22.99, vendor: 'Poissonnerie Falero' },
  { id: 6, name: 'Bacon tranché', category: 'Viandes', unit: 'kg', price: 14.99, vendor: 'Sysco' },
  { id: 7, name: 'Pancetta', category: 'Viandes', unit: 'kg', price: 24.99, vendor: 'Distribution Alimentaire' },

  // Dairy
  { id: 10, name: 'Beurre non-salé', category: 'Produits laitiers', unit: 'kg', price: 9.99, vendor: 'Lactantia' },
  { id: 11, name: 'Crème 35%', category: 'Produits laitiers', unit: 'L', price: 6.99, vendor: 'Lactantia' },
  { id: 12, name: 'Lait 3.25%', category: 'Produits laitiers', unit: 'L', price: 2.49, vendor: 'Lactantia' },
  { id: 13, name: 'Parmesan Reggiano', category: 'Fromages', unit: 'kg', price: 42.99, vendor: 'Distribution Alimentaire' },
  { id: 14, name: 'Gruyère', category: 'Fromages', unit: 'kg', price: 32.99, vendor: 'Distribution Alimentaire' },
  { id: 15, name: 'Oeufs gros', category: 'Produits laitiers', unit: 'dz', price: 4.99, vendor: 'Sysco' },

  // Vegetables
  { id: 20, name: 'Oignons jaunes', category: 'Légumes', unit: 'kg', price: 1.99, vendor: 'Marché Central' },
  { id: 21, name: 'Ail', category: 'Légumes', unit: 'kg', price: 8.99, vendor: 'Marché Central' },
  { id: 22, name: 'Carottes', category: 'Légumes', unit: 'kg', price: 1.49, vendor: 'Marché Central' },
  { id: 23, name: 'Céleri', category: 'Légumes', unit: 'kg', price: 2.49, vendor: 'Marché Central' },
  { id: 24, name: 'Pommes de terre Yukon', category: 'Légumes', unit: 'kg', price: 1.99, vendor: 'Marché Central' },
  { id: 25, name: 'Tomates italiennes', category: 'Légumes', unit: 'kg', price: 3.99, vendor: 'Marché Central' },
  { id: 26, name: 'Champignons blancs', category: 'Légumes', unit: 'kg', price: 7.99, vendor: 'Marché Central' },
  { id: 27, name: 'Échalotes françaises', category: 'Légumes', unit: 'kg', price: 12.99, vendor: 'Marché Central' },
  { id: 28, name: 'Poireaux', category: 'Légumes', unit: 'kg', price: 4.99, vendor: 'Marché Central' },
  { id: 29, name: 'Épinards frais', category: 'Légumes', unit: 'kg', price: 8.99, vendor: 'Marché Central' },

  // Herbs & Aromatics
  { id: 30, name: 'Persil frais', category: 'Herbes', unit: 'botte', price: 1.99, vendor: 'Marché Central' },
  { id: 31, name: 'Thym frais', category: 'Herbes', unit: 'botte', price: 2.49, vendor: 'Marché Central' },
  { id: 32, name: 'Romarin frais', category: 'Herbes', unit: 'botte', price: 2.49, vendor: 'Marché Central' },
  { id: 33, name: 'Basilic frais', category: 'Herbes', unit: 'botte', price: 2.99, vendor: 'Marché Central' },
  { id: 34, name: 'Ciboulette', category: 'Herbes', unit: 'botte', price: 1.99, vendor: 'Marché Central' },

  // Pantry
  { id: 40, name: 'Farine tout-usage', category: 'Épicerie', unit: 'kg', price: 1.49, vendor: 'Sysco' },
  { id: 41, name: 'Sucre blanc', category: 'Épicerie', unit: 'kg', price: 1.29, vendor: 'Sysco' },
  { id: 42, name: 'Huile d\'olive extra-vierge', category: 'Épicerie', unit: 'L', price: 12.99, vendor: 'Distribution Alimentaire' },
  { id: 43, name: 'Huile végétale', category: 'Épicerie', unit: 'L', price: 3.49, vendor: 'Sysco' },
  { id: 44, name: 'Vinaigre balsamique', category: 'Épicerie', unit: 'L', price: 14.99, vendor: 'Distribution Alimentaire' },
  { id: 45, name: 'Vin blanc sec (cuisine)', category: 'Épicerie', unit: 'L', price: 8.99, vendor: 'SAQ' },
  { id: 46, name: 'Fond de veau', category: 'Épicerie', unit: 'L', price: 6.99, vendor: 'Sysco' },
  { id: 47, name: 'Fond de poulet', category: 'Épicerie', unit: 'L', price: 4.99, vendor: 'Sysco' },
  { id: 48, name: 'Tomates San Marzano (conserve)', category: 'Épicerie', unit: 'can', price: 3.99, vendor: 'Distribution Alimentaire' },
  { id: 49, name: 'Pâtes spaghetti', category: 'Épicerie', unit: 'kg', price: 2.99, vendor: 'Sysco' },
  { id: 50, name: 'Riz arborio', category: 'Épicerie', unit: 'kg', price: 6.99, vendor: 'Distribution Alimentaire' },

  // Spices
  { id: 60, name: 'Sel de mer', category: 'Épices', unit: 'kg', price: 2.99, vendor: 'Sysco' },
  { id: 61, name: 'Poivre noir moulu', category: 'Épices', unit: 'kg', price: 24.99, vendor: 'Sysco' },
  { id: 62, name: 'Paprika fumé', category: 'Épices', unit: 'kg', price: 32.99, vendor: 'Épices de Cru' },
  { id: 63, name: 'Cumin moulu', category: 'Épices', unit: 'kg', price: 18.99, vendor: 'Épices de Cru' },
  { id: 64, name: 'Herbes de Provence', category: 'Épices', unit: 'kg', price: 28.99, vendor: 'Épices de Cru' },
];

// Sample recipes
export const DEMO_RECIPES = [
  {
    id: 1,
    name: 'Poulet Rôti aux Herbes',
    category: 'Plats principaux',
    department: 'Cuisine Chaude',
    portions: 4,
    prepTime: 20,
    cookTime: 75,
    ingredients: [
      { quantity: '1.5', unit: 'kg', name: 'Poulet entier', linkedIngredientId: 1 },
      { quantity: '30', unit: 'g', name: 'Beurre non-salé', linkedIngredientId: 10 },
      { quantity: '4', unit: 'gousses', name: 'Ail', linkedIngredientId: 21 },
      { quantity: '1', unit: 'botte', name: 'Thym frais', linkedIngredientId: 31 },
      { quantity: '1', unit: 'botte', name: 'Romarin frais', linkedIngredientId: 32 },
      { quantity: '30', unit: 'ml', name: 'Huile d\'olive extra-vierge', linkedIngredientId: 42 },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Préchauffer le four à 425°F (220°C).',
      'Sortir le poulet du réfrigérateur 30 minutes avant la cuisson.',
      'Mélanger le beurre ramolli avec l\'ail haché, le thym et le romarin.',
      'Glisser le beurre aux herbes sous la peau du poulet.',
      'Frotter l\'extérieur avec l\'huile d\'olive, saler et poivrer.',
      'Rôtir 1h15 ou jusqu\'à ce que la température interne atteigne 165°F.',
      'Laisser reposer 10 minutes avant de découper.'
    ],
    plating: [
      'Découper le poulet en 8 morceaux.',
      'Disposer sur un plat de service chaud.',
      'Arroser du jus de cuisson.',
      'Garnir de thym frais.'
    ],
    notes: ['Le poulet doit être à température ambiante avant cuisson pour une cuisson uniforme.'],
    imageUrl: null
  },
  {
    id: 2,
    name: 'Risotto aux Champignons',
    category: 'Plats principaux',
    department: 'Cuisine Chaude',
    portions: 4,
    prepTime: 15,
    cookTime: 25,
    ingredients: [
      { quantity: '300', unit: 'g', name: 'Riz arborio', linkedIngredientId: 50 },
      { quantity: '400', unit: 'g', name: 'Champignons blancs', linkedIngredientId: 26 },
      { quantity: '100', unit: 'g', name: 'Échalotes françaises', linkedIngredientId: 27 },
      { quantity: '1', unit: 'L', name: 'Fond de poulet', linkedIngredientId: 47 },
      { quantity: '100', unit: 'ml', name: 'Vin blanc sec', linkedIngredientId: 45 },
      { quantity: '60', unit: 'g', name: 'Parmesan Reggiano', linkedIngredientId: 13 },
      { quantity: '30', unit: 'g', name: 'Beurre non-salé', linkedIngredientId: 10 },
      { quantity: '30', unit: 'ml', name: 'Huile d\'olive extra-vierge', linkedIngredientId: 42 },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Chauffer le fond de poulet et garder au chaud.',
      'Faire sauter les champignons dans l\'huile jusqu\'à dorés. Réserver.',
      'Dans la même casserole, faire suer les échalotes dans le beurre.',
      'Ajouter le riz et nacrer 2 minutes.',
      'Déglacer au vin blanc et laisser absorber.',
      'Ajouter le bouillon une louche à la fois, en remuant constamment.',
      'Après 18-20 minutes, incorporer les champignons et le parmesan.',
      'Ajuster l\'assaisonnement et servir immédiatement.'
    ],
    plating: [
      'Servir dans des assiettes creuses chaudes.',
      'Garnir de copeaux de parmesan.',
      'Ajouter un filet d\'huile d\'olive.',
      'Décorer de persil frais.'
    ],
    notes: ['Le risotto n\'attend pas - servir dès qu\'il est prêt.'],
    imageUrl: null
  },
  {
    id: 3,
    name: 'Spaghetti Carbonara',
    category: 'Pâtes',
    department: 'Cuisine Chaude',
    portions: 4,
    prepTime: 10,
    cookTime: 15,
    ingredients: [
      { quantity: '400', unit: 'g', name: 'Pâtes spaghetti', linkedIngredientId: 49 },
      { quantity: '200', unit: 'g', name: 'Pancetta', linkedIngredientId: 7 },
      { quantity: '4', unit: '', name: 'Oeufs gros', linkedIngredientId: 15 },
      { quantity: '100', unit: 'g', name: 'Parmesan Reggiano', linkedIngredientId: 13 },
      { quantity: '3', unit: 'gousses', name: 'Ail', linkedIngredientId: 21 },
      { quantity: '30', unit: 'ml', name: 'Huile d\'olive extra-vierge', linkedIngredientId: 42 },
      { quantity: '5', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Cuire les pâtes dans une grande quantité d\'eau salée.',
      'Pendant ce temps, faire revenir la pancetta avec l\'ail dans l\'huile.',
      'Battre les oeufs avec le parmesan râpé et le poivre.',
      'Égoutter les pâtes en réservant 100ml d\'eau de cuisson.',
      'Retirer la poêle du feu, ajouter les pâtes chaudes.',
      'Verser le mélange oeufs-fromage et mélanger rapidement.',
      'Ajouter un peu d\'eau de cuisson si nécessaire.',
      'Servir immédiatement avec du parmesan supplémentaire.'
    ],
    plating: [
      'Twister les pâtes dans une assiette creuse chaude.',
      'Garnir de parmesan râpé.',
      'Ajouter un tour de moulin à poivre.',
      'Décorer d\'un jaune d\'oeuf si désiré.'
    ],
    notes: ['Ne jamais ajouter de crème - la vraie carbonara n\'en contient pas!'],
    imageUrl: null
  },
  {
    id: 4,
    name: 'Filet de Saumon Grillé',
    category: 'Poissons',
    department: 'Cuisine Chaude',
    portions: 4,
    prepTime: 10,
    cookTime: 12,
    ingredients: [
      { quantity: '600', unit: 'g', name: 'Filet de saumon', linkedIngredientId: 4 },
      { quantity: '30', unit: 'ml', name: 'Huile d\'olive extra-vierge', linkedIngredientId: 42 },
      { quantity: '1', unit: '', name: 'Citron', specification: 'jus et zeste' },
      { quantity: '2', unit: 'gousses', name: 'Ail', linkedIngredientId: 21 },
      { quantity: '15', unit: 'g', name: 'Beurre non-salé', linkedIngredientId: 10 },
      { quantity: '1', unit: 'botte', name: 'Aneth frais' },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Sortir le saumon du réfrigérateur 15 minutes avant cuisson.',
      'Préchauffer le grill ou la poêle à feu vif.',
      'Badigeonner le saumon d\'huile, saler et poivrer.',
      'Griller côté peau 4 minutes sans bouger.',
      'Retourner et cuire 3-4 minutes selon l\'épaisseur.',
      'Retirer du feu, ajouter une noix de beurre et le jus de citron.',
      'Laisser reposer 2 minutes avant de servir.'
    ],
    plating: [
      'Déposer le filet au centre de l\'assiette.',
      'Napper du beurre citronné.',
      'Garnir d\'aneth frais.',
      'Accompagner de légumes de saison.'
    ],
    notes: ['Le saumon continue de cuire après retrait du feu - le sortir légèrement rosé au centre.'],
    imageUrl: null
  },
  {
    id: 5,
    name: 'Soupe à l\'Oignon Gratinée',
    category: 'Soupes',
    department: 'Cuisine Chaude',
    portions: 6,
    prepTime: 20,
    cookTime: 60,
    ingredients: [
      { quantity: '1', unit: 'kg', name: 'Oignons jaunes', linkedIngredientId: 20 },
      { quantity: '60', unit: 'g', name: 'Beurre non-salé', linkedIngredientId: 10 },
      { quantity: '1.5', unit: 'L', name: 'Fond de veau', linkedIngredientId: 46 },
      { quantity: '200', unit: 'ml', name: 'Vin blanc sec', linkedIngredientId: 45 },
      { quantity: '200', unit: 'g', name: 'Gruyère', linkedIngredientId: 14 },
      { quantity: '6', unit: 'tranches', name: 'Pain baguette' },
      { quantity: '3', unit: 'gousses', name: 'Ail', linkedIngredientId: 21 },
      { quantity: '1', unit: 'botte', name: 'Thym frais', linkedIngredientId: 31 },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Émincer finement les oignons.',
      'Faire fondre le beurre dans une grande casserole.',
      'Ajouter les oignons, cuire à feu doux 45 minutes jusqu\'à caramélisation.',
      'Ajouter l\'ail et le thym, cuire 2 minutes.',
      'Déglacer au vin blanc, laisser réduire.',
      'Ajouter le fond de veau, porter à ébullition puis mijoter 15 minutes.',
      'Griller les tranches de pain.',
      'Verser la soupe dans des bols allant au four.',
      'Déposer le pain et couvrir de gruyère râpé.',
      'Gratiner au four à broil jusqu\'à doré.'
    ],
    plating: [
      'Servir immédiatement dans le bol de cuisson.',
      'Attention: le bol est très chaud!',
      'Accompagner d\'une salade verte.'
    ],
    notes: ['La caramélisation lente des oignons est la clé du goût - ne pas précipiter cette étape.'],
    imageUrl: null
  },
  {
    id: 6,
    name: 'Salade César Classique',
    category: 'Salades',
    department: 'Cuisine Froide',
    portions: 4,
    prepTime: 20,
    cookTime: 0,
    ingredients: [
      { quantity: '2', unit: '', name: 'Laitue romaine', specification: 'coeurs' },
      { quantity: '100', unit: 'g', name: 'Parmesan Reggiano', linkedIngredientId: 13 },
      { quantity: '4', unit: '', name: 'Anchois' },
      { quantity: '2', unit: '', name: 'Oeufs gros', linkedIngredientId: 15, specification: 'jaunes seulement' },
      { quantity: '3', unit: 'gousses', name: 'Ail', linkedIngredientId: 21 },
      { quantity: '15', unit: 'ml', name: 'Jus de citron' },
      { quantity: '5', unit: 'ml', name: 'Sauce Worcestershire' },
      { quantity: '5', unit: 'ml', name: 'Moutarde de Dijon' },
      { quantity: '150', unit: 'ml', name: 'Huile d\'olive extra-vierge', linkedIngredientId: 42 },
      { quantity: '100', unit: 'g', name: 'Croûtons maison' },
    ],
    method: [
      'Préparer la vinaigrette: écraser l\'ail et les anchois en pâte.',
      'Ajouter les jaunes d\'oeufs, la moutarde et le jus de citron.',
      'Émulsionner en ajoutant l\'huile en filet.',
      'Incorporer la sauce Worcestershire et ajuster l\'assaisonnement.',
      'Laver et essorer la laitue, couper en morceaux.',
      'Mélanger la laitue avec la vinaigrette.',
      'Ajouter les croûtons et les copeaux de parmesan.'
    ],
    plating: [
      'Servir dans des assiettes froides.',
      'Garnir de copeaux de parmesan.',
      'Ajouter quelques croûtons sur le dessus.',
      'Donner un tour de moulin à poivre.'
    ],
    notes: ['La vraie César se fait avec des oeufs crus - utiliser des oeufs très frais ou pasteurisés.'],
    imageUrl: null
  },
  {
    id: 7,
    name: 'Crème Brûlée à la Vanille',
    category: 'Desserts',
    department: 'Pâtisserie',
    portions: 6,
    prepTime: 20,
    cookTime: 45,
    ingredients: [
      { quantity: '500', unit: 'ml', name: 'Crème 35%', linkedIngredientId: 11 },
      { quantity: '100', unit: 'ml', name: 'Lait 3.25%', linkedIngredientId: 12 },
      { quantity: '6', unit: '', name: 'Oeufs gros', linkedIngredientId: 15, specification: 'jaunes seulement' },
      { quantity: '100', unit: 'g', name: 'Sucre blanc', linkedIngredientId: 41 },
      { quantity: '1', unit: '', name: 'Gousse de vanille' },
      { quantity: '60', unit: 'g', name: 'Sucre blanc', linkedIngredientId: 41, specification: 'pour caraméliser' },
    ],
    method: [
      'Préchauffer le four à 300°F (150°C).',
      'Fendre la gousse de vanille et gratter les graines.',
      'Chauffer la crème et le lait avec la vanille jusqu\'à frémissement.',
      'Fouetter les jaunes avec le sucre jusqu\'à blanchiment.',
      'Verser la crème chaude sur les jaunes en fouettant.',
      'Passer au tamis et répartir dans 6 ramequins.',
      'Cuire au bain-marie 40-45 minutes.',
      'Réfrigérer au moins 4 heures.',
      'Avant de servir, saupoudrer de sucre et caraméliser au chalumeau.'
    ],
    plating: [
      'Servir dans le ramequin sur une assiette avec serviette.',
      'Décorer d\'une framboise ou d\'une feuille de menthe.',
      'Servir immédiatement après avoir caramélisé.'
    ],
    notes: ['La crème doit être prise mais encore tremblotante au centre après cuisson.'],
    imageUrl: null
  },
  {
    id: 8,
    name: 'Pâté Chinois',
    category: 'Plats principaux',
    department: 'Cuisine Chaude',
    portions: 8,
    prepTime: 30,
    cookTime: 45,
    ingredients: [
      { quantity: '750', unit: 'g', name: 'Boeuf haché mi-maigre', linkedIngredientId: 3 },
      { quantity: '1', unit: 'kg', name: 'Pommes de terre Yukon', linkedIngredientId: 24 },
      { quantity: '500', unit: 'g', name: 'Maïs en crème' },
      { quantity: '200', unit: 'g', name: 'Oignons jaunes', linkedIngredientId: 20 },
      { quantity: '60', unit: 'g', name: 'Beurre non-salé', linkedIngredientId: 10 },
      { quantity: '100', unit: 'ml', name: 'Lait 3.25%', linkedIngredientId: 12 },
      { quantity: '5', unit: 'g', name: 'Paprika fumé', linkedIngredientId: 62 },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Cuire les pommes de terre dans l\'eau salée jusqu\'à tendreté.',
      'Pendant ce temps, faire revenir les oignons dans un peu de beurre.',
      'Ajouter le boeuf haché, cuire jusqu\'à coloration.',
      'Assaisonner de sel, poivre et paprika.',
      'Écraser les pommes de terre avec le beurre et le lait chaud.',
      'Dans un plat à gratin, étager: viande, maïs, purée.',
      'Créer un motif à la fourchette sur le dessus.',
      'Cuire au four à 375°F (190°C) pendant 30 minutes.',
      'Terminer sous le grill pour dorer.'
    ],
    plating: [
      'Servir directement du plat à la table.',
      'Ou portionner dans des assiettes chaudes.',
      'Accompagner de ketchup (tradition québécoise!).'
    ],
    notes: ['Classique québécois - parfait pour les repas de famille.'],
    imageUrl: null
  },
  {
    id: 9,
    name: 'Velouté de Poireaux',
    category: 'Soupes',
    department: 'Cuisine Chaude',
    portions: 6,
    prepTime: 15,
    cookTime: 30,
    ingredients: [
      { quantity: '500', unit: 'g', name: 'Poireaux', linkedIngredientId: 28 },
      { quantity: '300', unit: 'g', name: 'Pommes de terre Yukon', linkedIngredientId: 24 },
      { quantity: '1', unit: 'L', name: 'Fond de poulet', linkedIngredientId: 47 },
      { quantity: '200', unit: 'ml', name: 'Crème 35%', linkedIngredientId: 11 },
      { quantity: '30', unit: 'g', name: 'Beurre non-salé', linkedIngredientId: 10 },
      { quantity: '1', unit: 'botte', name: 'Ciboulette', linkedIngredientId: 34 },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Nettoyer les poireaux et émincer le blanc et le vert pâle.',
      'Faire suer les poireaux dans le beurre sans coloration.',
      'Ajouter les pommes de terre en cubes et le bouillon.',
      'Cuire 25 minutes jusqu\'à tendreté.',
      'Mixer jusqu\'à consistance veloutée.',
      'Incorporer la crème et ajuster l\'assaisonnement.',
      'Passer au tamis fin pour un velouté parfait.'
    ],
    plating: [
      'Verser dans des bols chauds.',
      'Décorer d\'un filet de crème.',
      'Parsemer de ciboulette ciselée.',
      'Servir avec des croûtons.'
    ],
    notes: ['Peut se servir chaud ou froid (vichyssoise).'],
    imageUrl: null
  },
  {
    id: 10,
    name: 'Tartare de Boeuf',
    category: 'Entrées',
    department: 'Cuisine Froide',
    portions: 4,
    prepTime: 25,
    cookTime: 0,
    ingredients: [
      { quantity: '400', unit: 'g', name: 'Filet de boeuf', specification: 'très frais' },
      { quantity: '50', unit: 'g', name: 'Échalotes françaises', linkedIngredientId: 27 },
      { quantity: '30', unit: 'g', name: 'Câpres' },
      { quantity: '30', unit: 'g', name: 'Cornichons' },
      { quantity: '2', unit: '', name: 'Oeufs gros', linkedIngredientId: 15, specification: 'jaunes seulement' },
      { quantity: '15', unit: 'ml', name: 'Huile d\'olive extra-vierge', linkedIngredientId: 42 },
      { quantity: '10', unit: 'ml', name: 'Sauce Worcestershire' },
      { quantity: '10', unit: 'ml', name: 'Moutarde de Dijon' },
      { quantity: '5', unit: 'ml', name: 'Tabasco' },
      { quantity: '1', unit: 'botte', name: 'Persil frais', linkedIngredientId: 30 },
      { quantity: '5', unit: 'g', name: 'Sel de mer', linkedIngredientId: 60 },
      { quantity: '2', unit: 'g', name: 'Poivre noir moulu', linkedIngredientId: 61 },
    ],
    method: [
      'Hacher finement le boeuf au couteau (jamais au robot).',
      'Ciseler les échalotes, câpres, cornichons et persil.',
      'Mélanger la viande avec tous les condiments.',
      'Assaisonner de sel, poivre, Worcestershire et Tabasco.',
      'Ajouter l\'huile d\'olive et la moutarde.',
      'Goûter et ajuster l\'assaisonnement.',
      'Réfrigérer jusqu\'au service.'
    ],
    plating: [
      'Mouler le tartare à l\'emporte-pièce au centre de l\'assiette.',
      'Créer un puits et y déposer le jaune d\'oeuf.',
      'Entourer de frites maison ou de salade.',
      'Servir avec des toasts grillés.'
    ],
    notes: ['Utiliser uniquement du boeuf de première qualité, très frais. Garder au froid jusqu\'au dernier moment.'],
    imageUrl: null
  }
];

// Sample invoice for demo
export const DEMO_INVOICES = [
  {
    id: 1,
    invoiceNumber: 'INV-2025-001',
    vendorName: 'Sysco Montréal',
    invoiceDate: '2025-12-01',
    dueDate: '2025-12-31',
    subtotal: 485.75,
    taxes: 72.86,
    total: 558.61,
    status: 'pending',
    items: [
      { description: 'Poulet entier', quantity: 10, unit: 'kg', unitPrice: 8.99, total: 89.90 },
      { description: 'Boeuf haché mi-maigre', quantity: 15, unit: 'kg', unitPrice: 11.99, total: 179.85 },
      { description: 'Bacon tranché', quantity: 5, unit: 'kg', unitPrice: 14.99, total: 74.95 },
      { description: 'Oeufs gros', quantity: 10, unit: 'dz', unitPrice: 4.99, total: 49.90 },
      { description: 'Farine tout-usage', quantity: 20, unit: 'kg', unitPrice: 1.49, total: 29.80 },
      { description: 'Sucre blanc', quantity: 15, unit: 'kg', unitPrice: 1.29, total: 19.35 },
      { description: 'Huile végétale', quantity: 12, unit: 'L', unitPrice: 3.49, total: 41.88 },
    ],
    createdAt: new Date('2025-12-01').toISOString(),
  },
  {
    id: 2,
    invoiceNumber: 'FAL-2025-0892',
    vendorName: 'Poissonnerie Falero',
    invoiceDate: '2025-12-03',
    dueDate: '2025-12-17',
    subtotal: 362.93,
    taxes: 54.44,
    total: 417.37,
    status: 'approved',
    items: [
      { description: 'Filet de saumon', quantity: 8, unit: 'kg', unitPrice: 28.99, total: 231.92 },
      { description: 'Crevettes 21-25', quantity: 5, unit: 'kg', unitPrice: 22.99, total: 114.95 },
      { description: 'Moules fraîches', quantity: 4, unit: 'kg', unitPrice: 4.99, total: 19.96 },
    ],
    createdAt: new Date('2025-12-03').toISOString(),
    qbBillId: 'QB-12345',
  }
];

// Demo departments
export const DEMO_DEPARTMENTS = [
  { id: 'demo-dept-1', name: 'Cuisine Chaude', description: 'Hot kitchen station' },
  { id: 'demo-dept-2', name: 'Cuisine Froide', description: 'Cold kitchen station' },
  { id: 'demo-dept-3', name: 'Pâtisserie', description: 'Pastry and desserts' },
];

// Demo team members (privileges)
export const DEMO_TEAM_MEMBERS = [
  { id: 'demo-chef', name: 'Chef Martin', accessLevel: 'owner', departments: null, pin: '1234' },
  { id: 'demo-sous', name: 'Sophie (Sous-chef)', accessLevel: 'editor', departments: ['Cuisine Chaude', 'Cuisine Froide'], pin: '5678' },
  { id: 'demo-pastry', name: 'Pierre (Pâtissier)', accessLevel: 'editor', departments: ['Pâtisserie'], pin: '9999' },
  { id: 'demo-commis', name: 'Marie (Commis)', accessLevel: 'viewer', departments: ['Cuisine Chaude'], pin: null },
];

// Demo tasks
export const DEMO_TASKS = [
  {
    id: 'demo-task-1',
    type: 'recipe',
    recipeId: 1,
    recipeName: 'Poulet Rôti aux Herbes',
    portions: 8,
    scaleFactor: 2,
    department: 'Cuisine Chaude',
    station: 'Rôtisserie',
    assignedTo: 'demo-sous',
    assignedToName: 'Sophie (Sous-chef)',
    status: 'in_progress',
    priority: 'high',
    dueDate: new Date(new Date().setHours(17, 0, 0, 0)),
    chefNotes: 'Pour le service du soir - table 12',
    createdAt: new Date(new Date().setHours(10, 0, 0, 0)),
    createdBy: 'demo-chef',
  },
  {
    id: 'demo-task-2',
    type: 'recipe',
    recipeId: 5,
    recipeName: 'Crème Brûlée à la Vanille',
    portions: 20,
    scaleFactor: 4,
    department: 'Pâtisserie',
    station: 'Desserts',
    assignedTo: 'demo-pastry',
    assignedToName: 'Pierre (Pâtissier)',
    status: 'pending',
    priority: 'normal',
    dueDate: new Date(new Date().setHours(16, 0, 0, 0)),
    chefNotes: 'Brûler au chalumeau au moment du service',
    createdAt: new Date(new Date().setHours(9, 0, 0, 0)),
    createdBy: 'demo-chef',
  },
  {
    id: 'demo-task-3',
    type: 'recipe',
    recipeId: 4,
    recipeName: 'Filet de Saumon Grillé',
    portions: 12,
    scaleFactor: 3,
    department: 'Cuisine Chaude',
    station: 'Grill',
    assignedTo: null,
    assignedToName: null,
    status: 'pending',
    priority: 'urgent',
    dueDate: new Date(new Date().setHours(12, 30, 0, 0)),
    chefNotes: 'URGENT - Groupe de 12 personnes pour le lunch',
    createdAt: new Date(new Date().setHours(8, 30, 0, 0)),
    createdBy: 'demo-chef',
  },
  {
    id: 'demo-task-4',
    type: 'custom',
    recipeId: null,
    recipeName: 'Mise en place légumes',
    portions: null,
    scaleFactor: null,
    department: 'Cuisine Chaude',
    station: 'Préparation',
    assignedTo: null,
    assignedToName: null,
    status: 'pending',
    priority: 'normal',
    dueDate: new Date(new Date().setHours(11, 0, 0, 0)),
    chefNotes: 'Couper oignons, carottes, céleri pour le service',
    createdAt: new Date(new Date().setHours(7, 0, 0, 0)),
    createdBy: 'demo-chef',
  },
  {
    id: 'demo-task-5',
    type: 'recipe',
    recipeId: 7,
    recipeName: 'Salade César Classique',
    portions: 30,
    scaleFactor: 6,
    department: 'Cuisine Froide',
    station: 'Garde-manger',
    assignedTo: 'demo-sous',
    assignedToName: 'Sophie (Sous-chef)',
    status: 'completed',
    priority: 'normal',
    dueDate: new Date(new Date().setHours(11, 30, 0, 0)),
    chefNotes: 'Préparation pour le buffet lunch',
    createdAt: new Date(new Date().setHours(8, 0, 0, 0)),
    createdBy: 'demo-chef',
    completedAt: new Date(new Date().setHours(11, 15, 0, 0)),
  },
];

// Demo tour steps
export const DEMO_TOUR_STEPS = [
  {
    id: 'welcome',
    title: 'Bienvenue dans SmartCookBook!',
    content: 'Découvrez comment gérer vos recettes professionnelles. Cette démo contient 10 recettes et des ingrédients pré-configurés.',
    target: null,
    placement: 'center'
  },
  {
    id: 'recipes',
    title: 'Explorez les recettes',
    content: 'Cliquez sur une recette pour voir les détails, les ingrédients liés et le calcul des coûts automatique.',
    target: '[data-tour="recipe-list"]',
    placement: 'bottom'
  },
  {
    id: 'voice',
    title: 'Entrée vocale',
    content: 'Activez le microphone pour dicter des ingrédients, des étapes ou des notes sans toucher l\'écran.',
    target: '[data-tour="mic-button"]',
    placement: 'bottom'
  },
  {
    id: 'import',
    title: 'Importez vos recettes',
    content: 'Importez des recettes depuis un PDF, une photo ou dictez-les directement.',
    target: '[data-tour="import-menu"]',
    placement: 'bottom'
  },
  {
    id: 'scaling',
    title: 'Calcul des portions',
    content: 'Ajustez le nombre de portions et toutes les quantités se recalculent automatiquement.',
    target: '[data-tour="portions"]',
    placement: 'left'
  },
  {
    id: 'costs',
    title: 'Coût des recettes',
    content: 'Liez vos ingrédients aux prix fournisseurs pour calculer le coût réel de chaque recette.',
    target: '[data-tour="recipe-cost"]',
    placement: 'left'
  },
  {
    id: 'invoices',
    title: 'Gestion des factures',
    content: 'Importez vos factures fournisseurs pour mettre à jour automatiquement les prix des ingrédients.',
    target: '[data-tour="invoices"]',
    placement: 'bottom'
  },
  {
    id: 'quickbooks',
    title: 'Intégration QuickBooks',
    content: 'Connectez QuickBooks pour créer automatiquement des factures à partir de vos achats.',
    target: '[data-tour="quickbooks"]',
    placement: 'left'
  },
  {
    id: 'feedback',
    title: 'Donnez votre avis!',
    content: 'Utilisez le bouton de feedback pour signaler des bugs ou suggérer des améliorations.',
    target: '[data-tour="feedback"]',
    placement: 'left'
  }
];
