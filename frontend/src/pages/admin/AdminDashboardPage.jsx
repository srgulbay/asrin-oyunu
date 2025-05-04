import React from 'react';
import { Typography, Paper, Grid, Box } from '@mui/material';

function AdminDashboardPage() {
  // İleride buraya istatistikler ve hızlı bilgiler eklenecek
  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Admin Dashboard
      </Typography>
      <Paper sx={{ p: 2 }}>
        <Typography variant="body1">
          Admin paneline hoş geldiniz. Buradan kullanıcıları, soruları ve diğer ayarları yönetebilirsiniz.
        </Typography>
        {/* Örnek İstatistik Kutuları */}
        <Grid container spacing={2} mt={2}>
             <Grid xs={12} sm={6} md={3}> <Paper elevation={2} sx={{p:2, textAlign:'center'}}> <Typography variant="h6">150</Typography><Typography variant="caption">Toplam Kullanıcı</Typography> </Paper> </Grid>
             <Grid xs={12} sm={6} md={3}> <Paper elevation={2} sx={{p:2, textAlign:'center'}}> <Typography variant="h6">5</Typography><Typography variant="caption">Aktif Turnuva</Typography> </Paper> </Grid>
             <Grid xs={12} sm={6} md={3}> <Paper elevation={2} sx={{p:2, textAlign:'center'}}> <Typography variant="h6">500</Typography><Typography variant="caption">Toplam Soru</Typography> </Paper> </Grid>
             <Grid xs={12} sm={6} md={3}> <Paper elevation={2} sx={{p:2, textAlign:'center'}}> <Typography variant="h6">25</Typography><Typography variant="caption">Bugünkü Kayıt</Typography> </Paper> </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}

export default AdminDashboardPage;
