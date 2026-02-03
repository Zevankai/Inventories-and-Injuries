import OBR, { buildImage } from '@owlbear-rodeo/sdk';
import type { Item } from '@owlbear-rodeo/sdk';
import type { JournalData } from '../../types/journal';

/**
 * Item IDs for journal storage
 * Store journals per token using pattern: __JOURNAL_DATA_{tokenId}
 */
const JOURNAL_CONFIG_ITEM_ID = 'com.weighted-inventory.journal-config';
const JOURNAL_DATA_ITEM_PREFIX = 'com.weighted-inventory.journal-data';

/**
 * Prefix used to identify all journal items
 */
export const JOURNAL_ITEM_PREFIX = 'com.weighted-inventory.journal-';

/**
 * Metadata keys for items
 */
const ITEM_METADATA_KEY_JOURNALS = 'journal.data';
const ITEM_METADATA_KEY_MIGRATED = 'journal.migrated';

/**
 * Transparent 1x1 PNG as data URL for invisible scene items
 */
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/**
 * Get the item ID for a specific token's journals
 */
export function getJournalItemId(tokenId: string): string {
  return `${JOURNAL_DATA_ITEM_PREFIX}.${tokenId}`;
}

/**
 * Create an invisible item for storing journal data
 */
async function createJournalItem(id: string, name: string): Promise<Item> {
  const item = buildImage(
    {
      height: 1,
      width: 1,
      url: TRANSPARENT_PIXEL,
      mime: 'image/png'
    },
    { dpi: 150, offset: { x: 0, y: 0 } }
  )
    .id(id)
    .name(name)
    .layer('ATTACHMENT')
    .locked(true)
    .visible(false)
    .disableHit(true)
    .position({ x: -10000, y: -10000 }) // Off-screen
    .build();

  await OBR.scene.items.addItems([item]);
  return item;
}

/**
 * Get a journal item for a specific token (read-only, returns null if not found)
 */
export async function getJournalItem(tokenId: string): Promise<Item | null> {
  const itemId = getJournalItemId(tokenId);
  const items = await OBR.scene.items.getItems((item) => item.id === itemId);
  return items.length > 0 ? items[0] : null;
}

/**
 * Get or create a journal item for a specific token (for write operations)
 */
export async function getOrCreateJournalItem(tokenId: string): Promise<Item> {
  const existingItem = await getJournalItem(tokenId);
  if (existingItem) {
    return existingItem;
  }
  const itemId = getJournalItemId(tokenId);
  return await createJournalItem(itemId, `Journal Data: ${tokenId}`);
}

/**
 * Read journals for a specific token from item metadata (read-only, doesn't create items)
 */
export async function readJournals(tokenId: string): Promise<JournalData | null> {
  try {
    const item = await getJournalItem(tokenId);
    if (!item) {
      return null;
    }
    const metadata = item.metadata;
    const data = metadata[ITEM_METADATA_KEY_JOURNALS] as JournalData | undefined;
    return data || null;
  } catch (error) {
    console.error(`[JournalStorage] Error reading journals for token ${tokenId}:`, error);
    return null;
  }
}

/**
 * Write journals for a specific token to item metadata
 */
export async function writeJournals(tokenId: string, data: JournalData): Promise<void> {
  const item = await getOrCreateJournalItem(tokenId);

  await OBR.scene.items.updateItems([item.id], (items) => {
    items.forEach(item => {
      item.metadata[ITEM_METADATA_KEY_JOURNALS] = data;
      item.metadata[ITEM_METADATA_KEY_MIGRATED] = true;
    });
  });
}

/**
 * Check if journals for a token have been migrated to OBR items
 */
export async function isMigrated(tokenId: string): Promise<boolean> {
  try {
    const item = await getJournalItem(tokenId);
    if (!item) {
      return false;
    }
    return item.metadata[ITEM_METADATA_KEY_MIGRATED] === true;
  } catch (error) {
    console.error(`[JournalStorage] Error checking migration status for token ${tokenId}:`, error);
    return false;
  }
}

/**
 * Extract journal data directly from an array of items (for use in onChange callback)
 * This avoids race conditions by reading from the items passed to the callback
 * rather than making separate API calls.
 */
export function extractJournalsFromItems(items: Item[], tokenId: string): JournalData | null {
  const itemId = getJournalItemId(tokenId);
  const journalItem = items.find(item => item.id === itemId);
  if (!journalItem) {
    return null;
  }
  return (journalItem.metadata[ITEM_METADATA_KEY_JOURNALS] as JournalData) || null;
}

/**
 * Delete journal data for a specific token
 */
export async function deleteJournals(tokenId: string): Promise<void> {
  const itemId = getJournalItemId(tokenId);
  const items = await OBR.scene.items.getItems((item) => item.id === itemId);
  
  if (items.length > 0) {
    await OBR.scene.items.deleteItems([itemId]);
  }
}

/**
 * Delete all journal items (for cleanup/reset)
 */
export async function deleteAllJournalItems(): Promise<void> {
  const allItems = await OBR.scene.items.getItems();
  const journalItemIds = allItems
    .filter(item => item.id.startsWith(JOURNAL_DATA_ITEM_PREFIX) || item.id === JOURNAL_CONFIG_ITEM_ID)
    .map(item => item.id);

  if (journalItemIds.length > 0) {
    await OBR.scene.items.deleteItems(journalItemIds);
  }
}
