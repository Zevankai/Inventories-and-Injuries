export type Currency = {
  cp: number;
  sp: number;
  gp: number;
  pp: number;
};

export type TokenType = 'player' | 'npc' | 'party' | 'lore' | 'monster' | 'merchant';

export interface Theme {
  accent: string;
  background: string;
}

export type Tab = 'Home' | 'Pack' | 'Weapons' | 'Body' | 'Quick' | 'Coin' | 'Create' | 'External' | 'Search' | 'Transfer' | 'GM' | 'Reputation' | 'LoreSettings' | 'Spells' | 'Calendar' | 'Loot' | 'Actions' | 'Monster' | 'Journal';

// Lore system types
export type LoreTabId = 
  | 'overview' | 'history' | 'rumors' | 'quests' | 'people' 
  | 'government' | 'geography' | 'economy' | 'culture' | 'dangers'
  | 'menu' | 'secrets' | 'properties' | 'legends'
  | 'members' | 'goals' | 'resources' | 'images' | 'notes';

export type LoreType = 'town' | 'dungeon' | 'tavern' | 'item' | 'faction' | 'region' | 'custom';

// Extended LoreEntry with optional specialized fields for different tab types
export interface LoreEntry {
  id: string;
  title: string;
  content: string;
  visibleToPlayers: boolean;
  createdAt: string;
  order: number;
  
  // Rumors tab fields
  heardFrom?: string;           // Attribution source for rumors
  
  // Quests tab fields
  isCompleted?: boolean;        // Quest completion status
  reward?: string;              // Quest reward
  difficulty?: 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';
  
  // People tab fields
  portraitUrl?: string;         // Avatar/portrait image URL
  role?: string;                // Role/title of the person
  relationship?: 'ally' | 'neutral' | 'enemy' | 'unknown';
  
  // History tab fields
  date?: string;                // Date/era for timeline
  
  // Dangers tab fields
  threatLevel?: 'low' | 'moderate' | 'high' | 'extreme';
  
  // Services/Menu tab fields
  price?: string;               // Price for services/menu items
  availability?: 'available' | 'limited' | 'unavailable';
  quantity?: string;            // Stock/quantity indicator
  
  // Secrets tab fields
  isRevealed?: boolean;         // Whether secret has been revealed to players
  
  // Members tab fields
  rank?: string;                // Rank within organization
  
  // Goals tab fields
  progress?: number;            // Progress percentage (0-100)
  priority?: 'low' | 'medium' | 'high';
  
  // Images tab fields
  imageUrl?: string;            // URL to an image for the images gallery
  caption?: string;             // Caption for the image
}

export interface LoreTabConfig {
  tabId: LoreTabId;
  enabled: boolean;
  visibleToPlayers: boolean;
  order: number;
  entries: LoreEntry[];
}

export interface LoreSettings {
  loreType: LoreType;
  tabs: LoreTabConfig[];
  allowPlayerEditing?: boolean;  // When true, players can add/edit entries in visible tabs (default: false)
}

// Merchant system types
export interface ShopPresetItem {
  repositoryItemId?: string;       // Reference to repository item (if from repo)
  customItem?: Partial<Item>;      // Or a fully custom item
  defaultQty: number;              // How many in stock by default
  qtyVariance?: number;            // ±variance for randomization
}

export interface ShopPreset {
  id: string;
  name: string;                    // "Village Blacksmith", "Shady Apothecary"
  description?: string;
  items: ShopPresetItem[];         // Curated item list
  priceModifier: number;           // Default markup for this preset
  buybackRate: number;             // Default buyback rate
  stockRandomization?: number;     // 0-100, what % of items appear when generated
}

export interface MerchantSettings {
  shopName?: string;                // Display name for the shop
  presetId?: string;                // Reference to a ShopPreset
  priceModifier: number;            // 1.0 = standard, 1.2 = 20% markup, 0.8 = discount
  buybackRate: number;              // 0.5 = buys at 50% value (standard D&D)
  unlimitedStock: boolean;          // If true, qty doesn't decrease on purchase
}

