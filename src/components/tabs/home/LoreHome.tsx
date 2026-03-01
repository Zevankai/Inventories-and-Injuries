import type { CharacterData } from '../../../types';
import { DebouncedInput, DebouncedTextarea } from '../../DebouncedInput';
import { MarkdownHint } from '../../MarkdownHint';

// Token image sizing constants (kept in sync with HomeTab)
const TOKEN_SIZE_EDITABLE = '140px';
const TOKEN_SIZE_READONLY = '140px';

// Description box width constants
const DESCRIPTION_WIDTH_EDITABLE = '100%';

interface LoreHomeProps {
  viewingStorageId: string | null;
  showTokenProfile?: boolean;
  showCoverPhoto?: boolean;
  characterData: CharacterData;
  tokenImage: string | null;
  tokenName: string | null;
  playerRole: string;
  canEditToken: () => boolean;
  updateData: (updates: Partial<CharacterData>) => void;
}

export function LoreHome({
  viewingStorageId,
  showTokenProfile = true,
  showCoverPhoto = true,
  characterData,
  tokenImage,
  tokenName,
  playerRole,
  canEditToken,
  updateData,
}: LoreHomeProps) {
  return (
    <>
      {/* --- TOKEN PROFILE WITH COVER PHOTO --- */}
      {!viewingStorageId && showTokenProfile && (
        <div style={{
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '8px',
          marginBottom: '12px',
          minHeight: '280px',
          paddingBottom: '24px'
        }}>
          {/* Cover photo as background */}
          {showCoverPhoto && characterData.coverPhotoUrl && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundImage: `url(${characterData.coverPhotoUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              opacity: 0.7,
            }} />
          )}
          {/* Gradient overlay for readability */}
          {showCoverPhoto && characterData.coverPhotoUrl && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)',
            }} />
          )}
          {/* Token image and info on top */}
          <div style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: showCoverPhoto && characterData.coverPhotoUrl 
              ? '20px 16px 16px 16px'
              : '8px 0',
            minHeight: showCoverPhoto && characterData.coverPhotoUrl 
              ? '200px'
              : undefined
          }}>
            {/* Token Image for lore tokens */}
            {tokenImage && (
              <div 
                style={{
                  position: 'relative',
                  width: canEditToken() ? TOKEN_SIZE_EDITABLE : TOKEN_SIZE_READONLY,
                  height: canEditToken() ? TOKEN_SIZE_EDITABLE : TOKEN_SIZE_READONLY,
                  cursor: 'default',
                }}
              >
                <div style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  border: '3px solid var(--accent-gold)',
                  background: 'transparent',
                  boxShadow: showCoverPhoto && characterData.coverPhotoUrl ? '0 4px 12px rgba(0,0,0,0.5)' : undefined,
                  transition: 'all 0.3s ease',
                }}>
                  <img
                    src={tokenImage}
                    alt="Token"
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                </div>
              </div>
            )}
            
            {/* Token Name - GM can edit for lore tokens */}
            {playerRole === 'GM' ? (
              <DebouncedInput
                value={characterData.name || tokenName || ''}
                onChange={(val) => updateData({ name: val })}
                className="search-input"
                placeholder="Enter token name..."
                style={{
                  fontSize: '16px',
                  fontWeight: 'bold',
                  color: 'var(--text-main)',
                  textAlign: 'center',
                  textShadow: showCoverPhoto && characterData.coverPhotoUrl ? '0 2px 4px rgba(0,0,0,0.8)' : undefined,
                  background: 'transparent',
                  border: '1px dashed var(--accent-gold)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  width: '80%',
                  maxWidth: '300px',
                  marginTop: '8px',
                }}
              />
            ) : (
              <div style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: 'var(--text-main)',
                textAlign: 'center',
                textShadow: showCoverPhoto && characterData.coverPhotoUrl ? '0 2px 4px rgba(0,0,0,0.8)' : undefined,
                paddingBottom: '4px',
                marginTop: '8px',
              }}>
                {characterData.name || tokenName || 'Unknown Character'}
              </div>
            )}

            {/* Token Type Badge - this section is for lore tokens only */}
            <div style={{
              fontSize: '9px',
              color: '#9c27b0',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              textAlign: 'center',
              textShadow: showCoverPhoto && characterData.coverPhotoUrl ? '0 1px 2px rgba(0,0,0,0.8)' : undefined,
              marginTop: '4px',
            }}>
              Lore Token
            </div>

          </div>
        </div>
      )}

      {/* Main Lore Content - large text area */}
      <div style={{marginTop: '12px', width: DESCRIPTION_WIDTH_EDITABLE, alignSelf: 'stretch'}}>
        <label style={{display:'block', fontSize:'10px', color:'#9c27b0', textTransform:'uppercase', fontWeight: 'bold', marginBottom: '6px'}}>
          📜 Lore Content
        </label>
        {/* Uses condition as fallback for backward compatibility with existing lore tokens that may have content stored in condition field */}
        <DebouncedTextarea
          value={characterData.loreContent || characterData.condition || ''}
          onChange={(val) => {
            if (playerRole === 'GM') {
              updateData({ loreContent: val });
            }
          }}
          className="search-input"
          rows={8}
          disabled={playerRole !== 'GM'}
          placeholder="Enter lore, history, or information here..."
          style={{
            width: '100%',
            minHeight: '200px',
            resize: 'vertical',
            boxSizing: 'border-box',
            opacity: 1,
            cursor: playerRole === 'GM' ? 'text' : 'default',
            fontSize: '13px',
            lineHeight: '1.5'
          }}
        />
        {playerRole === 'GM' && <MarkdownHint />}
      </div>

      {/* GM-only Notes Section */}
      {playerRole === 'GM' && (
        <div style={{marginTop: '16px', width: DESCRIPTION_WIDTH_EDITABLE, alignSelf: 'stretch'}}>
          <label style={{display:'block', fontSize:'10px', color:'var(--accent-gold)', textTransform:'uppercase', fontWeight: 'bold', marginBottom: '6px'}}>
            🔒 GM Notes (hidden from players)
          </label>
          <DebouncedTextarea
            value={characterData.gmNotes || ''}
            onChange={(val) => updateData({ gmNotes: val })}
            className="search-input"
            rows={4}
            placeholder="Private notes for GM only..."
            style={{
              width: '100%',
              minHeight: '80px',
              resize: 'vertical',
              boxSizing: 'border-box',
              fontSize: '12px',
              background: 'rgba(240, 225, 48, 0.05)',
              borderColor: 'rgba(240, 225, 48, 0.3)'
            }}
          />
          <MarkdownHint />
        </div>
      )}

      {/* Lore Token Footer */}
      <div style={{marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center'}}>
        {/* Lore Token - View only for players */}
        {playerRole !== 'GM' && (
          <div style={{fontSize: '10px', color: '#9c27b0', fontStyle: 'italic'}}>
            📜 Lore Token (view only)
          </div>
        )}

        {/* Lore Token - GM message */}
        {playerRole === 'GM' && (
          <div style={{fontSize: '10px', color: '#9c27b0', fontStyle: 'italic'}}>
            📜 Lore Token (You control this)
          </div>
        )}
      </div>
    </>
  );
}
