import React from 'react';
import { motion } from 'framer-motion';
import { List, ListItem, ListItemText, ListItemIcon, ListItemAvatar, Avatar, Paper, Typography, Button, Divider, Box, Chip, Stack } from '@mui/material'; // Stack eklendi
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import StarIcon from '@mui/icons-material/Star';
import MilitaryTechIcon from '@mui/icons-material/MilitaryTech'; // Başarı ikonu
import useUserStore from '../store/userStore';

// Kaynak ikonları
const resourceInfo = {
  bilgelik: { icon: '📚', color: 'info' },
  zekaKristali: { icon: '💎', color: 'warning' },
  enerji: { icon: '⚡', color: 'error' },
  kultur: { icon: '🌍', color: 'success' },
};

// Başarı ikonları (isteğe bağlı)
const achievementIcons = {
    winner: <EmojiEventsIcon sx={{ color: 'gold' }} fontSize="small"/>,
    top3: <EmojiEventsIcon color="disabled" fontSize="small"/>,
    combo_master: <span style={{fontSize: '1.1em'}}>🔥</span>,
    combo_streak: <span style={{fontSize: '1.1em'}}>⚡️</span>,
    giant_slayer: <span style={{fontSize: '1.1em'}}>🚀</span>,
    super_sonic: <span style={{fontSize: '1.1em'}}>💨</span>,
    quick_reflex: <span style={{fontSize: '1.1em'}}>🏃</span>,
    sharp_mind: <span style={{fontSize: '1.1em'}}>🎯</span>,
    good_accuracy: <span style={{fontSize: '1.1em'}}>✔️</span>,
    participant: <span style={{fontSize: '1.1em'}}>👍</span>,
};

function ResultsScreen({ gameResults, waitingMessage }) {
  const currentUser = useUserStore((state) => state.user);

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
        <List sx={{ width: '100%', maxWidth: 600, margin: 'auto', bgcolor: 'background.paper', borderRadius: 1, mb: 3 }}>
          {gameResults.map((result, i) => (
            <React.Fragment key={result.uid || result.id || `result-${i}`}>
                <ListItem
                    secondaryAction={
                       <ListItemIcon sx={{justifyContent: 'flex-end'}}>
                          {result.rank === 1 ? <EmojiEventsIcon sx={{color: 'gold', fontSize: '1.5rem'}}/> : (result.rank === 2 ? <EmojiEventsIcon sx={{color: 'silver', fontSize: '1.4rem'}}/> : (result.rank === 3 ? <EmojiEventsIcon sx={{color: '#cd7f32', fontSize: '1.3rem'}}/> : null))}
                       </ListItemIcon>
                    }
                    sx={{
                        backgroundColor: result.uid === currentUser?.uid ? 'action.selected' : 'transparent',
                        alignItems: 'flex-start', pt: 1.5, pb: 1.5
                    }}
                 >
                     <ListItemAvatar sx={{mr: 1, mt: 0.5}}>
                         <Avatar sx={{ bgcolor: result.rank < 4 ? 'secondary.main' : 'primary.light', width: 36, height: 36 }}>
                             <Typography variant="body1" sx={{color: 'white', fontWeight:'bold'}}>{result.rank}</Typography>
                         </Avatar>
                     </ListItemAvatar>
                     <ListItemText
                         primary={result.name}
                         secondary={
                             <Stack spacing={0.5} mt={0.5}>
                                 <Typography component="span" variant="body2" sx={{ fontWeight: 'bold' }}>
                                     {result.finalScore} Puan
                                 </Typography>
                                 {result.xpEarned > 0 && (
                                    <Chip icon={<StarIcon fontSize="small" />} label={`+${result.xpEarned} XP`} size="small" color="primary" variant="outlined" sx={{ height: '20px' }} />
                                 )}
                                 <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                     {Object.entries(result.resourcesEarned || {}).map(([key, value]) => (
                                         value > 0 && (
                                         <Chip key={key} icon={<span style={{ fontSize: '1em' }}>{resourceInfo[key]?.icon || '?'}</span>} label={`+${value}`} size="small" color={resourceInfo[key]?.color || 'default'} variant="filled" sx={{ height: '20px', '& .MuiChip-label': { fontSize: '0.7rem', px: '6px' }, '& .MuiChip-icon': { ml: '4px', mr: '-2px' } }} />
                                         )
                                     ))}
                                  </Box>
                                  {/* --- YENİ: Başarılar --- */}
                                  {result.achievements && result.achievements.length > 0 && (
                                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                                          {result.achievements.map((ach) => (
                                               <Chip
                                                   key={ach.id}
                                                   icon={achievementIcons[ach.id] || <MilitaryTechIcon fontSize="small"/>}
                                                   label={ach.name + (ach.value ? ` (${ach.value})` : '')}
                                                   size="small"
                                                   variant="outlined"
                                                   color="secondary"
                                                   sx={{ height: '20px', '& .MuiChip-label': { fontSize: '0.7rem', px: '6px'}, '& .MuiChip-icon': { fontSize: '1.1em', ml: '4px', mr: '-2px'} }}
                                                   title={ach.name} // Tooltip
                                                />
                                           ))}
                                      </Box>
                                  )}
                                  {/* ---------------------- */}
                             </Stack>
                         }
                         primaryTypographyProps={{ fontWeight: result.uid === currentUser?.uid ? 'bold' : 500, mb: 0.2 }}
                     />
                 </ListItem>
                 {i < gameResults.length - 1 && <Divider variant="inset" component="li" />}
            </React.Fragment>
          ))}
        </List>
         <Typography align="center" sx={{marginTop: 3, color: 'text.secondary'}}>
             {waitingMessage || 'Yeni oyun yakında başlayabilir...'}
          </Typography>
          <Button
             variant="contained"
             onClick={() => window.location.reload()}
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