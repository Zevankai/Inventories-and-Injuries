import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { RefObject } from 'react';
import type { CharacterData, PackType, ActiveTrade, CharacterStats, ConditionType, RestType, GMCustomizations, CharacterSheet, InjuryLocation, CharacterInjuryData, DeathSaves, AbilityScores, SuperiorityDice, Scar, Project } from '../../types';
import { AbilityScoreCircle, DeathSavesDisplay, CollapsibleDashboardSection } from './home/shared';
import { MonsterHome, LoreHome, NPCHome, PartyHome, MerchantHome } from './home';
import { INJURY_HP_VALUES } from '../../types';
import type { CalendarConfig } from '../../types/calendar';
import { ReputationDisplay } from '../ReputationDisplay';
import { DebouncedInput, DebouncedTextarea } from '../DebouncedInput';
import { CharacterSheetSection } from '../CharacterSheet';
import { PinnedSkillsBar } from '../PinnedSkillsBar';
import { ConditionsPanel } from '../ConditionsPanel';
import { ExhaustionMeter } from '../ExhaustionMeter';
import { RestModal } from '../RestModal';
import type { RestEffectsToApply } from '../RestModal';
import { EditPopup } from '../EditPopup';
import { InjuryPromptModal } from '../InjuryPromptModal';
import { createDefaultCharacterSheet, calculateModifier } from '../../utils/characterSheet';
import { createDefaultExhaustionState, createDefaultRestHistory, createDefaultCharacterStats, createDefaultDeathSaves, createDefaultHitDice, createDefaultSuperiorityDice } from '../../utils/characterStats';
import { createDefaultConditions, CONDITION_LABELS, INJURY_CONDITION_TYPES } from '../../data/conditions';
import { deductRationsFromInventory } from '../../utils/inventory';
import { deductCopperPieces } from '../../utils/currency';
import { useCalendar } from '../../hooks/useCalendar';
import { formatCustomDate } from '../../utils/calendar/dateFormatting';
import { initiateRestNotification } from '../../utils/restNotifications';
import { MarkdownHint } from '../MarkdownHint';

// Token image sizing constants
const TOKEN_SIZE_SIDEBAR = '75px'; // Circular token in sidebar - compact but readable

// Level bounds constants
const MIN_LEVEL = 1;
const MAX_LEVEL = 20;

// Daily exhaustion check time (in-game hour, 0-23)
const EXHAUSTION_CHECK_HOUR = 8;


// Helper function to get HP color class based on current/max ratio
const getHpColorClass = (current: number, max: number): string => {
  if (max <= 0) return '';
  const ratio = current / max;
  if (ratio > 0.5) return 'hp-healthy';
  if (ratio > 0.25) return 'hp-wounded';
  return 'hp-critical';
};

// Two Column Dashboard Component - Redesigned layout matching mockup
interface TwoColumnDashboardProps {
  sheet: CharacterSheet;
  characterStats: CharacterStats | undefined;
  tokenImage: string | null;
  tokenName: string | null;
  characterData: CharacterData;
  stats: Stats;
  canEdit: boolean;
  onUpdateSheet: (updates: Partial<CharacterSheet>) => void;
  onUpdateCharacterStats: (updates: Partial<CharacterStats>) => void;
  onToggleHeroicInspiration: () => void;
  onOpenTradePartnerModal?: () => void;
  onOpenRestModal?: () => void;
  onUpdateDeathSaves?: (updates: Partial<DeathSaves>) => void;
  onApplyInjury?: (injuryType: ConditionType, location?: InjuryLocation) => void;
  showTradeButton: boolean;
  toggleFavorite: () => void;
  isFavorited: boolean;
  favorites: Array<{ id: string; name: string }>;
  setViewingFavorites: (viewing: boolean) => void;
  setShowSettings: (show: boolean) => void;
  loadDebugInfo: () => void;
  canEditToken: () => boolean;
  hasClaimedToken?: boolean;
  gmCustomizations?: GMCustomizations;
  // Additional props for stats row
  packDefinitions: Record<string, { capacity: number; utilitySlots: number }>;
  onPackTypeChange: (packType: PackType) => void;
  inventoryCount: number;
  onPinnedSkillClick?: () => void;
  // Superiority dice props
  onUpdateSuperiorityDice?: (updates: Partial<SuperiorityDice>) => void;
}

