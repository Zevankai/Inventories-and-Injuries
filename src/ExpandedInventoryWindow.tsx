import { useState, useEffect, Fragment, useMemo, useRef } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { v4 as uuidv4 } from 'uuid';
import './App.css';

import { usePackLogic } from './hooks/usePackLogic';
import { ITEM_CATEGORIES, DEFAULT_CATEGORY_WEIGHTS, EXPANDED_POPOVER_ID, STORAGE_DEFINITIONS, PACK_DEFINITIONS, STORAGE_TYPES_WITH_EQUIPMENT, EQUIPMENT_TAB_IDS } from './constants';
import type { Item, ItemCategory, CharacterData, Tab, StorageType, Vault, Currency, PackType, LoreTabId, LoreEntry, MonsterSettings } from './types';
import { HomeTab } from './components/tabs/HomeTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { JournalTab } from './components/tabs/JournalTab';
import { SpellsTab } from './components/tabs/SpellsTab';
import { LoreTab } from './components/tabs/LoreTab';
import { LoreSettingsTab } from './components/tabs/LoreSettingsTab';
import { MonsterLootTab } from './components/tabs/MonsterLootTab';
import { MonsterActionsTab } from './components/tabs/MonsterActionsTab';
import { MonsterPlayerView } from './components/MonsterPlayerView';
import { LORE_TAB_DEFINITIONS, generateDefaultLoreSettings } from './constants/lore';
import { hexToRgb } from './utils/color';
import { parseMarkdown } from './utils/markdown';
import { ensureCurrency, formatCurrency } from './utils/currency';
import { waitForOBR } from './utils/obr';
import { MarkdownHint } from './components/MarkdownHint';
import { useRepository } from './context/RepositoryContext';
import type { RepoItem } from './data/repository';

