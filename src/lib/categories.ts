import type { Recipe } from './types'

// Smart collections. A recipe belongs to a category when a keyword matches its
// title or tags — and, for ingredient-led categories (salmon/steak/pasta), its
// ingredient list. No schema change: this works with existing recipes today and
// the keyword lists can be tuned over time. A recipe can be in several
// categories (e.g. "Salmon Pasta" → Salmon and Pastas).

export type Category = {
  slug: string
  label: string
  emoji: string
  keywords: string[]
  scanIngredients?: boolean
}

export const CATEGORIES: Category[] = [
  {
    slug: 'breakfast',
    label: 'Breakfast',
    emoji: '🍳',
    keywords: [
      'breakfast', 'brunch', 'pancake', 'waffle', 'omelet', 'omelette', 'frittata',
      'scramble', 'egg', 'benedict', 'oatmeal', 'overnight oats', 'granola', 'muesli',
      'french toast', 'crepe', 'hash brown', 'muffin', 'smoothie bowl', 'chia pudding',
    ],
  },
  {
    slug: 'coffee',
    label: 'Coffee',
    emoji: '☕',
    keywords: [
      'coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'macchiato', 'affogato',
      'cortado', 'americano', 'cold brew', 'flat white', 'frappe', 'frappuccino',
    ],
  },
  {
    slug: 'drinks',
    label: 'Drinks',
    emoji: '🍹',
    keywords: [
      'drink', 'cocktail', 'mocktail', 'smoothie', 'juice', 'margarita', 'martini',
      'mojito', 'negroni', 'daiquiri', 'spritz', 'aperol', 'sangria', 'punch',
      'lemonade', 'milkshake', 'shake', 'soda', 'tonic', 'matcha', 'chai', 'iced tea',
      'tea', 'hot chocolate', 'eggnog', 'mule', 'gin', 'vodka', 'tequila', 'rum',
      'whiskey', 'bourbon',
      // NB: bare "wine" is intentionally NOT a keyword — it's a common cooking
      // ingredient ("white wine" garlic butter) and matched fish dishes as drinks.
      // classic cocktails by name (so e.g. "Old Fashioned" lands here + gets the 🍹 cover)
      'old fashioned', 'old-fashioned', 'manhattan', 'cosmopolitan', 'mai tai',
      'pina colada', 'colada', 'whiskey sour', 'gimlet', 'paloma', 'moscow mule',
      'bloody mary', 'mimosa', 'highball', 'cosmo', 'tom collins', 'french 75',
    ],
  },
  {
    slug: 'bread',
    label: 'Bread',
    emoji: '🍞',
    keywords: [
      'bread', 'sourdough', 'focaccia', 'baguette', 'brioche', 'ciabatta', 'loaf',
      'bun', 'roll', 'dinner roll', 'naan', 'pita', 'flatbread', 'bagel', 'pretzel',
      'cornbread', 'banana bread', 'biscuit', 'scone',
    ],
  },
  {
    slug: 'seafood',
    label: 'Seafood',
    emoji: '🐟',
    keywords: [
      'seafood', 'fish', 'shellfish', 'salmon', 'lox', 'tuna', 'ahi', 'shrimp', 'prawn',
      'crab', 'lobster', 'scallop', 'mussel', 'clam', 'oyster', 'squid', 'calamari',
      'octopus', 'anchovy', 'anchovies', 'sardine', 'trout', 'cod', 'halibut', 'tilapia',
      'snapper', 'mahi', 'sea bass', 'branzino', 'haddock', 'catfish', 'swordfish',
      'mackerel', 'herring', 'crawfish', 'crayfish',
    ],
    scanIngredients: true,
  },
  {
    slug: 'chicken',
    label: 'Chicken',
    emoji: '🍗',
    // Title/tags only — scanning ingredients would pull in anything using
    // "chicken broth/stock" (risottos, soups, etc.).
    keywords: ['chicken', 'poultry', 'wings', 'drumstick'],
  },
  {
    slug: 'steak',
    label: 'Steak',
    emoji: '🥩',
    keywords: [
      'steak', 'ribeye', 'sirloin', 'filet', 'tenderloin', 't-bone', 'porterhouse',
      'striploin', 'strip steak', 'flank steak', 'skirt steak',
    ],
    scanIngredients: true,
  },
  {
    slug: 'pastas',
    label: 'Pastas',
    emoji: '🍝',
    keywords: [
      'pasta', 'spaghetti', 'penne', 'rigatoni', 'linguine', 'fettuccine', 'tagliatelle',
      'lasagna', 'lasagne', 'carbonara', 'bolognese', 'gnocchi', 'orzo', 'macaroni',
      'mac and cheese', 'ravioli', 'tortellini', 'pappardelle', 'ziti', 'noodle',
      'alfredo', 'cacio e pepe',
    ],
    scanIngredients: true,
  },
  {
    slug: 'salads',
    label: 'Salads',
    emoji: '🥗',
    keywords: [
      'salad', 'slaw', 'coleslaw', 'caesar', 'caprese', 'cobb', 'panzanella',
      'tabbouleh', 'nicoise', 'greek salad', 'wedge salad', 'grain bowl',
    ],
  },
  {
    slug: 'soups',
    label: 'Soups & Chilis',
    emoji: '🍲',
    keywords: [
      'soup', 'chili', 'chilli', 'stew', 'bisque', 'chowder', 'broth', 'ramen', 'pho',
      'minestrone', 'gumbo', 'gazpacho', 'consomme', 'bouillabaisse', 'borscht',
      'lentil soup', 'tortilla soup', 'noodle soup',
    ],
  },
  {
    slug: 'mexican',
    label: 'Mexican',
    emoji: '🌮',
    keywords: [
      'mexican', 'taco', 'burrito', 'quesadilla', 'enchilada', 'fajita', 'nachos',
      'guacamole', 'salsa', 'tostada', 'tamale', 'tamales', 'carnitas', 'carne asada',
      'al pastor', 'barbacoa', 'chilaquiles', 'elote', 'tortilla', 'queso', 'pico de gallo',
      'mole', 'pozole', 'tinga', 'cotija', 'horchata', 'churro', 'churros', 'tex-mex',
    ],
  },
  {
    slug: 'asian',
    label: 'Asian',
    emoji: '🥢',
    keywords: [
      'asian', 'chinese', 'japanese', 'thai', 'korean', 'vietnamese', 'filipino',
      'indian', 'stir fry', 'stir-fry', 'fried rice', 'ramen', 'pho', 'pad thai',
      'sushi', 'teriyaki', 'tempura', 'dumpling', 'dumplings', 'gyoza', 'bao',
      'kimchi', 'bibimbap', 'bulgogi', 'katsu', 'curry', 'tikka masala', 'masala',
      'satay', 'lo mein', 'chow mein', 'spring roll', 'banh mi', 'miso', 'edamame',
      'dim sum', 'wonton', 'udon', 'soba', 'laksa', 'rendang', 'gochujang', 'teriyaki',
    ],
  },
]

