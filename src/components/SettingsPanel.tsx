import { useState } from 'react';
import type { CharacterData, Theme, TokenType, CharacterRace, CharacterClass, CharacterStats, GMCustomizations } from '../types';
import { createDefaultCharacterStats, createDefaultSuperiorityDice } from '../utils/characterStats';
import OBR from '@owlbear-rodeo/sdk';
import { saveCharacterData, getCampaignId, TOKEN_DATA_KEY } from '../services/storageService';
import { downloadTokenData, importTokenData } from '../utils/dataExport';

interface DebugInfo {
  roomKeys: string[];
  roomSize: number;
  tokenSize: number;
  tokenDataSize: number;
  hasLegacyRoomData: boolean;
  hasLegacyNameKeys: boolean;
  legacyNameKeys: string[];
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  theme: Theme;
  updateTheme: (theme: Theme) => void;
  characterData: CharacterData;
  updateData: (updates: Partial<CharacterData>) => void;
  debugInfo: DebugInfo | null;
  loadDebugInfo: () => void;
  cleanupLegacyData: () => void;
  tokenId: string | null;
  playerRole: 'GM' | 'PLAYER';
  gmCustomizations?: GMCustomizations;
  onUpdateGMCustomizations?: (updates: Partial<GMCustomizations>) => void;
}

// Default races and classes
const DEFAULT_RACES: CharacterRace[] = ['Human', 'Elf', 'Dragonborn', 'Orc', 'Halfling', 'Dwarf', 'Tiefling', 'Goblin', 'Fairy', 'Mixed'];
const DEFAULT_CLASSES: CharacterClass[] = ['Fighter', 'Ranger', 'Bard', 'Wizard', 'Warlock', 'Rogue', 'Barbarian', 'Druid', 'Cleric', 'Paladin', 'Monk', 'Sorcerer', 'Multiclass'];

type SettingsTab = 'style' | 'character';

