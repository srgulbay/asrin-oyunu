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

  return (
    <div className="announcer-log" ref={announcerLogRef}>
      <h4>🎤 Sunucu</h4>
      {announcerLog.length === 0 && <p className="log-message log-info">Oyunla ilgili mesajlar burada görünecek...</p>}
      {/* AnimatePresence, listeden eleman çıktığında çıkış animasyonu sağlar */}
      <AnimatePresence initial={false}>
        {announcerLog.map((log) => (
          <motion.p
            key={`${log.timestamp}-${log.text}`} // Benzersiz key önemli
            // --- BASİTLEŞTİRİLMİŞ ANİMASYON ---
            initial={{ opacity: 0 }} // Sadece başlangıçta görünmez olsun
            animate={{ opacity: 1 }} // Sadece görünür olsun
            exit={{ opacity: 0 }}    // Sadece kaybolsun
            transition={{ duration: 0.5 }} // Yarım saniyede
            // -----------------------------------
            layout // Bu kalsın, önemlidir
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
