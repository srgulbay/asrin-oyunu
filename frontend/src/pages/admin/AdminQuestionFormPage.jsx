import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Paper, TextField, Button, Select, MenuItem, FormControl, InputLabel, IconButton, Stack, Alert, CircularProgress, RadioGroup, FormControlLabel, Radio, Grid } from '@mui/material';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import RemoveCircleOutlineIcon from '@mui/icons-material/RemoveCircleOutline';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { addQuestion } from '../../services/adminApi'; // API fonksiyonunu import et

// Örnek sabitler - Bunları daha sonra dinamik hale getirebiliriz
const BRANCH_OPTIONS = ['Matematik', 'Türkçe', 'Fen Bilimleri', 'Sosyal Bilgiler', 'İngilizce', 'Tarih', 'Coğrafya', 'Teknoloji'];
const GRADE_OPTIONS = ['Okul Öncesi', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

function AdminQuestionFormPage() {
  const navigate = useNavigate();
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']); // Başlangıçta 4 boş seçenek
  const [correctAnswerIndex, setCorrectAnswerIndex] = useState(null); // Doğru cevabın index'i
  const [branch, setBranch] = useState('');
  const [grade, setGrade] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleOptionChange = (index, value) => {
    const newOptions = [...options];
    newOptions[index] = value;
    setOptions(newOptions);
    // Eğer değiştirilen seçenek doğru cevap ise, doğru cevap seçimini temizle
    if (correctAnswerIndex === index && value !== options[correctAnswerIndex]) {
       setCorrectAnswerIndex(null);
    }
  };

  const handleAddOption = () => {
    if (options.length < 6) { // Max 6 seçenek olsun
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index) => {
    if (options.length > 2) { // Min 2 seçenek kalsın
      const newOptions = options.filter((_, i) => i !== index);
      setOptions(newOptions);
      // Silinen seçenek doğru cevap ise seçimi temizle
      if (correctAnswerIndex === index) {
        setCorrectAnswerIndex(null);
      } else if (correctAnswerIndex !== null && correctAnswerIndex > index) {
         // Eğer daha sonraki bir seçenek doğruysa index'i güncelle
         setCorrectAnswerIndex(correctAnswerIndex - 1);
      }
    }
  };

  const handleCorrectAnswerChange = (event) => {
    setCorrectAnswerIndex(parseInt(event.target.value, 10));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!questionText.trim() || !branch || !grade || options.some(opt => !opt.trim()) || correctAnswerIndex === null) {
      setError('Lütfen tüm alanları doldurun ve doğru cevabı seçin.');
      return;
    }
    const correctAnswerValue = options[correctAnswerIndex];
    if (!correctAnswerValue) {
        setError('Seçilen doğru cevap geçerli değil.');
        return;
    }

    const questionData = {
      question_text: questionText.trim(),
      options: options.filter(opt => opt.trim()), // Boş seçenekleri filtrele
      correct_answer: correctAnswerValue.trim(),
      grade: grade,
      branch: branch,
    };

    // Seçenek sayısını tekrar kontrol et
     if (questionData.options.length < 2) {
        setError('En az 2 geçerli seçenek girilmelidir.');
        return;
     }

    setLoading(true);
    try {
      const newQuestion = await addQuestion(questionData);
      setSuccess(`Soru başarıyla eklendi (ID: ${newQuestion.id}). Liste sayfasına yönlendiriliyorsunuz...`);
      // Formu temizle veya başka bir işlem yap
      setQuestionText('');
      setOptions(['', '', '', '']);
      setCorrectAnswerIndex(null);
      setBranch('');
      setGrade('');
      setTimeout(() => navigate('/admin/questions'), 2000); // 2 saniye sonra listeye dön
    } catch (err) {
      setError(err.message || 'Soru eklenirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
          <IconButton onClick={() => navigate('/admin/questions')} size="small">
              <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1"> Yeni Soru Ekle </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Stack spacing={3}>
          <TextField
            label="Soru Metni"
            variant="outlined"
            fullWidth
            multiline
            rows={4}
            required
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            disabled={loading}
          />

          <FormControl component="fieldset" required>
             <Typography component="legend" variant="subtitle1" sx={{mb:1}}>Seçenekler ve Doğru Cevap</Typography>
             <RadioGroup
                aria-label="doğru-cevap"
                name="correct-answer-group"
                value={correctAnswerIndex !== null ? correctAnswerIndex.toString() : ''}
                onChange={handleCorrectAnswerChange}
             >
             {options.map((option, index) => (
                 <Stack direction="row" spacing={1} key={index} alignItems="center" mb={1}>
                     <FormControlLabel
                        value={index.toString()}
                        control={<Radio required disabled={loading} />}
                        label={`Seçenek ${index + 1}:`}
                        sx={{ mr: 'auto' }} // Label'ı sola yasla
                        disabled={loading}
                      />
                     <TextField
                         variant="outlined"
                         size="small"
                         fullWidth
                         required
                         value={option}
                         onChange={(e) => handleOptionChange(index, e.target.value)}
                         disabled={loading}
                     />
                     <IconButton
                        onClick={() => handleRemoveOption(index)}
                        disabled={options.length <= 2 || loading}
                        color="error"
                        size="small"
                      >
                         <RemoveCircleOutlineIcon />
                     </IconButton>
                 </Stack>
             ))}
             </RadioGroup>
          </FormControl>

          <Button
            type="button"
            onClick={handleAddOption}
            disabled={options.length >= 6 || loading}
            startIcon={<AddCircleOutlineIcon />}
            variant="outlined"
            size="small"
            sx={{ alignSelf: 'flex-start' }}
          >
            Seçenek Ekle
          </Button>

          <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                   <FormControl fullWidth required>
                       <InputLabel id="branch-select-label">Branş</InputLabel>
                       <Select
                         labelId="branch-select-label"
                         value={branch}
                         label="Branş"
                         onChange={(e) => setBranch(e.target.value)}
                         disabled={loading}
                       >
                         {BRANCH_OPTIONS.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
                       </Select>
                   </FormControl>
              </Grid>
               <Grid item xs={12} sm={6}>
                    <FormControl fullWidth required>
                       <InputLabel id="grade-select-label">Sınıf</InputLabel>
                       <Select
                         labelId="grade-select-label"
                         value={grade}
                         label="Sınıf"
                         onChange={(e) => setGrade(e.target.value)}
                         disabled={loading}
                       >
                          {GRADE_OPTIONS.map((g) => <MenuItem key={g} value={g}>{g === 'Okul Öncesi' ? g : `${g}. Sınıf`}</MenuItem>)}
                       </Select>
                   </FormControl>
               </Grid>
          </Grid>

          <Box sx={{ textAlign: 'right', mt: 2 }}>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              startIcon={loading ? <CircularProgress size={20} color="inherit"/> : <SaveIcon />}
            >
              {loading ? 'Kaydediliyor...' : 'Soruyu Kaydet'}
            </Button>
          </Box>
        </Stack>
      </Box>
    </Paper>
  );
}

export default AdminQuestionFormPage;