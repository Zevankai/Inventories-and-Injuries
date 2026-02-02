import React, { useState, useMemo } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import OBR from '@owlbear-rodeo/sdk';
import { useJournal } from '../../context/JournalContext';
import type { JournalFolder, JournalNote, Visibility } from '../../types/journal';
import './JournalTab.css';

interface JournalTabProps {
  playerRole: string;
}

export const JournalTab: React.FC<JournalTabProps> = ({ playerRole }) => {
  const {
    folders,
    notes,
    loading,
    currentUserId,
    addFolder,
    updateFolder,
    deleteFolder,
    addNote,
    updateNote,
    deleteNote,
    controlledTokenIds,
  } = useJournal();

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParentId, setNewFolderParentId] = useState<string | null>(null);
  const [newFolderVisibility, setNewFolderVisibility] = useState<Visibility>('private');
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteVisibility, setNewNoteVisibility] = useState<Visibility>('private');
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [sceneTokens, setSceneTokens] = useState<Array<{ id: string; name: string }>>([]);

  const isGM = playerRole === 'GM';

  // Filter folders and notes based on visibility
  const visibleFolders = useMemo(() => {
    return folders.filter(folder => {
      if (isGM && folder.visibility === 'playersOnly') return false;
      if (!isGM && folder.visibility === 'private') return false;
      return true;
    });
  }, [folders, isGM]);

  const visibleNotes = useMemo(() => {
    return notes.filter(note => {
      if (isGM && note.visibility === 'playersOnly') return false;
      if (!isGM && note.visibility === 'private') return false;
      return true;
    });
  }, [notes, isGM]);

  // Get "Shared with me" notes
  const sharedWithMeNotes = useMemo(() => {
    return visibleNotes.filter(note =>
      note.sharedWithTokenIds.some(tokenId => controlledTokenIds.includes(tokenId))
    );
  }, [visibleNotes, controlledTokenIds]);

  // Get notes for selected folder
  const currentFolderNotes = useMemo(() => {
    if (selectedFolderId === 'shared-with-me') {
      return sharedWithMeNotes;
    }
    return visibleNotes.filter(note => note.folderId === selectedFolderId);
  }, [visibleNotes, selectedFolderId, sharedWithMeNotes]);

  // Get selected note
  const selectedNote = useMemo(() => {
    return notes.find(note => note.id === selectedNoteId) || null;
  }, [notes, selectedNoteId]);

  // TipTap editor setup
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
    ],
    content: selectedNote?.content || '',
    onUpdate: ({ editor }) => {
      if (selectedNoteId) {
        const html = editor.getHTML();
        updateNote(selectedNoteId, { content: html });
      }
    },
  });

  // Update editor content when note changes
  React.useEffect(() => {
    if (editor && selectedNote) {
      editor.commands.setContent(selectedNote.content);
    }
  }, [selectedNote, editor]);

  // Drag and drop setup
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = visibleFolders.findIndex(f => f.id === active.id);
      const newIndex = visibleFolders.findIndex(f => f.id === over.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const reordered = arrayMove(visibleFolders, oldIndex, newIndex);
        reordered.forEach((folder, index) => {
          updateFolder(folder.id, { order: index });
        });
      }
    }
  };

  // Folder operations
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    await addFolder(newFolderName, newFolderParentId, newFolderVisibility);
    setNewFolderName('');
    setNewFolderParentId(null);
    setNewFolderVisibility('private');
    setShowNewFolderModal(false);
  };

  const handleRenameFolder = async (folderId: string) => {
    if (!editingFolderName.trim()) return;
    await updateFolder(folderId, { name: editingFolderName });
    setEditingFolderId(null);
    setEditingFolderName('');
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (confirm('Delete this folder and all its contents?')) {
      await deleteFolder(folderId);
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
        setSelectedNoteId(null);
      }
    }
  };

  // Note operations
  const handleCreateNote = async () => {
    if (!newNoteTitle.trim()) return;
    const note = await addNote(newNoteTitle, selectedFolderId === 'shared-with-me' ? null : selectedFolderId, newNoteVisibility);
    setNewNoteTitle('');
    setNewNoteVisibility('private');
    setShowNewNoteModal(false);
    setSelectedNoteId(note.id);
  };

  const handleSelectNote = (noteId: string) => {
    setSelectedNoteId(noteId);
  };

  const handleDeleteNote = async (noteId: string) => {
    if (confirm('Delete this note?')) {
      await deleteNote(noteId);
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null);
      }
    }
  };

  // Share modal
  const handleOpenShareModal = async () => {
    try {
      const items = await OBR.scene.items.getItems();
      const tokens = items
        .filter(item => item.layer === 'CHARACTER')
        .map(item => ({
          id: item.id,
          name: item.name,
        }));
      setSceneTokens(tokens);
      setShowShareModal(true);
    } catch (error) {
      console.error('Error loading tokens:', error);
    }
  };

  const handleToggleShareToken = async (tokenId: string) => {
    if (!selectedNote) return;
    const sharedIds = selectedNote.sharedWithTokenIds;
    const newSharedIds = sharedIds.includes(tokenId)
      ? sharedIds.filter(id => id !== tokenId)
      : [...sharedIds, tokenId];
    await updateNote(selectedNote.id, { sharedWithTokenIds: newSharedIds });
  };

  if (loading) {
    return <div className="journal-tab">Loading journals...</div>;
  }

  return (
    <div className="journal-tab">
      <div className="journal-sidebar">
        <div className="journal-sidebar-header">
          <h3>Folders</h3>
          {isGM && (
            <button onClick={() => setShowNewFolderModal(true)} className="btn-icon" title="New Folder">
              +
            </button>
          )}
        </div>

        {/* Shared with me virtual folder */}
        {sharedWithMeNotes.length > 0 && (
          <div
            className={`journal-folder ${selectedFolderId === 'shared-with-me' ? 'selected' : ''}`}
            onClick={() => setSelectedFolderId('shared-with-me')}
          >
            <span>📋 Shared with me ({sharedWithMeNotes.length})</span>
          </div>
        )}

        {/* Root folders */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleFolders.map(f => f.id)} strategy={verticalListSortingStrategy}>
            {visibleFolders
              .filter(f => f.parentId === null)
              .sort((a, b) => a.order - b.order)
              .map(folder => (
                <SortableFolderItem
                  key={folder.id}
                  folder={folder}
                  isSelected={selectedFolderId === folder.id}
                  onSelect={() => setSelectedFolderId(folder.id)}
                  onRename={() => {
                    setEditingFolderId(folder.id);
                    setEditingFolderName(folder.name);
                  }}
                  onDelete={() => handleDeleteFolder(folder.id)}
                  isEditing={editingFolderId === folder.id}
                  editingName={editingFolderName}
                  onEditingNameChange={setEditingFolderName}
                  onEditingSave={() => handleRenameFolder(folder.id)}
                  onEditingCancel={() => setEditingFolderId(null)}
                  isGM={isGM}
                />
              ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="journal-main">
        <div className="journal-notes-list">
          <div className="journal-notes-header">
            <h3>{selectedFolderId === 'shared-with-me' ? 'Shared with me' : 'Notes'}</h3>
            {isGM && (
              <button onClick={() => setShowNewNoteModal(true)} className="btn-icon" title="New Note">
                +
              </button>
            )}
          </div>
          {currentFolderNotes.map(note => (
            <div
              key={note.id}
              className={`journal-note-item ${selectedNoteId === note.id ? 'selected' : ''}`}
              onClick={() => handleSelectNote(note.id)}
            >
              <div className="note-item-title">{note.title}</div>
              {isGM && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                  className="btn-icon-small"
                  title="Delete"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="journal-editor">
          {selectedNote ? (
            <>
              <div className="journal-editor-header">
                <input
                  type="text"
                  value={selectedNote.title}
                  onChange={(e) => updateNote(selectedNote.id, { title: e.target.value })}
                  className="note-title-input"
                  disabled={!isGM}
                />
                {isGM && (
                  <div className="editor-controls">
                    <select
                      value={selectedNote.visibility}
                      onChange={(e) => updateNote(selectedNote.id, { visibility: e.target.value as Visibility })}
                      className="visibility-select"
                    >
                      <option value="public">Public</option>
                      <option value="playersOnly">Players Only</option>
                      <option value="private">Private (GM)</option>
                    </select>
                    <button onClick={handleOpenShareModal} className="btn-share">
                      Share with Tokens
                    </button>
                  </div>
                )}
              </div>

              {isGM && editor && (
                <div className="tiptap-toolbar">
                  <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={editor.isActive('bold') ? 'active' : ''}
                    title="Bold"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={editor.isActive('italic') ? 'active' : ''}
                    title="Italic"
                  >
                    <em>I</em>
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    className={editor.isActive('underline') ? 'active' : ''}
                    title="Underline"
                  >
                    <u>U</u>
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
                    title="Heading"
                  >
                    H2
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={editor.isActive('bulletList') ? 'active' : ''}
                    title="Bullet List"
                  >
                    •
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={editor.isActive('orderedList') ? 'active' : ''}
                    title="Numbered List"
                  >
                    1.
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    className={editor.isActive('blockquote') ? 'active' : ''}
                    title="Quote"
                  >
                    "
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleCodeBlock().run()}
                    className={editor.isActive('codeBlock') ? 'active' : ''}
                    title="Code"
                  >
                    {'<>'}
                  </button>
                  <button onClick={() => editor.chain().focus().undo().run()} title="Undo">
                    ↶
                  </button>
                  <button onClick={() => editor.chain().focus().redo().run()} title="Redo">
                    ↷
                  </button>
                </div>
              )}

              <div className="tiptap-editor-wrapper">
                {isGM ? (
                  <EditorContent editor={editor} />
                ) : (
                  <div className="note-content-readonly" dangerouslySetInnerHTML={{ __html: selectedNote.content }} />
                )}
              </div>
            </>
          ) : (
            <div className="journal-editor-empty">Select a note to view or edit</div>
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="modal-overlay" onClick={() => setShowNewFolderModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>New Folder</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="modal-input"
            />
            <select
              value={newFolderVisibility}
              onChange={(e) => setNewFolderVisibility(e.target.value as Visibility)}
              className="modal-select"
            >
              <option value="public">Public</option>
              <option value="playersOnly">Players Only</option>
              <option value="private">Private (GM)</option>
            </select>
            <div className="modal-actions">
              <button onClick={handleCreateFolder} className="btn-primary">Create</button>
              <button onClick={() => setShowNewFolderModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* New Note Modal */}
      {showNewNoteModal && (
        <div className="modal-overlay" onClick={() => setShowNewNoteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>New Note</h3>
            <input
              type="text"
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
              placeholder="Note title"
              className="modal-input"
            />
            <select
              value={newNoteVisibility}
              onChange={(e) => setNewNoteVisibility(e.target.value as Visibility)}
              className="modal-select"
            >
              <option value="public">Public</option>
              <option value="playersOnly">Players Only</option>
              <option value="private">Private (GM)</option>
            </select>
            <div className="modal-actions">
              <button onClick={handleCreateNote} className="btn-primary">Create</button>
              <button onClick={() => setShowNewNoteModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShareModal && selectedNote && (
        <div className="modal-overlay" onClick={() => setShowShareModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Share with Tokens</h3>
            <div className="token-list">
              {sceneTokens.map(token => (
                <label key={token.id} className="token-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedNote.sharedWithTokenIds.includes(token.id)}
                    onChange={() => handleToggleShareToken(token.id)}
                  />
                  {token.name}
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setShowShareModal(false)} className="btn-primary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Sortable folder item component
interface SortableFolderItemProps {
  folder: JournalFolder;
  isSelected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (name: string) => void;
  onEditingSave: () => void;
  onEditingCancel: () => void;
  isGM: boolean;
}

const SortableFolderItem: React.FC<SortableFolderItemProps> = ({
  folder,
  isSelected,
  onSelect,
  onRename,
  onDelete,
  isEditing,
  editingName,
  onEditingNameChange,
  onEditingSave,
  onEditingCancel,
  isGM,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: folder.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`journal-folder ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
    >
      {isEditing ? (
        <input
          type="text"
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          onBlur={onEditingSave}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEditingSave();
            if (e.key === 'Escape') onEditingCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="folder-name-input"
        />
      ) : (
        <>
          <span>📁 {folder.name}</span>
          {isGM && (
            <div className="folder-actions">
              <button onClick={(e) => { e.stopPropagation(); onRename(); }} className="btn-icon-small" title="Rename">
                ✏️
              </button>
              <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="btn-icon-small" title="Delete">
                🗑️
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
