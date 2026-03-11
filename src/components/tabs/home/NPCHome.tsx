interface NPCHomeProps {
  playerRole: string;
}

export function NPCHome({ playerRole }: NPCHomeProps) {
  return (
    <div style={{fontSize: '10px', color: '#ff9800', fontStyle: 'italic'}}>
      🎭 NPC Token {playerRole === 'GM' ? '(You control this)' : '(GM controlled)'}
    </div>
  );
}
