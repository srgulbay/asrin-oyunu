import React from 'react';

// Props: players, gameState, currentSocketId
function PlayerList({ players = [], gameState, currentSocketId }) {
  // Zaten skora göre sıralı gelmeli (backend'den) ama burada tekrar sıralayabiliriz
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

  return (
    <div className="player-list">
      <h3>Oyuncular ({sortedPlayers.length})</h3>
      <ol>
        {sortedPlayers.map((p, index) => (
          <li key={p.id} style={p.id === currentSocketId ? { fontWeight: 'bold', color: 'dodgerblue' } : {}}>
            <span className="rank">{index + 1}.</span> {p.name}: {p.score} puan {gameState === 'waiting_tournament' ? (p.isReady ? '✅' : '⏳') : ''}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default PlayerList;
