import type { CharacterData, AbilityScores } from '../../../types';
import { AbilityScoreCircle, DeathSavesDisplay } from './shared';
import { DebouncedInput } from '../../DebouncedInput';
import { createDefaultCharacterSheet, calculateModifier } from '../../../utils/characterSheet';
import { createDefaultCharacterStats, createDefaultDeathSaves } from '../../../utils/characterStats';

interface MonsterHomeProps {
  characterData: CharacterData;
  tokenImage: string | null;
  tokenName: string | null;
  updateData: (updates: Partial<CharacterData>) => void;
  setShowSettings: (show: boolean) => void;
  loadDebugInfo: () => void;
  toggleFavorite: () => void;
  isFavorited: boolean;
  favorites: Array<{ id: string; name: string }>;
  hasClaimedToken?: boolean;
  setViewingFavorites: (viewing: boolean) => void;
}

export function MonsterHome({
  characterData,
  tokenImage,
  tokenName,
  updateData,
  setShowSettings,
  loadDebugInfo,
  toggleFavorite,
  isFavorited,
  favorites,
  hasClaimedToken,
  setViewingFavorites,
}: MonsterHomeProps) {
  return (
    <div className="section" style={{ textAlign: 'center', padding: '24px' }}>
      {/* Token Image and Name */}
      <div style={{ marginBottom: '16px' }}>
        {tokenImage && (
          <div style={{
            position: 'relative',
            width: '120px',
            height: '120px',
            margin: '0 auto 12px',
          }}>
            <div style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              overflow: 'hidden',
              border: '3px solid #e53935',
              background: 'transparent',
              boxShadow: '0 4px 12px rgba(229, 57, 53, 0.5)',
            }}>
              <img
                src={tokenImage}
                alt={characterData.name || tokenName || 'Monster'}
                style={{width: '100%', height: '100%', objectFit: 'cover'}}
              />
            </div>
          </div>
        )}

        {/* Editable Monster Name */}
        <DebouncedInput
          value={characterData.name || tokenName || ''}
          onChange={(val) => updateData({ name: val })}
          className="search-input"
          placeholder="Enter monster name..."
          style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: '#e53935',
            textAlign: 'center',
            width: '100%',
            maxWidth: '300px',
            background: 'rgba(229, 57, 53, 0.1)',
            border: '1px solid rgba(229, 57, 53, 0.3)',
            padding: '8px',
            borderRadius: '6px',
          }}
        />

        <div style={{ 
          fontSize: '10px', 
          color: '#e53935', 
          marginTop: '8px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 'bold'
        }}>
          Monster Token
        </div>
      </div>

      {/* Toolbar/Icon Row */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        gap: '6px',
        marginBottom: '16px',
        flexWrap: 'wrap',
      }}>
        {/* Settings */}
        <button
          onClick={() => { setShowSettings(true); loadDebugInfo(); }}
          style={{
            background: 'transparent',
            color: '#e53935',
            border: '1px solid rgba(229, 57, 53, 0.3)',
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '10px',
            fontWeight: 'bold',
          }}
          title="Settings - Change token type"
        >
          ⚙️ Settings
        </button>

        {/* Favorite Star */}
        <button
          onClick={toggleFavorite}
          style={{
            background: isFavorited ? 'rgba(229, 57, 53, 0.15)' : 'transparent',
            color: isFavorited ? '#e53935' : '#666',
            border: '1px solid ' + (isFavorited ? 'rgba(229, 57, 53, 0.3)' : '#333'),
            padding: '2px 6px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '11px',
          }}
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorited ? '⭐' : '☆'}
        </button>

        {/* View Favorites List */}
        {(favorites.length > 0 || hasClaimedToken) && (
          <button
            onClick={() => setViewingFavorites(true)}
            style={{
              background: 'transparent',
              color: '#e53935',
              border: '1px solid rgba(229, 57, 53, 0.3)',
              padding: '2px 6px',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '10px',
            }}
            title="View all favorite tokens"
          >
            📋
          </button>
        )}

        {/* Pack Visibility Toggle */}
        <button
          onClick={() => {
            const currentSettings = characterData.monsterSettings || {
              lootEntries: [],
              actionEntries: [],
              lootVisibleToPlayers: false,
              actionsVisibleToPlayers: false,
              inventoryVisibleToPlayers: false,
            };
            updateData({
              monsterSettings: {
                ...currentSettings,
                inventoryVisibleToPlayers: !currentSettings.inventoryVisibleToPlayers,
              }
            });
          }}
          style={{
            background: characterData.monsterSettings?.inventoryVisibleToPlayers 
              ? 'rgba(76, 175, 80, 0.2)' 
              : 'rgba(244, 67, 54, 0.2)',
            color: characterData.monsterSettings?.inventoryVisibleToPlayers ? '#4caf50' : '#f44336',
            border: `1px solid ${characterData.monsterSettings?.inventoryVisibleToPlayers ? '#4caf50' : '#f44336'}`,
            padding: '4px 8px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '9px',
            fontWeight: 'bold',
          }}
          title={characterData.monsterSettings?.inventoryVisibleToPlayers ? 'Pack visible to players' : 'Pack hidden from players'}
        >
          {characterData.monsterSettings?.inventoryVisibleToPlayers ? '👁️ Pack Visible' : '🔒 Pack Hidden'}
        </button>
      </div>

      {/* Ability Scores Bar */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 12px',
          background: 'rgba(229, 57, 53, 0.1)',
          borderRadius: '8px',
          border: '1px solid rgba(229, 57, 53, 0.3)',
        }}>
          {(() => {
            const sheet = characterData.characterSheet || createDefaultCharacterSheet();
            return (Object.keys(sheet.abilityScores) as Array<keyof AbilityScores>).map((ability) => (
              <AbilityScoreCircle variant="monster"
                key={ability}
                ability={ability}
                score={sheet.abilityScores[ability].base}
                modifier={sheet.abilityScores[ability].modifier}
                canEdit={true}
                onScoreChange={(newScore) => {
                  const sheet = characterData.characterSheet || createDefaultCharacterSheet();
                  const newModifier = calculateModifier(newScore);
                  updateData({
                    characterSheet: {
                      ...sheet,
                      abilityScores: {
                        ...sheet.abilityScores,
                        [ability]: {
                          base: newScore,
                          modifier: newModifier,
                        }
                      }
                    }
                  });
                }}
              />
            ));
          })()}
        </div>
      </div>

      {/* HP and AC Display - Simplified Combat Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '12px',
        marginBottom: '16px',
      }}>
        {/* HP Section */}
        <div style={{
          background: 'rgba(229, 57, 53, 0.1)',
          border: '1px solid rgba(229, 57, 53, 0.3)',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            color: '#e53935',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            marginBottom: '8px',
            letterSpacing: '0.5px'
          }}>
            ❤️ Hit Points
          </label>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <DebouncedInput
              value={String((characterData.characterSheet || createDefaultCharacterSheet()).hitPoints.current)}
              onChange={(val) => {
                const sheet = characterData.characterSheet || createDefaultCharacterSheet();
                updateData({
                  characterSheet: {
                    ...sheet,
                    hitPoints: { ...sheet.hitPoints, current: Number(val) || 0 }
                  }
                });
              }}
              type="number"
              style={{
                width: '60px',
                padding: '6px',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                color: '#fff',
              }}
            />
            <span style={{ color: '#888', fontSize: '14px' }}>/</span>
            <DebouncedInput
              value={String((characterData.characterSheet || createDefaultCharacterSheet()).hitPoints.max)}
              onChange={(val) => {
                const sheet = characterData.characterSheet || createDefaultCharacterSheet();
                updateData({
                  characterSheet: {
                    ...sheet,
                    hitPoints: { ...sheet.hitPoints, max: Number(val) || 0 }
                  }
                });
              }}
              type="number"
              style={{
                width: '60px',
                padding: '6px',
                fontSize: '16px',
                fontWeight: 'bold',
                textAlign: 'center',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                color: '#fff',
              }}
            />
          </div>
        </div>

        {/* AC Section */}
        <div style={{
          background: 'rgba(229, 57, 53, 0.1)',
          border: '1px solid rgba(229, 57, 53, 0.3)',
          borderRadius: '8px',
          padding: '12px',
        }}>
          <label style={{
            display: 'block',
            fontSize: '10px',
            color: '#e53935',
            textTransform: 'uppercase',
            fontWeight: 'bold',
            marginBottom: '8px',
            letterSpacing: '0.5px'
          }}>
            🛡️ Armor Class
          </label>
          <DebouncedInput
            value={String((characterData.characterSheet || createDefaultCharacterSheet()).armorClass)}
            onChange={(val) => {
              const sheet = characterData.characterSheet || createDefaultCharacterSheet();
              updateData({
                characterSheet: {
                  ...sheet,
                  armorClass: Number(val) || 10
                }
              });
            }}
            type="number"
            style={{
              width: '80px',
              padding: '6px',
              fontSize: '16px',
              fontWeight: 'bold',
              textAlign: 'center',
              background: 'rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '4px',
              color: '#fff',
            }}
          />
        </div>
      </div>

      {/* Death Saves Section */}
      <div style={{
        background: 'rgba(229, 57, 53, 0.1)',
        border: '1px solid rgba(229, 57, 53, 0.3)',
        borderRadius: '8px',
        padding: '12px',
      }}>
        <label style={{
          display: 'block',
          fontSize: '10px',
          color: '#e53935',
          textTransform: 'uppercase',
          fontWeight: 'bold',
          marginBottom: '8px',
          letterSpacing: '0.5px'
        }}>
          💀 Death Saves
        </label>
        <DeathSavesDisplay
          deathSaves={(characterData.characterStats?.deathSaves) || createDefaultDeathSaves()}
          onUpdate={(updates) => {
            const stats = characterData.characterStats || createDefaultCharacterStats();
            updateData({
              characterStats: {
                ...stats,
                deathSaves: {
                  ...(stats.deathSaves || createDefaultDeathSaves()),
                  ...updates
                }
              }
            });
          }}
          canEdit={true}
        />
      </div>
    </div>
  );
}
