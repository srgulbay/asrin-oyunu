import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Box, Typography, Paper, TextField, Button, Select, MenuItem, FormControl, InputLabel, Stack, Alert, CircularProgress, FormGroup, FormControlLabel, Checkbox, FormLabel } from '@mui/material'; // Form kontrolleri eklendi
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { addTournament, getTournamentById, updateTournament } from '../../services/adminApi'; // API fonksiyonları

const GRADE_OPTIONS = ['Okul Öncesi', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
const STATUS_OPTIONS = [
    { value: 'draft', label: 'Taslak' },
    { value: 'active', label: 'Aktif (Yayında)' },
    { value: 'archived', label: 'Arşivlenmiş' },
];

function AdminTournamentFormPage() {
  const navigate = useNavigate();
  const { tournamentId } = useParams();
  const isEditMode = Boolean(tournamentId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [allowedGrades, setAllowedGrades] = useState([]); // Seçilen sınıflar için dizi
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [pageLoading, setPageLoading] = useState(false);

  const handleGradeChange = (event) => {
    const { value, checked } = event.target;
    setAllowedGrades((prev) =>
      checked ? [...prev, value] : prev.filter((grade) => grade !== value)
    );
  };

  // Düzenleme modu için turnuva verisini yükle
  useEffect(() => {
      if (isEditMode) {
          setPageLoading(true);
          setError(null);
          getTournamentById(tournamentId)
              .then(data => {
                  setName(data.name);
                  setDescription(data.description || '');
                  setStatus(data.status || 'draft');
                  setAllowedGrades(data.allowed_grades || []); // Veritabanından gelen diziyi ayarla
              })
              .catch(err => setError(`Turnuva yüklenemedi: ${err.message}`))
              .finally(() => setPageLoading(false));
      }
  }, [tournamentId, isEditMode]);


  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null); setSuccess(null);

    if (!name.trim() || !status) { setError('Lütfen Turnuva Adı ve Durumu alanlarını doldurun.'); return; }

    const tournamentData = {
      name: name.trim(),
      description: description.trim() || null, // Boşsa null gönder
      status: status,
      allowed_grades: allowedGrades.length > 0 ? allowedGrades : null, // Boşsa null gönder
    };

    setLoading(true);
    try {
      let result;
      if (isEditMode) {
        result = await updateTournament(tournamentId, tournamentData);
        setSuccess(`Turnuva başarıyla güncellendi (ID: ${result.tournament_id}). Liste sayfasına yönlendiriliyorsunuz...`);
      } else {
        result = await addTournament(tournamentData);
        setSuccess(`Turnuva başarıyla oluşturuldu (ID: ${result.tournament_id}). Liste sayfasına yönlendiriliyorsunuz...`);
      }
      // Başarılı işlem sonrası listeye yönlendir
      setTimeout(() => navigate('/admin/tournaments'), 2000);
    } catch (err) { setError(err.message || `Turnuva ${isEditMode ? 'güncellenirken' : 'oluşturulurken'} bir hata oluştu.`); }
    finally { setLoading(false); }
  };

  if (pageLoading && isEditMode) {
      return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;
  }

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
          <IconButton onClick={() => navigate('/admin/tournaments')} size="small"> <ArrowBackIcon /> </IconButton>
          <Typography variant="h4" component="h1"> {isEditMode ? 'Turnuvayı Düzenle' : 'Yeni Turnuva Oluştur'} </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={3}>
          <TextField label="Turnuva Adı" variant="outlined" fullWidth required value={name} onChange={(e) => setName(e.target.value)} disabled={loading} />
          <TextField label="Açıklama (Opsiyonel)" variant="outlined" fullWidth multiline rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={loading} />

          <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                   <FormControl fullWidth required>
                       <InputLabel id="status-select-label">Durum</InputLabel>
                       <Select labelId="status-select-label" value={status} label="Durum" onChange={(e) => setStatus(e.target.value)} disabled={loading} >
                         {STATUS_OPTIONS.map((s) => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                       </Select>
                   </FormControl>
              </Grid>
               <Grid item xs={12} sm={6}>
                    <FormControl component="fieldset" variant="standard">
                      <FormLabel component="legend">İzin Verilen Sınıflar (Boşsa Tümü)</FormLabel>
                      <FormGroup row> {/* Checkbox'ları yan yana göster */}
                        {GRADE_OPTIONS.map((gradeOpt) => (
                          <FormControlLabel
                            key={gradeOpt}
                            control={
                              <Checkbox
                                checked={allowedGrades.includes(gradeOpt)}
                                onChange={handleGradeChange}
                                value={gradeOpt}
                                disabled={loading}
                              />
                            }
                            label={gradeOpt === 'Okul Öncesi' ? 'Ö.Ö.' : gradeOpt} // Kısa etiket
                            title={gradeOpt === 'Okul Öncesi' ? gradeOpt : `${gradeOpt}. Sınıf`} // Tam açıklama
                          />
                        ))}
                      </FormGroup>
                    </FormControl>
               </Grid>
          </Grid>

          {/* TODO: Turnuvaya soru ekleme/çıkarma arayüzü buraya eklenecek (özellikle düzenleme modunda) */}
          {isEditMode && (
            <Box mt={2} p={2} border="1px solid lightgrey" borderRadius={1}>
                <Typography variant="h6" gutterBottom>Turnuva Soruları</Typography>
                <Typography variant="body2" color="text.secondary"> (Soru ekleme/çıkarma özelliği sonraki adımda eklenecektir.) </Typography>
                {/* Buraya turnuvadaki mevcut soruları listeleyen ve ekleme/çıkarma butonu olan bir component gelecek */}
            </Box>
           )}

          <Box sx={{ textAlign: 'right', mt: 2 }}>
            <Button type="submit" variant="contained" disabled={loading} startIcon={loading ? <CircularProgress size={20} color="inherit"/> : <SaveIcon />} >
              {loading ? (isEditMode ? 'Güncelleniyor...' : 'Oluşturuluyor...') : (isEditMode ? 'Turnuvayı Güncelle' : 'Turnuvayı Oluştur')}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
}

export default AdminTournamentFormPage;