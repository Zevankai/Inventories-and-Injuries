import { useState, useCallback } from 'react';
import type { CharacterData, MerchantSettings } from '../../../types';
import { DebouncedInput } from '../../DebouncedInput';
import { ShopPresetManager } from '../../ShopPresetManager';
import { useShopPresets } from '../../../hooks/useShopPresets';
import { useRepository } from '../../../context/RepositoryContext';
import { generateStockFromPreset } from '../../../utils/stockGeneration';

const DEFAULT_MERCHANT_SETTINGS: MerchantSettings = {
  priceModifier: 1.0,
  buybackRate: 0.5,
  unlimitedStock: false
};

interface MerchantHomeProps {
  characterData: CharacterData;
  tokenImage: string | null;
  tokenName: string | null;
  playerRole: string;
  updateData: (updates: Partial<CharacterData>) => void;
  showTradeButton: boolean;
  onOpenTradePartnerModal?: () => void;
  isFavorited: boolean;
  toggleFavorite: () => void;
  setShowSettings: (show: boolean) => void;
  loadDebugInfo: () => void;
}

export function MerchantHome({
  characterData,
  tokenImage,
  tokenName,
  playerRole,
  updateData,
  showTradeButton,
  onOpenTradePartnerModal,
  isFavorited,
  toggleFavorite,
  setShowSettings,
  loadDebugInfo,
}: MerchantHomeProps) {
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');

  const { presets: shopPresets } = useShopPresets();
  const { itemRepository } = useRepository();

  const handleApplyPreset = useCallback(() => {
    if (!selectedPresetId) return;

    const preset = shopPresets.find(p => p.id === selectedPresetId);
    if (!preset) return;

    const confirmed = confirm(
      `This will replace the merchant's current inventory with generated stock from '${preset.name}'. Continue?`
    );

    if (!confirmed) return;

    const generatedItems = generateStockFromPreset(preset, itemRepository);

    updateData({
      inventory: generatedItems,
      merchantSettings: {
        ...(characterData.merchantSettings || DEFAULT_MERCHANT_SETTINGS),
        presetId: preset.id,
        priceModifier: preset.priceModifier,
        buybackRate: preset.buybackRate,
      }
    });

    console.log('[MerchantHome] Applied preset:', preset.name, 'Generated items:', generatedItems.length);
  }, [selectedPresetId, shopPresets, itemRepository, characterData.merchantSettings, updateData]);

  if (playerRole === 'GM') {
    return (
      <>
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
                  border: '3px solid #8BC34A',
                  background: 'transparent',
                  boxShadow: '0 4px 12px rgba(139, 195, 74, 0.5)',
                }}>
                  <img
                    src={tokenImage}
                    alt={characterData.name || tokenName || 'Merchant'}
                    style={{width: '100%', height: '100%', objectFit: 'cover'}}
                  />
                </div>
              </div>
            )}

            {/* Editable Merchant Name */}
            <DebouncedInput
              value={characterData.name || tokenName || ''}
              onChange={(val) => updateData({ name: val })}
              className="search-input"
              placeholder="Enter merchant name..."
              style={{
                fontSize: '18px',
                fontWeight: 'bold',
                color: '#8BC34A',
                textAlign: 'center',
                width: '100%',
                maxWidth: '300px',
                background: 'rgba(139, 195, 74, 0.1)',
                border: '1px solid rgba(139, 195, 74, 0.3)',
                padding: '8px',
                borderRadius: '6px',
              }}
            />

            <div style={{ 
              fontSize: '10px', 
              color: '#8BC34A', 
              marginTop: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: 'bold'
            }}>
              Merchant Token
            </div>
          </div>

          {/* Merchant Settings Section */}
          <div style={{ 
            marginTop: '24px',
            textAlign: 'left',
            background: 'rgba(139, 195, 74, 0.05)',
            border: '1px solid rgba(139, 195, 74, 0.2)',
            borderRadius: '8px',
            padding: '16px'
          }}>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: 'bold', 
              color: '#8BC34A',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.5px'
            }}>
              🏪 Shop Configuration
            </div>

            {/* Shop Name */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#8BC34A', display: 'block', marginBottom: '4px' }}>
                Shop Name
              </label>
              <DebouncedInput
                value={characterData.merchantSettings?.shopName || ''}
                onChange={(val) => updateData({ 
                  merchantSettings: { 
                    ...(characterData.merchantSettings || DEFAULT_MERCHANT_SETTINGS),
                    shopName: val 
                  }
                })}
                className="search-input"
                placeholder="e.g., Blacksmith's Forge, Potions & Elixirs..."
                style={{
                  width: '100%',
                  fontSize: '12px',
                  padding: '6px 8px'
                }}
              />
            </div>

            {/* Price Modifier */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#8BC34A', display: 'block', marginBottom: '4px' }}>
                Price Modifier: {((characterData.merchantSettings?.priceModifier || 1.0) * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.05"
                value={characterData.merchantSettings?.priceModifier || 1.0}
                onChange={(e) => updateData({ 
                  merchantSettings: { 
                    ...(characterData.merchantSettings || DEFAULT_MERCHANT_SETTINGS),
                    priceModifier: parseFloat(e.target.value)
                  }
                })}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                {(characterData.merchantSettings?.priceModifier ?? 1.0) === 1.0 ? 'Standard prices' : 
                 (characterData.merchantSettings?.priceModifier ?? 1.0) > 1.0 ? 'Markup' : 'Discount'}
              </div>
            </div>

            {/* Buyback Rate */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '11px', color: '#8BC34A', display: 'block', marginBottom: '4px' }}>
                Buyback Rate: {((characterData.merchantSettings?.buybackRate || 0.5) * 100).toFixed(0)}%
              </label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={characterData.merchantSettings?.buybackRate || 0.5}
                onChange={(e) => updateData({ 
                  merchantSettings: { 
                    ...(characterData.merchantSettings || DEFAULT_MERCHANT_SETTINGS),
                    buybackRate: parseFloat(e.target.value)
                  }
                })}
                style={{ width: '100%' }}
              />
              <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                How much merchant pays for items (% of value)
              </div>
            </div>

            {/* Unlimited Stock Toggle */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#8BC34A' }}>
                <input
                  type="checkbox"
                  checked={characterData.merchantSettings?.unlimitedStock || false}
                  onChange={(e) => updateData({ 
                    merchantSettings: { 
                      ...(characterData.merchantSettings || DEFAULT_MERCHANT_SETTINGS),
                      unlimitedStock: e.target.checked
                    }
                  })}
                />
                Unlimited Stock
              </label>
              <div style={{ fontSize: '9px', color: '#666', marginTop: '2px', marginLeft: '20px' }}>
                When enabled, items won't be removed from inventory on purchase
              </div>
            </div>

            {/* Shop Presets Section */}
            <div style={{
              marginTop: '16px',
              padding: '12px',
              background: 'rgba(139, 195, 74, 0.1)',
              borderRadius: '6px',
              border: '1px solid rgba(139, 195, 74, 0.2)',
            }}>
              <div style={{ 
                fontSize: '11px', 
                fontWeight: 'bold', 
                color: '#8BC34A',
                marginBottom: '8px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                🎲 Shop Presets
              </div>
              
              {/* Preset Selection */}
              <div style={{ marginBottom: '8px' }}>
                <select
                  value={selectedPresetId}
                  onChange={(e) => setSelectedPresetId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    border: '1px solid rgba(139, 195, 74, 0.3)',
                    background: 'rgba(0, 0, 0, 0.3)',
                    color: '#fff',
                    fontSize: '11px',
                  }}
                >
                  <option value="">Select a preset...</option>
                  {shopPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} ({preset.items.length} items)
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Current Preset Info */}
              {characterData.merchantSettings?.presetId && (
                <div style={{ 
                  fontSize: '9px', 
                  color: '#aaa', 
                  marginBottom: '8px',
                  fontStyle: 'italic'
                }}>
                  Current: {shopPresets.find(p => p.id === characterData.merchantSettings?.presetId)?.name || 'Unknown'}
                </div>
              )}
              
              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetId}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '4px',
                    border: 'none',
                    background: selectedPresetId 
                      ? 'linear-gradient(135deg, rgba(139, 195, 74, 0.8), rgba(104, 159, 56, 0.8))'
                      : 'rgba(100, 100, 100, 0.3)',
                    color: selectedPresetId ? '#fff' : '#666',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: selectedPresetId ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Generate Stock
                </button>
                <button
                  onClick={() => setShowPresetManager(true)}
                  style={{
                    flex: 1,
                    padding: '6px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'linear-gradient(135deg, rgba(139, 195, 74, 0.6), rgba(104, 159, 56, 0.6))',
                    color: '#fff',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  Manage Presets
                </button>
              </div>
              
              <div style={{ fontSize: '9px', color: '#666', marginTop: '8px' }}>
                💡 Generate random stock from presets or manage your shop configurations
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            marginTop: '16px',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            {/* Settings Button */}
            <button
              onClick={() => { setShowSettings(true); loadDebugInfo(); }}
              style={{
                background: 'rgba(139, 195, 74, 0.1)',
                color: '#8BC34A',
                border: '1px solid rgba(139, 195, 74, 0.3)',
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
                background: isFavorited ? 'rgba(139, 195, 74, 0.15)' : 'transparent',
                color: isFavorited ? '#8BC34A' : '#666',
                border: '1px solid ' + (isFavorited ? 'rgba(139, 195, 74, 0.3)' : '#333'),
                padding: '2px 6px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorited ? '⭐' : '☆'}
            </button>
          </div>
        </div>

        {/* Shop Preset Manager Modal */}
        {showPresetManager && (
          <ShopPresetManager onClose={() => setShowPresetManager(false)} />
        )}
      </>
    );
  }

  // Player view
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
              border: '3px solid #8BC34A',
              background: 'transparent',
              boxShadow: '0 4px 12px rgba(139, 195, 74, 0.5)',
            }}>
              <img
                src={tokenImage}
                alt={characterData.name || tokenName || 'Merchant'}
                style={{width: '100%', height: '100%', objectFit: 'cover'}}
              />
            </div>
          </div>
        )}

        <h2 style={{
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#8BC34A',
          marginBottom: '4px'
        }}>
          {characterData.merchantSettings?.shopName || characterData.name || tokenName || 'Merchant'}
        </h2>

        <div style={{ 
          fontSize: '10px', 
          color: '#8BC34A', 
          marginTop: '8px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
          fontWeight: 'bold'
        }}>
          🏪 Merchant Shop
        </div>
      </div>

      {/* Shop Info */}
      <div style={{ 
        marginTop: '20px',
        textAlign: 'left',
        background: 'rgba(139, 195, 74, 0.05)',
        border: '1px solid rgba(139, 195, 74, 0.2)',
        borderRadius: '8px',
        padding: '16px'
      }}>
        <div style={{ 
          fontSize: '12px', 
          color: '#8BC34A',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>💰 <strong>Prices:</strong> {((characterData.merchantSettings?.priceModifier || 1.0) * 100).toFixed(0)}% of base value</span>
        </div>
        <div style={{ 
          fontSize: '12px', 
          color: '#8BC34A',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>🤝 <strong>Buying at:</strong> {((characterData.merchantSettings?.buybackRate || 0.5) * 100).toFixed(0)}% of item value</span>
        </div>
        {characterData.merchantSettings?.unlimitedStock && (
          <div style={{ 
            fontSize: '11px', 
            color: '#8BC34A',
            padding: '8px',
            background: 'rgba(139, 195, 74, 0.1)',
            borderRadius: '4px',
            marginTop: '8px'
          }}>
            ♾️ Unlimited stock available
          </div>
        )}
      </div>

      {/* Trade Button for Players */}
      {showTradeButton && onOpenTradePartnerModal && (
        <div style={{ marginTop: '20px' }}>
          <button
            onClick={onOpenTradePartnerModal}
            style={{
              background: 'rgba(240, 225, 48, 0.15)',
              border: '2px solid rgba(240, 225, 48, 0.4)',
              borderRadius: '8px',
              cursor: 'pointer',
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 'bold',
              color: 'var(--accent-gold)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              width: '100%',
              maxWidth: '280px',
              margin: '0 auto',
              boxShadow: '0 2px 8px rgba(240, 225, 48, 0.3)',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(240, 225, 48, 0.25)';
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(240, 225, 48, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(240, 225, 48, 0.15)';
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 2px 8px rgba(240, 225, 48, 0.3)';
            }}
            title="Trade with this merchant"
          >
            <span style={{ fontSize: '18px' }}>$</span>
            <span>Initiate Trade</span>
          </button>
        </div>
      )}

      <div style={{
        marginTop: '16px',
        padding: '12px',
        background: 'rgba(139, 195, 74, 0.1)',
        borderRadius: '6px',
        fontSize: '11px',
        color: '#888',
        textAlign: 'left'
      }}>
        💡 <strong>How to trade:</strong> Click the "Initiate Trade" button above to open a trade window with this merchant.
      </div>

      {/* Favorite Star */}
      <div style={{ marginTop: '16px' }}>
        <button
          onClick={toggleFavorite}
          style={{
            background: isFavorited ? 'rgba(139, 195, 74, 0.15)' : 'transparent',
            color: isFavorited ? '#8BC34A' : '#666',
            border: '1px solid ' + (isFavorited ? 'rgba(139, 195, 74, 0.3)' : '#333'),
            padding: '2px 6px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '14px',
          }}
          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
        >
          {isFavorited ? '⭐' : '☆'}
        </button>
      </div>
    </div>
  );
}