const TwoColumnDashboard = ({
  sheet,
  characterStats,
  tokenImage,
  tokenName,
  characterData,
  stats,
  canEdit,
  onUpdateSheet,
  onUpdateCharacterStats,
  onToggleHeroicInspiration,
  onOpenTradePartnerModal,
  onOpenRestModal,
  onUpdateDeathSaves,
  onApplyInjury,
  showTradeButton,
  toggleFavorite,
  isFavorited,
  favorites,
  setViewingFavorites,
  setShowSettings,
  loadDebugInfo,
  canEditToken,
  hasClaimedToken,
  gmCustomizations,
  packDefinitions,
  onPackTypeChange,
  inventoryCount,
  onPinnedSkillClick,
  onUpdateSuperiorityDice
}: TwoColumnDashboardProps) => {
  const [editPopup, setEditPopup] = useState<{
    type: 'hp' | 'ac' | 'init' | 'passive' | 'superiority' | null;
    position: { top: number; left: number };
  }>({ type: null, position: { top: 0, left: 0 } });
  
  // State for injury prompt modal
  const [injuryPrompt, setInjuryPrompt] = useState<{
    isOpen: boolean;
    damageAmount: number;
  }>({ isOpen: false, damageAmount: 0 });
  
  // Track the HP value when edit popup opens to calculate damage later
  const hpBeforeEdit = useRef<number>(sheet.hitPoints.current);
  
  // State for inline level editing
  const [isEditingLevel, setIsEditingLevel] = useState(false);
  const [levelEditValue, setLevelEditValue] = useState('');
  
  const [showOverencumberedPopup, setShowOverencumberedPopup] = useState(false);
  
  // Get calendar data for time/weather display
  const { config: calendarConfig } = useCalendar();
  
  const hpRef = useRef<HTMLDivElement>(null);
  const acRef = useRef<HTMLDivElement>(null);
  const initRef = useRef<HTMLDivElement>(null);
  const passiveRef = useRef<HTMLDivElement>(null);
  const weightRef = useRef<HTMLDivElement>(null);
  const superiorityRef = useRef<HTMLButtonElement>(null);
  
  const isOverencumbered = stats.totalWeight > stats.maxCapacity;
  const overencumberedAmount = isOverencumbered ? stats.totalWeight - stats.maxCapacity : 0;
  const overencumberedText = gmCustomizations?.overencumberedText || '-3 to all DEX & STR rolls, -10 movement per 10 units over';
  
  // Get active conditions (excluding injuries and infections which have their own bar)
  const activeConditions = characterStats?.conditions 
    ? Object.entries(characterStats.conditions)
        .filter(([key, isActive]) => isActive && !INJURY_CONDITION_TYPES.includes(key as ConditionType))
        .map(([key]) => CONDITION_LABELS[key as ConditionType] || key)
    : [];
  
  const hpColorClass = getHpColorClass(sheet.hitPoints.current, sheet.hitPoints.max);

  const handleStatClick = (type: 'hp' | 'ac' | 'init' | 'passive' | 'superiority', ref: RefObject<HTMLDivElement | HTMLButtonElement | null>) => {
    if (!canEdit || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // Capture HP before editing so we can detect damage when popup closes
    if (type === 'hp') {
      hpBeforeEdit.current = sheet.hitPoints.current;
    }
    setEditPopup({
      type,
      position: { top: rect.bottom + 8, left: rect.left }
    });
  };
  
  // Handler for when HP edit popup closes - checks for damage and triggers injury prompt
  const handleHpEditClose = () => {
    const hpBefore = hpBeforeEdit.current;
    const hpAfter = sheet.hitPoints.current;
    const damage = hpBefore - hpAfter;
    
    // Close the edit popup first
    setEditPopup({ type: null, position: { top: 0, left: 0 } });
    
    // Check if HP dropped to 0 (for exhaustion penalty)
    // Add 1 level of exhaustion when HP drops to 0
    if (hpAfter === 0 && hpBefore > 0 && characterStats) {
      const currentExhaustion = characterStats.exhaustion?.currentLevel || 0;
      const maxExhaustion = characterStats.exhaustion?.maxLevels || 10;
      if (currentExhaustion < maxExhaustion) {
        onUpdateCharacterStats({
          exhaustion: {
            ...(characterStats.exhaustion || { currentLevel: 0, maxLevels: 10, customEffects: [] }),
            currentLevel: currentExhaustion + 1,
          }
        });
      }
    }
    
    // Check if damage meets injury thresholds (only actual HP damage, not temp HP)
    // Only show if onApplyInjury callback is provided, damage is positive (not healing), and >= 10
    if (onApplyInjury && damage > 0 && damage >= 10) {
      setInjuryPrompt({ isOpen: true, damageAmount: damage });
    }
  };
  
  // Handler for applying an injury from the injury prompt modal
  const handleApplyInjuryFromPrompt = (injuryType: ConditionType, location?: InjuryLocation) => {
    if (onApplyInjury) {
      onApplyInjury(injuryType, location);
    }
    setInjuryPrompt({ isOpen: false, damageAmount: 0 });
  };

  // Inline level editing handlers
  const handleLevelClick = () => {
    if (!canEdit) return;
    const currentLevel = characterStats?.level || sheet.level || MIN_LEVEL;
    setLevelEditValue(currentLevel.toString());
    setIsEditingLevel(true);
  };

  const handleLevelSave = () => {
    const parsed = parseInt(levelEditValue, 10);
    const newLevel = isNaN(parsed) ? MIN_LEVEL : Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, parsed));
    // Update both sheet.level and characterStats.level
    onUpdateSheet({ level: newLevel });
    onUpdateCharacterStats({ level: newLevel });
    setIsEditingLevel(false);
  };

  const handleWeightClick = () => {
    if (isOverencumbered) {
      setShowOverencumberedPopup(true);
    }
  };

  // Death saves state
  const deathSaves = characterStats?.deathSaves || createDefaultDeathSaves();

  // Update ability score
  const updateAbilityScore = (ability: keyof AbilityScores, newScore: number) => {
    const clampedScore = Math.max(1, Math.min(30, newScore));
    const modifier = calculateModifier(clampedScore);
    onUpdateSheet({
      abilityScores: {
        ...sheet.abilityScores,
        [ability]: { base: clampedScore, modifier },
      },
    });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      marginBottom: '6px',
    }}>
      {/* === HEADER AREA === */}
      <div style={{
        position: 'relative',
        padding: '10px 12px',
        borderRadius: '6px',
        overflow: 'hidden',
        background: characterData.coverPhotoUrl 
          ? 'transparent' 
          : 'linear-gradient(135deg, rgba(30, 30, 50, 0.9), rgba(20, 20, 40, 0.95))',
        border: '1px solid var(--glass-border)',
        minHeight: '60px',
      }}>
        {/* Cover photo background */}
        {characterData.coverPhotoUrl && (
          <>
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
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.7) 100%)',
            }} />
          </>
        )}
        
        {/* Header Content */}
        <div style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}>
          {/* Top row: Time/Weather + Level */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            {/* Time and Weather Display - replaces token type */}
            {calendarConfig ? (
              <div style={{
                fontSize: '8px',
                color: 'var(--text-muted)',
                letterSpacing: '0.3px',
                background: 'rgba(0,0,0,0.4)',
                padding: '2px 6px',
                borderRadius: '3px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <span style={{ color: 'var(--text-main)' }}>
                  {calendarConfig.currentDate.hour.toString().padStart(2, '0')}:{calendarConfig.currentDate.minute.toString().padStart(2, '0')}
                </span>
                <span style={{ opacity: 0.6 }}>|</span>
                <span style={{ color: 'var(--text-main)' }}>
                  {calendarConfig.currentWeather.currentCondition} {calendarConfig.currentWeather.temperature}°
                </span>
              </div>
            ) : (
              <div style={{
                fontSize: '8px',
                color: characterData.tokenType === 'npc' ? '#ff9800' : 
                       characterData.tokenType === 'party' ? '#4caf50' : 
                       characterData.tokenType === 'lore' ? '#9c27b0' : 'var(--accent-gold)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                fontWeight: 'bold',
                background: 'rgba(0,0,0,0.4)',
                padding: '2px 6px',
                borderRadius: '3px',
              }}>
                {characterData.tokenType || 'Player'} Token
              </div>
            )}
            {/* Inline editable level */}
            {isEditingLevel ? (
              <input
                type="number"
                value={levelEditValue}
                min={MIN_LEVEL}
                max={MAX_LEVEL}
                onChange={(e) => setLevelEditValue(e.target.value)}
                onBlur={handleLevelSave}
                onKeyDown={(e) => e.key === 'Enter' && handleLevelSave()}
                autoFocus
                style={{
                  width: '40px',
                  fontSize: '16px',
                  color: 'var(--accent-gold)',
                  fontWeight: 'bold',
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid var(--accent-gold)',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  textAlign: 'center',
                  outline: 'none',
                }}
              />
            ) : (
              <div
                onClick={handleLevelClick}
                style={{
                  fontSize: '18px',
                  color: 'var(--accent-gold)',
                  fontWeight: 'bold',
                  background: 'rgba(0,0,0,0.4)',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  cursor: canEdit ? 'pointer' : 'default',
                  textShadow: '0 0 10px rgba(240, 225, 48, 0.5)',
                  minWidth: '28px',
                  textAlign: 'center',
                }}
                title={canEdit ? 'Click to edit level' : undefined}
              >
                {characterStats?.level || sheet.level || MIN_LEVEL}
              </div>
            )}
          </div>
          
          {/* Token Name - Large and prominent */}
          <div style={{
            fontSize: '18px',
            fontWeight: 'bold',
            color: 'var(--text-main)',
            textShadow: '0 2px 4px rgba(0,0,0,0.7)',
            textAlign: 'center',
            padding: '4px 0',
          }}>
            {characterData.name || tokenName || 'Unknown'}
          </div>
          
          {/* Race + Class subtitle */}
          {characterStats && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textAlign: 'center',
              textShadow: '0 1px 2px rgba(0,0,0,0.5)',
            }}>
              {characterStats.race} {characterStats.characterClass}
            </div>
          )}
        </div>
      </div>

      {/* === TWO COLUMN LAYOUT === */}
      <div style={{
        display: 'flex',
        gap: '8px',
      }}>
        {/* LEFT SIDEBAR COLUMN */}
        <div style={{
          width: '100px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
        }}>
          {/* Circular Token Portrait */}
          {tokenImage && (
            <div 
              onClick={canEdit ? onToggleHeroicInspiration : undefined}
              style={{
                position: 'relative',
                width: TOKEN_SIZE_SIDEBAR,
                height: TOKEN_SIZE_SIDEBAR,
                cursor: canEdit ? 'pointer' : 'default',
                alignSelf: 'center',
              }}
              title={canEdit ? (characterStats?.heroicInspiration ? 'Click to remove Heroic Inspiration' : 'Click to grant Heroic Inspiration') : undefined}
            >
              {characterStats?.heroicInspiration && (
                <div style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '-3px',
                  right: '-3px',
                  bottom: '-3px',
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(255, 215, 0, 0.5) 0%, rgba(255, 215, 0, 0) 70%)',
                  animation: 'pulse 2s infinite',
                }} />
              )}
              <div style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                overflow: 'hidden',
                border: characterStats?.heroicInspiration
                  ? '2px solid gold'
                  : '2px solid var(--accent-gold)',
                boxShadow: characterStats?.heroicInspiration
                  ? '0 0 12px rgba(255, 215, 0, 0.5)'
                  : '0 2px 6px rgba(0,0,0,0.3)',
              }}>
                <img src={tokenImage} alt="Token" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              {characterStats?.heroicInspiration && (
                <div style={{
                  position: 'absolute',
                  bottom: '-2px',
                  right: '-2px',
                  background: 'gold',
                  borderRadius: '50%',
                  width: '16px',
                  height: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                }}>
                  ✨
                </div>
              )}
            </div>
          )}

          {/* HP Display Box - Green Background */}
          <div
            ref={hpRef}
            onClick={() => handleStatClick('hp', hpRef)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '5px',
              background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.3), rgba(56, 142, 60, 0.3))',
              borderRadius: '5px',
              border: '1px solid rgba(76, 175, 80, 0.5)',
              cursor: canEdit ? 'pointer' : 'default',
            }}
            title={canEdit ? 'Click to edit HP' : undefined}
          >
            <span style={{ fontSize: '8px', color: '#81c784', textTransform: 'uppercase', fontWeight: 'bold' }}>HP</span>
            <span style={{ fontSize: '13px', fontWeight: 'bold' }} className={hpColorClass}>
              {sheet.hitPoints.current}/{sheet.hitPoints.max}
            </span>
            {sheet.hitPoints.temp > 0 && (
              <span style={{ fontSize: '9px', color: '#4dabf7', fontWeight: 'bold' }}>+{sheet.hitPoints.temp}</span>
            )}
          </div>

          {/* Combined Row: AC, INIT, PROF, and Passive Traits */}
          <div
            ref={passiveRef}
            onClick={() => handleStatClick('passive', passiveRef)}
            style={{
              display: 'flex',
              gap: '3px',
              flexWrap: 'wrap',
              cursor: canEdit ? 'pointer' : 'default',
            }}
            title={canEdit ? 'Click to edit stats' : undefined}
          >
            <div
              ref={acRef}
              onClick={(e) => { e.stopPropagation(); handleStatClick('ac', acRef); }}
              style={{
                flex: 1,
                minWidth: '28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '3px 2px',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '4px',
                cursor: canEdit ? 'pointer' : 'default',
              }}
              title={canEdit ? 'Click to edit AC' : undefined}
            >
              <span style={{ fontSize: '6px', color: 'var(--text-muted)' }}>AC</span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)' }}>{sheet.armorClass}</span>
            </div>
            <div
              ref={initRef}
              onClick={(e) => { e.stopPropagation(); handleStatClick('init', initRef); }}
              style={{
                flex: 1,
                minWidth: '28px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '3px 2px',
                background: 'rgba(0, 0, 0, 0.4)',
                borderRadius: '4px',
                cursor: canEdit ? 'pointer' : 'default',
              }}
              title={canEdit ? 'Click to edit Initiative' : undefined}
            >
              <span style={{ fontSize: '6px', color: 'var(--text-muted)' }}>INIT</span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)' }}>
                {sheet.initiative >= 0 ? `+${sheet.initiative}` : sheet.initiative}
              </span>
            </div>
            <div style={{
              flex: 1,
              minWidth: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '3px 2px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '4px',
            }}>
              <span style={{ fontSize: '6px', color: 'var(--text-muted)' }}>PROF</span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>+{sheet.proficiencyBonus || 2}</span>
            </div>
            <div style={{
              flex: 1,
              minWidth: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '3px 2px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '4px',
            }}>
              <span style={{ fontSize: '6px', color: 'var(--text-muted)' }}>PER</span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)' }}>{sheet.passivePerception}</span>
            </div>
            <div style={{
              flex: 1,
              minWidth: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '3px 2px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '4px',
            }}>
              <span style={{ fontSize: '6px', color: 'var(--text-muted)' }}>INV</span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)' }}>{sheet.passiveInvestigation}</span>
            </div>
            <div style={{
              flex: 1,
              minWidth: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '3px 2px',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '4px',
            }}>
              <span style={{ fontSize: '6px', color: 'var(--text-muted)' }}>INS</span>
              <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--text-main)' }}>{sheet.passiveInsight}</span>
            </div>
          </div>
        </div>

        {/* RIGHT CONTENT AREA */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}>
          {/* Icon Row - Smaller buttons - Above Defenses */}
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '3px',
            padding: '2px 4px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '4px',
            border: '1px solid var(--glass-border)',
          }}>
            {/* Trade Icon - Gold Coin with gold $ */}
            {showTradeButton && onOpenTradePartnerModal && (
              <button
                onClick={onOpenTradePartnerModal}
                aria-label="Trade with nearby tokens"
                style={{
                  background: 'rgba(240, 225, 48, 0.15)',
                  border: '1px solid rgba(240, 225, 48, 0.4)',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  width: '20px',
                  height: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '9px',
                  fontWeight: 'bold',
                  color: 'var(--accent-gold)',
                  boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(240, 225, 48, 0.3)',
                }}
                title="Trade with nearby tokens"
              >
                $
              </button>
            )}

            {/* Rest Icon */}
            {onOpenRestModal && (
              <button
                onClick={onOpenRestModal}
                style={{
                  background: 'rgba(255, 152, 0, 0.1)',
                  border: '1px solid rgba(255, 152, 0, 0.3)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '9px',
                  padding: '2px 4px',
                  color: '#ff9800',
                }}
                title="Take a rest (option for party rest)"
              >
                🏕️
              </button>
            )}
            
            {/* Superiority Dice Icon */}
            {characterStats?.superiorityDice && characterStats.superiorityDice.max > 0 && (
              <button
                ref={superiorityRef}
                onClick={() => handleStatClick('superiority', superiorityRef)}
                style={{
                  background: 'rgba(220, 53, 69, 0.1)',
                  border: '1px solid rgba(220, 53, 69, 0.3)',
                  borderRadius: '3px',
                  cursor: canEdit ? 'pointer' : 'default',
                  fontSize: '9px',
                  padding: '2px 6px',
                  color: characterStats.superiorityDice.current > 0 ? '#dc3545' : '#888',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '3px',
                }}
                title={`Superiority Dice: ${characterStats.superiorityDice.current}/${characterStats.superiorityDice.max}`}
              >
                <span>⚔️</span>
                <span style={{ fontWeight: 'bold', fontSize: '10px' }}>
                  {characterStats.superiorityDice.current}/{characterStats.superiorityDice.max}
                </span>
              </button>
            )}

            {/* Favorite Star */}
            <button
              onClick={toggleFavorite}
              style={{
                background: isFavorited ? 'rgba(240, 225, 48, 0.15)' : 'transparent',
                color: isFavorited ? 'var(--accent-gold)' : '#666',
                border: '1px solid ' + (isFavorited ? 'rgba(240, 225, 48, 0.3)' : '#333'),
                padding: '2px 4px',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '9px',
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
                  color: 'var(--accent-gold)',
                  border: '1px solid #333',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '8px',
                }}
                title="View all favorite tokens"
              >
                📋
              </button>
            )}

            {/* Settings */}
            {canEditToken() && (
              <button
                onClick={() => { setShowSettings(true); loadDebugInfo(); }}
                style={{
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #333',
                  padding: '2px 4px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '8px',
                }}
                title="Settings"
              >
                ⚙️
              </button>
            )}

            {/* Separator */}
            <div style={{
              width: '1px',
              height: '16px',
              background: 'var(--glass-border)',
              margin: '0 2px',
            }} />

            {/* Death Save Skulls */}
            {onUpdateDeathSaves && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1px',
                padding: '1px 3px',
                background: 'rgba(139, 0, 0, 0.15)',
                border: '1px solid rgba(139, 0, 0, 0.3)',
                borderRadius: '3px',
              }} title="Death Save Failures">
                <DeathSavesDisplay
                  deathSaves={deathSaves}
                  onUpdate={onUpdateDeathSaves}
                  canEdit={canEdit}
                />
              </div>
            )}
          </div>

          {/* Status Boxes - Stacked vertically (Defenses on top, Conditions below) */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            {/* Defenses Box - Green - Only show if defenses exist */}
            {sheet.defenses && sheet.defenses.trim() !== '' && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(76, 175, 80, 0.2), rgba(56, 142, 60, 0.2))',
                border: '1px solid rgba(76, 175, 80, 0.4)',
                borderRadius: '5px',
                padding: '5px',
              }}>
                <div style={{ fontSize: '7px', color: '#81c784', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '1px' }}>
                  🛡️ Defenses
                </div>
                <div style={{ fontSize: '8px', color: 'var(--text-main)' }}>
                  {sheet.defenses}
                </div>
              </div>
            )}

            {/* Active Conditions Box - Red/Pink - Only show if conditions exist */}
            {activeConditions.length > 0 && (
              <div style={{
                background: 'linear-gradient(135deg, rgba(233, 30, 99, 0.2), rgba(194, 24, 91, 0.2))',
                border: '1px solid rgba(233, 30, 99, 0.4)',
                borderRadius: '5px',
                padding: '5px',
              }}>
                <div style={{ fontSize: '7px', color: '#f06292', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: '1px' }}>
                  ❗ Conditions
                </div>
                <div style={{ fontSize: '8px', color: '#ff5722' }}>
                  {activeConditions.slice(0, 2).join(', ')}
                  {activeConditions.length > 2 && ` +${activeConditions.length - 2}`}
                </div>
              </div>
            )}

            {/* Exhaustion/Injury/Infection Notice Bar */}
            {(() => {
              const exhaustionLevel = characterStats?.exhaustion?.currentLevel || 0;
              const hasMinorInjury = characterStats?.conditions?.minorInjury;
              const hasSeriousInjury = characterStats?.conditions?.seriousInjury;
              const hasCriticalInjury = characterStats?.conditions?.criticalInjury;
              const hasInfection = characterStats?.conditions?.infection;
              
              const hasAnyStatus = exhaustionLevel > 0 || hasMinorInjury || hasSeriousInjury || hasCriticalInjury || hasInfection;
              
              if (!hasAnyStatus) return null;
              
              const statusItems: string[] = [];
              if (exhaustionLevel > 0) statusItems.push(`💤 Exhaustion Lv ${exhaustionLevel}`);
              if (hasCriticalInjury) statusItems.push('🩹 Critical Injury');
              if (hasSeriousInjury) statusItems.push('🩹 Serious Injury');
              if (hasMinorInjury) statusItems.push('🩹 Minor Injury');
              if (hasInfection) statusItems.push('🦠 Infection');
              
              return (
                <div style={{
                  background: 'linear-gradient(135deg, rgba(255, 152, 0, 0.25), rgba(255, 87, 34, 0.25))',
                  border: '1px solid rgba(255, 152, 0, 0.5)',
                  borderRadius: '5px',
                  padding: '5px 8px',
                }}>
                  <div style={{ 
                    fontSize: '8px', 
                    color: '#ffb74d', 
                    fontWeight: 'bold',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                  }}>
                    {statusItems.map((item, index) => (
                      <span key={index}>{item}</span>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Ability Score Circles */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '6px 4px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '6px',
            border: '1px solid var(--glass-border)',
          }}>
            {(Object.keys(sheet.abilityScores) as Array<keyof AbilityScores>).map((ability) => (
              <AbilityScoreCircle
                key={ability}
                ability={ability}
                score={sheet.abilityScores[ability].base}
                modifier={sheet.abilityScores[ability].modifier}
                canEdit={canEdit}
                onScoreChange={(newScore) => updateAbilityScore(ability, newScore)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* === STATS ROW - Between Attributes and Pinned Skills === */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '6px 10px',
        background: 'rgba(0, 0, 0, 0.25)',
        borderRadius: '6px',
        border: '1px solid var(--glass-border)',
        flexWrap: 'wrap',
      }}>
        {/* Pack Type Selector */}
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Pack:</span>
            <select 
              value={characterData.packType} 
              onChange={(e) => onPackTypeChange(e.target.value as PackType)} 
              style={{
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid var(--glass-border)',
                borderRadius: '4px',
                color: 'var(--accent-gold)',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 4px',
                cursor: 'pointer',
              }}
            >
              {Object.keys(packDefinitions).map(pack => <option key={pack} value={pack}>{pack}</option>)}
            </select>
          </div>
        )}
        
        {/* Total Weight */}
        <div 
          ref={weightRef}
          onClick={handleWeightClick}
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '3px',
            padding: '2px 6px',
            background: isOverencumbered ? 'rgba(255, 87, 34, 0.2)' : 'rgba(0, 0, 0, 0.3)',
            borderRadius: '4px',
            border: isOverencumbered ? '1px solid rgba(255, 87, 34, 0.5)' : '1px solid transparent',
            cursor: isOverencumbered ? 'pointer' : 'default',
          }}
          title={isOverencumbered ? 'Click to see overencumbered effects' : 'Current weight / Max capacity'}
        >
          <span style={{ fontSize: '9px', color: isOverencumbered ? '#ff5722' : 'var(--text-muted)', textTransform: 'uppercase' }}>Wt:</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: isOverencumbered ? '#ff5722' : 'var(--text-main)' }}>
            {stats.totalWeight}/{stats.maxCapacity}
          </span>
        </div>

        {/* Items Count */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Items:</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--text-main)' }}>{inventoryCount}</span>
        </div>

        {/* Coin Weight */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '2px 6px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '4px' }}>
          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Coins:</span>
          <span style={{ fontSize: '10px', fontWeight: 'bold', color: stats.coinWeight > 0 ? '#ffc107' : 'var(--text-main)' }}>
            {stats.coinWeight}u
          </span>
        </div>
      </div>

      {/* === PINNED SKILLS BAR - Enlarged === */}
      <PinnedSkillsBar
        sheet={sheet}
        onSkillClick={onPinnedSkillClick}
        enlarged={true}
      />
      
      {/* Edit Popups */}
      <EditPopup
        isOpen={editPopup.type === 'hp'}
        onClose={handleHpEditClose}
        title="Edit Hit Points"
        position={editPopup.position}
        fields={[
          { label: 'Current HP', value: sheet.hitPoints.current, onChange: (val) => onUpdateSheet({ hitPoints: { ...sheet.hitPoints, current: val } }) },
          { label: 'Max HP', value: sheet.hitPoints.max, onChange: (val) => onUpdateSheet({ hitPoints: { ...sheet.hitPoints, max: val } }), min: 0 },
          { label: 'Temp HP', value: sheet.hitPoints.temp, onChange: (val) => onUpdateSheet({ hitPoints: { ...sheet.hitPoints, temp: val } }), min: 0 },
        ]}
      />
      <EditPopup
        isOpen={editPopup.type === 'ac'}
        onClose={() => setEditPopup({ type: null, position: { top: 0, left: 0 } })}
        title="Edit Armor Class"
        position={editPopup.position}
        fields={[
          { label: 'Armor Class', value: sheet.armorClass, onChange: (val) => onUpdateSheet({ armorClass: val }), min: 0 },
        ]}
      />
      <EditPopup
        isOpen={editPopup.type === 'init'}
        onClose={() => setEditPopup({ type: null, position: { top: 0, left: 0 } })}
        title="Edit Initiative"
        position={editPopup.position}
        fields={[
          { label: 'Initiative Modifier', value: sheet.initiative, onChange: (val) => onUpdateSheet({ initiative: val }) },
        ]}
      />
      <EditPopup
        isOpen={editPopup.type === 'passive'}
        onClose={() => setEditPopup({ type: null, position: { top: 0, left: 0 } })}
        title="Edit Passive Traits"
        position={editPopup.position}
        fields={[
          { label: 'Perception', value: sheet.passivePerception, onChange: (val) => onUpdateSheet({ passivePerception: val }) },
          { label: 'Investigation', value: sheet.passiveInvestigation, onChange: (val) => onUpdateSheet({ passiveInvestigation: val }) },
          { label: 'Insight', value: sheet.passiveInsight, onChange: (val) => onUpdateSheet({ passiveInsight: val }) },
        ]}
      />
      {/* Superiority Dice Edit Popup */}
      {characterStats?.superiorityDice && onUpdateSuperiorityDice && (
        <EditPopup
          isOpen={editPopup.type === 'superiority'}
          onClose={() => setEditPopup({ type: null, position: { top: 0, left: 0 } })}
          title="Edit Superiority Dice"
          position={editPopup.position}
          fields={[
            { label: 'Current', value: characterStats.superiorityDice?.current ?? 0, onChange: (val) => onUpdateSuperiorityDice({ current: Math.max(0, Math.min(characterStats.superiorityDice?.max ?? 4, val)) }), min: 0 },
            { label: 'Max', value: characterStats.superiorityDice?.max ?? 4, onChange: (val) => onUpdateSuperiorityDice({ max: Math.max(0, val) }), min: 0 },
          ]}
        />
      )}
      
      {/* Overencumbered Popup */}
      {showOverencumberedPopup && (
        <>
          <div 
            onClick={() => setShowOverencumberedPopup(false)} 
            style={{ 
              position: 'fixed', 
              inset: 0, 
              zIndex: 999,
              background: 'rgba(0, 0, 0, 0.3)'
            }} 
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: 'linear-gradient(135deg, rgba(40, 20, 20, 0.98), rgba(60, 30, 30, 0.98))',
            border: '2px solid rgba(255, 87, 34, 0.6)',
            borderRadius: '10px',
            padding: '16px',
            zIndex: 1000,
            minWidth: '200px',
            maxWidth: '280px',
            boxShadow: '0 8px 32px rgba(255, 87, 34, 0.3)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px' }}>⚠️</span>
              <h4 style={{
                margin: 0,
                fontSize: '14px',
                color: '#ff5722',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                fontWeight: 'bold',
              }}>
                Overencumbered
              </h4>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#ff8a65', fontWeight: 'bold', marginBottom: '4px' }}>
                +{overencumberedAmount} units over capacity
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: '1.4' }}>
                {overencumberedText}
              </div>
            </div>
            <button 
              onClick={() => setShowOverencumberedPopup(false)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgba(255, 87, 34, 0.3)',
                color: '#ff5722',
                border: '1px solid rgba(255, 87, 34, 0.5)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '11px',
                fontWeight: 'bold',
              }}
            >
              Close
            </button>
          </div>
        </>
      )}
      
      {/* Injury Prompt Modal - shown when HP damage exceeds thresholds */}
      <InjuryPromptModal
        isOpen={injuryPrompt.isOpen}
        onClose={() => setInjuryPrompt({ isOpen: false, damageAmount: 0 })}
        damageAmount={injuryPrompt.damageAmount}
        onApplyInjury={handleApplyInjuryFromPrompt}
      />
    </div>
  );
};

