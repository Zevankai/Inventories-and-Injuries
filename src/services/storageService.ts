/**
 * Storage Service for Vercel Blob Storage
 * 
 * Provides functions to save/load character data and custom repositories
 * to/from Vercel Blob storage with graceful fallback to OBR metadata.
 */

import type { CharacterData, ShopPreset } from '../types';
import type { RepoItem } from '../data/repository';
import type { RepositorySpell } from '../types';
import OBR from '@owlbear-rodeo/sdk';

export const TOKEN_DATA_KEY = 'com.weighted-inventory/data';

// API base URL - will be the same origin in production
const getApiBaseUrl = (): string => {
  // In development, this might need to be configured
  // In production on Vercel, API routes are at /api
  return window.location.origin;
};

/**
 * Get the campaign ID from OBR room ID
 */
export const getCampaignId = async (): Promise<string> => {
  return await OBR.room.id;
};

/**
 * Character Data Storage
 */

/**
 * Load character data from Vercel Blob storage
 * Falls back to OBR metadata if blob storage fails (only for non-migrated tokens)
 */
export const loadCharacterData = async (
  campaignId: string,
  tokenId: string
): Promise<CharacterData | null> => {
  try {
    const url = `${getApiBaseUrl()}/api/characters/${campaignId}/${tokenId}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log('[StorageService] Loaded character data from Vercel Blob');
      return data as CharacterData;
    }

    if (response.status === 404) {
      console.log('[StorageService] No character data in Vercel Blob, checking OBR metadata fallback');
      // Fallback to OBR metadata when Vercel Blob returns 404
      try {
        const items = await OBR.scene.items.getItems([tokenId]);
        if (items.length > 0) {
          const data = items[0].metadata[TOKEN_DATA_KEY] as CharacterData | undefined;
          if (data) {
            // Check if this token was already migrated to blob
            if (data.migratedToBlob) {
              console.warn('[StorageService] Token marked as migrated but not found in blob - this indicates a potential data consistency issue');
              // Return the data but log the concern - the next save will re-sync it
            } else {
              console.log('[StorageService] Loaded character data from OBR metadata (fallback for non-migrated token)');
            }
            return data;
          }
        }
      } catch (obrError) {
        console.error('[StorageService] Failed to load from OBR metadata:', obrError);
      }
      return null;
    }

    throw new Error(`Failed to load character data: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error loading from Vercel Blob, falling back to OBR metadata:', error);
    // Fallback to OBR metadata on network errors
    try {
      const items = await OBR.scene.items.getItems([tokenId]);
      if (items.length > 0) {
        const data = items[0].metadata[TOKEN_DATA_KEY] as CharacterData | undefined;
        if (data) {
          // Check if this token was already migrated to blob
          if (data.migratedToBlob) {
            console.warn('[StorageService] Token marked as migrated but blob storage failed - using OBR metadata as temporary fallback');
          } else {
            console.log('[StorageService] Loaded character data from OBR metadata (fallback for non-migrated token)');
          }
          return data;
        }
      }
    } catch (obrError) {
      console.error('[StorageService] Failed to load from OBR metadata:', obrError);
    }
    return null;
  }
};

/**
 * Save character data to Vercel Blob storage
 * Also updates OBR metadata as cache
 * Automatically marks data as migrated to blob on successful save
 */
export const saveCharacterData = async (
  campaignId: string,
  tokenId: string,
  data: CharacterData
): Promise<boolean> => {
  let blobSaveSuccess = false;

  // Ensure the migratedToBlob flag is set
  const dataToSave: CharacterData = {
    ...data,
    migratedToBlob: true,
  };

  // Try to save to Vercel Blob
  try {
    const url = `${getApiBaseUrl()}/api/characters/${campaignId}/${tokenId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dataToSave),
    });

    if (response.ok) {
      console.log('[StorageService] Saved character data to Vercel Blob (migratedToBlob: true)');
      blobSaveSuccess = true;
    } else {
      throw new Error(`Failed to save character data: ${response.statusText}`);
    }
  } catch (error) {
    console.error('[StorageService] Error saving to Vercel Blob:', error);
  }

  // Always update OBR metadata as cache (and fallback)
  try {
    await OBR.scene.items.updateItems([tokenId], (items) => {
      items[0].metadata[TOKEN_DATA_KEY] = dataToSave;
    });
    console.log('[StorageService] Saved character data to OBR metadata (cache)');
  } catch (error) {
    console.error('[StorageService] Failed to save to OBR metadata:', error);
    // If blob save failed AND OBR save failed, return false
    if (!blobSaveSuccess) {
      return false;
    }
  }

  return true;
};

/**
 * Delete character data from Vercel Blob storage
 * Also clears OBR metadata
 */
export const deleteCharacterData = async (
  campaignId: string,
  tokenId: string
): Promise<boolean> => {
  let success = true;

  // Try to delete from Vercel Blob
  try {
    const url = `${getApiBaseUrl()}/api/characters/${campaignId}/${tokenId}`;
    const response = await fetch(url, {
      method: 'DELETE',
    });

    if (response.ok) {
      console.log('[StorageService] Deleted character data from Vercel Blob');
    } else {
      throw new Error(`Failed to delete character data: ${response.statusText}`);
    }
  } catch (error) {
    console.error('[StorageService] Error deleting from Vercel Blob:', error);
    success = false;
  }

  // Clear OBR metadata
  try {
    await OBR.scene.items.updateItems([tokenId], (items) => {
      delete items[0].metadata[TOKEN_DATA_KEY];
    });
    console.log('[StorageService] Cleared character data from OBR metadata');
  } catch (error) {
    console.error('[StorageService] Failed to clear OBR metadata:', error);
    success = false;
  }

  return success;
};

/**
 * Custom Repository Storage
 */

/**
 * Load custom items for a campaign
 */
export const loadCustomItems = async (campaignId: string): Promise<RepoItem[]> => {
  try {
    const url = `${getApiBaseUrl()}/api/repositories/${campaignId}/items`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log('[StorageService] Loaded custom items from Vercel Blob:', data.length);
      return data as RepoItem[];
    }

    if (response.status === 404) {
      console.log('[StorageService] No custom items found');
      return [];
    }

    throw new Error(`Failed to load custom items: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error loading custom items:', error);
    return [];
  }
};

