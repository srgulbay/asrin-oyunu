import React from 'react';
import { motion } from 'framer-motion';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import LinearProgress from '@mui/material/LinearProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle'; // Doğru ikon
import CancelIcon from '@mui/icons-material/Cancel'; // Yanlış ikon

function QuestionDisplay({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  if (!currentQuestion) return null;

  const { index, total, text, options, timeLimit, answered, timedOut, correct_answer } = currentQuestion; // correct_answer'ı da alalım (backend göndermeli)
  // --- lastAnswerResult GÜNCELLENDİ ---
  // {correct, score, pointsAwarded, combo, comboBroken, questionIndex, timeout?, submittedAnswer?}
  const relevantResult = (lastAnswerResult && lastAnswerResult.questionIndex === index) ? lastAnswerResult : null;
  const showFeedback = !!relevantResult || timedOut; // Zaman aşımında da feedback gösterilebilir
  const myAnswer = relevantResult?.submittedAnswer; // Benim verdiğim cevap

  const progress = timeLimit > 0 ? (timeRemaining / timeLimit) * 100 : 0;
  const progressColor = timeRemaining <= 5 ? "error" : (timeRemaining <= 10 ? "warning" : "primary");

   // Buton stilini belirle
  const getButtonAppearance = (option) => {
      if (!answered && !timedOut) return "outlined"; // Henüz cevaplanmadıysa normal outlined

      // Cevaplandıktan veya süre dolduktan sonra
      if (option === correct_answer) return "contained"; // Doğru cevap her zaman contained (dolgulu)
      if (option === myAnswer && !correct) return "contained"; // Yanlış işaretlediğim şık contained
      return "outlined"; // Diğer yanlış şıklar outlined kalsın
  };

  const getButtonColor = (option) => {
       if (!answered && !timedOut) return "primary"; // Normal renk

       if (option === correct_answer) return "success"; // Doğru cevap yeşil
       if (option === myAnswer && !correct) return "error"; // Yanlış işaretlediğim şık kırmızı
       return "inherit"; // Diğer yanlış şıklar varsayılan (gri gibi)
   };

  return (
    <Paper elevation={3} sx={{ padding: { xs: 2, sm: 3 }, marginBottom: 2 }}>
      <motion.div
        key={index}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      >
        <Box sx={{ width: '100%', mb: 1 }}>
          <LinearProgress variant="determinate" value={progress} color={progressColor} sx={{ height: '6px', borderRadius: '3px' }}/>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="overline" color="text.secondary"> Soru {index + 1} / {total} </Typography>
          <Typography variant="overline" className="timer" sx={{ color: progressColor + '.main' }}> Kalan Süre: {timeRemaining}sn </Typography>
        </Box>
        <Typography variant="h5" component="p" sx={{ mb: 3, minHeight: '4em' }}> {text} </Typography>

        <Grid container spacing={1.5}>
          {options.map((option, i) => (
            <Grid xs={12} sm={6} key={i}>
              <motion.div whileHover={{ scale: answered || timedOut ? 1 : 1.02 }} whileTap={{ scale: answered || timedOut ? 1 : 0.98 }} style={{ height: '100%' }}>
                <Button
                  // --- GÜNCELLENDİ: Dinamik Stil ---
                  variant={getButtonAppearance(option)}
                  color={getButtonColor(option)}
                  // ---------------------------------
                  fullWidth
                  onClick={() => handleAnswerSubmit(option)}
                  disabled={answered || timedOut}
                  size="large"
                  sx={{ textTransform: 'none', justifyContent: 'flex-start', p: '12px 16px', textAlign: 'left', height: '100%', mb: 0.5 }}
                  // --- GÜNCELLENDİ: İkon Ekleme ---
                  endIcon={answered || timedOut ? (option === correct_answer ? <CheckCircleIcon /> : (option === myAnswer ? <CancelIcon /> : null)) : null}
                  // --------------------------------
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