interface Stats {
  totalWeight: number;
  maxCapacity: number;
  coinWeight: number;
  totalCoins: number;
  usedSlots: {
    weapon: number;
    armor: number;
    clothing: number;
    jewelry: number;
    utility: number;
  };
  maxSlots: {
    weapon: number;
    armor: number;
    clothing: number;
    jewelry: number;
    utility: number;
  };
}

interface StorageDef {
  capacity: number;
}

// Scar Prompt Modal Component
interface ScarPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  injuryType: 'serious' | 'critical';
  defaultLocation: string;
  onSave: (scar: Scar) => void;
}

const ScarPromptModal: React.FC<ScarPromptModalProps> = ({
  isOpen,
  onClose,
  injuryType,
  defaultLocation,
  onSave,
}) => {
  const [source, setSource] = useState('');
  const [size, setSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [location, setLocation] = useState(defaultLocation);
  
  // Get calendar date for scar acquisition
  const { config: calendarConfig } = useCalendar();
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    const scar: Scar = {
      id: `scar-${Date.now()}`,
      source: source || 'Unknown injury',
      size,
      location: location || defaultLocation,
      injuryType,
      acquiredDate: calendarConfig ? {
        year: calendarConfig.currentDate.year,
        monthIndex: calendarConfig.currentDate.monthIndex,
        day: calendarConfig.currentDate.day,
      } : undefined,
    };
    onSave(scar);
  };
  
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
        }}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'linear-gradient(135deg, rgba(30, 30, 50, 0.98), rgba(40, 40, 60, 0.98))',
        padding: '20px',
        borderRadius: '12px',
        border: `2px solid ${injuryType === 'critical' ? '#e53935' : '#ff9800'}`,
        zIndex: 1001,
        minWidth: '320px',
        maxWidth: '420px',
        boxShadow: `0 8px 32px ${injuryType === 'critical' ? 'rgba(229, 57, 53, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '28px' }}>{injuryType === 'critical' ? '💀' : '🩸'}</span>
          <h3 style={{ 
            margin: 0, 
            color: injuryType === 'critical' ? '#e53935' : '#ff9800', 
            fontSize: '16px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
            New Scar
          </h3>
        </div>
        
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Your {injuryType === 'critical' ? 'critical' : 'serious'} injury has healed, leaving a permanent scar. 
          Describe the scar below.
        </p>
        
        {/* Source Input */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            What caused this injury?
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., Dragon fire, Sword slash..."
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--glass-border)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
        </div>
        
        {/* Size Selection */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Scar Size
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['small', 'medium', 'large'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: size === s ? `${injuryType === 'critical' ? '#e53935' : '#ff9800'}20` : 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${size === s ? (injuryType === 'critical' ? '#e53935' : '#ff9800') : 'transparent'}`,
                  borderRadius: '4px',
                  color: size === s ? (injuryType === 'critical' ? '#e53935' : '#ff9800') : 'var(--text-muted)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  fontSize: '12px',
                  fontWeight: size === s ? 'bold' : 'normal',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        
        {/* Location Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Location on Body
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Left arm, Face, Chest..."
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--glass-border)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              background: '#444',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              background: injuryType === 'critical' ? '#e53935' : '#ff9800',
              border: 'none',
              borderRadius: '4px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            Save Scar
          </button>
        </div>
      </div>
    </>
  );
};

// Scar Edit Modal Component
interface ScarEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  scar: Scar;
  onSave: (scarId: string, updates: Partial<Scar>) => void;
  calendarConfig?: CalendarConfig | null;
}

const ScarEditModal: React.FC<ScarEditModalProps> = ({
  isOpen,
  onClose,
  scar,
  onSave,
  calendarConfig,
}) => {
  const [source, setSource] = useState(scar.source);
  const [size, setSize] = useState<'small' | 'medium' | 'large'>(scar.size);
  const [location, setLocation] = useState(scar.location);
  const [acquiredDate, setAcquiredDate] = useState<{ year: number; monthIndex: number; day: number } | undefined>(scar.acquiredDate);
  
  // Sync state when scar prop changes (when editing a different scar)
  // This is necessary because the modal reuses the same component instance
  useEffect(() => {
    setSource(scar.source);
    setSize(scar.size);
    setLocation(scar.location);
    setAcquiredDate(scar.acquiredDate);
  }, [scar.id, scar.source, scar.size, scar.location, scar.acquiredDate]);
  
  if (!isOpen) return null;
  
  const handleSave = () => {
    onSave(scar.id, {
      source,
      size,
      location,
      acquiredDate,
    });
    onClose();
  };
  
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
        }}
      />
      <div style={{
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'linear-gradient(135deg, rgba(30, 30, 50, 0.98), rgba(40, 40, 60, 0.98))',
        padding: '20px',
        borderRadius: '12px',
        border: `2px solid ${scar.injuryType === 'critical' ? '#e53935' : '#ff9800'}`,
        zIndex: 1001,
        minWidth: '320px',
        maxWidth: '420px',
        boxShadow: `0 8px 32px ${scar.injuryType === 'critical' ? 'rgba(229, 57, 53, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <span style={{ fontSize: '28px' }}>{scar.injuryType === 'critical' ? '💀' : '🩸'}</span>
          <h3 style={{ 
            margin: 0, 
            color: scar.injuryType === 'critical' ? '#e53935' : '#ff9800', 
            fontSize: '16px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
          }}>
            Edit Scar
          </h3>
        </div>
        
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Update the details of this scar.
        </p>
        
        {/* Source Input */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            What caused this injury?
          </label>
          <input
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="e.g., Dragon fire, Sword slash..."
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--glass-border)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              boxSizing: 'border-box',
            }}
            autoFocus
          />
        </div>
        
        {/* Size Selection */}
        <div style={{ marginBottom: '12px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Scar Size
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            {(['small', 'medium', 'large'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                style={{
                  flex: 1,
                  padding: '8px',
                  background: size === s ? `${scar.injuryType === 'critical' ? '#e53935' : '#ff9800'}20` : 'rgba(0, 0, 0, 0.3)',
                  border: `1px solid ${size === s ? (scar.injuryType === 'critical' ? '#e53935' : '#ff9800') : 'transparent'}`,
                  borderRadius: '4px',
                  color: size === s ? (scar.injuryType === 'critical' ? '#e53935' : '#ff9800') : 'var(--text-muted)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                  fontSize: '12px',
                  fontWeight: size === s ? 'bold' : 'normal',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        
        {/* Location Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Location on Body
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Left arm, Face, Chest..."
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              background: 'rgba(0, 0, 0, 0.3)',
              border: '1px solid var(--glass-border)',
              borderRadius: '6px',
              color: 'var(--text-main)',
              boxSizing: 'border-box',
            }}
          />
        </div>
        
        {/* Acquired Date Display and Edit */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Acquired Date
          </label>
          {calendarConfig && acquiredDate ? (
            <div style={{ 
              padding: '10px', 
              background: 'rgba(0, 0, 0, 0.2)', 
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text-main)',
            }}>
              {formatCustomDate(calendarConfig, acquiredDate)}
            </div>
          ) : acquiredDate ? (
            <div style={{ 
              padding: '10px', 
              background: 'rgba(0, 0, 0, 0.2)', 
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}>
              Day {acquiredDate.day}, Month {acquiredDate.monthIndex + 1}, Year {acquiredDate.year}
            </div>
          ) : (
            <div style={{ 
              padding: '10px', 
              background: 'rgba(0, 0, 0, 0.2)', 
              borderRadius: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              No date recorded
            </div>
          )}
          
          {/* Date editing inputs */}
          {calendarConfig && (
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {/* Year selector */}
              <div style={{ flex: '0 1 auto' }}>
                <label style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                  Year
                </label>
                <input
                  type="number"
                  value={acquiredDate?.year ?? calendarConfig.currentDate.year}
                  onChange={(e) => setAcquiredDate({
                    year: parseInt(e.target.value, 10) || calendarConfig.currentDate.year,
                    monthIndex: acquiredDate?.monthIndex ?? calendarConfig.currentDate.monthIndex,
                    day: acquiredDate?.day ?? calendarConfig.currentDate.day,
                  })}
                  style={{
                    width: '70px',
                    padding: '6px',
                    fontSize: '11px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '4px',
                    color: 'var(--text-main)',
                  }}
                />
              </div>
              
              {/* Month selector */}
              <div style={{ flex: '1 1 auto' }}>
                <label style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                  Month
                </label>
                <select
                  value={acquiredDate?.monthIndex ?? calendarConfig.currentDate.monthIndex}
                  onChange={(e) => setAcquiredDate({
                    year: acquiredDate?.year ?? calendarConfig.currentDate.year,
                    monthIndex: parseInt(e.target.value, 10),
                    day: acquiredDate?.day ?? 1,
                  })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    fontSize: '11px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '4px',
                    color: 'var(--text-main)',
                  }}
                >
                  {calendarConfig.months.map((month, index) => (
                    <option key={index} value={index}>
                      {month.name}
                    </option>
                  ))}
                </select>
              </div>
              
              {/* Day selector */}
              <div style={{ flex: '0 1 auto' }}>
                <label style={{ display: 'block', fontSize: '9px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                  Day
                </label>
                <input
                  type="number"
                  min={1}
                  max={(() => {
                    const monthIndex = acquiredDate?.monthIndex ?? calendarConfig.currentDate.monthIndex;
                    return calendarConfig.months[monthIndex]?.days || 30;
                  })()}
                  value={acquiredDate?.day ?? calendarConfig.currentDate.day}
                  onChange={(e) => {
                    const monthIndex = acquiredDate?.monthIndex ?? calendarConfig.currentDate.monthIndex;
                    const maxDays = calendarConfig.months[monthIndex]?.days || 30;
                    const day = Math.min(maxDays, Math.max(1, parseInt(e.target.value, 10) || 1));
                    setAcquiredDate({
                      year: acquiredDate?.year ?? calendarConfig.currentDate.year,
                      monthIndex: acquiredDate?.monthIndex ?? calendarConfig.currentDate.monthIndex,
                      day,
                    });
                  }}
                  style={{
                    width: '60px',
                    padding: '6px',
                    fontSize: '11px',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '4px',
                    color: 'var(--text-main)',
                  }}
                />
              </div>
            </div>
          )}
        </div>
        
        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 16px',
              background: 'rgba(128, 128, 128, 0.2)',
              border: '1px solid rgba(128, 128, 128, 0.4)',
              borderRadius: '6px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '12px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '10px 16px',
              background: scar.injuryType === 'critical' ? '#e53935' : '#ff9800',
              border: 'none',
              borderRadius: '6px',
              color: 'white',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 'bold',
            }}
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  );
};

interface HomeTabProps {
  stats: Stats;
  viewingStorageId: string | null;
  setShowSettings: (show: boolean) => void;
  loadDebugInfo: () => void;
  characterData: CharacterData;
  playerRole: string;
  playerId: string | null;
  tokenImage: string | null;
  tokenName: string | null;
  toggleFavorite: () => void;
  isFavorited: boolean;
  favorites: Array<{ id: string; name: string }>;
  setViewingFavorites: (viewing: boolean) => void;
  activeTrade: ActiveTrade | null;
  tokenId: string | null;
  canEditToken: () => boolean;
  claimToken: () => Promise<boolean | undefined>;
  unclaimToken: () => void;
  handleUpdateData: (updates: Partial<CharacterData>) => void;
  onOpenTradePartnerModal?: () => void;
  updateData: (updates: Partial<CharacterData>) => void;
  PACK_DEFINITIONS: Record<string, { capacity: number; utilitySlots: number }>;
  currentDisplayData: CharacterData;
  activeStorageDef: StorageDef | null;
  hasClaimedToken?: boolean;
  showCoverPhoto?: boolean;
  showTokenProfile?: boolean;
  gmCustomizations?: GMCustomizations;
  preSelectedRestType?: RestType | null;
  onRestTypeUsed?: () => void;
}

export function HomeTab({
  stats,
  viewingStorageId,
  setShowSettings,
  loadDebugInfo,
  characterData,
  playerRole,
  playerId,
  tokenImage,
  tokenName,
  toggleFavorite,
  isFavorited,
  favorites,
  setViewingFavorites,
  activeTrade,
  tokenId,
  canEditToken,
  claimToken,
  unclaimToken,
  handleUpdateData,
  onOpenTradePartnerModal,
  updateData,
  PACK_DEFINITIONS,
  currentDisplayData,
  activeStorageDef,
  hasClaimedToken,
  showCoverPhoto = true,
  showTokenProfile = true,
  gmCustomizations,
  preSelectedRestType,
  onRestTypeUsed
}: HomeTabProps) {
  // State for Rest Modal
  const [showRestModal, setShowRestModal] = useState(false);
  const [initialRestType, setInitialRestType] = useState<RestType | null>(null);
  
  // Effect to open RestModal when preSelectedRestType is set
  useEffect(() => {
    if (preSelectedRestType && !showRestModal) {
      setInitialRestType(preSelectedRestType);
      setShowRestModal(true);
      // Clear the pre-selected rest type from parent
      if (onRestTypeUsed) {
        onRestTypeUsed();
      }
    }
    // Only run when preSelectedRestType changes to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preSelectedRestType]);
  
  // State for Scar Prompt Modal
  const [scarPrompt, setScarPrompt] = useState<{
    isOpen: boolean;
    injuryType: 'serious' | 'critical';
    injuryLocation: string;
  } | null>(null);
  
  // State for Scar Edit Modal
  const [scarEditModal, setScarEditModal] = useState<{
    isOpen: boolean;
    scar: Scar;
  } | null>(null);
  
  // Helper to check if user can edit this token (GM, owner, or party token)
  const canUserEdit = playerRole === 'GM' || characterData.claimedBy === playerId || characterData.tokenType === 'party';
  
  // Get calendar config for date tracking (projects, scars, etc.)
  const { config: calendarConfig } = useCalendar();
  
  // Get character stats with defaults - memoize to avoid recreating on every render
  const characterStats = characterData.characterStats;
  const defaultStats = useMemo(() => createDefaultCharacterStats(), []);
  
  // Track the last checked date for exhaustion to prevent duplicate checks
  const lastExhaustionCheckRef = useRef<string | null>(null);
  
  // Helper to update character stats
  const updateCharacterStats = useCallback((updates: Partial<CharacterStats>) => {
    const currentStats = characterStats || defaultStats;
    updateData({
      characterStats: {
        ...currentStats,
        ...updates,
      }
    });
  }, [characterStats, defaultStats, updateData]);
  
  // Helper function to calculate hours between two calendar dates
  const calculateHoursBetweenDates = useCallback((
    config: typeof calendarConfig,
    date1: { year: number; monthIndex: number; day: number; hour: number; minute: number },
    date2: { year: number; monthIndex: number; day: number; hour: number; minute: number }
  ): number => {
    if (!config) return 0;
    
    // Calculate total minutes for date1
    let totalMinutes1 = date1.minute + (date1.hour * 60);
    for (let y = 0; y < date1.year; y++) {
      for (let m = 0; m < config.months.length; m++) {
        totalMinutes1 += config.months[m].days * 24 * 60;
      }
    }
    for (let m = 0; m < date1.monthIndex; m++) {
      totalMinutes1 += config.months[m].days * 24 * 60;
    }
    totalMinutes1 += (date1.day - 1) * 24 * 60;
    
    // Calculate total minutes for date2
    let totalMinutes2 = date2.minute + (date2.hour * 60);
    for (let y = 0; y < date2.year; y++) {
      for (let m = 0; m < config.months.length; m++) {
        totalMinutes2 += config.months[m].days * 24 * 60;
      }
    }
    for (let m = 0; m < date2.monthIndex; m++) {
      totalMinutes2 += config.months[m].days * 24 * 60;
    }
    totalMinutes2 += (date2.day - 1) * 24 * 60;
    
    const minutesDiff = Math.abs(totalMinutes2 - totalMinutes1);
    return minutesDiff / 60; // Convert to hours
  }, []);
  
  // Daily exhaustion check at 8:00 AM in-game time
  useEffect(() => {
    if (!calendarConfig || !characterStats?.restHistory?.lastLongRest?.calendarDate || !canUserEdit) {
      return;
    }
    
    const currentDate = calendarConfig.currentDate;
    
    // Only check at the configured exhaustion check hour
    if (currentDate.hour !== EXHAUSTION_CHECK_HOUR) {
      return;
    }
    
    // Create a unique key for this day to prevent duplicate checks
    const dayKey = `${currentDate.year}-${currentDate.monthIndex}-${currentDate.day}`;
    
    // Skip if we've already checked this day
    if (lastExhaustionCheckRef.current === dayKey) {
      return;
    }
    
    // Check if 24+ hours have passed since last long rest
    const lastRestDate = characterStats.restHistory.lastLongRest.calendarDate;
    const hoursSinceLastRest = calculateHoursBetweenDates(calendarConfig, lastRestDate, currentDate);
    
    if (hoursSinceLastRest >= 24) {
      // Automatically add 1 exhaustion level
      const currentExhaustion = characterStats.exhaustion || createDefaultCharacterStats().exhaustion;
      const newExhaustionLevel = Math.min(currentExhaustion.maxLevels, currentExhaustion.currentLevel + 1);
      
      updateCharacterStats({
        exhaustion: {
          ...currentExhaustion,
          currentLevel: newExhaustionLevel,
        }
      });
      
      // Mark that we've checked this day
      lastExhaustionCheckRef.current = dayKey;
    }
  }, [calendarConfig, characterStats, calculateHoursBetweenDates, updateCharacterStats, canUserEdit]);
  
  // Function to handle opening rest modal with party rest option
  const handleOpenRestModal = useCallback(async () => {
    // Prompt user if they want to initiate a party rest
    const partyRestPrompt = window.confirm('Would you like to initiate a party rest?\n\nClick OK to notify all players and rest together.\nClick Cancel to rest alone.');
    
    if (partyRestPrompt) {
      // User wants party rest - prompt for rest type
      const restTypePrompt = window.prompt('Initiate a party rest:\n1 = Short Rest (2 hours)\n2 = Long Rest (8 hours)', '1');
      if (!restTypePrompt) return; // User cancelled
      
      const restType: RestType = restTypePrompt === '2' ? 'long' : 'short';
      
      try {
        await initiateRestNotification(restType);
        // The RestNotification component will automatically redirect the initiator to the rest modal
      } catch (error) {
        console.error('Failed to initiate party rest:', error);
        alert('Failed to initiate party rest notification.');
      }
    } else {
      // User wants to rest alone - just open the modal
      setShowRestModal(true);
    }
  }, []);
  
  // Toggle heroic inspiration
  const toggleHeroicInspiration = () => {
    if (!canUserEdit) return;
    const currentStats = characterStats || defaultStats;
    updateCharacterStats({ heroicInspiration: !currentStats.heroicInspiration });
  };
  
  // Scar management functions
  const handleUpdateScar = (scarId: string, updates: Partial<Scar>) => {
    if (!canUserEdit) return;
    const existingScars = characterData.scars || [];
    const updatedScars = existingScars.map(scar => 
      scar.id === scarId ? { ...scar, ...updates } : scar
    );
    updateData({ scars: updatedScars });
  };
  
  const handleDeleteScar = (scarId: string) => {
    if (!canUserEdit) return;
    const existingScars = characterData.scars || [];
    const updatedScars = existingScars.filter(scar => scar.id !== scarId);
    updateData({ scars: updatedScars });
  };
  
  // Update condition
  // Injury types that track HP for healing
  const INJURY_TYPES_WITH_HP: ConditionType[] = ['minorInjury', 'seriousInjury', 'criticalInjury'];
  
  const updateCondition = (conditionType: ConditionType, value: boolean, location?: InjuryLocation) => {
    const currentStats = characterStats || defaultStats;
    
    // Check if we already have this injury type active (only 1 of each type allowed)
    if (value && INJURY_TYPES_WITH_HP.includes(conditionType)) {
      if (currentStats.conditions[conditionType as keyof typeof currentStats.conditions]) {
        // Already have this injury type - don't add another
        return;
      }
    }
    
    const newConditions = {
      ...currentStats.conditions,
      [conditionType]: value,
    };
    
    // If enabling an injury, set up injury HP and date acquired
    if (value && INJURY_TYPES_WITH_HP.includes(conditionType)) {
      const injuryType = conditionType as 'minorInjury' | 'seriousInjury' | 'criticalInjury';
      const newInjuryData: CharacterInjuryData = {
        ...(currentStats.injuryData || {}),
        [conditionType]: { 
          injuryLocation: location,
          injuryHP: INJURY_HP_VALUES[injuryType],
          injuryDaysSinceRest: 0,
          dateAcquired: new Date().toISOString(),
        },
      };
      updateCharacterStats({
        conditions: newConditions,
        injuryData: newInjuryData,
      });
    } else if (!value) {
      // When disabling an injury condition, clear its injury data
      const newInjuryData = { ...(currentStats.injuryData || {}) };
      delete newInjuryData[conditionType as keyof CharacterInjuryData];
      updateCharacterStats({
        conditions: newConditions,
        injuryData: Object.keys(newInjuryData).length > 0 ? newInjuryData : undefined,
      });
    } else {
      updateCharacterStats({
        conditions: newConditions,
      });
    }
  };
  
  // Update injury data (for additional injury tracking like days since rest)
  const updateInjuryData = (conditionType: ConditionType, data: Partial<CharacterInjuryData[keyof CharacterInjuryData]>) => {
    const currentStats = characterStats || defaultStats;
    const currentInjuryData = currentStats.injuryData || {};
    const currentConditionData = currentInjuryData[conditionType as keyof CharacterInjuryData] || {};
    
    updateCharacterStats({
      injuryData: {
        ...currentInjuryData,
        [conditionType]: {
          ...currentConditionData,
          ...data,
        },
      },
    });
  };
  
  // Update exhaustion level
  const updateExhaustionLevel = (level: number) => {
    const currentStats = characterStats || defaultStats;
    updateCharacterStats({
      exhaustion: {
        ...currentStats.exhaustion,
        currentLevel: level,
      }
    });
  };
  
  // Handle rest completion with effects
  const handleRest = (restType: RestType, selectedOptionIds: string[], effects: RestEffectsToApply) => {
    const currentStats = characterStats || defaultStats;
    const sheet = characterData.characterSheet || createDefaultCharacterSheet();
    const now = Date.now();
    
    // Prepare updates for character stats
    const statsUpdates: Partial<CharacterStats> = {};
    
    // Apply heroic inspiration if granted by effect
    if (effects.heroicInspiration) {
      statsUpdates.heroicInspiration = true;
    }
    
    // Apply exhaustion reduction (based on location for long rest)
    if (effects.reduceExhaustion && effects.reduceExhaustion > 0) {
      const currentExhaustionLevel = currentStats.exhaustion?.currentLevel || 0;
      const newExhaustionLevel = Math.max(0, currentExhaustionLevel - effects.reduceExhaustion);
      statsUpdates.exhaustion = {
        ...currentStats.exhaustion,
        currentLevel: newExhaustionLevel,
      };
    }
    
    // Check if "Patch Wounds" was selected
    const patchWoundsSelected = selectedOptionIds.some(id => 
      id === 'short-standard-patch-wounds' || id === 'long-standard-patch-wounds'
    );
    
    // Apply injury healing using the new HP system
    if (effects.healInjuryLevels && effects.healInjuryLevels > 0 && patchWoundsSelected) {
      const conditions = { ...currentStats.conditions };
      const injuryData = { ...(currentStats.injuryData || {}) };
      const healAmount = effects.healInjuryLevels; // 1 for short rest, 2 for long rest
      
      // If a specific injury was selected from the prompt, heal that one
      // Otherwise, use priority order: Critical -> Serious -> Minor
      let injuryToHeal: 'criticalInjury' | 'seriousInjury' | 'minorInjury' | null = null;
      
      if (effects.selectedInjuryToHeal && conditions[effects.selectedInjuryToHeal] && injuryData[effects.selectedInjuryToHeal]) {
        injuryToHeal = effects.selectedInjuryToHeal;
      } else {
        // Find the first active injury with priority order
        const injuryPriority: ('criticalInjury' | 'seriousInjury' | 'minorInjury')[] = ['criticalInjury', 'seriousInjury', 'minorInjury'];
        for (const injuryType of injuryPriority) {
          if (conditions[injuryType] && injuryData[injuryType]) {
            injuryToHeal = injuryType;
            break;
          }
        }
      }
      
      if (injuryToHeal) {
        const currentHP = injuryData[injuryToHeal]?.injuryHP || INJURY_HP_VALUES[injuryToHeal];
        const newHP = Math.max(0, currentHP - healAmount);
        
        if (newHP <= 0) {
          // Injury is fully healed - remove the condition
          const healedInjuryLocation = injuryData[injuryToHeal]?.injuryLocation || 'Unknown';
          conditions[injuryToHeal] = false;
          delete injuryData[injuryToHeal];
          
          // Trigger scar prompt for serious/critical injuries
          if (injuryToHeal === 'seriousInjury' || injuryToHeal === 'criticalInjury') {
            setScarPrompt({
              isOpen: true,
              injuryType: injuryToHeal === 'seriousInjury' ? 'serious' : 'critical',
              injuryLocation: healedInjuryLocation || 'Unknown',
            });
          }
        } else {
          // Update injury HP and reset days since rest (injury was treated)
          injuryData[injuryToHeal] = {
            ...injuryData[injuryToHeal],
            injuryHP: newHP,
            injuryDaysSinceRest: 0,
          };
        }
      }
      
      statsUpdates.conditions = conditions;
      statsUpdates.injuryData = Object.keys(injuryData).length > 0 ? injuryData : undefined;
    }
    
    // For long rests, track days without treatment for injuries not patched
    // and auto-add infection if 3 long rests pass without treatment
    if (restType === 'long') {
      const conditions = statsUpdates.conditions ? { ...statsUpdates.conditions } : { ...currentStats.conditions };
      const injuryData = statsUpdates.injuryData ? { ...statsUpdates.injuryData } : { ...(currentStats.injuryData || {}) };
      
      const injuryTypes: ('minorInjury' | 'seriousInjury' | 'criticalInjury')[] = ['minorInjury', 'seriousInjury', 'criticalInjury'];
      
      for (const injuryType of injuryTypes) {
        if (conditions[injuryType] && injuryData[injuryType]) {
          // Only increment if this injury wasn't treated this rest
          const wasJustTreated = patchWoundsSelected && effects.healInjuryLevels && effects.healInjuryLevels > 0;
          if (!wasJustTreated) {
            const currentDays = injuryData[injuryType]?.injuryDaysSinceRest || 0;
            const newDays = currentDays + 1;
            
            injuryData[injuryType] = {
              ...injuryData[injuryType],
              injuryDaysSinceRest: newDays,
            };
            
            // Auto-add Infection if 3 long rests (days) pass without treatment
            // Note: Each long rest counts as 1 day without treatment
            if (newDays >= 3 && !conditions.infection) {
              conditions.infection = true;
              injuryData.infection = {
                infectionDeathSavesFailed: 0,
              };
            }
          }
        }
      }
      
      statsUpdates.conditions = conditions;
      statsUpdates.injuryData = Object.keys(injuryData).length > 0 ? injuryData : undefined;
    }
    
    // Handle hit dice recovery on long rest
    if (restType === 'long' && effects.hitDiceRecovered && effects.hitDiceRecovered > 0) {
      const currentHitDice = currentStats.hitDice || createDefaultHitDice(currentStats.level, currentStats.characterClass);
      const newHitDiceCurrent = Math.min(currentHitDice.max, currentHitDice.current + effects.hitDiceRecovered);
      statsUpdates.hitDice = {
        ...currentHitDice,
        current: newHitDiceCurrent,
      };
    }
    
    // Handle superiority dice recovery on any rest
    if (effects.recoverSuperiorityDice && currentStats.superiorityDice) {
      statsUpdates.superiorityDice = {
        ...currentStats.superiorityDice,
        current: currentStats.superiorityDice.max,
      };
    }
    
    // Update rest history with location tracking for long rests
    if (restType === 'short') {
      statsUpdates.restHistory = {
        ...currentStats.restHistory,
        lastShortRest: {
          timestamp: now,
          chosenOptionIds: selectedOptionIds,
          selectedBenefits: selectedOptionIds, // Track selected benefits for preventing same choice twice
          calendarDate: calendarConfig ? {
            year: calendarConfig.currentDate.year,
            monthIndex: calendarConfig.currentDate.monthIndex,
            day: calendarConfig.currentDate.day,
            hour: calendarConfig.currentDate.hour,
            minute: calendarConfig.currentDate.minute,
          } : undefined,
        }
      };
    } else {
      // Long rest - track wilderness streaks
      let newConsecutiveWildernessRests = currentStats.restHistory?.consecutiveWildernessRests || 0;
      let newWildernessExhaustionBlocked = currentStats.restHistory?.wildernessExhaustionBlocked || false;
      
      if (effects.restLocation === 'wilderness') {
        // Increment wilderness counter
        newConsecutiveWildernessRests++;
        
        // Handle wilderness exhaustion mechanics based on consecutive count
        if (newConsecutiveWildernessRests === 7) {
          // Exactly 7 consecutive: Auto-add 1 exhaustion (no prompt)
          const currentExhaustionLevel = statsUpdates.exhaustion?.currentLevel ?? (currentStats.exhaustion?.currentLevel || 0);
          const maxLevels = currentStats.exhaustion?.maxLevels || 10;
          statsUpdates.exhaustion = {
            ...currentStats.exhaustion,
            ...statsUpdates.exhaustion,
            currentLevel: Math.min(maxLevels, currentExhaustionLevel + 1),
          };
          // Block exhaustion reduction until settlement rest
          newWildernessExhaustionBlocked = true;
        } else if (newConsecutiveWildernessRests >= 8 && effects.wildernessD4Roll) {
          // 8+ consecutive: Check d4 roll result (odd = +1 exhaustion, even = no exhaustion)
          const isOdd = effects.wildernessD4Roll % 2 === 1;
          if (isOdd) {
            const currentExhaustionLevel = statsUpdates.exhaustion?.currentLevel ?? (currentStats.exhaustion?.currentLevel || 0);
            const maxLevels = currentStats.exhaustion?.maxLevels || 10;
            statsUpdates.exhaustion = {
              ...currentStats.exhaustion,
              ...statsUpdates.exhaustion,
              currentLevel: Math.min(maxLevels, currentExhaustionLevel + 1),
            };
          }
          // Keep exhaustion reduction blocked
          newWildernessExhaustionBlocked = true;
        }
      } else if (effects.restLocation === 'settlement') {
        // Settlement rest resets the wilderness counter and unblocks exhaustion
        newConsecutiveWildernessRests = 0;
        newWildernessExhaustionBlocked = false;
      }
      
      statsUpdates.restHistory = {
        ...currentStats.restHistory,
        lastLongRest: {
          timestamp: now,
          chosenOptionIds: selectedOptionIds,
          location: effects.restLocation,
          roomType: effects.roomType,
          selectedBenefits: selectedOptionIds, // Track selected benefits for preventing same choice twice
          calendarDate: calendarConfig ? {
            year: calendarConfig.currentDate.year,
            monthIndex: calendarConfig.currentDate.monthIndex,
            day: calendarConfig.currentDate.day,
            hour: calendarConfig.currentDate.hour,
            minute: calendarConfig.currentDate.minute,
          } : undefined,
        },
        heroicInspirationGainedToday: effects.heroicInspiration || false,
        consecutiveWildernessRests: newConsecutiveWildernessRests,
        wildernessExhaustionBlocked: newWildernessExhaustionBlocked,
      };
    }
    
    // Apply character stats updates
    updateCharacterStats(statsUpdates);
    
    // Apply temp HP if granted by effect (update character sheet)
    if (effects.tempHp && effects.tempHp > 0) {
      const newTempHp = Math.max(sheet.hitPoints.temp, effects.tempHp);
      updateData({
        characterSheet: {
          ...sheet,
          hitPoints: {
            ...sheet.hitPoints,
            temp: newTempHp,
          },
        },
      });
    }
    
    // Deduct rations from inventory if required
    if (effects.rationsToDeduct && effects.rationsToDeduct > 0) {
      const updatedInventory = deductRationsFromInventory(characterData.inventory, effects.rationsToDeduct);
      updateData({ inventory: updatedInventory });
    }
    
    // Deduct GP for settlement room
    if (effects.gpCost && effects.gpCost > 0) {
      const updatedCurrency = { ...characterData.currency };
      const gpInCopper = effects.gpCost * 100;
      deductCopperPieces(updatedCurrency, gpInCopper);
      updateData({ currency: updatedCurrency });
    }
    
    // Handle project work
    if (effects.newProject) {
      // Create a new project and add initial work
      const existingProjects = characterData.projects || [];
      const newProject: Project = {
        ...effects.newProject,
        createdDate: calendarConfig ? {
          year: calendarConfig.currentDate.year,
          monthIndex: calendarConfig.currentDate.monthIndex,
          day: calendarConfig.currentDate.day,
        } : undefined,
      };
      
      // Check if project is completed immediately
      if (newProject.completedWorkUnits >= newProject.totalWorkUnits) {
        newProject.isCompleted = true;
        newProject.completedDate = calendarConfig ? {
          year: calendarConfig.currentDate.year,
          monthIndex: calendarConfig.currentDate.monthIndex,
          day: calendarConfig.currentDate.day,
        } : undefined;
        
        // Add to completed projects
        const completedProjects = characterData.completedProjects || [];
        updateData({
          completedProjects: [...completedProjects, newProject],
        });
      } else {
        updateData({
          projects: [...existingProjects, newProject],
        });
      }
    } else if (effects.projectToWorkOn && effects.workUnitsToAdd) {
      // Work on existing project
      const existingProjects = characterData.projects || [];
      const projectIndex = existingProjects.findIndex(p => p.id === effects.projectToWorkOn);
      
      if (projectIndex !== -1) {
        const project = existingProjects[projectIndex];
        const newCompletedUnits = project.completedWorkUnits + effects.workUnitsToAdd;
        
        if (newCompletedUnits >= project.totalWorkUnits) {
          // Project is completed
          const completedProject: Project = {
            ...project,
            completedWorkUnits: project.totalWorkUnits,
            isCompleted: true,
            completedDate: calendarConfig ? {
              year: calendarConfig.currentDate.year,
              monthIndex: calendarConfig.currentDate.monthIndex,
              day: calendarConfig.currentDate.day,
            } : undefined,
          };
          
          // Remove from active projects and add to completed
          const updatedProjects = existingProjects.filter((_, i) => i !== projectIndex);
          const completedProjects = characterData.completedProjects || [];
          
          updateData({
            projects: updatedProjects,
            completedProjects: [...completedProjects, completedProject],
          });
        } else {
          // Update project progress
          const updatedProject: Project = {
            ...project,
            completedWorkUnits: newCompletedUnits,
          };
          
          const updatedProjects = [...existingProjects];
          updatedProjects[projectIndex] = updatedProject;
          
          updateData({
            projects: updatedProjects,
          });
        }
      }
    }
  };
  
  // Handle spending a hit die
  const handleSpendHitDie = (hpRecovered: number) => {
    if (!canUserEdit) return;
    const currentStats = characterStats || defaultStats;
    const sheet = characterData.characterSheet || createDefaultCharacterSheet();
    
    // Get or create hit dice
    const currentHitDice = currentStats.hitDice || createDefaultHitDice(currentStats.level, currentStats.characterClass);
    
    if (currentHitDice.current <= 0) return;
    
    // Spend one hit die
    updateCharacterStats({
      hitDice: {
        ...currentHitDice,
        current: currentHitDice.current - 1,
      },
    });
    
    // Heal HP
    const newCurrentHp = Math.min(sheet.hitPoints.max, sheet.hitPoints.current + hpRecovered);
    updateData({
      characterSheet: {
        ...sheet,
        hitPoints: {
          ...sheet.hitPoints,
          current: newCurrentHp,
        },
      },
    });
  };
  
  // Update death saves
  const updateDeathSaves = (updates: Partial<DeathSaves>) => {
    if (!canUserEdit) return;
    const currentStats = characterStats || defaultStats;
    updateCharacterStats({
      deathSaves: {
        ...(currentStats.deathSaves || createDefaultDeathSaves()),
        ...updates,
      }
    });
  };
  
  // Update superiority dice
  const updateSuperiorityDice = (updates: Partial<SuperiorityDice>) => {
    if (!canUserEdit) return;
    const currentStats = characterStats || defaultStats;
    const currentSuperiorityDice = currentStats.superiorityDice || createDefaultSuperiorityDice();
    updateCharacterStats({
      superiorityDice: {
        ...currentSuperiorityDice,
        ...updates,
      }
    });
  };
  
  // Apply an injury from the automatic injury prompt
  // This is a wrapper around updateCondition specifically for injury application
  const applyInjury = (injuryType: ConditionType, location?: InjuryLocation) => {
    // For minor injuries, no location is needed
    if (injuryType === 'minorInjury') {
      updateCondition('minorInjury', true);
    } else {
      // For serious and critical injuries, location is required
      updateCondition(injuryType, true, location);
    }
  };
  
  // Helper to check if trade button should be shown
  const showTradeButton = !activeTrade && tokenId && 
    (characterData.claimedBy || characterData.tokenType === 'party' || characterData.tokenType === 'merchant') && 
    onOpenTradePartnerModal;

  return (
    <div className="section" style={{flex: 1, display: 'flex', flexDirection: 'column', width: '100%', padding: '8px 6px'}}>
      {/* Only show header when viewing storage */}
      {viewingStorageId && (
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px'}}>
          <h2 style={{margin: 0, marginBottom: '4px'}}>Storage Stats</h2>
          {/* Action buttons are now shown only for storage view or handled in the TwoColumnDashboard */}
          {canEditToken() && (
            <div style={{display: 'flex', gap: '4px', alignItems: 'center'}}>
              <button
                onClick={() => { setShowSettings(true); loadDebugInfo(); }}
                style={{
                  background: 'transparent',
                  color: '#666',
                  border: '1px solid #333',
                  padding: '2px 6px',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '9px',
                  fontWeight: 'normal'
                }}
                title="Settings"
              >
                ⚙
              </button>
            </div>
          )}
        </div>
      )}

      {/* --- TOKEN PROFILE WITH COVER PHOTO --- */}
      {/* Only show for lore tokens - non-lore tokens use TwoColumnDashboard which has its own cover photo */}
      {!viewingStorageId && characterData.tokenType === 'lore' && (
        <LoreHome
          viewingStorageId={viewingStorageId}
          showTokenProfile={showTokenProfile}
          showCoverPhoto={showCoverPhoto}
          characterData={characterData}
          tokenImage={tokenImage}
          tokenName={tokenName}
          playerRole={playerRole}
          canEditToken={canEditToken}
          updateData={updateData}
        />
      )}

      {/* === TWO COLUMN DASHBOARD - Main layout with stats, token, and status boxes === */}
      {(() => {
        // Show for player tokens, party tokens, or NPC tokens when user is GM
        // Do not show for monster tokens or merchant tokens (they have their own simplified UI)
        const showCharacterSheet = characterData.tokenType !== 'lore' && 
          characterData.tokenType !== 'monster' &&
          characterData.tokenType !== 'merchant' &&
          (characterData.tokenType !== 'npc' || playerRole === 'GM');
        const shouldShowBanner = !viewingStorageId && showCharacterSheet;
        
        if (!shouldShowBanner) return null;
        
        const sheet = characterData.characterSheet || createDefaultCharacterSheet();
        
        const handleUpdateSheet = (updates: Partial<CharacterSheet>) => {
          updateData({
            characterSheet: {
              ...sheet,
              ...updates,
            },
          });
        };

        // Handler for pinned skill click - scrolls to skills section
        const handlePinnedSkillClick = () => {
          // Placeholder: In the future this could scroll to the skill in the skills section
          // For now it just provides visual feedback
        };
        
        return (
          <TwoColumnDashboard
            sheet={sheet}
            characterStats={characterStats}
            tokenImage={tokenImage}
            tokenName={tokenName}
            characterData={characterData}
            stats={stats}
            canEdit={canUserEdit}
            onUpdateSheet={handleUpdateSheet}
            onUpdateCharacterStats={updateCharacterStats}
            onToggleHeroicInspiration={toggleHeroicInspiration}
            onOpenTradePartnerModal={onOpenTradePartnerModal}
            onOpenRestModal={handleOpenRestModal}
            onUpdateDeathSaves={updateDeathSaves}
            onApplyInjury={applyInjury}
            showTradeButton={!!showTradeButton}
            toggleFavorite={toggleFavorite}
            isFavorited={isFavorited}
            favorites={favorites}
            setViewingFavorites={setViewingFavorites}
            setShowSettings={setShowSettings}
            loadDebugInfo={loadDebugInfo}
            canEditToken={canEditToken}
            hasClaimedToken={hasClaimedToken}
            gmCustomizations={gmCustomizations}
            packDefinitions={PACK_DEFINITIONS}
            onPackTypeChange={(packType) => updateData({ packType })}
            inventoryCount={currentDisplayData.inventory.length}
            onPinnedSkillClick={handlePinnedSkillClick}
            onUpdateSuperiorityDice={updateSuperiorityDice}
          />
        );
      })()}

      {/* === CONDITIONS & EXHAUSTION - Purple Collapsible section === */}
      {!viewingStorageId && characterData.tokenType !== 'lore' && characterData.tokenType !== 'monster' && (characterData.tokenType !== 'npc' || playerRole === 'GM') && (
        <CollapsibleDashboardSection title="Conditions & Exhaustion" defaultExpanded={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Full Conditions Panel */}
            <ConditionsPanel
              conditions={characterStats?.conditions || createDefaultConditions()}
              onConditionChange={updateCondition}
              canEdit={canUserEdit}
              injuryData={characterStats?.injuryData}
              onInjuryDataChange={updateInjuryData}
            />
            
            {/* Exhaustion Meter */}
            <ExhaustionMeter
              exhaustion={characterStats?.exhaustion || createDefaultExhaustionState()}
              onExhaustionChange={updateExhaustionLevel}
              canEdit={canUserEdit}
              customEffects={gmCustomizations?.exhaustionEffects}
            />
          </div>
        </CollapsibleDashboardSection>
      )}

      {/* === SKILLS & PROFICIENCIES - Purple Collapsible section - Just beneath Conditions and Exhaustion === */}
      {!viewingStorageId && 
       characterData.tokenType !== 'lore' &&
       characterData.tokenType !== 'monster' &&
       (characterData.tokenType !== 'npc' || playerRole === 'GM') && (
        <CollapsibleDashboardSection title="Skills & Proficiencies" defaultExpanded={false}>
          <CharacterSheetSection
            characterData={characterData}
            canEdit={canUserEdit}
            updateData={updateData}
          />
        </CollapsibleDashboardSection>
      )}

      {/* === FEATURES & TRAITS - Purple Collapsible section - Beneath Skills & Proficiencies === */}
      {!viewingStorageId && 
       characterData.tokenType !== 'lore' &&
       characterData.tokenType !== 'monster' &&
       (characterData.tokenType !== 'npc' || playerRole === 'GM') && (
        <CollapsibleDashboardSection title="Features & Traits" defaultExpanded={false}>
          {(() => {
            const sheet = characterData.characterSheet || createDefaultCharacterSheet();
            const handleUpdateSheet = (updates: Partial<CharacterSheet>) => {
              updateData({
                characterSheet: {
                  ...sheet,
                  ...updates,
                },
              });
            };
            
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <DebouncedTextarea
                  value={sheet.featuresAndTraits || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ featuresAndTraits: val })}
                  className="search-input"
                  rows={6}
                  disabled={!canUserEdit}
                  placeholder="Enter character features, traits, and special abilities..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    opacity: 1,
                    cursor: canUserEdit ? 'text' : 'default',
                    fontSize: '13px',
                    lineHeight: '1.5'
                  }}
                />
                {canUserEdit && (
                  <span style={{fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic'}}>
                    Supports: **bold**, *italic*, __underline__, ~~strikethrough~~, [links](url)
                  </span>
                )}
              </div>
            );
          })()}
        </CollapsibleDashboardSection>
      )}

      {/* Rest Modal */}
      <RestModal
        isOpen={showRestModal}
        onClose={() => {
          setShowRestModal(false);
          setInitialRestType(null);
        }}
        race={characterStats?.race}
        characterClass={characterStats?.characterClass}
        secondaryRace={characterStats?.secondaryRace}
        secondaryClass={characterStats?.secondaryClass}
        level={characterStats?.level || 1}
        restHistory={characterStats?.restHistory || createDefaultRestHistory()}
        onRest={handleRest}
        gmRestRulesMessage={gmCustomizations?.restRulesMessage}
        customRestOptions={gmCustomizations?.customRestOptions}
        disabledRestOptionIds={gmCustomizations?.disabledRestOptions}
        inventory={characterData.inventory}
        tokenId={tokenId || 'default'}
        hitDice={characterStats?.hitDice || createDefaultHitDice(characterStats?.level || 1, characterStats?.characterClass || 'Fighter')}
        superiorityDice={characterStats?.superiorityDice}
        currency={characterData.currency}
        onSpendHitDie={handleSpendHitDie}
        activeInjuries={{
          minorInjury: characterStats?.conditions?.minorInjury ? characterStats.injuryData?.minorInjury : undefined,
          seriousInjury: characterStats?.conditions?.seriousInjury ? characterStats.injuryData?.seriousInjury : undefined,
          criticalInjury: characterStats?.conditions?.criticalInjury ? characterStats.injuryData?.criticalInjury : undefined,
        }}
        projects={characterData.projects || []}
        calendarConfig={calendarConfig}
        initialRestType={initialRestType}
      />

      {/* Scar Prompt Modal - shown when a serious/critical injury fully heals */}
      {scarPrompt && scarPrompt.isOpen && (
        <ScarPromptModal
          isOpen={scarPrompt.isOpen}
          onClose={() => setScarPrompt(null)}
          injuryType={scarPrompt.injuryType}
          defaultLocation={scarPrompt.injuryLocation}
          onSave={(scar) => {
            const existingScars = characterData.scars || [];
            updateData({
              scars: [...existingScars, scar],
            });
            setScarPrompt(null);
          }}
        />
      )}

      {/* Scar Edit Modal - shown when editing an existing scar */}
      {scarEditModal && scarEditModal.isOpen && (
        <ScarEditModal
          isOpen={scarEditModal.isOpen}
          onClose={() => setScarEditModal(null)}
          scar={scarEditModal.scar}
          onSave={(scarId, updates) => {
            handleUpdateScar(scarId, updates);
            setScarEditModal(null);
          }}
          calendarConfig={calendarConfig}
        />
      )}

      {/* === MONSTER TOKEN SPECIFIC UI === */}
      {!viewingStorageId && characterData.tokenType === 'monster' && playerRole === 'GM' && (
        <MonsterHome
          characterData={characterData}
          tokenImage={tokenImage}
          tokenName={tokenName}
          updateData={updateData}
          setShowSettings={setShowSettings}
          loadDebugInfo={loadDebugInfo}
          toggleFavorite={toggleFavorite}
          isFavorited={isFavorited}
          favorites={favorites}
          hasClaimedToken={hasClaimedToken}
          setViewingFavorites={setViewingFavorites}
        />
      )}

      {/* === MERCHANT TOKEN SPECIFIC UI === */}
      {!viewingStorageId && characterData.tokenType === 'merchant' && (
        <MerchantHome
          characterData={characterData}
          tokenImage={tokenImage}
          tokenName={tokenName}
          playerRole={playerRole}
          updateData={updateData}
          showTradeButton={!!showTradeButton}
          onOpenTradePartnerModal={onOpenTradePartnerModal}
          isFavorited={isFavorited}
          toggleFavorite={toggleFavorite}
          setShowSettings={setShowSettings}
          loadDebugInfo={loadDebugInfo}
        />
      )}


      {/* === STANDARD TOKEN UI (non-lore, non-monster tokens) === */}
      {characterData.tokenType !== 'lore' && characterData.tokenType !== 'monster' && characterData.tokenType !== 'merchant' && (
        <>
          {viewingStorageId && (
        <div style={{marginBottom: '12px'}}>
          <div style={{color: '#888', fontSize: '12px'}}>Type: {characterData.externalStorages.find(s => s.id === viewingStorageId)?.type}</div>
          <div style={{marginTop:'8px'}}>
            <label style={{display:'flex', alignItems:'center', gap:'8px', fontSize:'12px'}}>
              <input type="checkbox" checked={characterData.externalStorages.find(s => s.id === viewingStorageId)?.isNearby} onChange={(e) => {
                const newStorages = characterData.externalStorages.map(s => s.id === viewingStorageId ? {...s, isNearby: e.target.checked} : s);
                updateData({ externalStorages: newStorages });
              }} /> Is Nearby?
            </label>
          </div>
        </div>
      )}

      {/* Show stats - only when viewing storage */}
      {viewingStorageId && (
        <>
          <div className="totals-grid">
            <div className="stat-box"><div className="stat-label">TOTAL WEIGHT</div><div className={`stat-value ${stats.totalWeight > (activeStorageDef?.capacity || stats.maxCapacity) ? 'danger' : ''}`}>{stats.totalWeight} <span style={{fontSize:'10px', color:'#666'}}>/ {activeStorageDef ? activeStorageDef.capacity : stats.maxCapacity}</span></div></div>
            <div className="stat-box"><div className="stat-label">COIN WEIGHT</div><div className={`stat-value ${stats.coinWeight > 0 ? 'danger' : ''}`}>{stats.coinWeight}u</div></div>
            <div className="stat-box"><div className="stat-label">ITEMS</div><div className="stat-value">{currentDisplayData.inventory.length}</div></div>
          </div>
        </>
      )}

      {/* Pack Slots - collapsible section for main view */}
      {!viewingStorageId && canUserEdit && (
            <CollapsibleDashboardSection title="Pack Slots" defaultExpanded={false}>
              <div className="totals-grid">
                <div className="stat-box" style={{borderColor: stats.usedSlots.weapon > stats.maxSlots.weapon ? 'var(--danger)' : 'transparent', borderStyle:'solid', borderWidth:'1px'}}>
                  <div className="stat-label">WEAPONS</div>
                  <div className={`stat-value ${stats.usedSlots.weapon > stats.maxSlots.weapon ? 'danger' : ''}`}>{stats.usedSlots.weapon} <span style={{fontSize:'10px', color:'#666'}}>/ {stats.maxSlots.weapon}</span></div>
                </div>
                <div className="stat-box" style={{borderColor: stats.usedSlots.armor > stats.maxSlots.armor ? 'var(--danger)' : 'transparent', borderStyle:'solid', borderWidth:'1px'}}>
                  <div className="stat-label">ARMOR</div>
                  <div className={`stat-value ${stats.usedSlots.armor > stats.maxSlots.armor ? 'danger' : ''}`}>{stats.usedSlots.armor} <span style={{fontSize:'10px', color:'#666'}}>/ {stats.maxSlots.armor}</span></div>
                </div>
                <div className="stat-box"><div className="stat-label">CLOTHING</div><div className="stat-value">{stats.usedSlots.clothing} <span style={{fontSize:'10px', color:'#666'}}>/ {stats.maxSlots.clothing}</span></div></div>
                <div className="stat-box"><div className="stat-label">JEWELRY</div><div className="stat-value">{stats.usedSlots.jewelry} <span style={{fontSize:'10px', color:'#666'}}>/ {stats.maxSlots.jewelry}</span></div></div>
                <div className="stat-box" style={{gridColumn: 'span 2', background: 'rgba(240, 225, 48, 0.05)'}}><div className="stat-label" style={{color: 'var(--accent-gold)'}}>UTILITY / QUICK</div><div className="stat-value">{stats.usedSlots.utility} <span style={{fontSize:'10px', color:'#666'}}>/ {stats.maxSlots.utility}</span></div></div>
              </div>
            </CollapsibleDashboardSection>
      )}

      {/* Show description - editable only if GM, owner, or party token */}
      <CollapsibleDashboardSection title="Biography & Description" defaultExpanded={false}>
        {(() => {
          const sheet = characterData.characterSheet || createDefaultCharacterSheet();
          const handleUpdateSheet = (updates: Partial<CharacterSheet>) => {
            updateData({
              characterSheet: {
                ...sheet,
                ...updates,
              },
            });
          };
          
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* Gender Field */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Gender
                </label>
                <DebouncedInput
                  value={sheet.gender || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ gender: val })}
                  className="search-input"
                  disabled={!canUserEdit}
                  placeholder="Enter gender..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '12px',
                    padding: '6px 8px',
                  }}
                />
              </div>
              
              {/* Alignment Field */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Alignment
                </label>
                <DebouncedInput
                  value={sheet.alignment || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ alignment: val })}
                  className="search-input"
                  disabled={!canUserEdit}
                  placeholder="e.g., Lawful Good, Chaotic Neutral..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '12px',
                    padding: '6px 8px',
                  }}
                />
              </div>
              
              {/* Birthplace Field */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Birthplace
                </label>
                <DebouncedInput
                  value={sheet.birthplace || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ birthplace: val })}
                  className="search-input"
                  disabled={!canUserEdit}
                  placeholder="Enter birthplace..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '12px',
                    padding: '6px 8px',
                  }}
                />
              </div>
              
              {/* Scars Field */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Scars
                </label>
                <DebouncedInput
                  value={sheet.scars || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ scars: val })}
                  className="search-input"
                  disabled={!canUserEdit}
                  placeholder="Describe any scars..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '12px',
                    padding: '6px 8px',
                  }}
                />
              </div>
              
              {/* Scars from Healed Injuries - Display scars from the scar system */}
              {characterData.scars && characterData.scars.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '10px', color: '#ff9800', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>
                    🩸 Scars from Healed Injuries
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Sort by injury type - critical first, then serious */}
                    {[...characterData.scars]
                      .sort((a, b) => a.injuryType === 'critical' && b.injuryType !== 'critical' ? -1 : b.injuryType === 'critical' && a.injuryType !== 'critical' ? 1 : 0)
                      .map((scar) => (
                        <div
                          key={scar.id}
                          style={{
                            padding: '10px',
                            background: scar.injuryType === 'critical' ? 'rgba(229, 57, 53, 0.1)' : 'rgba(255, 152, 0, 0.1)',
                            border: `1px solid ${scar.injuryType === 'critical' ? 'rgba(229, 57, 53, 0.3)' : 'rgba(255, 152, 0, 0.3)'}`,
                            borderRadius: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ 
                                fontSize: '12px', 
                                fontWeight: 'bold',
                                color: scar.injuryType === 'critical' ? '#e53935' : '#ff9800',
                                textTransform: 'capitalize',
                              }}>
                                {scar.injuryType === 'critical' ? '💀' : '🩸'} {scar.size} scar on {scar.location}
                              </span>
                              {scar.acquiredDate && (
                                <div style={{ fontSize: '9px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                  {calendarConfig ? formatCustomDate(calendarConfig, scar.acquiredDate) : `Day ${scar.acquiredDate.day}, M${scar.acquiredDate.monthIndex + 1}, Y${scar.acquiredDate.year}`}
                                </div>
                              )}
                            </div>
                            {canUserEdit && (
                              <div style={{ display: 'flex', gap: '4px', marginLeft: '8px' }}>
                                <button
                                  onClick={() => setScarEditModal({ isOpen: true, scar })}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    background: 'rgba(77, 171, 247, 0.2)',
                                    border: '1px solid rgba(77, 171, 247, 0.4)',
                                    borderRadius: '4px',
                                    color: '#4dabf7',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                  }}
                                  title="Edit scar"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to delete this scar?')) {
                                      handleDeleteScar(scar.id);
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    fontSize: '10px',
                                    background: 'rgba(255, 107, 107, 0.2)',
                                    border: '1px solid rgba(255, 107, 107, 0.4)',
                                    borderRadius: '4px',
                                    color: '#ff6b6b',
                                    cursor: 'pointer',
                                    fontWeight: 'bold',
                                  }}
                                  title="Delete scar"
                                >
                                  🗑️
                                </button>
                              </div>
                            )}
                          </div>
                          {scar.source && (
                            <div style={{ fontSize: '11px', color: 'var(--text-main)', fontStyle: 'italic' }}>
                              Caused by: {scar.source}
                            </div>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
              
              {/* Values Field */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Values
                </label>
                <DebouncedInput
                  value={sheet.values || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ values: val })}
                  className="search-input"
                  disabled={!canUserEdit}
                  placeholder="Character values and beliefs..."
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    fontSize: '12px',
                    padding: '6px 8px',
                  }}
                />
              </div>
              
              {/* Description / Backstory */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Description / Backstory
                </label>
                <DebouncedTextarea
                  value={currentDisplayData.condition}
                  onChange={(val) => canUserEdit && handleUpdateData({ condition: val })}
                  className="search-input"
                  rows={2}
                  disabled={!canUserEdit}
                  placeholder="Character description..."
                  style={{
                    width: '100%',
                    minHeight: '50px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    opacity: 1,
                    cursor: canUserEdit ? 'text' : 'default',
                    fontSize: '13px'
                  }}
                />
              </div>
              
              {/* Major Life Moments */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Major Life Moments
                </label>
                <DebouncedTextarea
                  value={sheet.majorLifeMoments || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ majorLifeMoments: val })}
                  className="search-input"
                  rows={3}
                  disabled={!canUserEdit}
                  placeholder="Significant events in the character's life..."
                  style={{
                    width: '100%',
                    minHeight: '70px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    opacity: 1,
                    cursor: canUserEdit ? 'text' : 'default',
                    fontSize: '13px'
                  }}
                />
              </div>
              
              {/* Known Languages */}
              <div>
                <label style={{ display: 'block', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Known Languages
                </label>
                <DebouncedTextarea
                  value={sheet.languages || ''}
                  onChange={(val) => canUserEdit && handleUpdateSheet({ languages: val })}
                  className="search-input"
                  rows={2}
                  disabled={!canUserEdit}
                  placeholder="e.g., Common, Elvish, Dwarvish..."
                  style={{
                    width: '100%',
                    minHeight: '50px',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    opacity: 1,
                    cursor: canUserEdit ? 'text' : 'default',
                    fontSize: '13px'
                  }}
                />
              </div>
              
              {/* Completed Projects - Display projects completed through the project system */}
              {characterData.completedProjects && characterData.completedProjects.length > 0 && (
                <div style={{ marginTop: '12px' }}>
                  <label style={{ display: 'block', fontSize: '10px', color: '#51cf66', textTransform: 'uppercase', marginBottom: '8px', fontWeight: 'bold' }}>
                    📋 Completed Projects
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {characterData.completedProjects.map((project) => (
                      <div
                        key={project.id}
                        style={{
                          padding: '10px',
                          background: 'rgba(81, 207, 102, 0.1)',
                          border: '1px solid rgba(81, 207, 102, 0.3)',
                          borderRadius: '6px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
                          <span style={{ 
                            fontSize: '12px', 
                            fontWeight: 'bold',
                            color: '#51cf66',
                          }}>
                            ✓ {project.name}
                          </span>
                          {project.completedDate && project.completedDate.year > 0 && (
                            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                              Completed: Day {project.completedDate.day}, M{project.completedDate.monthIndex + 1}, Y{project.completedDate.year}
                            </span>
                          )}
                        </div>
                        {project.description && (
                          <div style={{ fontSize: '11px', color: 'var(--text-main)' }}>
                            {project.description}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {canUserEdit && <MarkdownHint />}
            </div>
          );
        })()}
      </CollapsibleDashboardSection>

      {/* Storage Notes - only show when viewing storage and can edit */}
      {viewingStorageId && canEditToken() && (
        <div style={{marginTop: '8px', width: '100%', alignSelf: 'stretch'}}>
          <label style={{display:'block', fontSize:'10px', color:'var(--text-muted)', textTransform:'uppercase'}}>Notes</label>
          <DebouncedTextarea value={characterData.externalStorages.find(s => s.id === viewingStorageId)?.notes || ''} onChange={(val) => {
            const newStorages = characterData.externalStorages.map(s => s.id === viewingStorageId ? {...s, notes: val} : s);
            updateData({ externalStorages: newStorages });
          }} className="search-input" rows={3} />
          <MarkdownHint />
        </div>
      )}
        </>
      )}

      {/* Reputation Display - show for NPC tokens with reputation data */}
      {!viewingStorageId &&
       characterData?.packType === 'NPC' &&
       characterData?.reputation &&
       (characterData.reputation.showPartyAverage || characterData.reputation.entries.some(e => e.visibleToPlayer)) && (
        <ReputationDisplay reputation={characterData.reputation} />
      )}

      {/* Token Claiming - at the bottom of the dashboard */}
      {!viewingStorageId && characterData && (
        <div style={{marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center'}}>
          
          {/* NPC Token - GM controlled */}
          {characterData.tokenType === 'npc' && (
            <NPCHome playerRole={playerRole} />
          )}

          {/* Party Token - Shared access */}
          {characterData.tokenType === 'party' && (
            <PartyHome />
          )}

          {/* Monster Token - GM controlled */}
          {characterData.tokenType === 'monster' && (
            <div style={{fontSize: '10px', color: '#e53935', fontStyle: 'italic'}}>
              🐉 Monster Token {playerRole === 'GM' ? '(You control this)' : '(GM controlled)'}
            </div>
          )}

          {/* Standard player token claiming - only show for player-type tokens */}
          {(characterData.tokenType === 'player' || !characterData.tokenType) && (
            <>
              {characterData.claimedBy && (
                <div style={{fontSize: '10px', color: '#aaa'}}>
                  {characterData.claimedBy === playerId ? 'You claimed this token' : 'Claimed by another player'}
                </div>
              )}
              {!characterData.claimedBy && (
                <>
                  {/* Show claiming status */}
                  {!characterData.claimingEnabled && playerRole !== 'GM' && (
                    <div style={{fontSize: '10px', color: '#888', fontStyle: 'italic'}}>
                      🔒 Claiming disabled (GM must enable)
                    </div>
                  )}
                  {/* Claim button */}
                  {canEditToken() && (
                    <button
                      onClick={async () => {
                        const success = await claimToken();
                        if (success === false) {
                          alert('Claiming is not enabled for this token. Ask the GM to enable claiming first.');
                        }
                      }}
                      style={{
                        background: characterData.claimingEnabled ? 'rgba(0,255,0,0.1)' : 'rgba(128,128,128,0.1)',
                        border: '1px solid ' + (characterData.claimingEnabled ? '#0f0' : '#888'),
                        color: characterData.claimingEnabled ? '#0f0' : '#888',
                        padding: '6px 16px',
                        borderRadius: '4px',
                        cursor: characterData.claimingEnabled ? 'pointer' : 'not-allowed',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        opacity: characterData.claimingEnabled ? 1 : 0.5
                      }}
                    >
                      CLAIM TOKEN
                    </button>
                  )}
                </>
              )}
              {characterData.claimedBy === playerId && (
                <button
                  onClick={unclaimToken}
                  style={{
                    background: 'rgba(255,0,0,0.1)',
                    border: '1px solid #f00',
                    color: '#f00',
                    padding: '6px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  UNCLAIM TOKEN
                </button>
              )}

              {/* GM Token Controls - only for player type tokens */}
              {playerRole === 'GM' && (
                <button
                  onClick={() => handleUpdateData({ claimingEnabled: !characterData.claimingEnabled })}
                  style={{
                    background: characterData.claimingEnabled ? 'rgba(0,255,0,0.2)' : 'rgba(128,128,128,0.2)',
                    border: '1px solid ' + (characterData.claimingEnabled ? '#0f0' : '#888'),
                    color: characterData.claimingEnabled ? '#0f0' : '#888',
                    padding: '6px 16px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    width: '220px'
                  }}
                >
                  {characterData.claimingEnabled ? '🔓 CLAIMING ENABLED' : '🔒 CLAIMING DISABLED'}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
