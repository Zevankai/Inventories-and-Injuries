import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import OBR from '@owlbear-rodeo/sdk';
import { nanoid } from 'nanoid';
import type { JournalFolder, JournalNote, JournalData, Visibility } from '../types/journal';
import { getCampaignId, loadJournals, saveJournals } from '../services/storageService';

interface JournalContextType {
  folders: JournalFolder[];
  notes: JournalNote[];
  loading: boolean;
  currentUserId: string | null;
  playerRole: string | null;
  
  // Folder operations
  addFolder: (name: string, parentId: string | null, visibility: Visibility) => Promise<JournalFolder>;
  updateFolder: (id: string, updates: Partial<JournalFolder>) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  
  // Note operations
  addNote: (title: string, folderId: string | null, visibility: Visibility) => Promise<JournalNote>;
  updateNote: (id: string, updates: Partial<JournalNote>) => Promise<void>;
  deleteNote: (id: string) => Promise<void>;
  
  // Controlled tokens for "Shared with me"
  controlledTokenIds: string[];
}

const JournalContext = createContext<JournalContextType | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export const useJournal = () => {
  const context = useContext(JournalContext);
  if (!context) {
    throw new Error('useJournal must be used within a JournalProvider');
  }
  return context;
};

interface JournalProviderProps {
  children: ReactNode;
}

export const JournalProvider: React.FC<JournalProviderProps> = ({ children }) => {
  const [folders, setFolders] = useState<JournalFolder[]>([]);
  const [notes, setNotes] = useState<JournalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [playerRole, setPlayerRole] = useState<string | null>(null);
  const [controlledTokenIds, setControlledTokenIds] = useState<string[]>([]);
  const [currentTokenId, setCurrentTokenId] = useState<string | null>(null);

  // Load journal data and user info
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Get campaign ID
        const campaignId = await getCampaignId();
        
        // Get current token ID from selection
        const selection = await OBR.player.getSelection();
        const tokenId = selection && selection.length > 0 ? selection[0] : null;
        
        if (!tokenId) {
          console.log('[JournalContext] No token selected');
          setLoading(false);
          return;
        }
        
        setCurrentTokenId(tokenId);
        
        // Load journals for this specific token
        const data = await loadJournals(campaignId, tokenId);
        setFolders(data.folders);
        setNotes(data.notes);
        
        // Get current user info
        const playerId = await OBR.player.id;
        const role = await OBR.player.getRole();
        setCurrentUserId(playerId);
        setPlayerRole(role);
        
        // Get controlled tokens
        const items = await OBR.scene.items.getItems();
        const tokenItems = items.filter((item) => item.layer === 'CHARACTER');
        const controlled = tokenItems
          .filter((token) => {
            const metadata = token.metadata as any;
            return metadata['com.weighted-inventory/claim']?.playerId === playerId;
          })
          .map((token) => token.id);
        setControlledTokenIds(controlled);
        
        console.log('[JournalContext] Loaded journals for token:', tokenId, data.folders.length, 'folders,', data.notes.length, 'notes');
      } catch (error) {
        console.error('[JournalContext] Error loading journals:', error);
      } finally {
        setLoading(false);
      }
    };

    const init = async () => {
      // Initial load
      await loadData();
      
      // Subscribe to player selection changes instead of polling
      unsubscribe = OBR.player.onChange(async (player) => {
        const selection = player.selection || [];
        const tokenId = selection.length > 0 ? selection[0] : null;
        
        if (tokenId && tokenId !== currentTokenId) {
          console.log('[JournalContext] Selection changed, reloading journals for new token:', tokenId);
          await loadData();
        }
      });
    };

    init();

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []); // Empty dependency array - runs once on mount

  // Save journals to storage
  const saveData = async (updatedFolders: JournalFolder[], updatedNotes: JournalNote[]) => {
    if (!currentTokenId) {
      console.error('[JournalContext] No token ID available for saving');
      return;
    }
    
    try {
      const campaignId = await getCampaignId();
      const data: JournalData = {
        folders: updatedFolders,
        notes: updatedNotes,
      };
      const success = await saveJournals(campaignId, currentTokenId, data);
      if (!success) {
        console.error('[JournalContext] Failed to save journals');
      }
    } catch (error) {
      console.error('[JournalContext] Error saving journals:', error);
    }
  };

  // Folder operations
  const addFolder = async (name: string, parentId: string | null, visibility: Visibility): Promise<JournalFolder> => {
    if (!currentUserId) {
      console.error('[JournalContext] Cannot add folder: User ID not available yet');
      throw new Error('User ID not available');
    }
    
    const newFolder: JournalFolder = {
      id: nanoid(),
      name,
      parentId,
      order: folders.filter(f => f.parentId === parentId).length,
      createdBy: currentUserId,
      createdAt: new Date().toISOString(),
      visibility,
    };
    
    const updatedFolders = [...folders, newFolder];
    setFolders(updatedFolders);
    await saveData(updatedFolders, notes);
    return newFolder;
  };

  const updateFolder = async (id: string, updates: Partial<JournalFolder>) => {
    const updatedFolders = folders.map(folder =>
      folder.id === id ? { ...folder, ...updates } : folder
    );
    setFolders(updatedFolders);
    await saveData(updatedFolders, notes);
  };

  const deleteFolder = async (id: string) => {
    // Delete folder and all its children recursively
    const getAllChildFolderIds = (parentId: string): string[] => {
      const children = folders.filter(f => f.parentId === parentId);
      return [
        parentId,
        ...children.flatMap(child => getAllChildFolderIds(child.id))
      ];
    };
    
    const folderIdsToDelete = getAllChildFolderIds(id);
    const updatedFolders = folders.filter(f => !folderIdsToDelete.includes(f.id));
    const updatedNotes = notes.filter(n => !folderIdsToDelete.includes(n.folderId || ''));
    
    setFolders(updatedFolders);
    setNotes(updatedNotes);
    await saveData(updatedFolders, updatedNotes);
  };

  // Note operations
  const addNote = async (title: string, folderId: string | null, visibility: Visibility): Promise<JournalNote> => {
    if (!currentUserId) {
      console.error('[JournalContext] Cannot add note: User ID not available yet');
      throw new Error('User ID not available');
    }
    
    const now = new Date().toISOString();
    const newNote: JournalNote = {
      id: nanoid(),
      folderId,
      title,
      content: '',
      createdBy: currentUserId,
      createdAt: now,
      updatedAt: now,
      visibility,
      sharedWithTokenIds: [],
    };
    
    const updatedNotes = [...notes, newNote];
    setNotes(updatedNotes);
    await saveData(folders, updatedNotes);
    return newNote;
  };

  const updateNote = async (id: string, updates: Partial<JournalNote>) => {
    const updatedNotes = notes.map(note =>
      note.id === id 
        ? { ...note, ...updates, updatedAt: new Date().toISOString() } 
        : note
    );
    setNotes(updatedNotes);
    await saveData(folders, updatedNotes);
  };

  const deleteNote = async (id: string) => {
    const updatedNotes = notes.filter(n => n.id !== id);
    setNotes(updatedNotes);
    await saveData(folders, updatedNotes);
  };

  const value: JournalContextType = {
    folders,
    notes,
    loading,
    currentUserId,
    playerRole,
    addFolder,
    updateFolder,
    deleteFolder,
    addNote,
    updateNote,
    deleteNote,
    controlledTokenIds,
  };

  return (
    <JournalContext.Provider value={value}>
      {children}
    </JournalContext.Provider>
  );
};
