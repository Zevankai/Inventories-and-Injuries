import { useState } from 'react';

export interface CollapsibleDashboardSectionProps {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export const CollapsibleDashboardSection = ({ 
  title, 
  defaultExpanded = false, 
  children 
}: CollapsibleDashboardSectionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div style={{ marginTop: '8px' }}>
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
        aria-expanded={isExpanded}
        aria-label={`${title} section, ${isExpanded ? 'click to collapse' : 'click to expand'}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          padding: '8px 10px',
          background: isHovered 
            ? 'linear-gradient(135deg, rgba(138, 43, 226, 0.35), rgba(75, 0, 130, 0.35))' 
            : 'linear-gradient(135deg, rgba(138, 43, 226, 0.25), rgba(75, 0, 130, 0.25))',
          borderRadius: '6px',
          border: `1px solid ${isHovered ? 'rgba(186, 85, 211, 0.5)' : 'rgba(138, 43, 226, 0.3)'}`,
          marginBottom: isExpanded ? '8px' : '0',
          transition: 'all 0.2s ease',
        }}
      >
        <span style={{
          fontSize: '11px',
          fontWeight: 'bold',
          color: '#fff',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        }}>
          {title}
        </span>
        <span 
          style={{ 
            color: '#e0b0ff', 
            fontSize: '11px',
            transition: 'transform 0.2s ease',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
          aria-hidden="true"
        >
          ▼
        </span>
      </div>
      {isExpanded && (
        <div style={{
          background: 'rgba(75, 0, 130, 0.1)',
          borderRadius: '6px',
          padding: '10px',
          border: '1px solid rgba(138, 43, 226, 0.2)',
        }}>
          {children}
        </div>
      )}
    </div>
  );
};