export default function ExpandedInventoryWindow() {
  const [loading, setLoading] = useState(true);
  const [tokenId, setTokenId] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState<string | null>(null);
  const [tokenImage, setTokenImage] = useState<string | null>(null);
  const [characterData, setCharacterData] = useState<CharacterData | null>(null);
  const [playerId, setPlayerId] = useState<string>('');
  const [playerRole, setPlayerRole] = useState<'GM' | 'PLAYER'>('PLAYER');

  // Load repository data (merged built-in + custom)
  const { itemRepository } = useRepository();

  // Lore tab state
  const [activeLoreTab, setActiveLoreTab] = useState<LoreTabId>('overview');

  // Form States
  const [newItem, setNewItem] = useState<Partial<Item>>({
    name: '', category: 'Other', type: 'Gear', weight: 1, qty: 1, value: '', properties: '', requiresAttunement: false,
  });
  const [repoSearch, setRepoSearch] = useState('');
  const [showRepo, setShowRepo] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  // Tab navigation
  const [activeTab, setActiveTab] = useState<Tab>('Home');
  
  // State for External Storage Viewing
  const [viewingStorageId, setViewingStorageId] = useState<string | null>(null);

  // Global search state
  const [globalSearch, setGlobalSearch] = useState('');

  // Storage and vault states
  const [newStorage, setNewStorage] = useState<{name: string; description: string; type: StorageType}>({
    name: '', description: '', type: 'Small Pet'
  });
  const [newVaultName, setNewVaultName] = useState('');

  // Theme state for HomeTab
  const [theme, setTheme] = useState({ accent: '#f0e130', background: '#0f0f1e' });

  // Load theme from characterData when it becomes available
  useEffect(() => {
    if (characterData?.theme) {
      setTheme(characterData.theme);
    }
  }, [characterData?.theme]);

  // Apply theme colors to CSS variables
  useEffect(() => {
    document.documentElement.style.setProperty('--accent-gold', theme.accent);
    document.documentElement.style.setProperty('--bg-dark', theme.background);
    // Calculate lighter/darker variants
    const accentRgb = hexToRgb(theme.accent);
    const bgRgb = hexToRgb(theme.background);
    if (accentRgb) {
      document.documentElement.style.setProperty('--border-bright', `rgba(${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}, 0.3)`);
    }
    if (bgRgb) {
      document.documentElement.style.setProperty('--bg-panel', `rgba(${Math.min(bgRgb.r + 20, 255)}, ${Math.min(bgRgb.g + 20, 255)}, ${Math.min(bgRgb.b + 20, 255)}, 0.7)`);
      // Set navbar background based on theme background
      document.documentElement.style.setProperty('--nav-bg', `rgba(${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}, 0.8)`);
    }
  }, [theme]);

  // --- VIRTUAL CONTEXT SWITCHING ---
  const currentDisplayData: CharacterData | null = useMemo(() => {
    if (!characterData) return null;
    
    const safeCurrency = ensureCurrency(characterData.currency);
    const safeInventory = characterData.inventory || [];

    if (!viewingStorageId) {
      return { ...characterData, inventory: safeInventory, currency: safeCurrency };
    }

    const storage = characterData.externalStorages.find(s => s.id === viewingStorageId);
    if (!storage) return { ...characterData, inventory: safeInventory, currency: safeCurrency };

    return {
      ...characterData, 
      packType: 'NPC' as PackType, 
      inventory: storage.inventory || [],
      currency: ensureCurrency(storage.currency),
      condition: storage.description || '', 
    };
  }, [characterData, viewingStorageId]);

  const stats = usePackLogic(currentDisplayData);

  // Get tokenId from URL parameter (passed when opening the expanded window)
  // Memoize to avoid parsing URL on every render
  const urlTokenId = useMemo(() => {
    return new URLSearchParams(window.location.search).get('tokenId');
  }, []);
  
  // Track if we've completed initial load (to prefer URL tokenId on first load)
  const hasInitialLoadRef = useRef(false);

  // Initialize OBR and load data
  useEffect(() => {
    (async () => {
      await waitForOBR();
      const id = await OBR.player.getId();
      const role = await OBR.player.getRole();
      setPlayerId(id);
      setPlayerRole(role);
      setLoading(false);
    })();
  }, []);

  // Poll for token selection and data updates
  useEffect(() => {
    if (loading) return;

    const pollData = async () => {
      try {
        // First try to get the current selection
        const selection = await OBR.player.getSelection();
        
        // On initial load, prefer URL tokenId to ensure correct token is shown
        // After initial load, prefer current selection for responsive updates
        let targetId: string | null;
        if (!hasInitialLoadRef.current && urlTokenId) {
          targetId = urlTokenId;
          hasInitialLoadRef.current = true;
        } else {
          targetId = (selection && selection.length > 0) ? selection[0] : urlTokenId;
        }
        if (!targetId) return;

        const items = await OBR.scene.items.getItems([targetId]);
        if (items.length === 0) return;

        const token = items[0];
        setTokenId(token.id);
        setTokenName(token.name || 'Unknown');
        setTokenImage((token as { image?: { url?: string } }).image?.url || null);

        const data = token.metadata['com.weighted-inventory/data'] as CharacterData | undefined;
        if (data) {
          setCharacterData(data);
        }
      } catch (err) {
        console.error('Error polling token data:', err);
      }
    };

    pollData();
    const interval = setInterval(pollData, 2000);

    return () => clearInterval(interval);
  }, [loading, urlTokenId]);

  // Update token data
  const updateData = async (updates: Partial<CharacterData>) => {
    if (!tokenId || !characterData) return;

    const newData = { ...characterData, ...updates };
    setCharacterData(newData);

    try {
      await OBR.scene.items.updateItems([tokenId], (items) => {
        for (const item of items) {
          item.metadata['com.weighted-inventory/data'] = newData;
        }
      });
    } catch (err) {
      console.error('Failed to update token data:', err);
    }
  };

  // --- CORE UPDATE HANDLER (supports storage context switching) ---
  const handleUpdateData = (updates: Partial<CharacterData>) => {
    if (!characterData) return;

    if (viewingStorageId) {
      const newStorages = characterData.externalStorages.map(s => {
        if (s.id !== viewingStorageId) return s;
        return {
          ...s,
          inventory: updates.inventory !== undefined ? updates.inventory : s.inventory,
          currency: updates.currency !== undefined ? updates.currency : (s.currency || {cp:0, sp:0, gp:0, pp:0}),
          description: updates.condition !== undefined ? updates.condition : s.description,
        };
      });
      updateData({ externalStorages: newStorages });
    } else {
      const safeUpdates = { ...updates };
      if (!safeUpdates.currency && !characterData.currency) {
        safeUpdates.currency = { cp: 0, sp: 0, gp: 0, pp: 0 };
      }
      updateData(safeUpdates);
    }
  };

  // Check if player can edit this token
  const canEditToken = () => {
    if (playerRole === 'GM') return true;
    if (characterData?.tokenType === 'party') return true;
    if (characterData?.claimedBy === playerId) return true;
    return false;
  };

  // Handler for updating lore entries
  const handleUpdateLoreEntries = (tabId: LoreTabId, entries: LoreEntry[]) => {
    if (!characterData?.loreSettings) return;
    
    const updatedTabs = characterData.loreSettings.tabs.map(tab =>
      tab.tabId === tabId ? { ...tab, entries } : tab
    );
    
    updateData({
      loreSettings: {
        ...characterData.loreSettings,
        tabs: updatedTabs,
      },
    });
  };

  // Handle creating a new item
  const handleCreateItem = () => {
    if (!newItem.name || !currentDisplayData) return;
    const createdItem: Item = {
      id: uuidv4(),
      name: newItem.name,
      category: newItem.category as ItemCategory,
      type: newItem.type || 'Gear',
      weight: newItem.weight || 0,
      qty: newItem.qty || 1,
      value: newItem.value || '',
      properties: newItem.properties || '',
      requiresAttunement: newItem.requiresAttunement || false,
      isAttuned: false,
      notes: '',
      ac: newItem.ac,
      damage: newItem.damage,
      equippedSlot: null,
      charges: newItem.charges,
      maxCharges: newItem.maxCharges,
      damageModifier: newItem.damageModifier,
      hitModifier: newItem.hitModifier
    };
    handleUpdateData({ inventory: [...currentDisplayData.inventory, createdItem] });
    setNewItem({ name: '', category: 'Other', type: 'Gear', weight: 1, qty: 1, value: '', properties: '', requiresAttunement: false });
  };

  // Handle deleting an item
  const handleDelete = (itemId: string) => {
    if (!currentDisplayData) return;
    if (window.confirm("Delete this item?")) {
      handleUpdateData({ inventory: currentDisplayData.inventory.filter(i => i.id !== itemId) });
    }
  };

  // Handle selling an item
  const handleSell = (item: Item) => {
    if (!currentDisplayData) return;
    const qtyToSellStr = window.prompt(`How many "${item.name}" to sell? (Max: ${item.qty})`, "1");
    if (!qtyToSellStr) return;
    const qtyToSell = parseInt(qtyToSellStr);
    if (isNaN(qtyToSell) || qtyToSell <= 0 || qtyToSell > item.qty) return;

    const valueStr = item.value.toLowerCase();
    let coinType: 'cp' | 'sp' | 'gp' | 'pp' = 'gp';
    if (valueStr.includes('pp')) coinType = 'pp';
    else if (valueStr.includes('sp')) coinType = 'sp';
    else if (valueStr.includes('cp')) coinType = 'cp';

    const unitValue = parseFloat(valueStr.replace(/[^0-9.]/g, '')) || 0;
    const finalPriceStr = window.prompt(`Selling ${qtyToSell} x ${item.name}.\nTotal Value (${coinType}):`, (unitValue * qtyToSell).toString());
    if (finalPriceStr === null) return;
    const finalPrice = parseFloat(finalPriceStr) || 0;

    const newInventory = currentDisplayData.inventory.map(i => i.id === item.id ? { ...i, qty: i.qty - qtyToSell } : i).filter(i => i.qty > 0);
    const newCurrency = { ...currentDisplayData.currency };
    newCurrency[coinType] = (newCurrency[coinType] || 0) + finalPrice;
    handleUpdateData({ inventory: newInventory, currency: newCurrency });
  };

  // Handle equipping/unequipping an item
  const handleToggleEquip = (item: Item) => {
    if (!currentDisplayData || !stats) return;

    if (item.equippedSlot) {
      // Unequip
      const matchingStack = currentDisplayData.inventory.find(i =>
        i.id !== item.id &&
        i.name === item.name &&
        i.category === item.category &&
        i.value === item.value &&
        !i.equippedSlot
      );

      if (matchingStack) {
        const newInventory = currentDisplayData.inventory
          .map(i => i.id === matchingStack.id ? { ...i, qty: i.qty + item.qty } : i)
          .filter(i => i.id !== item.id);
        handleUpdateData({ inventory: newInventory });
      } else {
        const newInventory = currentDisplayData.inventory.map(i => i.id === item.id ? { ...i, equippedSlot: null } : i);
        handleUpdateData({ inventory: newInventory });
      }
      return;
    }

    const validSlots: Item['equippedSlot'][] = [];
    const cat = item.category;
    const pack = characterData?.packType || 'Standard';

    if (cat.includes('Weapon') || cat === 'Shield' || cat === 'Instrument') validSlots.push('weapon');
    if (cat.includes('Armor')) validSlots.push('armor');
    if (cat === 'Clothing') validSlots.push('clothing');
    if (cat === 'Jewelry' || cat.includes('Symbol')) validSlots.push('jewelry');

    let allowedInUtility = false;
    const STANDARD_UTILITY_CATEGORIES = ['Consumable', 'Literature', 'Ammo', 'Light Ammo', 'Magic Item', 'Ammunition'];
    if (STANDARD_UTILITY_CATEGORIES.includes(cat)) allowedInUtility = true;

    if (pack === 'Utility' && item.weight < 2) allowedInUtility = true;
    if (pack === 'Warrior' && cat === 'One-Handed Weapon') allowedInUtility = true;
    if ((pack === 'Explorer' || pack === 'Tinkerer') && cat === 'Tool/Kit') allowedInUtility = true;
    if (pack === 'Travel' && cat === 'Camp') allowedInUtility = true;
    if (pack === 'Shadow') { if (cat === 'One-Handed Weapon' || cat === 'Tool/Kit') allowedInUtility = true; }

    if (allowedInUtility) { if (!validSlots.includes('utility')) validSlots.push('utility'); }

    if (validSlots.length === 0) { alert(`This item cannot be equipped in any slot.`); return; }
    let chosenSlot: Item['equippedSlot'] = validSlots[0];
    if (validSlots.length > 1) {
      const userChoice = window.prompt(`Equip to which slot?\n${validSlots.map(s => s?.toUpperCase()).join(' or ')}?\n(Type 'w' for weapon, 'u' for utility, 'a' for armor)`);
      if (!userChoice) return;
      const lower = userChoice.toLowerCase();
      if (lower.startsWith('u') && validSlots.includes('utility')) chosenSlot = 'utility';
      else if (lower.startsWith('w') && validSlots.includes('weapon')) chosenSlot = 'weapon';
      else if (lower.startsWith('a') && validSlots.includes('armor')) chosenSlot = 'armor';
      else { if (validSlots.includes(lower as Item['equippedSlot'])) chosenSlot = lower as Item['equippedSlot']; else return; }
    }

    if (chosenSlot) {
      let cost = 1;
      if (chosenSlot === 'weapon' && cat === 'Two-Handed Weapon') cost = 2;
      if (chosenSlot === 'armor' && cat === 'Medium Armor') cost = 2;
      if (chosenSlot === 'armor' && cat === 'Heavy Armor') cost = 3;
      const currentUsed = stats.usedSlots[chosenSlot];
      const maxAllowed = stats.maxSlots[chosenSlot];

      if (currentUsed + cost > maxAllowed) {
        alert(`Not enough space in ${chosenSlot.toUpperCase()}.\nCost: ${cost}\nAvailable: ${maxAllowed - currentUsed}`);
        return;
      }

      const isAmmo = ['Ammo', 'Light Ammo'].includes(item.category);
      if (!isAmmo && item.qty > 1) {
        const equippedItem = { ...item, id: uuidv4(), qty: 1, equippedSlot: chosenSlot };
        const remainingItem = { ...item, qty: item.qty - 1 };
        const newInventory = currentDisplayData.inventory.map(i =>
          i.id === item.id ? remainingItem : i
        );
        newInventory.push(equippedItem);
        handleUpdateData({ inventory: newInventory });
      } else {
        const newInventory = currentDisplayData.inventory.map(i => i.id === item.id ? { ...i, equippedSlot: chosenSlot } : i);
        handleUpdateData({ inventory: newInventory });
      }
    }
  };

  // Drag and drop handlers
  const handleDragStart = (itemId: string) => {
    setDraggedItemId(itemId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetItemId: string) => {
    if (!currentDisplayData || !draggedItemId || draggedItemId === targetItemId) {
      setDraggedItemId(null);
      return;
    }

    const items = currentDisplayData.inventory;
    const draggedIndex = items.findIndex(i => i.id === draggedItemId);
    const targetIndex = items.findIndex(i => i.id === targetItemId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedItemId(null);
      return;
    }

    const newItems = [...items];
    const [draggedItem] = newItems.splice(draggedIndex, 1);
    newItems.splice(targetIndex, 0, draggedItem);

    handleUpdateData({ inventory: newItems });
    setDraggedItemId(null);
  };

  // --- STORAGE & VAULT ACTIONS ---

  const createStorage = () => {
    if (!newStorage.name || !characterData) return;
    const storage = {
      id: uuidv4(),
      name: newStorage.name,
      description: newStorage.description,
      notes: '',
      type: newStorage.type,
      inventory: [] as Item[],
      currency: {cp:0, sp:0, gp:0, pp:0},
      isNearby: true
    };
    updateData({ externalStorages: [...characterData.externalStorages, storage] });
    setNewStorage({ name: '', description: '', type: 'Small Pet' });
  };

  const deleteStorage = (id: string) => {
    if (!characterData) return;
    if(window.confirm("Delete this storage unit and all items inside?")) {
      updateData({ externalStorages: characterData.externalStorages.filter(s => s.id !== id) });
      if (viewingStorageId === id) setViewingStorageId(null);
    }
  };

  const createVault = () => {
    if (!newVaultName || !characterData) return;
    const vault: Vault = { id: uuidv4(), name: newVaultName, currency: {cp:0, sp:0, gp:0, pp:0}, isNearby: true };
    updateData({ vaults: [...characterData.vaults, vault] });
    setNewVaultName('');
  };

  const deleteVault = (id: string) => {
    if (!characterData) return;
    if(window.confirm("Delete this vault?")) {
      updateData({ vaults: characterData.vaults.filter(v => v.id !== id) });
    }
  };

  const transferVaultFunds = (vaultId: string, action: 'deposit' | 'withdraw') => {
    if (!currentDisplayData || !characterData) return;
    const vault = characterData.vaults.find(v => v.id === vaultId);
    if (!vault) return;

    const vaultCurrency = vault.currency || { cp: 0, sp: 0, gp: 0, pp: 0 };

    const coinType = window.prompt("Which coin? (cp, sp, gp, pp)", "gp")?.toLowerCase() as keyof Currency;
    if (!coinType || !['cp','sp','gp','pp'].includes(coinType)) return;

    const amountStr = window.prompt(`${action.toUpperCase()} ${coinType.toUpperCase()}:\nVault: ${vaultCurrency[coinType]}\nWallet: ${currentDisplayData.currency[coinType]}`);
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    const newCurrency = { ...currentDisplayData.currency };
    const newVaultCurrency = { ...vaultCurrency };

    if (action === 'deposit') {
      if (newCurrency[coinType] < amount) { alert("Not enough coins."); return; }
      newCurrency[coinType] -= amount;
      newVaultCurrency[coinType] += amount;
    } else {
      if (newVaultCurrency[coinType] < amount) { alert("Not enough coins in vault."); return; }
      newVaultCurrency[coinType] -= amount;
      newCurrency[coinType] += amount;
    }

    const newVaults = characterData.vaults.map(v => v.id === vaultId ? { ...v, currency: newVaultCurrency } : v);
    
    if (viewingStorageId) {
      const newStorages = characterData.externalStorages.map(s => 
        s.id === viewingStorageId ? { ...s, currency: newCurrency } : s
      );
      updateData({ externalStorages: newStorages, vaults: newVaults });
    } else {
      updateData({ currency: newCurrency, vaults: newVaults });
    }
  };

  const transferNearbyCoins = (targetStorageId: string, direction: 'give' | 'take') => {
    if (!characterData || !currentDisplayData) return;
    
    const targetStorage = characterData.externalStorages.find(s => s.id === targetStorageId);
    if (!targetStorage) return;

    const coinType = window.prompt("Which coin? (cp, sp, gp, pp)", "gp")?.toLowerCase() as keyof Currency;
    if (!coinType || !['cp','sp','gp','pp'].includes(coinType)) return;
    
    const amountStr = window.prompt(`Amount?`);
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    if (isNaN(amount) || amount <= 0) return;

    const targetCurrency = targetStorage.currency || { cp: 0, sp: 0, gp: 0, pp: 0 };
    const sourceWallet = direction === 'give' ? currentDisplayData.currency : targetCurrency;
    const targetWallet = direction === 'give' ? targetCurrency : currentDisplayData.currency;
    
    if (sourceWallet[coinType] < amount) { alert("Not enough coins."); return; }

    const newSourceWallet = { ...sourceWallet, [coinType]: sourceWallet[coinType] - amount };
    const newTargetWallet = { ...targetWallet, [coinType]: targetWallet[coinType] + amount };

    let newStorages = [...characterData.externalStorages];
    newStorages = newStorages.map(s => s.id === targetStorageId ? { ...s, currency: direction === 'give' ? newTargetWallet : newSourceWallet } : s);

    if (viewingStorageId) {
      newStorages = newStorages.map(s => s.id === viewingStorageId ? { ...s, currency: direction === 'give' ? newSourceWallet : newTargetWallet } : s);
      updateData({ externalStorages: newStorages });
    } else {
      updateData({ 
        currency: direction === 'give' ? newSourceWallet : newTargetWallet,
        externalStorages: newStorages 
      });
    }
  };

  const transferItem = (item: Item, direction: 'ToStorage' | 'ToPlayer') => {
    if (!characterData || !viewingStorageId) return;
    const storage = characterData.externalStorages.find(s => s.id === viewingStorageId);
    if (!storage || !storage.isNearby) { alert("Storage not nearby."); return; }

    const itemToMove = { ...item, isAttuned: false, equippedSlot: null };
    
    let newPlayerInv = [...characterData.inventory];
    let newStorageInv = [...storage.inventory];

    if (direction === 'ToStorage') {
      newPlayerInv = newPlayerInv.filter(i => i.id !== item.id);
      newStorageInv.push(itemToMove);
    } else {
      newStorageInv = newStorageInv.filter(i => i.id !== item.id);
      newPlayerInv.push(itemToMove);
    }

    const newStorages = characterData.externalStorages.map(s => s.id === viewingStorageId ? { ...s, inventory: newStorageInv } : s);
    updateData({ inventory: newPlayerInv, externalStorages: newStorages });
  };

  // --- GLOBAL SEARCH ACTIONS ---

  const handleGlobalTake = (item: Item, storageId: string) => {
    if (!characterData) return;
    const storage = characterData.externalStorages.find(s => s.id === storageId);
    if (!storage) return;
    
    if (!storage.isNearby) {
      alert(`${storage.name} is not nearby. Cannot take item.`);
      return;
    }

    const newStorageInv = storage.inventory.filter(i => i.id !== item.id);
    const itemToMove = { ...item, isAttuned: false, equippedSlot: null };
    const newPlayerInv = [...characterData.inventory, itemToMove];

    const newStorages = characterData.externalStorages.map(s => s.id === storageId ? { ...s, inventory: newStorageInv } : s);
    
    updateData({
      inventory: newPlayerInv,
      externalStorages: newStorages
    });
  };

  const handleJumpTo = (storageId: string | null) => {
    setViewingStorageId(storageId);
    setActiveTab('Pack');
    setFilterText('');
  };

  // Helper function to add item from repository
  const handleAddFromRepository = (repoItem: RepoItem) => {
    if (!currentDisplayData) return;
    const createdItem: Item = {
      id: uuidv4(),
      name: repoItem.name,
      category: repoItem.category,
      type: repoItem.type,
      weight: repoItem.weight,
      qty: 1,
      value: repoItem.value,
      properties: repoItem.properties || '',
      requiresAttunement: repoItem.requiresAttunement || false,
      isAttuned: false,
      notes: '',
      ac: repoItem.ac,
      damage: repoItem.damage,
      damageModifier: '',
      hitModifier: '',
      equippedSlot: null,
      charges: undefined,
      maxCharges: undefined
    };
    handleUpdateData({ inventory: [...currentDisplayData.inventory, createdItem] });
  };

  // Close the expanded window
  const handleClose = () => {
    OBR.popover.close(EXPANDED_POPOVER_ID);
  };

  if (loading) {
    return (
      <div className="loading">
        Loading expanded inventory...
      </div>
    );
  }

  if (!tokenId || !characterData || !currentDisplayData) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-dark)',
        color: 'var(--text-main)'
      }}>
        <div style={{fontSize: '48px', marginBottom: '16px'}}>📦</div>
        <p style={{fontSize: '16px', marginBottom: '8px'}}>No token selected</p>
        <p style={{fontSize: '12px', color: 'var(--text-muted)'}}>Select a token on the map to view its inventory</p>
        <button
          onClick={handleClose}
          style={{
            marginTop: '16px',
            padding: '8px 16px',
            background: 'var(--border)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Close Window
        </button>
      </div>
    );
  }

  // Permission check: Only GMs and players who claimed the token can view expanded inventory
  // Party tokens are accessible to all players
  // Lore tokens can be expanded by all players (to read lore content)
  const canViewExpandedInventory = () => {
    if (playerRole === 'GM') return true;
    if (characterData.tokenType === 'party') return true;
    if (characterData.tokenType === 'lore') return true; // All players can expand lore tokens
    if (characterData.claimedBy === playerId) return true;
    return false;
  };

  if (!canViewExpandedInventory()) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg-dark)',
        color: 'var(--text-main)'
      }}>
        <div style={{fontSize: '48px', marginBottom: '16px'}}>🔒</div>
        <p style={{fontSize: '16px', marginBottom: '8px'}}>You don't have permission to view this inventory.</p>
        <p style={{fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px'}}>You must claim this token first.</p>
        <button
          onClick={handleClose}
          style={{
            padding: '10px 20px',
            background: 'var(--border)',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold'
          }}
        >
          Close
        </button>
      </div>
    );
  }

  const filteredInventory = currentDisplayData.inventory.filter(item =>
    item.name.toLowerCase().includes(filterText.toLowerCase())
  );

  // Group items by equipped slot for quick access
  const equippedWeapons = currentDisplayData.inventory.filter(i => i.equippedSlot === 'weapon');
  const equippedArmor = currentDisplayData.inventory.filter(i => i.equippedSlot === 'armor');
  const equippedClothing = currentDisplayData.inventory.filter(i => i.equippedSlot === 'clothing');
  const equippedJewelry = currentDisplayData.inventory.filter(i => i.equippedSlot === 'jewelry');
  const equippedUtility = currentDisplayData.inventory.filter(i => i.equippedSlot === 'utility');

  // Determine which tabs are visible
  const baseTabs: { id: Tab; label?: string; icon?: React.ReactNode }[] = [
    { id: 'Home', label: '||' },
    { id: 'Journal', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg> },
    { id: 'Calendar', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> },
    { id: 'Search', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> },
    { id: 'Pack', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7h-3V4c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v3H4c-1.1 0-2 .9-2 2v11c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2zM9 4h6v3H9V4z"/></svg> },
    { id: 'Weapons', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 6.5 9 2 2 9l4.5 5.5"/><path d="m14.5 6.5 5.5 5.5L22 10l-2-2-5.5-1.5z"/><path d="M9 18h4"/><path d="M11 16v6"/></svg> },
    { id: 'Body', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><path d="M6 22V10h12v12"/><path d="M6 10 V8c0-2.2 1.8-4 4-4h4c2.2 0 4 1.8 4 4v2"/></svg> },
    { id: 'Quick', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M2 7h20M7 12h10M12 2a5 5 0 0 0-5 5v10a5 5 0 0 0 10 0V7a5 5 0 0 0-5-5z"/></svg> },
    { id: 'Create', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> },
    { id: 'External', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M3 8V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg> },
    { id: 'Coin', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> },
  ];

  // Add Spells tab for player/party tokens, and NPC tokens (GM only)
  const showSpellsTab = !viewingStorageId && characterData?.tokenType !== 'lore' && 
    characterData?.tokenType !== 'monster' && characterData?.tokenType !== 'merchant' &&
    (characterData?.tokenType !== 'npc' || playerRole === 'GM');
  if (showSpellsTab) {
    baseTabs.push({ id: 'Spells', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8"/><path d="M8 11h8"/></svg> });
  }

  let visibleTabs = baseTabs;

  if (viewingStorageId) {
    visibleTabs = visibleTabs.filter(t => t.id !== 'External');
    const activeStorageType = characterData.externalStorages.find(s => s.id === viewingStorageId)?.type;
    if (!activeStorageType || !STORAGE_TYPES_WITH_EQUIPMENT.includes(activeStorageType)) {
      visibleTabs = visibleTabs.filter(t => !EQUIPMENT_TAB_IDS.includes(t.id));
    }
    const searchIdx = visibleTabs.findIndex(t => t.id === 'Search');
    visibleTabs.splice(searchIdx, 0, { id: 'Transfer', label: 'TRANSFER' });
  }

  const activeStorageDef = viewingStorageId ? STORAGE_DEFINITIONS[characterData.externalStorages.find(s => s.id === viewingStorageId)!.type] : null;

  // Build lore tabs for lore tokens
  let loreTabs: Array<{ id: LoreTabId; label: string; visible: boolean }> = [];
  
  if (characterData?.tokenType === 'lore') {
    // Initialize lore settings if not present
    if (!characterData.loreSettings) {
      updateData({ loreSettings: { loreType: 'custom', tabs: generateDefaultLoreSettings() } });
    }
    
    // Build lore tabs from settings
    if (characterData.loreSettings) {
      const enabledTabs = characterData.loreSettings.tabs
        .filter(t => t.enabled)
        .sort((a, b) => a.order - b.order);
      
      loreTabs = enabledTabs
        .filter(t => playerRole === 'GM' || t.visibleToPlayers)
        .map(t => ({
          id: t.tabId,
          label: LORE_TAB_DEFINITIONS[t.tabId]?.label || t.tabId,
          visible: true,
        }));
    }
    
    // For lore tokens, don't use the standard tabs
    visibleTabs = [];
  }

  // Monster tokens have special tab handling
  if (characterData?.tokenType === 'monster') {
    // Initialize monster settings if not present
    if (!characterData.monsterSettings) {
      const defaultMonsterSettings: MonsterSettings = {
        lootEntries: [],
        actionEntries: [],
        lootVisibleToPlayers: false,
        actionsVisibleToPlayers: false,
      };
      updateData({ monsterSettings: defaultMonsterSettings });
    }

    // For GM: Show Home, Pack, Create, Actions tabs (matching standard view)
    if (playerRole === 'GM') {
      visibleTabs = [
        { id: 'Home' as Tab, label: '||' },
        { id: 'Pack' as Tab, label: 'PACK' },
        { id: 'Create' as Tab, label: 'CREATE' },
        { id: 'Actions' as Tab, label: 'ACTIONS' }
      ];
    } else {
      // For players: Show Home tab, and Pack tab if inventory is visible to players
      const showPackTab = characterData.monsterSettings?.inventoryVisibleToPlayers;
      visibleTabs = [
        { id: 'Home' as Tab, label: 'HOME' },
        ...(showPackTab ? [{ id: 'Pack' as Tab, label: 'PACK' }] : [])
      ];
    }
  }

  // Merchant tokens have simplified tab handling
  if (characterData?.tokenType === 'merchant') {
    // For GM: Show Home, Pack, Create tabs only (no Weapons, Body, Quick, Storage, Calendar)
    if (playerRole === 'GM') {
      visibleTabs = [
        { id: 'Home' as Tab, label: '||' },
        { id: 'Pack' as Tab, label: 'PACK' },
        { id: 'Create' as Tab, label: 'CREATE' },
      ];
    } else {
      // For players: Show Home tab, and Pack tab (merchant inventory is always visible to players for trading)
      visibleTabs = [
        { id: 'Home' as Tab, label: 'HOME' },
        { id: 'Pack' as Tab, label: 'PACK' },
      ];
    }
  }

  return (
    <div className="app-container" style={{background: 'var(--bg-dark)', border: viewingStorageId ? '2px solid var(--accent-gold)' : 'none'}}>
      {/* Storage Viewing Banner */}
      {viewingStorageId && (
        <div style={{background: 'var(--accent-gold)', color: 'black', padding: '4px 8px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <span>VIEWING: {currentDisplayData.condition}</span>
          <button onClick={() => { setViewingStorageId(null); setActiveTab('External'); }} style={{background:'black', color:'white', border:'none', padding:'2px 6px', fontSize:'10px', cursor:'pointer'}}>EXIT</button>
        </div>
      )}

      {/* Header with Cover Photo */}
      <div style={{
        position: 'relative',
        overflow: 'hidden',
        borderBottom: '1px solid var(--glass-border)',
      }}>
        {/* Cover photo as background */}
        {characterData.coverPhotoUrl && !viewingStorageId && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundImage: `url(${characterData.coverPhotoUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.6,
          }} />
        )}
        {/* Gradient overlay for readability */}
        {characterData.coverPhotoUrl && !viewingStorageId && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)',
          }} />
        )}
        {/* Header content on top */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: characterData.coverPhotoUrl && !viewingStorageId ? '30px 16px' : '12px 16px',
          background: characterData.coverPhotoUrl && !viewingStorageId ? 'transparent' : 'rgba(0,0,0,0.3)'
        }}>
          <div style={{display: 'flex', alignItems: 'center', gap: '12px'}}>
            {tokenImage && (
              <div style={{
                width: characterData.coverPhotoUrl && !viewingStorageId ? '75px' : '40px',
                height: characterData.coverPhotoUrl && !viewingStorageId ? '75px' : '40px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '2px solid var(--accent-gold)'
              }}>
                <img src={tokenImage} alt={tokenName || ''} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
              </div>
            )}
            <div>
              <h1 style={{margin: 0, fontSize: '18px', color: 'var(--accent-gold)'}}>
                {tokenName}
                {/* Exhaustion indicator in header */}
                {characterData.characterStats?.exhaustion && characterData.characterStats.exhaustion.currentLevel > 0 && (
                  <span 
                    style={{ 
                      marginLeft: '8px', 
                      fontSize: '14px',
                      color: '#ff9632',
                    }}
                    title={`Exhaustion Level ${characterData.characterStats.exhaustion.currentLevel}`}
                  >
                    (+{characterData.characterStats.exhaustion.currentLevel}) 💤
                  </span>
                )}
              </h1>
              <div style={{fontSize: '11px', color: 'var(--text-muted)'}}>
                {characterData.tokenType === 'lore' 
                  ? '📜 Lore Token'
                  : viewingStorageId 
                    ? `Storage: ${characterData.externalStorages.find(s => s.id === viewingStorageId)?.type}` 
                    : `${characterData.packType} Pack`}
                {characterData.tokenType !== 'lore' && ` • ${currentDisplayData.inventory.length} Items`}
                {characterData.tokenType !== 'lore' && stats && ` • ${stats.totalWeight}/${activeStorageDef?.capacity || stats.maxCapacity}u`}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'var(--border)',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            CLOSE
          </button>
        </div>
      </div>

      {/* Lore Token Navigation */}
      {characterData?.tokenType === 'lore' && loreTabs.length > 0 && (
        <nav className="nav-bar" style={{padding: '8px 12px', gap: '4px'}}>
          {loreTabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-btn ${activeLoreTab === tab.id && activeTab !== 'LoreSettings' ? 'active' : ''}`}
              onClick={() => {
                setActiveLoreTab(tab.id);
                setActiveTab('Home'); // Reset from LoreSettings so lore content renders
              }}
              title={tab.label}
            >
              {tab.label.toUpperCase()}
            </button>
          ))}
          {/* GM Settings Tab */}
          {playerRole === 'GM' && (
            <button
              className={`nav-btn ${activeTab === 'LoreSettings' ? 'active' : ''}`}
              onClick={() => setActiveTab('LoreSettings')}
              title="Lore Settings"
              style={{ marginLeft: 'auto' }}
            >
              ⚙
            </button>
          )}
        </nav>
      )}

      {/* Standard Tab Navigation (non-lore, non-monster tokens) */}
      {characterData?.tokenType !== 'lore' && characterData?.tokenType !== 'monster' && visibleTabs.length > 0 && (
        <nav className="nav-bar" style={{padding: '8px 12px', gap: '4px'}}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.id}
            >
              {tab.icon ? tab.icon : tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* Monster Token Navigation */}
      {characterData?.tokenType === 'monster' && visibleTabs.length > 0 && (
        <nav className="nav-bar" style={{padding: '8px 12px', gap: '4px'}}>
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              className={`nav-btn ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* Main Content */}
      <main className="content" style={{flex: 1, overflow: 'auto', padding: '16px'}}>
        {/* HOME TAB - show for non-lore tokens when Home tab is active, OR for lore tokens when overview tab is active */}
        {activeTab === 'Home' && stats && (characterData?.tokenType !== 'lore' || activeLoreTab === 'overview') && (
          <HomeTab
            stats={stats}
            viewingStorageId={viewingStorageId}
            setShowSettings={() => {}}
            loadDebugInfo={() => {}}
            characterData={characterData}
            playerRole={playerRole}
            playerId={playerId}
            tokenImage={tokenImage}
            tokenName={tokenName}
            toggleFavorite={() => {}}
            isFavorited={false}
            favorites={[]}
            setViewingFavorites={() => {}}
            activeTrade={null}
            tokenId={tokenId}
            canEditToken={canEditToken}
            claimToken={async () => false}
            unclaimToken={() => {}}
            handleUpdateData={handleUpdateData}
            updateData={updateData}
            PACK_DEFINITIONS={PACK_DEFINITIONS}
            currentDisplayData={currentDisplayData}
            activeStorageDef={activeStorageDef}
            showCoverPhoto={false}
            showTokenProfile={false}
          />
        )}

        {/* LORE TABS (non-overview) */}
        {characterData?.tokenType === 'lore' && characterData.loreSettings && activeTab !== 'LoreSettings' && activeLoreTab !== 'overview' && (
          (() => {
            const tabConfig = characterData.loreSettings.tabs.find(t => t.tabId === activeLoreTab);
            if (!tabConfig) return null;
            return (
              <LoreTab
                tabConfig={tabConfig}
                playerRole={playerRole}
                onUpdateEntries={handleUpdateLoreEntries}
              />
            );
          })()
        )}

        {/* LORE SETTINGS TAB (GM Only) */}
        {activeTab === 'LoreSettings' && playerRole === 'GM' && characterData?.tokenType === 'lore' && (
          <LoreSettingsTab
            characterData={characterData}
            updateData={updateData}
          />
        )}

        {/* MONSTER LOOT TAB */}
        {activeTab === 'Loot' && characterData?.tokenType === 'monster' && characterData.monsterSettings && (
          <MonsterLootTab
            monsterSettings={characterData.monsterSettings}
            onUpdate={(updates) => {
              if (!characterData?.monsterSettings) return;
              updateData({
                monsterSettings: {
                  ...characterData.monsterSettings,
                  ...updates,
                },
              });
            }}
            canEdit={playerRole === 'GM'}
          />
        )}

        {/* MONSTER ACTIONS TAB */}
        {activeTab === 'Actions' && characterData?.tokenType === 'monster' && characterData.monsterSettings && (
          <MonsterActionsTab
            monsterSettings={characterData.monsterSettings}
            onUpdate={(updates) => {
              if (!characterData?.monsterSettings) return;
              updateData({
                monsterSettings: {
                  ...characterData.monsterSettings,
                  ...updates,
                },
              });
            }}
            canEdit={playerRole === 'GM'}
          />
        )}

        {/* MONSTER PLAYER VIEW TAB */}
        {activeTab === 'Monster' && characterData?.tokenType === 'monster' && playerRole !== 'GM' && (
          <MonsterPlayerView
            tokenImage={tokenImage}
            tokenName={tokenName}
            characterData={characterData}
          />
        )}

        {/* CALENDAR TAB */}
        {activeTab === 'Calendar' && (
          <CalendarTab playerRole={playerRole} />
        )}

        {/* JOURNAL TAB */}
        {activeTab === 'Journal' && (
          <JournalTab playerRole={playerRole} />
        )}

        {/* SPELLS TAB */}
        {activeTab === 'Spells' && characterData?.tokenType !== 'lore' && 
         characterData?.tokenType !== 'monster' && characterData?.tokenType !== 'merchant' &&
         (characterData?.tokenType !== 'npc' || playerRole === 'GM') && (
          <SpellsTab
            characterData={characterData}
            canEdit={playerRole === 'GM' || characterData?.claimedBy === playerId || characterData?.tokenType === 'party'}
            updateData={updateData}
          />
        )}

        {/* PACK TAB */}
        {activeTab === 'Pack' && (
          <div className="section" style={{padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%'}}>
            <div style={{padding: '8px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border)'}}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px'}}>
                <h2 style={{margin: 0, border: 'none'}}>INVENTORY ({viewingStorageId ? 'STORAGE' : 'PLAYER'})</h2>
                <span style={{fontSize: '10px', color: 'var(--text-muted)'}}>{currentDisplayData.inventory.length} Items</span>
              </div>
              <input type="text" placeholder="Filter items..." className="search-input" style={{marginTop: 0}} value={filterText} onChange={(e) => setFilterText(e.target.value)} />
            </div>
            <div style={{flex: 1, overflowY: 'auto', padding: '0 8px 8px 8px'}}>
              <table style={{width: '100%', borderCollapse: 'collapse', marginTop: '8px'}}>
                <thead>
                  <tr style={{borderBottom: '2px solid var(--border)', color: 'var(--accent-gold)', fontSize: '10px', textAlign: 'left', position: 'sticky', top: 0, background: 'var(--bg-dark)'}}>
                    <th style={{padding: '8px 4px'}}>QTY</th>
                    <th style={{padding: '8px 4px'}}>ITEM</th>
                    <th style={{padding: '8px 4px'}}>TYPE</th>
                    <th style={{padding: '8px 4px'}}>VALUE</th>
                    <th style={{padding: '8px 4px', textAlign: 'center'}}>CHARGES</th>
                    <th style={{padding: '8px 4px', textAlign: 'center'}}>WT</th>
                    <th style={{padding: '8px 4px', textAlign: 'right'}}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map((item) => (
                    <Fragment key={item.id}>
                      <tr
                        draggable={canEditToken()}
                        onDragStart={() => handleDragStart(item.id)}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(item.id)}
                        style={{
                          borderTop: '1px solid #333',
                          cursor: canEditToken() ? 'grab' : 'default',
                          opacity: draggedItemId === item.id ? 0.5 : 1,
                          background: draggedItemId === item.id ? 'rgba(255, 215, 0, 0.1)' : 'transparent'
                        }}
                      >
                        <td style={{padding: '8px 4px', width: '50px'}}>
                          <input
                            type="number"
                            value={item.qty}
                            min="1"
                            disabled={!canEditToken()}
                            onChange={(e) => {
                              const parsedQty = parseInt(e.target.value);
                              if (isNaN(parsedQty) || parsedQty < 1) return;
                              const newInv = currentDisplayData.inventory.map(i => i.id === item.id ? {...i, qty: parsedQty} : i);
                              handleUpdateData({inventory: newInv});
                            }}
                            style={{width: '40px', background: '#222', border: '1px solid #444', color: 'white', textAlign: 'center', padding: '4px'}}
                          />
                        </td>
                        <td style={{padding: '8px 4px'}}>
                          <div style={{fontWeight: 'bold', fontSize: '13px', color: item.equippedSlot ? 'var(--accent-gold)' : 'var(--text-main)'}}>{item.name}</div>
                          {item.equippedSlot && <div style={{fontSize: '9px', textTransform: 'uppercase', color: 'var(--accent-gold)'}}>[EQ: {item.equippedSlot}]</div>}
                        </td>
                        <td style={{padding: '8px 4px', width: '100px'}}>
                          <select
                            value={item.category}
                            disabled={!canEditToken()}
                            onChange={(e) => {
                              const cat = e.target.value as ItemCategory;
                              const newWeight = DEFAULT_CATEGORY_WEIGHTS[cat] || item.weight;
                              const newInv = currentDisplayData.inventory.map(i => i.id === item.id ? {...i, category: cat, weight: newWeight} : i);
                              handleUpdateData({inventory: newInv});
                            }}
                            style={{width: '100%', background: 'transparent', border: 'none', color: '#aaa', fontSize: '11px'}}
                          >
                            {ITEM_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </td>
                        <td style={{padding: '8px 4px', fontSize: '11px', color: '#888'}}>{item.value || '-'}</td>
                        <td style={{padding: '8px 4px', textAlign: 'center', fontSize: '11px'}}>
                          {item.maxCharges !== undefined ? (
                            <span style={{color: (item.charges || 0) === 0 ? '#f44' : 'var(--text-main)'}}>
                              {item.charges || 0}/{item.maxCharges}
                            </span>
                          ) : <span style={{color: '#444'}}>-</span>}
                        </td>
                        <td style={{padding: '8px 4px', textAlign: 'center', fontSize: '11px', color: '#888'}}>{item.weight * item.qty}</td>
                        <td style={{padding: '8px 4px', textAlign: 'right'}}>
                          {canEditToken() && characterData?.tokenType !== 'merchant' && (
                            <>
                              <button onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: editingItemId === item.id ? 'var(--accent-gold)' : '#555', padding: '2px', marginRight: '4px'}} title="Edit">✎</button>
                              <button onClick={() => handleToggleEquip(item)} style={{background: 'none', border: 'none', cursor: 'pointer', color: item.equippedSlot ? 'var(--accent-gold)' : '#555', padding: '2px', marginRight: '4px'}} title="Equip/Unequip">⚔</button>
                              <button onClick={() => handleSell(item)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px', marginRight: '4px'}} title="Sell">$</button>
                              <button onClick={() => handleDelete(item.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px'}} title="Delete">✕</button>
                            </>
                          )}
                          {/* Merchant tokens: Only show edit and delete buttons (GM only), no equip/sell */}
                          {characterData?.tokenType === 'merchant' && playerRole === 'GM' && (
                            <>
                              <button onClick={() => setEditingItemId(editingItemId === item.id ? null : item.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: editingItemId === item.id ? 'var(--accent-gold)' : '#555', padding: '2px', marginRight: '4px'}} title="Edit">✎</button>
                              <button onClick={() => handleDelete(item.id)} style={{background: 'none', border: 'none', cursor: 'pointer', color: '#555', padding: '2px'}} title="Delete">✕</button>
                            </>
                          )}
                        </td>
                      </tr>
                      {editingItemId === item.id && canEditToken() && (
                        <tr style={{background: 'rgba(0,0,0,0.3)'}}>
                          <td colSpan={7} style={{padding: '12px'}}>
                            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px'}}>
                              <div>
                                <label style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px'}}>Name</label>
                                <input className="search-input" style={{marginTop: 0}} value={item.name} onChange={(e) => { const newInv = currentDisplayData.inventory.map(i => i.id === item.id ? {...i, name: e.target.value} : i); handleUpdateData({inventory: newInv}); }} />
                              </div>
                              <div>
                                <label style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px'}}>Weight</label>
                                <input type="number" className="search-input" style={{marginTop: 0}} value={item.weight} onChange={(e) => { const newInv = currentDisplayData.inventory.map(i => i.id === item.id ? {...i, weight: parseFloat(e.target.value)} : i); handleUpdateData({inventory: newInv}); }} />
                              </div>
                              <div>
                                <label style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px'}}>Value</label>
                                <input className="search-input" style={{marginTop: 0}} value={item.value} onChange={(e) => { const newInv = currentDisplayData.inventory.map(i => i.id === item.id ? {...i, value: e.target.value} : i); handleUpdateData({inventory: newInv}); }} />
                              </div>
                              <div style={{gridColumn: 'span 3'}}>
                                <label style={{display: 'block', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px'}}>Properties / Notes</label>
                                <textarea className="search-input" style={{marginTop: 0, minHeight: '50px'}} value={item.properties || ''} onChange={(e) => { const newInv = currentDisplayData.inventory.map(i => i.id === item.id ? {...i, properties: e.target.value} : i); handleUpdateData({inventory: newInv}); }} />
                                <MarkdownHint />
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      {editingItemId !== item.id && item.properties && (
                        <tr style={{background: 'rgba(0,0,0,0.1)'}}>
                          <td colSpan={7} style={{padding: '4px 8px 8px 8px', fontSize: '10px', color: '#888', fontStyle: 'italic'}} dangerouslySetInnerHTML={{ __html: parseMarkdown(item.properties) }} />
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* WEAPONS TAB */}
        {activeTab === 'Weapons' && (
          <div className="section">
            <h2>Equipped Weapons</h2>
            {equippedWeapons.map(item => (
              <div key={item.id} style={{background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '4px', display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px'}}>
                <div>
                  <div style={{fontWeight:'bold', color: 'var(--text-main)'}}>{item.name}</div>
                  <div style={{fontSize:'11px', color:'var(--accent-gold)'}}>
                    {item.damage || 'No Damage'}
                    {item.hitModifier && <span style={{marginLeft: '8px'}}>Hit: {item.hitModifier}</span>}
                    {item.damageModifier && <span style={{marginLeft: '8px'}}>Dmg: {item.damageModifier}</span>}
                  </div>
                  <div style={{fontSize:'10px', color:'#888', fontStyle:'italic'}} dangerouslySetInnerHTML={{ __html: parseMarkdown(item.properties || 'No properties') }} />
                </div>
                <button onClick={() => handleToggleEquip(item)} style={{background: '#333', color: '#888', border:'none', padding:'4px 8px', borderRadius:'4px', fontSize:'10px', cursor:'pointer'}}>UNEQUIP</button>
              </div>
            ))}
            {equippedWeapons.length === 0 && <p style={{color:'#666', fontStyle:'italic'}}>No weapons equipped.</p>}
          </div>
        )}

        {/* BODY TAB */}
        {activeTab === 'Body' && (
          <div className="section">
            <h2>Body Slots</h2>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px'}}>
              <div>
                <div style={{borderBottom:'1px solid #333', marginBottom:'8px'}}><span style={{fontSize:'11px', color:'var(--text-muted)', fontWeight:'bold'}}>ARMOR</span></div>
                {equippedArmor.map(item => (
                  <div key={item.id} style={{background: 'rgba(0,0,0,0.2)', padding: '8px', marginBottom: '4px', borderRadius: '4px', display:'flex', justifyContent:'space-between'}}>
                    <div><div style={{fontWeight:'bold'}}>{item.name}</div>{item.ac && <div style={{fontSize:'10px', color:'var(--accent-gold)'}}>AC: +{item.ac}</div>}</div>
                    <button onClick={() => handleToggleEquip(item)} style={{background:'none', border:'none', color:'#555', cursor:'pointer'}}>X</button>
                  </div>
                ))}
                {equippedArmor.length === 0 && <p style={{color:'#666', fontStyle:'italic', fontSize: '11px'}}>None</p>}
              </div>
              <div>
                <div style={{borderBottom:'1px solid #333', marginBottom:'8px'}}><span style={{fontSize:'11px', color:'var(--text-muted)', fontWeight:'bold'}}>CLOTHING</span></div>
                {equippedClothing.map(item => (
                  <div key={item.id} style={{background: 'rgba(0,0,0,0.2)', padding: '8px', marginBottom: '4px', borderRadius: '4px', display:'flex', justifyContent:'space-between'}}>
                    <div style={{fontWeight:'bold'}}>{item.name}</div>
                    <button onClick={() => handleToggleEquip(item)} style={{background:'none', border:'none', color:'#555', cursor:'pointer'}}>X</button>
                  </div>
                ))}
                {equippedClothing.length === 0 && <p style={{color:'#666', fontStyle:'italic', fontSize: '11px'}}>None</p>}
              </div>
              <div style={{gridColumn: 'span 2'}}>
                <div style={{borderBottom:'1px solid #333', marginBottom:'8px'}}><span style={{fontSize:'11px', color:'var(--text-muted)', fontWeight:'bold'}}>JEWELRY</span></div>
                {equippedJewelry.map(item => (
                  <div key={item.id} style={{background: 'rgba(0,0,0,0.2)', padding: '8px', marginBottom: '4px', borderRadius: '4px', display:'flex', justifyContent:'space-between'}}>
                    <div><div style={{fontWeight:'bold'}}>{item.name}</div>{item.properties && <div style={{fontSize:'10px', color:'#888'}} dangerouslySetInnerHTML={{ __html: parseMarkdown(item.properties) }} />}</div>
                    <button onClick={() => handleToggleEquip(item)} style={{background:'none', border:'none', color:'#555', cursor:'pointer'}}>X</button>
                  </div>
                ))}
                {equippedJewelry.length === 0 && <p style={{color:'#666', fontStyle:'italic', fontSize: '11px'}}>None</p>}
              </div>
            </div>
          </div>
        )}

        {/* QUICK TAB */}
        {activeTab === 'Quick' && (
          <div className="section">
            <h2>Quick Slots / Utility</h2>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '16px'}}>
              {equippedUtility.map(item => (
                <div key={item.id} style={{background: 'rgba(240, 225, 48, 0.05)', border:'1px solid rgba(240, 225, 48, 0.2)', padding: '12px', borderRadius: '4px', position:'relative'}}>
                  <div style={{fontWeight:'bold', fontSize:'12px', paddingRight:'20px'}}>{item.name}</div>
                  <div style={{fontSize:'10px', color:'#888'}}>{item.qty > 1 ? `Qty: ${item.qty}` : ''}</div>
                  {item.properties && <div style={{fontSize:'10px', color:'var(--accent-gold)', marginTop: '4px', fontStyle:'italic'}} dangerouslySetInnerHTML={{ __html: parseMarkdown(item.properties) }} />}
                  <button onClick={() => handleToggleEquip(item)} style={{position:'absolute', top:4, right:4, background:'none', border:'none', color:'#555', cursor:'pointer', fontSize:'10px'}}>X</button>
                </div>
              ))}
            </div>
            {equippedUtility.length === 0 && <p style={{color:'#666', fontStyle:'italic', textAlign:'center', marginTop:'20px'}}>No utility items equipped.</p>}
          </div>
        )}

        {/* SEARCH TAB */}
        {activeTab === 'Search' && (
          <div className="section">
            <h2>Global Search</h2>
            <input className="search-input" placeholder="Search items (min 2 chars)..." value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} autoFocus />
            <div style={{marginTop: '16px'}}>
              {globalSearch.length < 2 ? <p style={{color:'#666', fontStyle:'italic'}}>Type to search...</p> : (() => {
                const term = globalSearch.toLowerCase();
                const results: { item: Item, source: string, storageId: string | null, isNearby: boolean }[] = [];
                characterData.inventory.forEach(item => { if (item.name.toLowerCase().includes(term)) results.push({ item, source: 'Player', storageId: null, isNearby: true }); });
                characterData.externalStorages.forEach(storage => { storage.inventory.forEach(item => { if (item.name.toLowerCase().includes(term)) results.push({ item, source: storage.name, storageId: storage.id, isNearby: storage.isNearby }); }); });
                if (results.length === 0) return <p style={{color:'#666'}}>No items found.</p>;
                return (
                  <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
                    {results.map((res, idx) => (
                      <div key={`${res.item.id}-${idx}`} style={{background:'rgba(255,255,255,0.05)', padding:'12px', borderRadius:'4px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                        <div>
                          <div style={{fontWeight:'bold', color:'var(--text-main)'}}>{res.item.name}</div>
                          <div style={{fontSize:'11px', color: res.storageId ? 'var(--accent-gold)' : '#888'}}>{res.source} {res.item.qty > 1 ? `(x${res.item.qty})` : ''}{res.storageId && !res.isNearby && <span style={{color:'var(--danger)', marginLeft:'4px'}}>(Not Nearby)</span>}</div>
                        </div>
                        <div style={{display:'flex', gap:'8px'}}>
                          {res.storageId && <button onClick={() => handleGlobalTake(res.item, res.storageId!)} disabled={!res.isNearby} style={{background: res.isNearby ? '#333' : '#222', color: res.isNearby ? 'white' : '#555', border:'none', padding:'6px 12px', borderRadius:'4px', fontSize:'11px', cursor: res.isNearby ? 'pointer' : 'not-allowed'}}>TAKE</button>}
                          <button onClick={() => handleJumpTo(res.storageId)} style={{background:'var(--border)', color:'white', border:'none', padding:'6px 12px', borderRadius:'4px', fontSize:'11px', cursor:'pointer'}}>JUMP</button>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* CREATE TAB */}
        {activeTab === 'Create' && (
          <div className="section">
            <h2>Forge New Item</h2>
            <div style={{ position: 'relative', marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px dashed var(--border)' }}>
              <label style={{display:'block', fontSize:'11px', color:'var(--accent-gold)', fontWeight:'bold'}}>SEARCH REPOSITORY</label>
              <input className="search-input" placeholder="Search by name, category, or type" value={repoSearch} onChange={(e) => { setRepoSearch(e.target.value); setShowRepo(e.target.value.length > 1); }} onFocus={() => { if (repoSearch.length > 1) setShowRepo(true); }} />
              {showRepo && repoSearch.length > 1 && (
                <div style={{position: 'absolute', top: '100%', left: 0, right: 0, background: '#222', border: '1px solid var(--accent-gold)', maxHeight: '300px', overflowY: 'auto', zIndex: 100, borderRadius: '0 0 4px 4px'}}>
                  {itemRepository.filter(i => i.name.toLowerCase().includes(repoSearch.toLowerCase()) || i.category.toLowerCase().includes(repoSearch.toLowerCase()) || i.type.toLowerCase().includes(repoSearch.toLowerCase())).map((repoItem, idx) => (
                    <div key={idx} style={{padding: '8px', cursor: 'pointer', borderBottom:'1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}} onMouseEnter={(e) => e.currentTarget.style.background = '#444'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <div style={{flex: 1}} onClick={() => { setNewItem({name: repoItem.name, category: repoItem.category, type: repoItem.type, weight: repoItem.weight, value: repoItem.value, damage: repoItem.damage || '', ac: repoItem.ac, properties: repoItem.properties || '', requiresAttunement: repoItem.requiresAttunement || false, qty: 1}); setRepoSearch(''); setShowRepo(false); }}>
                        <div style={{fontWeight:'bold', color:'var(--text-main)'}}>{repoItem.name}</div>
                        <div style={{fontSize:'10px', color:'#888'}}>{repoItem.type} | {repoItem.weight}u {repoItem.damage ? `| ${repoItem.damage}` : ''}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); handleAddFromRepository(repoItem); }} style={{background: 'var(--accent-gold)', color: 'black', border: 'none', padding: '4px 12px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', marginLeft: '8px'}}>ADD</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px'}}>
              <div style={{gridColumn: 'span 2'}}><label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Item Name</label><input className="search-input" value={newItem.name} onChange={e => setNewItem({...newItem, name: e.target.value})} placeholder="Ex: Longsword +1" /></div>
              <div><label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Category</label><select className="search-input" value={newItem.category} onChange={e => { const cat = e.target.value as ItemCategory; setNewItem({...newItem, category: cat, weight: DEFAULT_CATEGORY_WEIGHTS[cat] || 1}); }}>{ITEM_CATEGORIES.map(cat => (<option key={cat} value={cat}>{cat}</option>))}</select></div>
              <div><label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Type</label><input className="search-input" value={newItem.type} onChange={e => setNewItem({...newItem, type: e.target.value})} /></div>
              <div><label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Weight</label><input type="number" className="search-input" value={newItem.weight} onChange={e => setNewItem({...newItem, weight: parseFloat(e.target.value)})} /></div>
              <div><label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Qty</label><input type="number" className="search-input" value={newItem.qty} onChange={e => setNewItem({...newItem, qty: parseInt(e.target.value)})} /></div>
              <div><label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Value</label><input className="search-input" value={newItem.value} onChange={e => setNewItem({...newItem, value: e.target.value})} placeholder="10gp" /></div>
              <div style={{gridColumn: 'span 3'}}>
                <label style={{display:'block', fontSize:'11px', color:'var(--text-muted)'}}>Properties / Notes</label>
                <textarea className="search-input" rows={2} value={newItem.properties} onChange={e => setNewItem({...newItem, properties: e.target.value})} />
                <MarkdownHint />
              </div>
            </div>
            <button onClick={handleCreateItem} style={{width: '100%', marginTop: '16px', padding: '12px', backgroundColor: 'var(--accent-gold)', color: 'black', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer'}}>FORGE ITEM</button>
          </div>
        )}

        {/* EXTERNAL/STORAGE TAB */}
        {activeTab === 'External' && !viewingStorageId && (
          <div className="section">
            <h2>External Storage</h2>
            <div style={{marginBottom: '20px'}}>
              {characterData.externalStorages.length === 0 ? <p style={{color:'#666', fontStyle:'italic'}}>No external storage created.</p> : (
                <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px'}}>
                  {characterData.externalStorages.map(storage => (
                    <div key={storage.id} style={{background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '4px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                      <div><div style={{fontWeight:'bold'}}>{storage.name}</div><div style={{fontSize:'11px', color:'#888'}}>{storage.type} | {storage.inventory.length} Items</div></div>
                      <div><button onClick={() => { setViewingStorageId(storage.id); setActiveTab('Home'); }} style={{background: 'var(--accent-gold)', color: 'black', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer', marginRight:'8px'}}>VIEW</button><button onClick={() => deleteStorage(storage.id)} style={{background: '#333', color: '#888', border: 'none', padding: '6px', borderRadius: '4px', cursor: 'pointer'}}>X</button></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <h3>Add New Storage</h3>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px'}}>
              <input className="search-input" placeholder="Name (e.g. Shadowfax)" value={newStorage.name} onChange={e => setNewStorage({...newStorage, name: e.target.value})} />
              <select className="search-input" value={newStorage.type} onChange={e => setNewStorage({...newStorage, type: e.target.value as StorageType})}>{Object.keys(STORAGE_DEFINITIONS).map(t => <option key={t} value={t}>{t}</option>)}</select>
              <input className="search-input" placeholder="Description / Notes" value={newStorage.description} onChange={e => setNewStorage({...newStorage, description: e.target.value})} style={{gridColumn:'span 2'}} />
            </div>
            <button onClick={createStorage} style={{width:'100%', marginTop:'10px', padding:'10px', background:'var(--border)', color:'white', border:'none', cursor:'pointer', borderRadius:'4px'}}>CREATE STORAGE</button>
          </div>
        )}

        {/* TRANSFER TAB */}
        {activeTab === 'Transfer' && viewingStorageId && (
          <div className="section">
            <h2>Transfer Items</h2>
            {!characterData.externalStorages.find(s => s.id === viewingStorageId)?.isNearby ? (
              <div style={{color: 'var(--danger)', textAlign:'center', padding:'20px'}}>Storage is NOT Nearby.<br/>Cannot transfer items.</div>
            ) : (
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', height: '450px'}}>
                <div style={{border: '1px solid #333', borderRadius: '4px', padding: '12px', overflowY: 'auto'}}>
                  <h3 style={{marginTop:0, fontSize:'12px', color:'var(--accent-gold)'}}>PLAYER</h3>
                  {characterData.inventory.map(item => (
                    <div key={item.id} style={{fontSize:'11px', borderBottom:'1px solid #333', padding:'8px', display:'flex', justifyContent:'space-between'}}>
                      <span>{item.name} ({item.qty}) {item.equippedSlot && <span style={{color:'var(--accent-gold)'}}>[EQ]</span>}</span>
                      <button onClick={() => transferItem(item, 'ToStorage')} style={{cursor:'pointer', background: '#333', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px'}}>→</button>
                    </div>
                  ))}
                </div>
                <div style={{border: '1px solid #333', borderRadius: '4px', padding: '12px', overflowY: 'auto'}}>
                  <h3 style={{marginTop:0, fontSize:'12px', color:'var(--accent-gold)'}}>STORAGE</h3>
                  {currentDisplayData.inventory.map(item => (
                    <div key={item.id} style={{fontSize:'11px', borderBottom:'1px solid #333', padding:'8px', display:'flex', justifyContent:'space-between'}}>
                      <button onClick={() => transferItem(item, 'ToPlayer')} style={{cursor:'pointer', background: '#333', border: 'none', color: 'white', padding: '4px 8px', borderRadius: '4px'}}>←</button>
                      <span>{item.name} ({item.qty})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* COIN TAB */}
        {activeTab === 'Coin' && stats && (
          <div className="section">
            <h2>Currency ({viewingStorageId ? 'Storage' : 'Player'})</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              {(['cp', 'sp', 'gp', 'pp'] as const).map((key) => {
                const labels = { cp: 'Copper', sp: 'Silver', gp: 'Gold', pp: 'Platinum' };
                const displayCurrency = currentDisplayData.currency || { cp: 0, sp: 0, gp: 0, pp: 0 };
                return (
                  <div key={key} style={{ background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '4px' }}>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>{labels[key]}</label>
                    <input type="number" min="0" value={displayCurrency[key]} onChange={(e) => { const val = parseInt(e.target.value) || 0; handleUpdateData({currency: { ...displayCurrency, [key]: val }}); }} onFocus={(e) => e.target.select()} disabled={!canEditToken()} style={{width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text-main)', fontSize: '20px', fontWeight: 'bold', cursor: canEditToken() ? 'text' : 'not-allowed', opacity: canEditToken() ? 1 : 0.5}} />
                  </div>
                );
              })}
            </div>
            <div className="totals-grid" style={{marginBottom: '16px'}}>
              <div className="stat-box"><div className="stat-label">Total Coins</div><div className={`stat-value ${stats.totalCoins > 30 ? 'warning' : ''}`}>{stats.totalCoins}</div></div>
              {!viewingStorageId && <div className="stat-box"><div className="stat-label">Limit w/o Penalty</div><div className="stat-value">30</div></div>}
              <div className="stat-box" style={{ border: stats.coinWeight > 0 ? '1px solid var(--danger)' : 'none' }}><div className="stat-label">Added Weight</div><div className={`stat-value ${stats.coinWeight > 0 ? 'danger' : ''}`}>+{stats.coinWeight}u</div></div>
            </div>
            {!viewingStorageId && characterData.externalStorages.some(s => s.isNearby) && (
              <div style={{marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
                <h3 style={{fontSize:'14px', color:'var(--accent-gold)', marginTop:0}}>NEARBY STORAGE WALLETS</h3>
                {characterData.externalStorages.filter(s => s.isNearby).map(storage => (
                  <div key={storage.id} style={{background:'rgba(255,255,255,0.05)', padding:'8px', borderRadius:'4px', marginBottom:'8px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <div><div style={{fontWeight:'bold', fontSize:'12px'}}>{storage.name}</div><div style={{fontSize:'10px', color:'#aaa'}}>{(storage.currency || {gp:0}).gp} GP</div></div>
                    <div style={{display:'flex', gap:'4px'}}><button onClick={() => transferNearbyCoins(storage.id, 'give')} style={{background:'#333', border:'none', color:'white', fontSize:'10px', padding:'6px 12px', borderRadius:'4px', cursor:'pointer'}}>GIVE</button><button onClick={() => transferNearbyCoins(storage.id, 'take')} style={{background:'#333', border:'none', color:'white', fontSize:'10px', padding:'6px 12px', borderRadius:'4px', cursor:'pointer'}}>TAKE</button></div>
                  </div>
                ))}
              </div>
            )}
            <div style={{marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px'}}>
              <h3 style={{fontSize:'14px', color:'var(--accent-gold)', marginTop:0}}>VAULTS (BANKS)</h3>
              {characterData.vaults.length === 0 && <p style={{fontSize:'11px', color:'#666'}}>No vaults created.</p>}
              {characterData.vaults.map(vault => { const vCurrency = ensureCurrency(vault.currency); return (
                <div key={vault.id} style={{background:'rgba(255,255,255,0.05)', padding:'12px', borderRadius:'4px', marginBottom:'8px'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}><div style={{fontWeight:'bold', color:'var(--text-main)'}}>{vault.name}</div><div style={{fontWeight:'bold', color:'var(--accent-gold)'}}>{formatCurrency(vCurrency)}</div></div>
                  <div style={{display:'flex', gap:'4px'}}><button onClick={() => transferVaultFunds(vault.id, 'deposit')} style={{flex:1, background:'#333', border:'none', color:'white', fontSize:'10px', padding:'6px', borderRadius:'4px', cursor:'pointer'}}>DEPOSIT</button><button onClick={() => transferVaultFunds(vault.id, 'withdraw')} style={{flex:1, background:'#333', border:'none', color:'white', fontSize:'10px', padding:'6px', borderRadius:'4px', cursor:'pointer'}}>WITHDRAW</button><button onClick={() => deleteVault(vault.id)} style={{background:'#333', border:'none', color:'var(--danger)', fontSize:'10px', padding:'6px 12px', borderRadius:'4px', cursor:'pointer'}}>X</button></div>
                </div>
              );})}
              <div style={{marginTop:'12px', display:'flex', gap:'8px'}}><input className="search-input" placeholder="New Vault Name" value={newVaultName} onChange={e => setNewVaultName(e.target.value)} style={{marginTop:0}} /><button onClick={createVault} style={{background:'var(--border)', color:'white', border:'none', padding:'0 12px', borderRadius:'4px', cursor:'pointer'}}>ADD</button></div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
