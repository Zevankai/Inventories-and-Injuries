import { useState } from 'react';
import type { AbilityScores } from '../../../../types';
import { ABILITY_ABBREV } from '../../../../utils/characterSheet';

export interface AbilityScoreCircleProps {
  ability: keyof AbilityScores;
  score: number;
  modifier: number;
  canEdit: boolean;
  onScoreChange: (score: number) => void;
  /** Controls color theme. 'player' = cyan/teal, 'monster' = red. Defaults to 'player'. */
  variant?: 'player' | 'monster';
}

export const AbilityScoreCircle = ({ ability, score, modifier, canEdit, onScoreChange, variant = 'player' }: AbilityScoreCircleProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(score.toString());

  const isMonster = variant === 'monster';

  const color = isMonster ? '#e53935' : '#00bcd4';
  const colorAlpha = isMonster ? 'rgba(229, 57, 53, 0.8)' : 'rgba(0, 188, 212, 0.8)';
  const background = isMonster
    ? 'linear-gradient(135deg, rgba(229, 57, 53, 0.3), rgba(200, 40, 40, 0.3))'
    : 'linear-gradient(135deg, rgba(0, 188, 212, 0.3), rgba(0, 150, 170, 0.3))';
  const border = isMonster
    ? '2px solid rgba(229, 57, 53, 0.6)'
    : '2px solid rgba(0, 188, 212, 0.6)';
  const boxShadow = isMonster
    ? '0 2px 6px rgba(229, 57, 53, 0.3)'
    : '0 2px 6px rgba(0, 188, 212, 0.2)';
  const labelColor = isMonster ? 'rgba(229, 57, 53, 0.8)' : 'var(--text-muted)';
  const labelFontWeight = isMonster ? 'bold' : undefined;

  const handleClick = () => {
    if (canEdit) {
      setEditValue(score.toString());
      setIsEditing(true);
    }
  };

  const handleSave = () => {
    const parsed = parseInt(editValue, 10);
    const newScore = isNaN(parsed) ? 10 : Math.max(1, Math.min(30, parsed));
    onScoreChange(newScore);
    setIsEditing(false);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '2px',
    }}>
      <span style={{
        fontSize: '8px',
        color: labelColor,
        textTransform: 'uppercase',
        letterSpacing: '0.3px',
        fontWeight: labelFontWeight,
      }}>
        {ABILITY_ABBREV[ability]}
      </span>
      <div
        onClick={handleClick}
        style={{
          width: '42px',
          height: '42px',
          borderRadius: '50%',
          background,
          border,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: canEdit ? 'pointer' : 'default',
          transition: 'all 0.2s ease',
          boxShadow,
        }}
        title={canEdit ? 'Click to edit' : undefined}
      >
        {isEditing ? (
          <input
            type="number"
            value={editValue}
            min={1}
            max={30}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
            style={{
              width: '28px',
              background: 'transparent',
              border: 'none',
              color,
              fontSize: '12px',
              fontWeight: 'bold',
              textAlign: 'center',
              outline: 'none',
            }}
          />
        ) : (
          <>
            <span style={{
              fontSize: '14px',
              fontWeight: 'bold',
              color,
              lineHeight: 1,
            }}>
              {modifier >= 0 ? `+${modifier}` : modifier}
            </span>
            <span style={{
              fontSize: '9px',
              color: colorAlpha,
            }}>
              {score}
            </span>
          </>
        )}
      </div>
    </div>
  );
};
