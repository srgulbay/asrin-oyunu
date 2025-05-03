import React from 'react';
import { motion } from 'framer-motion';
// --- MUI Imports ---
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemAvatar from '@mui/material/ListItemAvatar'; // Avatar için
import Avatar from '@mui/material/Avatar'; // Avatar için
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider'; // Ayırıcı
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'; // Kupa ikonu
import Box from '@mui/material/Box';
// --- MUI Imports Sonu ---

// Props: gameResults, waitingMessage, currentSocketId
function ResultsScreen({ gameResults, waitingMessage, currentSocketId }) {
  if (!gameResults || gameResults.length === 0) {
       return <Typography sx={{ textAlign: 'center', mt: 3 }}>Sonuçlar hesaplanıyor...</Typography>;
   }

  return (
    <Paper elevation={3} sx={{ padding: { xs: 2, sm: 3 }, textAlign: 'center' }}>
      <motion.div
         initial={{ scale: 0.8, opacity: 0 }}
         animate={{ scale: 1, opacity: 1 }}
         transition={{ type: "spring", stiffness: 100, damping: 15, delay: 0.1 }}
      >
        <EmojiEventsIcon sx={{ fontSize: 60, color: 'warning.main', marginBottom: 1 }} />
        <Typography variant="h4" component="h2" gutterBottom>
          Oyun Bitti! İşte Sonuçlar:
        </Typography>
        <List sx={{ width: '100%', maxWidth: 400, margin: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
          {gameResults.map((result, i) => (
            <React.Fragment key={result.id || `result-${i}`}>
              {/* Her öğe için animasyonlu div */}
               <motion.div
                   initial={{ opacity: 0, x: -20 }}
                   animate={{ opacity: 1, x: 0 }}
                   transition={{ delay: i * 0.15 + 0.4 }} // Biraz daha belirgin gecikme
                >
                  <ListItem
                     secondaryAction={ // Sağ tarafa ikonu koyalım
                       <ListItemIcon sx={{justifyContent: 'flex-end'}}>
                          {i === 0 ? <EmojiEventsIcon sx={{color: 'gold'}}/> : (i === 1 ? <EmojiEventsIcon sx={{color: 'silver'}}/> : (i === 2 ? <EmojiEventsIcon sx={{color: '#cd7f32'}}/> : null))}
                       </ListItemIcon>
                     }
                     sx={{ backgroundColor: result.id === currentSocketId ? 'action.selected' : 'transparent' }}
                   >
                       <ListItemAvatar>
                           <Avatar sx={{ bgcolor: i < 3 ? 'secondary.main' : 'primary.main', width: 32, height: 32 }}>
                               {/* Sıra numarasını avatar içine */}
                               <Typography variant="body2" sx={{color: 'white'}}>{i + 1}</Typography>
                           </Avatar>
                       </ListItemAvatar>
                       <ListItemText
                         primary={result.name}
                         secondary={`${result.score} puan`}
                         primaryTypographyProps={{ fontWeight: result.id === currentSocketId ? 'bold' : 500 }}
                       />
                   </ListItem>
               </motion.div>
               {/* Son eleman hariç araya ayırıcı koy */}
               {i < gameResults.length - 1 && <Divider variant="inset" component="li" />}
            </React.Fragment>
          ))}
        </List>
         <Typography align="center" sx={{marginTop: 3, color: 'text.secondary'}}>
             {waitingMessage || 'Yeni oyun yakında başlayabilir...'}
          </Typography>
          <Button
             variant="contained"
             onClick={() => window.location.reload()} // Şimdilik basit yenileme
             sx={{marginTop: 3}}
             size="large"
          >
             Yeni Oyun İçin Yenile
          </Button>
      </motion.div>
    </Paper>
  );
}

export default ResultsScreen;