export function SettingsPanel({
  isOpen,
  onClose,
  theme,
  updateTheme,
  characterData,
  updateData,
  debugInfo,
  loadDebugInfo,
  cleanupLegacyData,
  tokenId,
  playerRole,
  gmCustomizations,
  onUpdateGMCustomizations
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('style');
  const [newCustomRace, setNewCustomRace] = useState('');
  const [newCustomClass, setNewCustomClass] = useState('');
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationMessage, setMigrationMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  if (!isOpen) return null;
  
  // Get character stats with defaults
  const characterStats = characterData.characterStats;
  
  // Helper to update character stats
  const updateCharacterStats = (updates: Partial<CharacterStats>) => {
    const currentStats: CharacterStats = characterStats || createDefaultCharacterStats();
    updateData({
      characterStats: {
        ...currentStats,
        ...updates,
      }
    });
  };
  
  // Migration handler to save OBR metadata to Vercel Blob
  const handleMigrateToBlobStorage = async () => {
    if (!tokenId) {
      setMigrationMessage({ type: 'error', text: 'No token selected' });
      return;
    }
    
    setIsMigrating(true);
    setMigrationMessage(null);
    
    try {
      // Get campaign ID
      const campaignId = await getCampaignId();
      
      // Read current token's OBR metadata
      const items = await OBR.scene.items.getItems([tokenId]);
      
      if (items.length === 0) {
        setMigrationMessage({ type: 'error', text: 'Token not found' });
        setIsMigrating(false);
        return;
      }
      
      const obrData = items[0].metadata[TOKEN_DATA_KEY] as CharacterData | undefined;
      
      if (!obrData) {
        setMigrationMessage({ type: 'error', text: 'No data found in OBR metadata' });
        setIsMigrating(false);
        return;
      }
      
      // Save to Vercel Blob
      const success = await saveCharacterData(campaignId, tokenId, obrData);
      
      if (success) {
        setMigrationMessage({ type: 'success', text: 'Successfully migrated to Blob Storage!' });
      } else {
        setMigrationMessage({ type: 'error', text: 'Failed to save to Blob Storage' });
      }
    } catch (error) {
      console.error('[SettingsPanel] Migration error:', error);
      setMigrationMessage({ type: 'error', text: 'Migration failed: ' + (error instanceof Error ? error.message : 'Unknown error') });
    } finally {
      setIsMigrating(false);
    }
  };
  
  // Combine default and custom races/classes
  const allRaces = [...DEFAULT_RACES, ...(gmCustomizations?.customRaces || [])];
  const allClasses = [...DEFAULT_CLASSES, ...(gmCustomizations?.customClasses || [])];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 9998
        }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 9999,
        background: 'rgba(15, 15, 30, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--glass-border)',
        borderRadius: '8px',
        padding: '0',
        width: 'min(500px, 90vw)',
        maxHeight: 'min(600px, 80vh)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: '12px',
        color: 'var(--text-main)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          borderBottom: '1px solid var(--glass-border)',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: '8px 8px 0 0',
          flexShrink: 0
        }}>
          <span style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--accent-gold)' }}>
            ⚙ Settings
          </span>
          <button
            onClick={onClose}
            style={{
              background: '#333',
              color: 'white',
              border: 'none',
              padding: '4px 10px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 'bold'
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--glass-border)',
          background: 'rgba(0,0,0,0.1)',
        }}>
          <button
            onClick={() => setActiveTab('style')}
            style={{
              flex: 1,
              padding: '10px',
              background: activeTab === 'style' ? 'rgba(240, 225, 48, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'style' ? '2px solid var(--accent-gold)' : '2px solid transparent',
              color: activeTab === 'style' ? 'var(--accent-gold)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
          >
            🎨 Style
          </button>
          <button
            onClick={() => setActiveTab('character')}
            style={{
              flex: 1,
              padding: '10px',
              background: activeTab === 'character' ? 'rgba(240, 225, 48, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'character' ? '2px solid var(--accent-gold)' : '2px solid transparent',
              color: activeTab === 'character' ? 'var(--accent-gold)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
              transition: 'all 0.2s',
            }}
          >
            👤 Character
          </button>
        </div>

        {/* Content - scrollable */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {/* ========== STYLE TAB ========== */}
          {activeTab === 'style' && (
            <>
              {/* Token Type Section - GM Only */}
              {playerRole === 'GM' && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'rgba(0,0,0,0.2)',
                  borderRadius: '6px',
                  border: '1px solid var(--glass-border)'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--accent-gold)',
                    textTransform: 'uppercase',
                    marginBottom: '10px',
                    fontWeight: 'bold'
                  }}>
                    🎭 Token Type
                  </label>
                  <select
                    value={characterData.tokenType || 'player'}
                    onChange={(e) => updateData({ tokenType: e.target.value as TokenType })}
                    className="search-input"
                    style={{ marginTop: '4px', fontWeight: 'bold' }}
                  >
                    <option value="player">Player Token</option>
                    <option value="npc">NPC Token</option>
                    <option value="party">Party Token</option>
                    <option value="lore">Lore Token</option>
                    <option value="monster">Monster Token</option>
                    <option value="merchant">Merchant Token</option>
                  </select>
                  <p style={{ fontSize: '10px', color: '#666', marginTop: '8px', marginBottom: 0 }}>
                    {characterData.tokenType === 'player' && 'Standard token claimable by one player'}
                    {characterData.tokenType === 'npc' && 'GM-controlled NPC with inventory'}
                    {characterData.tokenType === 'party' && 'Shared inventory accessible by all players'}
                    {characterData.tokenType === 'lore' && 'Information token (no inventory)'}
                    {characterData.tokenType === 'monster' && 'Combat enemy with simplified UI'}
                    {characterData.tokenType === 'merchant' && 'NPC merchant with shop inventory and trade functionality'}
                    {!characterData.tokenType && 'Standard token claimable by one player'}
                  </p>
                </div>
              )}

          {/* Cover Photo Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            border: '1px solid var(--glass-border)'
          }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--accent-gold)',
              textTransform: 'uppercase',
              marginBottom: '10px',
              fontWeight: 'bold'
            }}>
              🖼️ Cover Photo
            </label>
            <input
              type="text"
              value={characterData.coverPhotoUrl || ''}
              onChange={(e) => updateData({ coverPhotoUrl: e.target.value || undefined })}
              placeholder="Paste image URL here..."
              className="search-input"
              style={{ marginTop: 0, marginBottom: '8px' }}
            />
            {characterData.coverPhotoUrl && (
              <>
                {/* Preview */}
                <div style={{
                  width: '100%',
                  height: '100px',
                  borderRadius: '4px',
                  overflow: 'hidden',
                  marginBottom: '8px',
                  border: '1px solid var(--glass-border)'
                }}>
                  <img
                    src={characterData.coverPhotoUrl}
                    alt="Cover preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </div>
                {/* Remove button */}
                <button
                  onClick={() => updateData({ coverPhotoUrl: undefined })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    background: 'rgba(255,0,0,0.1)',
                    border: '1px solid rgba(255,0,0,0.3)',
                    borderRadius: '4px',
                    color: '#f66',
                    fontSize: '11px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,0,0,0.2)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,0,0,0.1)'}
                >
                  Remove Cover Photo
                </button>
              </>
            )}
          </div>

          {/* Theme Colors Section */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            border: '1px solid var(--glass-border)'
          }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--accent-gold)',
              textTransform: 'uppercase',
              marginBottom: '10px',
              fontWeight: 'bold'
            }}>
              🎨 Theme Colors
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Accent
                </label>
                <input
                  type="color"
                  value={theme.accent}
                  onChange={(e) => updateTheme({ ...theme, accent: e.target.value })}
                  style={{
                    width: '100%',
                    height: '40px',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: 'transparent'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                  Background
                </label>
                <input
                  type="color"
                  value={theme.background}
                  onChange={(e) => updateTheme({ ...theme, background: e.target.value })}
                  style={{
                    width: '100%',
                    height: '40px',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    background: 'transparent'
                  }}
                />
              </div>
            </div>
            <button
              onClick={() => updateTheme({ accent: '#f0e130', background: '#0f0f1e' })}
              style={{
                marginTop: '10px',
                width: '100%',
                padding: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--glass-border)',
                borderRadius: '4px',
                color: 'var(--text-muted)',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              Reset to Default
            </button>
          </div>

          {/* Data Management Section */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            padding: '16px',
            borderRadius: '8px',
            marginTop: '16px'
          }}>
            <h3 style={{
              fontSize: '14px',
              color: 'var(--accent-gold)',
              marginTop: 0,
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}>
              📦 Data Management
            </h3>
            
            {/* Download Backup */}
            <div style={{ marginBottom: '12px' }}>
              <button
                onClick={() => {
                  if (characterData && tokenId) {
                    downloadTokenData(characterData, characterData.condition || 'Token');
                    alert('Token data downloaded successfully!');
                  }
                }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(56, 142, 60, 0.2))',
                  border: '1px solid rgba(76, 175, 80, 0.4)',
                  borderRadius: '6px',
                  color: '#4caf50',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <span>💾</span>
                Download Token Backup
              </button>
              <p style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                Exports all token data except name and claimedBy
              </p>
            </div>
            
            {/* Upload/Restore Data */}
            <div>
              <label
                htmlFor="token-data-upload"
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px',
                  background: 'linear-gradient(135deg, rgba(33, 150, 243, 0.2), rgba(25, 118, 210, 0.2))',
                  border: '1px solid rgba(33, 150, 243, 0.4)',
                  borderRadius: '6px',
                  color: '#2196f3',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textAlign: 'center'
                }}
              >
                <span>📥</span> Upload & Restore Data
              </label>
              <input
                id="token-data-upload"
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    const jsonString = event.target?.result as string;
                    const importedData = importTokenData(jsonString);
                    
                    if (importedData && characterData) {
                      if (window.confirm(
                        'This will replace the current token data (except name and claimedBy). Continue?'
                      )) {
                        // Merge imported data with current token identifiers
                        updateData({
                          ...importedData,
                          // Keep current token name and claimedBy
                          condition: characterData.condition,
                          claimedBy: characterData.claimedBy,
                        });
                        alert('Token data restored successfully!');
                      }
                    } else {
                      alert('Invalid backup file. Please select a valid token backup JSON file.');
                    }
                    
                    // Reset file input
                    e.target.value = '';
                  };
                  reader.readAsText(file);
                }}
              />
              <p style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                marginTop: '6px',
                fontStyle: 'italic'
              }}>
                Restores data from a backup file to this token
              </p>
            </div>
          </div>

          {/* Debug Info Section */}
          <div style={{
            padding: '12px',
            background: 'rgba(0,0,0,0.2)',
            borderRadius: '6px',
            border: '1px solid var(--glass-border)'
          }}>
            <label style={{
              display: 'block',
              fontSize: '11px',
              color: 'var(--accent-gold)',
              textTransform: 'uppercase',
              marginBottom: '10px',
              fontWeight: 'bold'
            }}>
              🔧 Debug Info
            </label>

            {debugInfo && (
              <>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                  <div style={{ color: '#4dabf7', marginBottom: '4px', fontSize: '11px' }}>✨ Current Token Storage:</div>
                  {tokenId ? (
                    <>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: debugInfo.tokenDataSize > 15000 ? '#ff6b6b' : '#51cf66' }}>
                        {debugInfo.tokenDataSize} bytes / 16384 bytes
                      </div>
                      <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>
                        {((debugInfo.tokenDataSize / 16384) * 100).toFixed(1)}% used (this token only)
                      </div>
                    </>
                  ) : (
                    <div style={{ color: '#aaa', fontSize: '10px' }}>No token selected</div>
                  )}
                </div>

                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                  <div style={{ color: '#4dabf7', marginBottom: '4px', fontSize: '11px' }}>Room Metadata (shared):</div>
                  <div style={{ fontSize: '12px', color: debugInfo.roomSize > 15000 ? '#ff6b6b' : '#51cf66' }}>
                    {debugInfo.roomSize} bytes / 16384 bytes
                  </div>
                  <div style={{ fontSize: '10px', color: '#aaa', marginTop: '2px' }}>
                    Used by all extensions ({debugInfo.roomKeys.length} keys)
                  </div>
                </div>

                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }}>
                  <div style={{ color: '#4dabf7', marginBottom: '4px', fontSize: '11px' }}>Legacy Data:</div>
                  {(debugInfo.hasLegacyRoomData || debugInfo.hasLegacyNameKeys) ? (
                    <>
                      <div style={{ color: '#ff6b6b', fontWeight: 'bold', fontSize: '11px' }}>
                        ⚠️ FOUND {debugInfo.hasLegacyNameKeys ? `(${debugInfo.legacyNameKeys.length} old keys)` : ''}
                      </div>
                      <button
                        onClick={cleanupLegacyData}
                        style={{
                          background: '#ff6b6b',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          marginTop: '6px',
                          width: '100%'
                        }}
                      >
                        CLEANUP LEGACY DATA
                      </button>
                    </>
                  ) : (
                    <div style={{ color: '#51cf66', fontSize: '11px' }}>✓ Clean (using token storage)</div>
                  )}
                </div>

                {/* Migration to Blob Storage Button */}
                {tokenId && (
                  <div style={{ marginBottom: '8px' }}>
                    <button
                      onClick={handleMigrateToBlobStorage}
                      disabled={isMigrating}
                      style={{
                        background: '#4dabf7',
                        color: 'white',
                        border: 'none',
                        padding: '8px 12px',
                        borderRadius: '4px',
                        cursor: isMigrating ? 'wait' : 'pointer',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        width: '100%',
                        opacity: isMigrating ? 0.6 : 1
                      }}
                    >
                      {isMigrating ? 'MIGRATING...' : '☁️ MIGRATE TO BLOB STORAGE'}
                    </button>
                    {migrationMessage && (
                      <div style={{
                        marginTop: '6px',
                        padding: '6px',
                        borderRadius: '4px',
                        fontSize: '10px',
                        background: migrationMessage.type === 'success' ? 'rgba(81, 207, 102, 0.2)' : 'rgba(255, 107, 107, 0.2)',
                        color: migrationMessage.type === 'success' ? '#51cf66' : '#ff6b6b',
                        border: `1px solid ${migrationMessage.type === 'success' ? '#51cf66' : '#ff6b6b'}`
                      }}>
                        {migrationMessage.text}
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={loadDebugInfo}
                  style={{
                    background: '#333',
                    color: 'white',
                    border: 'none',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    width: '100%'
                  }}
                >
                  REFRESH
                </button>
              </>
            )}
          </div>
            </>
          )}

          {/* ========== CHARACTER TAB ========== */}
          {activeTab === 'character' && (
            <>
              {/* Race Selection */}
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '6px',
                border: '1px solid var(--glass-border)'
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--accent-gold)',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                  fontWeight: 'bold'
                }}>
                  🧬 Race
                </label>
                <select
                  value={characterStats?.race || 'Human'}
                  onChange={(e) => updateCharacterStats({ race: e.target.value as CharacterRace })}
                  className="search-input"
                  style={{ marginTop: '4px' }}
                >
                  {allRaces.map(race => (
                    <option key={race} value={race}>{race}</option>
                  ))}
                </select>
                
                {/* Secondary Race for Mixed */}
                {characterStats?.race === 'Mixed' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Secondary Race
                    </label>
                    <select
                      value={characterStats?.secondaryRace || ''}
                      onChange={(e) => updateCharacterStats({ secondaryRace: e.target.value as CharacterRace })}
                      className="search-input"
                    >
                      <option value="">Select secondary race...</option>
                      {allRaces.filter(r => r !== 'Mixed').map(race => (
                        <option key={race} value={race}>{race}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Class Selection */}
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(0,0,0,0.2)',
                borderRadius: '6px',
                border: '1px solid var(--glass-border)'
              }}>
                <label style={{
                  display: 'block',
                  fontSize: '11px',
                  color: 'var(--accent-gold)',
                  textTransform: 'uppercase',
                  marginBottom: '10px',
                  fontWeight: 'bold'
                }}>
                  ⚔️ Class
                </label>
                <select
                  value={characterStats?.characterClass || 'Fighter'}
                  onChange={(e) => updateCharacterStats({ characterClass: e.target.value as CharacterClass })}
                  className="search-input"
                  style={{ marginTop: '4px' }}
                >
                  {allClasses.map(cls => (
                    <option key={cls} value={cls}>{cls}</option>
                  ))}
                </select>
                
                {/* Secondary Class for Multiclass (level 5+) */}
                {characterStats?.characterClass === 'Multiclass' && (characterStats?.level || 1) >= 5 && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Secondary Class (Level 5+)
                    </label>
                    <select
                      value={characterStats?.secondaryClass || ''}
                      onChange={(e) => updateCharacterStats({ secondaryClass: e.target.value as CharacterClass })}
                      className="search-input"
                    >
                      <option value="">Select secondary class...</option>
                      {allClasses.filter(c => c !== 'Multiclass').map(cls => (
                        <option key={cls} value={cls}>{cls}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Superiority Dice Toggle */}
              <div style={{
                marginBottom: '16px',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '6px',
                border: '1px solid var(--glass-border)',
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: 'var(--text-main)',
                }}>
                  <input
                    type="checkbox"
                    checked={(characterStats?.superiorityDice?.max ?? 0) > 0}
                    onChange={(e) => {
                      if (e.target.checked) {
                        updateCharacterStats({
                          superiorityDice: createDefaultSuperiorityDice()
                        });
                      } else {
                        updateCharacterStats({
                          superiorityDice: { current: 0, max: 0 }
                        });
                      }
                    }}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  ⚔️ Enable Superiority Dice
                </label>
                <p style={{
                  margin: '8px 0 0 26px',
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}>
                  When enabled, superiority dice tracking will be shown on the character sheet.
                </p>
              </div>

              {/* GM-Only Custom Races/Classes Section */}
              {playerRole === 'GM' && onUpdateGMCustomizations && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  background: 'rgba(240, 225, 48, 0.05)',
                  borderRadius: '6px',
                  border: '1px solid rgba(240, 225, 48, 0.3)'
                }}>
                  <label style={{
                    display: 'block',
                    fontSize: '11px',
                    color: 'var(--accent-gold)',
                    textTransform: 'uppercase',
                    marginBottom: '10px',
                    fontWeight: 'bold'
                  }}>
                    👑 GM Customizations
                  </label>
                  
                  {/* Add Custom Race */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Add Custom Race
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={newCustomRace}
                        onChange={(e) => setNewCustomRace(e.target.value)}
                        placeholder="New race name..."
                        className="search-input"
                        style={{ flex: 1, margin: 0 }}
                      />
                      <button
                        onClick={() => {
                          if (newCustomRace.trim()) {
                            onUpdateGMCustomizations({
                              customRaces: [...(gmCustomizations?.customRaces || []), newCustomRace.trim()]
                            });
                            setNewCustomRace('');
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(81, 207, 102, 0.2)',
                          border: '1px solid #51cf66',
                          borderRadius: '4px',
                          color: '#51cf66',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                      >
                        Add
                      </button>
                    </div>
                    {/* Show custom races */}
                    {gmCustomizations?.customRaces && gmCustomizations.customRaces.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {gmCustomizations.customRaces.map(race => (
                          <span
                            key={race}
                            style={{
                              padding: '2px 8px',
                              background: 'rgba(0, 0, 0, 0.3)',
                              borderRadius: '12px',
                              fontSize: '10px',
                              color: 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {race}
                            <button
                              onClick={() => onUpdateGMCustomizations({
                                customRaces: gmCustomizations.customRaces.filter(r => r !== race)
                              })}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ff6b6b',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: '10px',
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add Custom Class */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Add Custom Class
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        value={newCustomClass}
                        onChange={(e) => setNewCustomClass(e.target.value)}
                        placeholder="New class name..."
                        className="search-input"
                        style={{ flex: 1, margin: 0 }}
                      />
                      <button
                        onClick={() => {
                          if (newCustomClass.trim()) {
                            onUpdateGMCustomizations({
                              customClasses: [...(gmCustomizations?.customClasses || []), newCustomClass.trim()]
                            });
                            setNewCustomClass('');
                          }
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'rgba(81, 207, 102, 0.2)',
                          border: '1px solid #51cf66',
                          borderRadius: '4px',
                          color: '#51cf66',
                          cursor: 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold',
                        }}
                      >
                        Add
                      </button>
                    </div>
                    {/* Show custom classes */}
                    {gmCustomizations?.customClasses && gmCustomizations.customClasses.length > 0 && (
                      <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        {gmCustomizations.customClasses.map(cls => (
                          <span
                            key={cls}
                            style={{
                              padding: '2px 8px',
                              background: 'rgba(0, 0, 0, 0.3)',
                              borderRadius: '12px',
                              fontSize: '10px',
                              color: 'var(--text-main)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            {cls}
                            <button
                              onClick={() => onUpdateGMCustomizations({
                                customClasses: gmCustomizations.customClasses.filter(c => c !== cls)
                              })}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: '#ff6b6b',
                                cursor: 'pointer',
                                padding: 0,
                                fontSize: '10px',
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Overencumbered Text */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Overencumbered Warning Text
                    </label>
                    <input
                      type="text"
                      value={gmCustomizations?.overencumberedText || '-3 to all DEX & STR rolls, -10 movement per 10 units over'}
                      onChange={(e) => onUpdateGMCustomizations({ overencumberedText: e.target.value })}
                      placeholder="Custom overencumbered text..."
                      className="search-input"
                      style={{ margin: 0 }}
                    />
                  </div>

                  {/* Rest Rules Message */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>
                      Rest House Rules Message
                    </label>
                    <input
                      type="text"
                      value={gmCustomizations?.restRulesMessage || ''}
                      onChange={(e) => onUpdateGMCustomizations({ restRulesMessage: e.target.value })}
                      placeholder="Custom rest rules message..."
                      className="search-input"
                      style={{ margin: 0 }}
                    />
                  </div>

                  {/* Exhaustion Effects Management */}
                  <div>
                    <label style={{ fontSize: '10px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
                      💤 Exhaustion Level Effects
                    </label>
                    <p style={{ fontSize: '9px', color: '#666', marginBottom: '8px' }}>
                      Customize what happens at each exhaustion level (0-10)
                    </p>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(level => {
                      const defaultEffects = [
                        'No effect',
                        'Weary - DIS on ability checks',
                        'Fatigued - Speed reduced by 10 feet',
                        'Sluggish - Speed halved',
                        'Shaken - DIS on attack rolls',
                        'Vulnerable - DIS on saving throws',
                        'Weak - HP maximum reduced by 25%',
                        'Frail - HP maximum reduced by 50%',
                        'Collapsed - Speed reduced to 0. Incapacitated.',
                        'Comatose - Unconscious until stabilized (magic/hospitalized)',
                        'Death - Character dies',
                      ];
                      const currentEffect = gmCustomizations?.exhaustionEffects?.[level] || defaultEffects[level];
                      
                      return (
                        <div key={level} style={{ marginBottom: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ 
                              minWidth: '28px', 
                              fontSize: '11px', 
                              fontWeight: 'bold',
                              color: level === 0 ? '#51cf66' : 
                                     level <= 3 ? '#fcc419' : 
                                     level <= 6 ? '#ff922b' : '#ff6b6b',
                            }}>
                              L{level}:
                            </span>
                            <input
                              type="text"
                              value={currentEffect}
                              onChange={(e) => {
                                const newEffects = [...(gmCustomizations?.exhaustionEffects || defaultEffects)];
                                newEffects[level] = e.target.value;
                                onUpdateGMCustomizations({ exhaustionEffects: newEffects });
                              }}
                              className="search-input"
                              style={{ margin: 0, flex: 1, padding: '4px 8px', fontSize: '10px' }}
                            />
                          </div>
                        </div>
                      );
                    })}
                    <button
                      onClick={() => onUpdateGMCustomizations({ exhaustionEffects: undefined })}
                      style={{
                        marginTop: '8px',
                        width: '100%',
                        padding: '6px',
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '4px',
                        color: 'var(--text-muted)',
                        fontSize: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      Reset to Default Effects
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
