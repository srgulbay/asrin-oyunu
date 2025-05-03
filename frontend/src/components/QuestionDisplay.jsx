import React from 'react';
// Animasyon için Framer Motion eklenebilir
import { motion } from 'framer-motion';

// Props: currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult
function QuestionDisplay({ currentQuestion, timeRemaining, handleAnswerSubmit, lastAnswerResult }) {
  // Eğer geçerli bir soru yoksa hiçbir şey gösterme
  if (!currentQuestion) return null;

  // Props'tan gerekli bilgileri al
  const { index, total, text, options, answered, timedOut } = currentQuestion;

  // Bu soruyla ilgili en son cevap sonucunu bul (varsa)
  const relevantResult = (lastAnswerResult && lastAnswerResult.questionIndex === index) ? lastAnswerResult : null;
  const showFeedback = !!relevantResult; // Geri bildirim gösterilecek mi?

  return (
    <motion.div
      key={index} // Soru değiştiğinde animasyon için key önemli
      className="question-display"
      initial={{ opacity: 0, y: 20 }} // Aşağıdan belirerek gelsin
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <h3>
         Soru {index + 1} / {total}
         {/* Zamanlayıcı için görsel bir bar eklenebilir */}
         <span className="timer">(Kalan Süre: {timeRemaining}sn)</span>
      </h3>
      <p className="question-text">{text}</p>
      <div className="options">
        {options.map((option, i) => (
          // Seçenekler için de animasyon eklenebilir
          <motion.button
            key={i}
            onClick={() => handleAnswerSubmit(option)}
            disabled={answered || timedOut} // Cevaplandıysa veya süre dolduysa pasif
            whileHover={{ scale: 1.05 }} // Üzerine gelince hafif büyüsün
            whileTap={{ scale: 0.95 }}   // Tıklayınca hafif küçülsün
            // Stil veya MUI Button buraya gelecek
          >
            {option}
          </motion.button>
        ))}
      </div>
      {/* Cevap sonucu göstergesi */}
      {showFeedback && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`answer-feedback ${relevantResult.correct ? 'correct' : (relevantResult.timeout ? 'timeout' : 'incorrect')}`}
        >
          {relevantResult.timeout ? 'Süre Doldu!' : (relevantResult.correct ? `Doğru! +${relevantResult.pointsAwarded || 0} Puan` : 'Yanlış!')}
          {/* Kombo mesajı (eğer varsa) */}
          {(relevantResult.correct && relevantResult.combo > 1) ? ` (${relevantResult.combo}x Kombo! 🔥)` : ''}
          {relevantResult.comboBroken ? ' (Kombo Bozuldu!)' : ''}
        </motion.p>
      )}
    </motion.div>
  );
}

export default QuestionDisplay;
