import React from 'react';
import useUserStore from '../store/userStore';
import { Container, Paper, Typography, Box, Avatar, Grid, Chip, List, ListItem, ListItemIcon, ListItemText, Divider } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School'; // Sınıf ikonu
import StarIcon from '@mui/icons-material/Star'; // XP ikonu
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'; // Seviye ikonu
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import EmailIcon from '@mui/icons-material/Email';
import { deepOrange, amber, lightBlue, green } from '@mui/material/colors'; // Renkler için

// Kaynak ikonlarını ve renklerini tanımlayalım (Opsiyonel)
const resourceInfo = {
  bilgelik: { icon: '📚', color: lightBlue[500] }, // Örnek ikonlar
  zekaKristali: { icon: '💎', color: amber[500] },
  enerji: { icon: '⚡', color: deepOrange[500] },
  kultur: { icon: '🌍', color: green[500] },
};

function ProfilePage() {
  const user = useUserStore((state) => state.user);

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ mt: 4 }}>
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography>Kullanıcı bilgileri yükleniyor...</Typography>
        </Paper>
      </Container>
    );
  }

  // Avatar için baş harf veya varsayılan ikon
  const avatarLetter = user.displayName ? user.displayName[0].toUpperCase() : <AccountCircleIcon />;

  return (
    <Container maxWidth="md" sx={{ mt: 4 }}>
      <Paper elevation={3} sx={{ p: { xs: 2, sm: 4 } }}>
        <Grid container spacing={3} alignItems="center">
          <Grid xs={12} sm={4} md={3} sx={{ textAlign: 'center' }}>
            <Avatar sx={{ width: 100, height: 100, margin: 'auto', mb: 2, bgcolor: 'primary.main', fontSize: '2.5rem' }}>
              {avatarLetter}
            </Avatar>
            <Typography variant="h5" gutterBottom>
              {user.displayName || 'İsim Yok'}
            </Typography>
            <Chip icon={<EmojiEventsIcon />} label={`Seviye ${user.level || 1}`} color="secondary" sx={{ mb: 1 }} />
            <Chip icon={<StarIcon />} label={`${user.xp || 0} XP`} color="primary" variant="outlined" />
          </Grid>
          <Grid xs={12} sm={8} md={9}>
            <Typography variant="h6" gutterBottom>Kullanıcı Bilgileri</Typography>
            <List dense>
              <ListItem>
                <ListItemIcon sx={{minWidth: '40px'}}>
                  <EmailIcon />
                </ListItemIcon>
                <ListItemText primary="E-posta" secondary={user.email} />
              </ListItem>
              <ListItem>
                <ListItemIcon sx={{minWidth: '40px'}}>
                  <SchoolIcon />
                </ListItemIcon>
                <ListItemText primary="Sınıf" secondary={user.grade ? (user.grade === 'Okul Öncesi' ? user.grade : `${user.grade}. Sınıf`) : 'Belirtilmemiş'} />
              </ListItem>
            </List>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" gutterBottom>Kaynaklar</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              {Object.entries(user.resources || {}).map(([key, value]) => (
                 <Chip
                    key={key}
                    icon={<span style={{ fontSize: '1.2em', marginRight: '4px' }}>{resourceInfo[key]?.icon || '?'}</span>}
                    label={`${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`}
                    variant="outlined"
                    sx={{ borderColor: resourceInfo[key]?.color, color: resourceInfo[key]?.color }}
                  />
              ))}
              {Object.keys(user.resources || {}).length === 0 && (
                <Typography variant="body2" color="text.secondary">Henüz kaynak kazanılmamış.</Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
    </Container>
  );
}

export default ProfilePage;