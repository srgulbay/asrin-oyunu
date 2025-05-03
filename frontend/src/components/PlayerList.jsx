import React from 'react';
// Framer Motion importu
import { motion } from 'framer-motion';

// Props: players, gameState, currentSocketId
function PlayerList({ players = [], gameState, currentSocketId }) {
  const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

   // Liste öğesi animasyonu
   const itemVariants = {
     hidden: { opacity: 0, x: -15 },
     visible: (i) => ({ // Her eleman için sıralı gecikme (opsiyonel)
       opacity: 1,
       x: 0,
       transition: {
         delay: i * 0.05, // Her eleman 0.05sn gecikmeyle gelsin
         duration: 0.2
       }
     }),
     // Skor değiştiğinde belki hafifçe scale yapar?
     update: { scale: [1, 1.05, 1], transition: {duration: 0.4}} // Scale animasyonu
   };


  return (
    <div className="player-list">
      <h3>Oyuncular ({sortedPlayers.length})</h3>
      {/* Liste için motion.ol kullanalım */}
      <motion.ol initial="hidden" animate="visible">
        {sortedPlayers.map((p, index) => (
          // Her liste elemanını motion.li yapalım
          <motion.li
             key={p.id} // Key ID olmalı, index değil, sıralama değişebilir
             custom={index} // Varyanta index'i gönderir (gecikme için)
             variants={itemVariants}
             animate="visible" // Hem başlangıçta hem de skoru animate etmek için (?)
             // Skor değiştiğinde 'update' animasyonunu tetikle? Bu daha karmaşık state yönetimi gerektirir.
             // Şimdilik sadece giriş animasyonu ekleyelim. Skor güncelleme animasyonu için
             // skorun kendisini motion.span içine alıp animate prop'uyla oynayabiliriz.

             // Layout prop'u sıralama değiştiğinde yumuşak geçiş sağlar
             layout
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