export type PackType =
  | 'NPC' | 'Simple' | 'Standard' | 'Warrior' | 'Explorer'
  | 'Tinkerer' | 'Travel' | 'Shadow' | 'Mule' | 'Utility';

export type StorageType = 
  | 'Small Pet' | 'Large Pet' | 'Standard Mount' | 'Large Mount' 
  | 'Small Cart' | 'Large Cart' | 'Boat' | 'Ship' | 'House' | 'Warehouse'
  | 'Chest' | 'Barrel';

export type ItemCategory = 
  | 'Other' | 'Large' | 'Massive' | 'Tool/Kit' | 'Light Armor' 
  | 'Medium Armor' | 'Heavy Armor' | 'Consumable' | 'Instrument' 
  | 'One-Handed Weapon' | 'Two-Handed Weapon' | 'Clothing' 
  | 'Light Ammo' | 'Ammo' | 'Jewelry' | 'Shield' | 'Magic Item' 
  | 'Literature' | 'Camp';

export interface Item {
  id: string;
  name: string;
  value: string;
  category: ItemCategory;
  type: string;
  weight: number;
  qty: number;
  ac?: number;
  damage?: string;
  damageModifier?: string;
  hitModifier?: string;
  properties?: string;
  requiresAttunement: boolean;
  isAttuned: boolean;
  notes?: string;
  equippedSlot?: 'weapon' | 'armor' | 'clothing' | 'jewelry' | 'utility' | null;
  charges?: number;
  maxCharges?: number;
}

export interface Vault {
  id: string;
  name: string;
  currency: Currency; // Updated from 'amount: number'
  isNearby: boolean; 
}

export interface ExternalStorage {
  id: string;
  name: string;
  description: string;
  notes: string; // Added notes field
  type: StorageType;
  inventory: Item[];
  currency: Currency;
  isNearby: boolean;
}

export interface ActiveTrade {
  id: string;
  status: 'pending-acceptance' | 'active' | 'completed' | 'cancelled';
  player1TokenId: string;
  player1Id: string;
  player1Name: string;
  player2TokenId: string;
  player2Id: string;
  player2Name: string;
  player1OfferedItems: Item[];
  player1OfferedCoins: Currency;
  player2OfferedItems: Item[];
  player2OfferedCoins: Currency;
  player1Confirmed: boolean;
  player2Confirmed: boolean;
  timestamp: number;
}

export interface ReputationEntry {
  id: string;              // UUID for React keys
  label: string;           // Player/character name
  value: number;           // 0-100
  visibleToPlayer: boolean; // GM controls per-entry visibility
}

export interface Reputation {
  entries: ReputationEntry[];
  showPartyAverage: boolean; // GM controls if average slider is visible to players
}

// D&D 5e Character Sheet Types
export interface AbilityScore {
  base: number;      // 1-30
  modifier: number;  // Auto-calculated: floor((base - 10) / 2)
}

export interface AbilityScores {
  strength: AbilityScore;
  dexterity: AbilityScore;
  constitution: AbilityScore;
  intelligence: AbilityScore;
  wisdom: AbilityScore;
  charisma: AbilityScore;
}

// Skill proficiency levels: none, half, proficient, mastery (expertise)
export type SkillProficiencyLevel = 'none' | 'half' | 'proficient' | 'mastery';

export interface SkillProficiency {
  proficiencyLevel: SkillProficiencyLevel;
  bonus: number;
  // Legacy support - keep proficient for backwards compatibility
  proficient?: boolean;
}

export interface Skills {
  // Strength
  athletics: SkillProficiency;
  // Dexterity
  acrobatics: SkillProficiency;
  sleightOfHand: SkillProficiency;
  stealth: SkillProficiency;
  // Intelligence
  arcana: SkillProficiency;
  history: SkillProficiency;
  investigation: SkillProficiency;
  nature: SkillProficiency;
  religion: SkillProficiency;
  // Wisdom
  animalHandling: SkillProficiency;
  insight: SkillProficiency;
  medicine: SkillProficiency;
  perception: SkillProficiency;
  survival: SkillProficiency;
  // Charisma
  deception: SkillProficiency;
  intimidation: SkillProficiency;
  performance: SkillProficiency;
  persuasion: SkillProficiency;
}

