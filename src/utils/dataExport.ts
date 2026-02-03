import type { CharacterData } from '../types';

/**
 * Export token data for backup
 * Excludes token-specific identifiers like claimedBy
 * Note: 'condition' field (token name in game) is preserved for reference
 */
export const exportTokenData = (characterData: CharacterData): string => {
  // Create a clean copy excluding token-specific data
  const exportData = {
    // Core data
    packType: characterData.packType,
    tokenType: characterData.tokenType,
    inventory: characterData.inventory,
    currency: characterData.currency,
    
    // Storage and vaults
    externalStorages: characterData.externalStorages,
    vaults: characterData.vaults,
    favorites: characterData.favorites,
    
    // Character stats and sheet
    characterStats: characterData.characterStats,
    characterSheet: characterData.characterSheet,
    
    // Settings
    theme: characterData.theme,
    coverPhotoUrl: characterData.coverPhotoUrl,
    claimingEnabled: characterData.claimingEnabled,
    
    // Projects
    projects: characterData.projects,
    completedProjects: characterData.completedProjects,
    scars: characterData.scars,
    
    // Reputation (for NPCs)
    reputation: characterData.reputation,
    
    // Lore content and settings (for lore tokens)
    loreContent: characterData.loreContent,
    gmNotes: characterData.gmNotes,
    loreSettings: characterData.loreSettings,
    
    // Monster settings (for monster tokens)
    monsterSettings: characterData.monsterSettings,
    
    // Merchant settings (for merchant tokens)
    merchantSettings: characterData.merchantSettings,
    
    // Custom name (optional)
    name: characterData.name,
    
    // Metadata
    exportVersion: '1.0',
    exportDate: new Date().toISOString(),
  };

  return JSON.stringify(exportData, null, 2);
};

/**
 * Download exported data as a JSON file
 */
export const downloadTokenData = (characterData: CharacterData, tokenName: string) => {
  const dataStr = exportTokenData(characterData);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `${tokenName.replace(/[^a-z0-9]/gi, '_')}_backup_${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * Import token data from uploaded JSON
 * Returns the parsed data or null if invalid
 */
export const importTokenData = (jsonString: string): Partial<CharacterData> | null => {
  try {
    const data = JSON.parse(jsonString);
    
    // Validate that it has expected structure (at least one of these should be present)
    if (!data.packType && !data.tokenType) {
      throw new Error('Invalid token data: missing both packType and tokenType');
    }
    
    // Remove export metadata
    delete data.exportVersion;
    delete data.exportDate;
    
    return data;
  } catch (error) {
    console.error('Error importing token data:', error);
    return null;
  }
};
