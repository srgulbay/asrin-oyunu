import React from 'react';
import { motion } from 'framer-motion';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid'; // Grid layout için
import LinearProgress from '@mui/material/LinearProgress'; // Zamanlayıcı barı

function QuestionDisplay({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  if (!currentQuestion) return null;

  const { index, total, text, options, timeLimit, answered, timedOut } = currentQuestion;
  const relevantResult = (lastAnswerResult && lastAnswerResult.questionIndex === index) ? lastAnswerResult : null;
  const showFeedback = !!relevantResult;
  const progress = timeLimit > 0 ? (timeRemaining / timeLimit) * 100 : 0;
  const progressColor = timeRemaining <= 5 ? "error" : (timeRemaining <= 10 ? "warning" : "primary");

  return (
    <Paper elevation={3} sx={{ padding: { xs: 2, sm: 3 }, marginBottom: 2 }}> {/* Mobil için daha az padding */}
      <motion.div
        key={index}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <Box sx={{ width: '100%', mb: 1 }}> {/* Bar için margin bottom */}
          <LinearProgress variant="determinate" value={progress} color={progressColor} sx={{ height: '6px', borderRadius: '3px' }}/>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="overline" color="text.secondary"> Soru {index + 1} / {total} </Typography>
          <Typography variant="overline" className="timer" sx={{ color: progressColor + '.main' }}> Kalan Süre: {timeRemaining}sn </Typography>
        </Box>
        <Typography variant="h5" component="p" sx={{ mb: 3, minHeight: '4em' }}> {text} </Typography>

        {/* Seçenek Butonları - Grid v2 Düzeltmesi */}
        <Grid container spacing={1.5}> {/* Ana container */}
          {options.map((option, i) => (
            // item prop'u yok, xs/sm doğrudan Grid üzerinde
            <Grid xs={12} sm={6} key={i}> {/* Grid item için boyutlandırma */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ height: '100%' }}>
                <Button
                  variant="outlined"
                  fullWidth
                  onClick={() => handleAnswerSubmit(option)}
                  disabled={answered || timedOut}
                  size="large"
                  sx={{ textTransform: 'none', justifyContent: 'flex-start', p: '12px 16px', textAlign: 'left', height: '100%' }}
                >
                  {option}
                </Button>
              </motion.div>
            </Grid>
          ))}
        </Grid>

        {showFeedback && ( /* Feedback */ <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}><Typography variant="subtitle1" component="p" color={relevantResult.correct ? 'success.main' : (relevantResult.timeout ? 'warning.main' : 'error.main')} sx={{ marginTop: 3, fontWeight: 'bold', textAlign: 'center' }}>{relevantResult.timeout ? 'Süre Doldu!' : (relevantResult.correct ? `Doğru! +${relevantResult.pointsAwarded || 0} Puan` : 'Yanlış!')}{(relevantResult.correct && relevantResult.combo > 1) ? ` (${relevantResult.combo}x Kombo! 🔥)` : ''}{relevantResult.comboBroken ? ' (Kombo Bozuldu!)' : ''}</Typography></motion.div> )}
      </motion.div>
    </Paper>
  );
}

export default QuestionDisplay;