export interface HitPoints {
  current: number;
  max: number;
  temp: number;
}

// Spell types for spell management
export type SpellSchool = 'abjuration' | 'conjuration' | 'divination' | 'enchantment' | 
  'evocation' | 'illusion' | 'necromancy' | 'transmutation';

export type SpellActionType = 'action' | 'bonusAction' | 'reaction';

export type SpellComponent = 'v' | 's' | 'm';

export type SpellCasterClass = 'bard' | 'cleric' | 'druid' | 'paladin' | 'ranger' | 
  'sorcerer' | 'warlock' | 'wizard';

export interface RepositorySpell {
  name: string;
  level: number;
  school: SpellSchool;
  classes: SpellCasterClass[];
  actionType: SpellActionType;
  concentration: boolean;
  ritual: boolean;
  castingTime?: string;
  castingTrigger?: string;
  range: string;
  components: SpellComponent[];
  material?: string;
  duration: string;
  description: string;
  cantripUpgrade?: string;
  higherLevelSlot?: string;
}

export interface Spell {
  id: string;
  name: string;
  level: number;       // 0 for cantrips, 1-9 for spell levels
  description: string;
  prepared?: boolean;  // Is this spell currently prepared/equipped?
  school?: SpellSchool;
  classes?: SpellCasterClass[];
  actionType?: SpellActionType;
  concentration?: boolean;
  ritual?: boolean;
  castingTime?: string;
  castingTrigger?: string;
  range?: string;
  components?: SpellComponent[];
  material?: string;
  duration?: string;
  cantripUpgrade?: string;
  higherLevelSlot?: string;
  notes?: string;
  fromRepository?: boolean;
}

export interface SpellSlots {
  max: number;
  used: number;
}

export interface SpellManagement {
  knownSpells: Spell[];
  spellSlots: Record<number, SpellSlots>;  // Key is spell level (1-9), value is slots info
  useCustomSlots: boolean;  // If true, use custom slot values instead of auto-calculated
}

export interface CharacterSheet {
  // Character Info
  gender: string;
  race: string;
  characterClass: string;  // 'class' is reserved
  level: number;
  
  // Ability Scores
  abilityScores: AbilityScores;
  
  // Skills
  skills: Skills;
  pinnedSkills: string[];  // Array of skill keys (max 5) for quick reference
  
  // Combat Stats
  hitPoints: HitPoints;
  armorClass: number;
  initiative: number;
  proficiencyBonus: number;
  speed: number;
  
  // Passive Scores
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  
  // Misc
  heroicInspiration: boolean;
  defenses: string;      // Text field for immunities/resistances
  conditions: string;    // Text field for active conditions
  languages: string;     // Text field for known languages
  
  // Biography fields
  scars?: string;           // Text field for character scars
  values?: string;          // Text field for character values
  alignment?: string;       // Alignment (e.g., "Lawful Good", "Chaotic Neutral")
  birthplace?: string;      // Text field for birthplace
  majorLifeMoments?: string; // Text area for major life moments
  featuresAndTraits?: string; // Text field for character features and traits
  
  // Spells
  spellManagement?: SpellManagement;
}

// Race and Class types
export type CharacterRace = 'Human' | 'Elf' | 'Dragonborn' | 'Orc' | 'Halfling' | 'Dwarf' | 'Tiefling' | 'Goblin' | 'Fairy' | 'Mixed' | string;
export type CharacterClass = 'Fighter' | 'Ranger' | 'Bard' | 'Wizard' | 'Warlock' | 'Rogue' | 'Barbarian' | 'Druid' | 'Cleric' | 'Paladin' | 'Monk' | 'Sorcerer' | 'Multiclass' | string;

// Condition types
export type ConditionType = 'blinded' | 'charmed' | 'deafened' | 'frightened' | 'grappled' | 'incapacitated' | 'invisible' | 'paralyzed' | 'petrified' | 'poisoned' | 'prone' | 'restrained' | 'stunned' | 'unconscious' | 'minorInjury' | 'seriousInjury' | 'criticalInjury' | 'infection';

// Injury location types for injury conditions
export type InjuryLocation = 'limb' | 'torso' | 'head';

