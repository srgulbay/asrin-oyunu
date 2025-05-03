import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';

const MAX_LOG_MESSAGES = 20; // Gösterilecek maksimum mesaj sayısı

// Props: announcerLog dizisi [{id, text, type, timestamp}, ...]
function AnnouncerLog({ announcerLog = [] }) {
  const scrollableLogRef = useRef(null); // Kaydırılacak Box için ref

  // Log güncellendiğinde en alta kaydır
  useEffect(() => {
    if (scrollableLogRef.current) {
      scrollableLogRef.current.scrollTop = scrollableLogRef.current.scrollHeight;
    }
  }, [announcerLog]);

  return (
    // Paper ile çerçeve
    <Paper elevation={1} sx={{ padding: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' /* İçerik taşmasını engelle*/ }}>
      <Typography variant="h6" component="h4" sx={{ marginBottom: 1, paddingLeft: '8px', flexShrink: 0 /* Başlık küçülmesin */ }}>
        🎤 Sunucu
      </Typography>
      {/* Mesajların gösterileceği ve kaydırılacak alan */}
      <Box
        ref={scrollableLogRef} // Ref'i kaydırılacak Box'a ata
        className="announcer-log-messages"
        sx={{
          flexGrow: 1, // Kalan tüm alanı kapla
          overflowY: 'auto', // Taşarsa DİKEY scroll çıksın
          marginBottom: '5px',
          paddingRight: '5px',
          paddingLeft: '8px',
        }}
      >
        {announcerLog.length === 0 && <Typography variant="body2" sx={{ color: 'text.secondary'}}>Oyunla ilgili mesajlar burada görünecek...</Typography>}
        <AnimatePresence initial={false}>
          {/* App.jsx'ten limitli geldiği için slice'a gerek yok, map yeterli */}
          {/* Diziyi ters çevirmiyoruz */}
          {announcerLog.map((log) => ( // index'e de gerek yok, log.id var
            <motion.p
              // --- BENZERSİZ KEY ---
              key={log.id} // Backend'den gelen benzersiz ID'yi kullan
              // --------------------
              initial={{ opacity: 0, y: 10 }} // Aşağıdan gel
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }} // Sadece fade out
              transition={{ duration: 0.3 }}
              // layout prop'u kaldırılmıştı, yanıp sönmeyi önlemek için
              className={`log-message log-${log.type || 'info'}`} // Stil için class
              style={{ margin: '3px 0', fontSize: '0.85rem', lineHeight: '1.4' }} // Temel stil
            >
              <span className="log-time" style={{color: 'gray', marginRight: '5px'}}>
                 [{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute:'2-digit', second:'2-digit' })}]
              </span>
               {log.text}
            </motion.p>
          ))}
        </AnimatePresence>
         {/* Kaydırma için boş div'e gerek yok */}
      </Box>
    </Paper>
  );
}

export default AnnouncerLog;
