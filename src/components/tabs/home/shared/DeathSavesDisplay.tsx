import type { DeathSaves } from '../../../../types';

export interface DeathSavesDisplayProps {
  deathSaves: DeathSaves;
  onUpdate: (updates: Partial<DeathSaves>) => void;
  canEdit: boolean;
}

export const DeathSavesDisplay = ({ deathSaves, onUpdate, canEdit }: DeathSavesDisplayProps) => {
  const handleFailureClick = (index: number) => {
    if (!canEdit) return;
    // Toggle logic: clicking on an active skull turns it off (sets failures to that index)
    // Clicking on an inactive skull turns it on (sets failures to index + 1)
    const clickedPosition = index + 1; // 1-based position
    if (clickedPosition <= deathSaves.failures) {
      // Clicking on active skull - toggle it off (set to the skull before this one)
      onUpdate({ failures: index });
    } else {
      // Clicking on inactive skull - toggle it on
      onUpdate({ failures: clickedPosition });
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {[0, 1, 2].map((index) => (
        <button
          key={index}
          onClick={() => handleFailureClick(index)}
          disabled={!canEdit}
          style={{
            background: 'none',
            border: 'none',
            cursor: canEdit ? 'pointer' : 'default',
            fontSize: '16px',
            padding: '2px',
            opacity: index < deathSaves.failures ? 1 : 0.3,
            filter: index < deathSaves.failures ? 'none' : 'grayscale(100%)',
            transition: 'all 0.2s ease',
          }}
          title={`Death Save Failure ${index + 1}${index < deathSaves.failures ? ' (active)' : ''}`}
        >
          💀
        </button>
      ))}
    </div>
  );
};