// Injury HP values - how many rests/treatments needed to heal each injury type
export const INJURY_HP_VALUES = {
  minorInjury: 1,
  seriousInjury: 3,
  criticalInjury: 4,
} as const;

// Extended condition data for injury conditions
export interface InjuryConditionData {
  injuryLocation?: InjuryLocation;
  injuryDaysSinceRest?: number; // For infection tracking (long rests without treatment)
  infectionDeathSavesFailed?: number; // For infection death saves
  injuryHP?: number; // HP remaining - must be depleted to heal (default based on injury type)
  maxInjuryHP?: number; // Max HP for this injury (4 for critical, 3 for serious, 1 for minor)
  longRestsSinceLastTreatment?: number; // For infection tracking - counts long rests without Patch Wounds
  dateAcquired?: string; // ISO date string for when the injury was acquired (for scar logging)
  acquiredDate?: { year: number; monthIndex: number; day: number }; // Calendar date for scar logging
}

export interface CharacterConditions {
  blinded: boolean;
  charmed: boolean;
  deafened: boolean;
  frightened: boolean;
  grappled: boolean;
  incapacitated: boolean;
  invisible: boolean;
  paralyzed: boolean;
  petrified: boolean;
  poisoned: boolean;
  prone: boolean;
  restrained: boolean;
  stunned: boolean;
  unconscious: boolean;
  // New injury conditions
  minorInjury: boolean;
  seriousInjury: boolean;
  criticalInjury: boolean;
  infection: boolean;
}

// Extended data for injury tracking
export interface CharacterInjuryData {
  minorInjury?: InjuryConditionData;
  seriousInjury?: InjuryConditionData;
  criticalInjury?: InjuryConditionData;
  infection?: InjuryConditionData;
}

// Exhaustion state
export interface ExhaustionState {
  currentLevel: number;
  maxLevels: number; // Default 10, GM customizable
  customEffects: string[]; // GM-defined effects per level
}

// Hit Dice state
export interface HitDice {
  current: number;
  max: number;
  dieType: string; // e.g., "d8", "d10" - based on class
}

// Superiority Dice state
export interface SuperiorityDice {
  current: number;
  max: number;
}

// Rest Location type for long rest
export type RestLocationType = 'wilderness' | 'settlement';
export type SettlementRoomType = 'free' | 'basic' | 'quality' | 'luxury';

// Rest System types
export type RestType = 'short' | 'long';

// Effect types for rest options - used for auto-apply functionality
export interface RestOptionEffect {
  type: 'tempHp' | 'heroicInspiration' | 'healInjury';
  value?: number;              // For tempHp: amount of temp HP to add; For healInjury: levels to heal (default 1)
  requiresRations?: number;    // Number of rations required per party member
  requiresRationPrompt?: boolean; // If true, prompt user to enter how many rations to use
}

export interface RestOption {
  id: string;
  name: string;
  description: string;
  category: 'standard' | 'race' | 'class';
  raceRestriction?: CharacterRace;
  classRestriction?: CharacterClass;
  restType: RestType;
  effect?: RestOptionEffect;   // Optional auto-apply effect
}

export interface RestHistory {
  lastShortRest: {
    timestamp: number;
    chosenOptionIds: string[];
    calendarDate?: { year: number; monthIndex: number; day: number; hour: number; minute: number };
    selectedBenefits?: string[];  // IDs of rest options chosen (for preventing same benefit twice)
  } | null;
  lastLongRest: {
    timestamp: number;
    chosenOptionIds: string[];
    location?: RestLocationType;
    roomType?: SettlementRoomType;
    calendarDate?: { year: number; monthIndex: number; day: number; hour: number; minute: number };
    selectedBenefits?: string[];  // IDs of rest options chosen (for preventing same benefit twice)
  } | null;
  heroicInspirationGainedToday: boolean;
  consecutiveWildernessRests: number; // Track wilderness rest streak
  wildernessExhaustionBlocked: boolean; // Prevents exhaustion reduction on long rests until settlement rest
}

