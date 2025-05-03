import React from 'react';
import { motion } from 'framer-motion';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import Box from '@mui/material/Box'; // Box ekleyelim

function PlayerList({ players = [], gameState, currentSocketId }) {
  const sortedPlayers = players; // Sıralı geldiğini varsayıyoruz

   const itemVariants = {
     hidden: { opacity: 0, x: -15 },
     visible: (i) => ({
       opacity: 1,
       x: 0,
       transition: { delay: i * 0.05, duration: 0.2 }
     }),
   };

  return (
    // variant="outlined" yerine elevation={2} ile hafif bir gölge
    <Paper elevation={2} sx={{ padding: '12px 8px', overflow: 'hidden', height:'100%' }}>
      <Typography variant="h6" component="h3" sx={{ paddingLeft: '16px', marginBottom: 1 }}>
            Oyuncular ({sortedPlayers.length})
       </Typography>
      {/* dense prop'unu kaldırıp padding'i ListItem'da ayarlayabiliriz */}
      <List sx={{ maxHeight: 'calc(100% - 50px)', overflowY: 'auto', paddingRight: '8px' }}>
        {sortedPlayers.map((p, index) => (
          <motion.div
             key={p.id}
             custom={index}
             variants={itemVariants}
             initial="hidden"
             animate="visible"
             // layout prop kaldırılmıştı
          >
              {/* ListItem'a daha fazla stil ve yapı */}
              <ListItem
                  disablePadding
                  sx={{
                      py: 0.5, // Dikey padding
                      mb: 0.5, // Alt boşluk
                      backgroundColor: p.id === currentSocketId ? 'action.hover' : 'transparent',
                      borderRadius: 1, // Daha yumuşak köşe
                      '&:hover': { // Üzerine gelince hafif etki
                          backgroundColor: 'action.focus'
                      }
                  }}
              >
                  {/* İkon ve Rank */}
                  <ListItemIcon sx={{ minWidth: '40px', pl: 1 }}>
                      <Typography
                          variant="caption"
                          sx={{
                              fontWeight: 'bold',
                              color: index < 3 ? 'warning.main' : 'text.secondary',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                          }}
                       >
                          {index === 0 ? <EmojiEventsIcon sx={{ color: 'gold', fontSize: '1.2rem' }}/> :
                           (index === 1 ? <EmojiEventsIcon sx={{ color: 'silver', fontSize: '1.2rem' }}/> :
                           (index === 2 ? <EmojiEventsIcon sx={{ color: '#cd7f32', fontSize: '1.2rem' }}/> :
                           `${index + 1}.`))}
                       </Typography>
                  </ListItemIcon>
                  {/* İsim ve Skor */}
                  <ListItemText
                    primary={p.name}
                    secondary={`${p.score} puan`}
                    primaryTypographyProps={{
                        fontWeight: p.id === currentSocketId ? 'bold' : 500,
                        fontSize: '0.95rem', // Biraz küçültelim
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis' // Uzun isimler için ...
                    }}
                    secondaryTypographyProps={{
                         fontSize: '0.8rem'
                     }}
                  />
                  {/* Hazır İkonu (sağda) */}
                  {gameState === 'waiting_tournament' && (
                      <ListItemIcon sx={{ minWidth: 'auto', justifyContent: 'flex-end', pr: 1 }}>
                          {p.isReady ? <CheckCircleOutlineIcon color="success" fontSize="small" /> : <HourglassEmptyIcon color="disabled" fontSize="small" />}
                      </ListItemIcon>
                  )}
              </ListItem>
          </motion.div>
        ))}
      </List>
    </Paper>
  );
}

export default PlayerList;