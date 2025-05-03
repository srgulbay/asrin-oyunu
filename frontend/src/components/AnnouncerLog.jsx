import React, { useEffect, useRef } from 'react';
// Framer Motion importları
import { motion, AnimatePresence } from 'framer-motion';

// Props: announcerLog
function AnnouncerLog({ announcerLog = [] }) {
  const announcerLogRef = useRef(null);

  useEffect(() => {
    if (announcerLogRef.current) {
      announcerLogRef.current.scrollTop = 0; // En yeni üste gelir
    }
  }, [announcerLog]);

  // Animasyon tanımları
  const messageVariants = {
    hidden: { opacity: 0, y: -10 }, // Başlangıçta görünmez ve biraz yukarıda
    visible: { opacity: 1, y: 0 },    // Görünür ve normal pozisyonunda
    exit: { opacity: 0, x: -20 }      // Çıkarken sola kayıp kaybolsun (opsiyonel)
  };

  return (
    <div className="announcer-log" ref={announcerLogRef}>
      <h4>🎤 Sunucu</h4>
      {announcerLog.length === 0 && <p className="log-message log-info">Oyunla ilgili mesajlar burada görünecek...</p>}
      {/* AnimatePresence, listeden eleman çıktığında çıkış animasyonu sağlar */}
      <AnimatePresence initial={false}>
        {announcerLog.map((log) => ( // index yerine timestamp+text kullanalım
          <motion.p
            key={`<span class="math-inline">\{log\.timestamp\}\-</span>{log.text}`} // Benzersiz key önemli
            variants={messageVariants}
            initial="hidden"  // Başlangıç animasyon durumu
            animate="visible" // Görünür animasyon durumu
            exit="exit"       // Çıkış animasyon durumu
            transition={{ duration: 0.3, ease: "easeOut" }} // Animasyon süresi ve şekli
            layout // Liste elemanı eklendiğinde/çıktığında diğerlerini kaydırır
            className={`log-message log-${log.type || 'info'}`}
          >
            <span className="log-time">[{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</span> {log.text}
          </motion.p>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default AnnouncerLog;