// GM Customizations (stored in Room Metadata)
export interface GMCustomizations {
  customRaces: string[];
  customClasses: string[];
  customRestOptions: RestOption[];
  modifiedRestOptions: Record<string, Partial<RestOption>>; // Overrides for default options
  disabledRestOptions: string[]; // IDs of disabled default options
  exhaustionEffects: string[]; // Custom effects per exhaustion level
  overencumberedText: string;
  restRulesMessage: string;
}

// Death Saves state
export interface DeathSaves {
  successes: number;  // 0-3
  failures: number;   // 0-3
}

// Project System types
export interface Project {
  id: string;
  name: string;
  description: string;
  totalWorkUnits: number;      // How much work needed to complete
  completedWorkUnits: number;  // How much work done so far
  createdDate?: { year: number; monthIndex: number; day: number };
  completedDate?: { year: number; monthIndex: number; day: number };
  isCompleted: boolean;
}

// Scar System types
export interface Scar {
  id: string;
  source: string;           // What caused it
  size: 'small' | 'medium' | 'large';
  location: string;         // Body location
  injuryType: 'serious' | 'critical';
  acquiredDate?: { year: number; monthIndex: number; day: number }; // Optional for when calendar not available
}

// Character Stats (unified character stats for dashboard)
export interface CharacterStats {
  race: CharacterRace;
  secondaryRace?: CharacterRace; // For Mixed race
  characterClass: CharacterClass;
  secondaryClass?: CharacterClass; // For Multiclass
  level: number;
  currentHp: number;
  maxHp: number;
  tempHp: number;
  armorClass: number;
  heroicInspiration: boolean;
  conditions: CharacterConditions;
  injuryData?: CharacterInjuryData; // Extended injury condition data
  exhaustion: ExhaustionState;
  restHistory: RestHistory;
  deathSaves?: DeathSaves; // Death saving throws tracking
  hitDice?: HitDice; // Hit dice for rest healing
  superiorityDice?: SuperiorityDice; // Superiority dice for combat
}

// Monster system types
export interface MonsterLootEntry {
  id: string;
  content: string;
  order: number;
}

export interface MonsterActionEntry {
  id: string;
  content: string;
  order: number;
}

export interface MonsterSettings {
  lootEntries: MonsterLootEntry[];
  actionEntries: MonsterActionEntry[];
  lootVisibleToPlayers: boolean; // GM can toggle this manually (deprecated, kept for backwards compatibility)
  actionsVisibleToPlayers: boolean; // GM can toggle this manually
  inventoryVisibleToPlayers?: boolean; // GM can toggle to show/hide Pack tab from players
}

export interface CharacterData {
  tokenType: TokenType;  // Type of token: player (default), npc, party, lore, monster, or merchant
  packType: PackType;
  inventory: Item[];
  currency: Currency;
  vaults: Vault[];
  externalStorages: ExternalStorage[];
  favorites: string[];
  condition: string;
  claimedBy?: string;    // Player ID who claimed this token
  claimingEnabled?: boolean;  // GM controls if token can be claimed
  reputation?: Reputation;  // NPC reputation tracking (only for packType === 'NPC')
  theme?: Theme;  // Per-token theme colors (everyone sees the same theme for this token)
  coverPhotoUrl?: string;  // URL to an externally hosted cover/banner image
  loreContent?: string;   // Main lore text for lore tokens
  gmNotes?: string;       // GM-only notes (hidden from players)
  loreSettings?: LoreSettings;  // Lore system settings (only for tokenType === 'lore')
  monsterSettings?: MonsterSettings;  // Monster settings (only for tokenType === 'monster')
  merchantSettings?: MerchantSettings;  // Merchant settings (only for tokenType === 'merchant')
  name?: string;  // Custom display name (overrides token name, GM-editable for lore tokens)
  characterSheet?: CharacterSheet;  // D&D 5e character sheet (optional for backwards compatibility)
  characterStats?: CharacterStats;  // New unified character stats
  projects?: Project[];  // Active projects in progress
  completedProjects?: Project[];  // Completed projects for display
  scars?: Scar[];  // Scars from healed serious/critical injuries
  migratedToBlob?: boolean;  // Flag indicating token data has been migrated to Vercel Blob storage
}
