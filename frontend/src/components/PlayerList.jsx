import React from 'react';
// Framer Motion importu
import { motion } from 'framer-motion';

// Props: players, gameState, currentSocketId
function PlayerList({ players = [], gameState, currentSocketId }) {
  // Skora göre sıralama App.jsx'ten gelmeli ama burada da yapabiliriz.
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

   // Liste öğesi animasyonu (Basit giriş animasyonu)
   const itemVariants = {
     hidden: { opacity: 0, x: -15 },
     visible: (i) => ({ // Her eleman için sıralı gecikme
       opacity: 1,
       x: 0,
       transition: {
         delay: i * 0.05,
         duration: 0.2
       }
     }),
   };

  return (
    <div className="player-list">
      <h3>Oyuncular ({sortedPlayers.length})</h3>
      {/* Liste için motion.ol */}
      <motion.ol initial="hidden" animate="visible">
        {sortedPlayers.map((p, index) => (
          // Her liste elemanını motion.li yapalım
          <motion.li
             key={p.id} // ID kullanmak önemli
             custom={index}
             variants={itemVariants}
             // animate="visible" // Zaten parent'tan alıyor
             layout // Sıralama değişince animasyonlu geçiş
             transition={{ type: "spring", stiffness: 600, damping: 30 }}
             style={p.id === currentSocketId ? { fontWeight: 'bold', color: 'dodgerblue' } : {}}
           >
            <span className="rank">{index + 1}.</span> {p.name}: {p.score} puan {gameState === 'waiting_tournament' ? (p.isReady ? '✅' : '⏳') : ''}
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}

export default PlayerList;