/**
 * Save custom items for a campaign
 */
export const saveCustomItems = async (
  campaignId: string,
  items: RepoItem[]
): Promise<boolean> => {
  try {
    const url = `${getApiBaseUrl()}/api/repositories/${campaignId}/items`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(items),
    });

    if (response.ok) {
      console.log('[StorageService] Saved custom items to Vercel Blob');
      return true;
    }

    throw new Error(`Failed to save custom items: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error saving custom items:', error);
    return false;
  }
};

/**
 * Load custom spells for a campaign
 */
export const loadCustomSpells = async (campaignId: string): Promise<RepositorySpell[]> => {
  try {
    const url = `${getApiBaseUrl()}/api/repositories/${campaignId}/spells`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log('[StorageService] Loaded custom spells from Vercel Blob:', data.length);
      return data as RepositorySpell[];
    }

    if (response.status === 404) {
      console.log('[StorageService] No custom spells found');
      return [];
    }

    throw new Error(`Failed to load custom spells: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error loading custom spells:', error);
    return [];
  }
};

/**
 * Save custom spells for a campaign
 */
export const saveCustomSpells = async (
  campaignId: string,
  spells: RepositorySpell[]
): Promise<boolean> => {
  try {
    const url = `${getApiBaseUrl()}/api/repositories/${campaignId}/spells`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(spells),
    });

    if (response.ok) {
      console.log('[StorageService] Saved custom spells to Vercel Blob');
      return true;
    }

    throw new Error(`Failed to save custom spells: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error saving custom spells:', error);
    return false;
  }
};

/**
 * Load shop presets for a campaign
 */
export const loadShopPresets = async (campaignId: string): Promise<ShopPreset[]> => {
  try {
    const url = `${getApiBaseUrl()}/api/repositories/${campaignId}/shop-presets`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log('[StorageService] Loaded shop presets from Vercel Blob:', data.length);
      return data as ShopPreset[];
    }

    if (response.status === 404) {
      console.log('[StorageService] No shop presets found');
      return [];
    }

    throw new Error(`Failed to load shop presets: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error loading shop presets:', error);
    return [];
  }
};

/**
 * Save shop presets for a campaign
 */
export const saveShopPresets = async (
  campaignId: string,
  presets: ShopPreset[]
): Promise<boolean> => {
  try {
    const url = `${getApiBaseUrl()}/api/repositories/${campaignId}/shop-presets`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(presets),
    });

    if (response.ok) {
      console.log('[StorageService] Saved shop presets to Vercel Blob');
      return true;
    }

    throw new Error(`Failed to save shop presets: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error saving shop presets:', error);
    return false;
  }
};

/**
 * Journal Storage
 * 
 * @deprecated These functions are being replaced by OBR item storage in src/utils/journal/itemStorage.ts
 * They are kept for backward compatibility during migration but should not be used for new code.
 * Will be removed in a future version after migration is complete.
 */

/**
 * Load journals for a specific token
 * @deprecated Use readJournals from src/utils/journal/itemStorage.ts instead
 */
export const loadJournals = async (campaignId: string, tokenId: string): Promise<{ folders: any[]; notes: any[] }> => {
  try {
    const url = `${getApiBaseUrl()}/api/journals/${campaignId}/${tokenId}`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      console.log('[StorageService] Loaded token journals from Vercel Blob:', data.folders.length, 'folders,', data.notes.length, 'notes');
      return data;
    }

    if (response.status === 404) {
      console.log('[StorageService] No journals found for token');
      return { folders: [], notes: [] };
    }

    throw new Error(`Failed to load journals: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error loading token journals:', error);
    return { folders: [], notes: [] };
  }
};

/**
 * Save journals for a specific token
 * @deprecated Use writeJournals from src/utils/journal/itemStorage.ts instead
 */
export const saveJournals = async (
  campaignId: string,
  tokenId: string,
  data: { folders: any[]; notes: any[] }
): Promise<boolean> => {
  try {
    const url = `${getApiBaseUrl()}/api/journals/${campaignId}/${tokenId}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      console.log('[StorageService] Saved token journals to Vercel Blob');
      return true;
    }

    throw new Error(`Failed to save journals: ${response.statusText}`);
  } catch (error) {
    console.error('[StorageService] Error saving token journals:', error);
    return false;
  }
};