// Single-word keywords match whole words (+ simple plural), so "egg" won't hit
// "eggplant" and "tea" won't hit "steak". Multi-word keywords match as phrases.
function compile(kw: string): RegExp | string {
  if (kw.includes(' ')) return kw
  const escaped = kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  return new RegExp(`\\b${escaped}(s|es)?\\b`, 'i')
}

const COMPILED = new Map<string, (RegExp | string)[]>(
  CATEGORIES.map((c) => [c.slug, c.keywords.map(compile)]),
)

function hit(text: string, matchers: (RegExp | string)[]): boolean {
  for (const m of matchers) {
    if (typeof m === 'string') {
      if (text.includes(m)) return true
    } else if (m.test(text)) {
      return true
    }
  }
  return false
}

export function recipeInCategory(recipe: Recipe, category: Category): boolean {
  const matchers = COMPILED.get(category.slug)
  if (!matchers) return false
  const base = `${recipe.title ?? ''} ${(recipe.tags ?? []).join(' ')}`.toLowerCase()
  if (hit(base, matchers)) return true
  if (category.scanIngredients && recipe.ingredients?.length) {
    let ing = recipe.ingredients.map((i) => i.item || i.raw || '').join(' ').toLowerCase()
    // "fish sauce" / "oyster sauce" are pantry staples in many non-seafood
    // dishes — drop those phrases so they don't false-match the Seafood scan.
    ing = ing.replace(/\b(fish|oyster)\s+sauce\b/g, ' ')
    if (hit(ing, matchers)) return true
  }
  return false
}

export function categoryBySlug(slug: string | undefined): Category | undefined {
  return CATEGORIES.find((c) => c.slug === slug)
}

// Warm, on-brand gradients (Tailwind classes) shared by the home tiles AND the
// photo-less recipe cover, so the two always match. Keyed by category slug, plus
// `all` (hero) and `default` (uncategorized fallback).
export const TILE_BG: Record<string, string> = {
  all: 'bg-gradient-to-br from-paprika-700 to-paprika-500',
  breakfast: 'bg-gradient-to-br from-amber-100 to-orange-50 dark:from-amber-900/40 dark:to-stone-100',
  coffee: 'bg-gradient-to-br from-amber-200/80 to-amber-50 dark:from-amber-950/50 dark:to-stone-100',
  drinks: 'bg-gradient-to-br from-rose-100 to-orange-50 dark:from-rose-900/30 dark:to-stone-100',
  bread: 'bg-gradient-to-br from-orange-100 to-amber-50 dark:from-orange-900/30 dark:to-stone-100',
  seafood: 'bg-gradient-to-br from-sky-100 to-cyan-50 dark:from-sky-900/30 dark:to-stone-100',
  chicken: 'bg-gradient-to-br from-orange-100 to-rose-50 dark:from-orange-900/25 dark:to-stone-100',
  steak: 'bg-gradient-to-br from-red-100 to-orange-50 dark:from-red-900/30 dark:to-stone-100',
  pastas: 'bg-gradient-to-br from-yellow-100 to-amber-50 dark:from-yellow-900/30 dark:to-stone-100',
  salads: 'bg-gradient-to-br from-lime-100 to-emerald-50 dark:from-lime-900/30 dark:to-stone-100',
  soups: 'bg-gradient-to-br from-orange-100 to-red-50 dark:from-orange-900/30 dark:to-stone-100',
  mexican: 'bg-gradient-to-br from-lime-100 to-yellow-50 dark:from-lime-900/30 dark:to-stone-100',
  asian: 'bg-gradient-to-br from-red-100 to-rose-50 dark:from-red-900/30 dark:to-stone-100',
  default: 'bg-gradient-to-br from-paprika-100 to-amber-50 dark:from-paprika-900/40 dark:to-stone-100',
}

// Pick a designed cover (gradient + emoji) for a recipe that has no photo. Uses
// the recipe's first matching category; falls back to a neutral plate motif.
export function coverFor(recipe: Recipe): { bg: string; emoji: string } {
  for (const c of CATEGORIES) {
    if (recipeInCategory(recipe, c)) return { bg: TILE_BG[c.slug] ?? TILE_BG.default, emoji: c.emoji }
  }
  return { bg: TILE_BG.default, emoji: '🍽️' }
}
