/**
 * Journal System Types
 * 
 * Defines types for the journal system including folders, notes, and visibility settings.
 */

export type Visibility = 'public' | 'playersOnly' | 'private';

export interface JournalFolder {
  id: string;
  name: string;
  parentId: string | null; // null for root-level folders
  order: number; // For sorting siblings
  createdBy: string; // User ID who created the folder
  createdAt: string; // ISO timestamp
  visibility: Visibility;
}

export interface JournalNote {
  id: string;
  folderId: string | null; // null for root-level notes
  title: string;
  content: string; // HTML content from TipTap editor
  createdBy: string; // User ID who created the note
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  visibility: Visibility;
  sharedWithTokenIds: string[]; // Token IDs this note is shared with
}

export interface JournalData {
  folders: JournalFolder[];
  notes: JournalNote[];
}
