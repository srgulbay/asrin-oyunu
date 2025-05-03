import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css'; // Temel CSS kalsın, özelleştirilebilir
import { io } from "socket.io-client";

// Backend URL'ini Vite environment variables'dan al
const SERVER_URL = import.meta.env.VITE_BACKEND_URL;

// Oyun durumlarını tanımla (Backend ile aynı olmalı)
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };

function App() {
  // Socket ve Bağlantı State'leri
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');

  // Oyun State'leri
  const [playerName, setPlayerName] = useState(''); // Oyuncu adı
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [players, setPlayers] = useState([]); // Turnuvadaki oyuncular {id, name, score, isReady}
  const [currentQuestion, setCurrentQuestion] = useState(null); // Aktif soru {index, total, text, options, timeLimit, answered, timedOut}
  const [gameResults, setGameResults] = useState(null); // Oyun sonu sonuçları [{id, name, score}, ...]
  const [waitingMessage, setWaitingMessage] = useState(''); // Bekleme ekranı mesajı
  // Cevap Sonucu: {correct, score, pointsAwarded, combo, comboBroken, questionIndex, timeout}
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0); // Soru için kalan süre göstergesi
  const [isPlayerReady, setIsPlayerReady] = useState(false); // Bu oyuncu hazır mı?
  const [highlightMessages, setHighlightMessages] = useState([]); // Öne çıkan mesajlar

  const questionTimerIntervalRef = useRef(null); // Soru zamanlayıcısı interval ID'si için ref

  // --- Socket Bağlantısı ve Temel Olaylar ---
  useEffect(() => {
    if (!SERVER_URL) {
       console.error("HATA: VITE_BACKEND_URL tanımlanmamış!");
       setConnectionMessage('HATA: Backend adresi yapılandırılmamış!');
       return;
    }
    console.log("Bağlanılacak Backend URL:", SERVER_URL);

    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log("Socket.IO'ya bağlandı! ID:", newSocket.id);
      setIsConnected(true);
      setConnectionMessage('Sunucuya Bağlandı.');
       // Sayfa yenilendiğinde veya tekrar bağlandığında sunucudan güncel durumu isteyebiliriz.
       // newSocket.emit('request_current_state'); // Bu olay backend'de karşılanmalı
    });
    newSocket.on("connect_error", (err) => { console.error("Bağlantı hatası:", err.message); setConnectionMessage(`Bağlantı hatası: ${err.message}`); setIsConnected(false); });
    newSocket.on("disconnect", (reason) => { console.log("Bağlantı kesildi:", reason); setConnectionMessage('Bağlantı kesildi.'); setIsConnected(false); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); /* State'leri sıfırla */ });

    // Genel hata mesajları
     newSocket.on('error_message', (data) => {
         console.error("Sunucudan Hata:", data.message);
         // Hata mesajını kullanıcıya göstermek için bir state kullanılabilir.
         alert(`Sunucu Hatası: ${data.message}`); // Şimdilik alert
     });

      // Oyun sıfırlama olayı
      newSocket.on('reset_game', (data) => {
          console.log("Oyun sıfırlandı:", data.message);
          setGameState(GAME_STATES.IDLE);
          setPlayers([]);
          setCurrentQuestion(null);
          setGameResults(null);
          setWaitingMessage(data.message || 'Yeni oyun bekleniyor.');
          setLastAnswerResult(null);
          setIsPlayerReady(false);
          // Belki oyuncu adını da sıfırlamak istenir?
          // setPlayerName('');
      });

      // Başlangıç durumunu alma
      newSocket.on('initial_state', (data) => {
            console.log('Başlangıç durumu alındı:', data);
            setGameState(data.gameState);
            setPlayers(data.players || []);
            // Eğer bekleme durumundaysa ve oyuncu listedeyse, hazır durumunu al
            const myPlayerData = data.players.find(p => p.id === newSocket.id);
            if (myPlayerData && data.gameState === GAME_STATES.WAITING_TOURNAMENT) {
                setIsPlayerReady(myPlayerData.isReady);
            } else {
                setIsPlayerReady(false); // Diğer durumlarda hazır değil
            }
        });

    // Component unmount olduğunda temizlik
    return () => { newSocket.disconnect(); };
  }, []);


  // --- Turnuva Olay Dinleyicileri ---
  useEffect(() => {
    if (!socket) return; // Socket yoksa dinleyici ekleme

    // Turnuva durumu güncellendiğinde
    const handleStateUpdate = (data) => {
        console.log('Turnuva Durumu Güncellemesi:', data);
        setGameState(data.gameState);
        setPlayers(data.players || []); // Oyuncu listesini güncelle (sıralı gelmeli)
        // Gelen soru index'i mevcut soru index'inden farklıysa, cevap sonucunu temizle
        if (currentQuestion && data.currentQuestionIndex !== currentQuestion.index) {
             setLastAnswerResult(null);
        }
         // Bekleme durumundaysa kendi hazır durumunu güncelle
         if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) {
             setWaitingMessage(''); // Belki backend mesajı kullanılır?
             const myPlayerData = data.players.find(p => p.id === socket.id);
             setIsPlayerReady(myPlayerData ? myPlayerData.isReady : false);
         }
         // Oyun başlayınca hazır durumunu false yap
         if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) {
             setIsPlayerReady(false);
         }
         // Oyun çalışmıyorsa timer'ı temizle
         if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING){
            if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
         }
    };

    // Yeni soru geldiğinde
    const handleNewQuestion = (questionData) => {
        console.log('Yeni Soru Geldi:', questionData);
        setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); // answered/timedOut state'i ekle
        setGameResults(null); // Yeni soru gelince eski sonuçları temizle
        setLastAnswerResult(null); // Yeni soru gelince eski cevap sonucunu temizle
        setGameState(GAME_STATES.TOURNAMENT_RUNNING); // Durumu RUNNING yap

        // Zamanlayıcıyı başlat/sıfırla
        if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
        let timeLeft = questionData.timeLimit;
        setTimeRemaining(timeLeft); // Başlangıç süresini ayarla
        questionTimerIntervalRef.current = setInterval(() => {
             setTimeRemaining(prevTime => {
                 if (prevTime <= 1) {
                     clearInterval(questionTimerIntervalRef.current);
                     return 0;
                 }
                 return prevTime - 1;
             });
        }, 1000);
    };

    // Soru süresi dolduğunda
     const handleQuestionTimeout = (data) => {
         console.log(`Soru ${data.questionIndex + 1} için süre doldu.`);
         if (currentQuestion && data.questionIndex === currentQuestion.index) {
             setCurrentQuestion(prev => ({...prev, timedOut: true})); // Soruyu zaman aşımına uğradı olarak işaretle
             // Geçerli skoru almak için players state'ini kullan
              const currentPlayerScore = players.find(p => p.id === socket?.id)?.score || 0;
             setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore });
         }
         if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
     };

    // Cevap sonucu geldiğinde
     const handleAnswerResult = (data) => {
         console.log('Cevap Sonucu:', data);
         // Sadece ilgili soru için sonucu güncelle
         if (currentQuestion && data.questionIndex === currentQuestion.index) {
             setLastAnswerResult(data);
         }
     };

    // Oyun bittiğinde sonuçlar geldiğinde
    const handleGameOver = (data) => {
        console.log('Oyun Bitti! Sonuçlar:', data.results);
        setGameState(GAME_STATES.GAME_OVER);
        setCurrentQuestion(null); // Aktif soruyu temizle
        setGameResults(data.results);
        setLastAnswerResult(null);
        if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
    };

     // Bekleme durumu mesajı
     const handleWaitingUpdate = (data) => {
         console.log('Bekleme Güncellemesi:', data.message);
         if (gameState === GAME_STATES.WAITING_TOURNAMENT) {
            setWaitingMessage(data.message);
         }
     };

     // Öne çıkan mesajlar geldiğinde
     const handleHighlight = (data) => {
         console.log('Highlight Geldi:', data.messages);
         setHighlightMessages(data.messages || []);
         // Mesajları birkaç saniye sonra temizle
         setTimeout(() => {
             setHighlightMessages(prev => prev.filter(m => data.messages.includes(m))); // Sadece yeni gelenleri tutarak temizleme (daha akıcı olabilir)
             // Veya basitçe: setHighlightMessages([]);
         }, 6000); // 6 saniye göster
     };


    // Dinleyicileri ekle
    socket.on('tournament_state_update', handleStateUpdate);
    socket.on('new_question', handleNewQuestion);
    socket.on('question_timeout', handleQuestionTimeout);
    socket.on('answer_result', handleAnswerResult);
    socket.on('game_over', handleGameOver);
    socket.on('waiting_update', handleWaitingUpdate);
    socket.on('game_highlight', handleHighlight);

    // Component unmount olduğunda veya socket değiştiğinde dinleyicileri kaldır
    return () => {
      socket.off('tournament_state_update', handleStateUpdate);
      socket.off('new_question', handleNewQuestion);
      socket.off('question_timeout', handleQuestionTimeout);
      socket.off('answer_result', handleAnswerResult);
      socket.off('game_over', handleGameOver);
      socket.off('waiting_update', handleWaitingUpdate);
      socket.off('game_highlight', handleHighlight);
      if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); // Interval'i temizle
    };
    // players state'i değiştiğinde useEffect'in tekrar çalışmasına gerek yok,
    // state_update zaten gerekli güncellemeyi tetikliyor.
  }, [socket, gameState, currentQuestion]);

  // --- Kullanıcı Eylemleri ---
  const handleJoinTournament = useCallback(() => { if (socket && isConnected && playerName.trim()) { console.log(`'${playerName}' ismiyle join_tournament gönderiliyor...`); socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { console.log("Socket bağlı değil."); setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { console.log(`Cevap gönderiliyor: Soru ${currentQuestion.index + 1}, Cevap: ${answer}`); socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { console.log("'player_ready' olayı gönderiliyor..."); socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);


  // --- Render Fonksiyonları (JSX) ---
  // PlayerList: Sıralı ve hazır durumu gösteriyor
  const PlayerList = () => (
      <div className="player-list">
          <h3>Oyuncular ({players.length})</h3>
          {/* Skora göre sıralı listeyi kullan */}
          <ol>
              {players.map((p, index) => (
                  <li key={p.id} style={p.id === socket?.id ? { fontWeight: 'bold', color: 'dodgerblue' } : {}}>
                      <span className="rank">{index + 1}.</span> {p.name}: {p.score} puan {gameState === GAME_STATES.WAITING_TOURNAMENT ? (p.isReady ? '✅' : '⏳') : ''}
                  </li>
              ))}
          </ol>
      </div>
  );

   // QuestionDisplay: Cevap sonucunu daha detaylı gösteriyor
   const QuestionDisplay = () => {
       if (!currentQuestion) return null;
       const { index, total, text, options, answered, timedOut } = currentQuestion;
       // Sadece ilgili soruya ait cevap sonucunu kullan
       const relevantResult = (lastAnswerResult && lastAnswerResult.questionIndex === index) ? lastAnswerResult : null;
       const showFeedback = !!relevantResult; // relevantResult null değilse göster

       return (
           <div className="question-display">
               <h3>Soru {index + 1} / {total} <span className="timer">(Kalan Süre: {timeRemaining}sn)</span></h3>
               <p className="question-text">{text}</p>
               <div className="options">
                   {options.map((option, i) => (
                       <button
                           key={i}
                           onClick={() => handleAnswerSubmit(option)}
                           disabled={answered || timedOut}
                       >
                           {option}
                       </button>
                   ))}
               </div>
               {/* Cevap sonucu göstergesi */}
               {showFeedback && (
                   <p className={`answer-feedback ${relevantResult.correct ? 'correct' : (relevantResult.timeout ? 'timeout' : 'incorrect')}`}>
                       {relevantResult.timeout ? 'Süre Doldu!' : (relevantResult.correct ? `Doğru! +${relevantResult.pointsAwarded || 0} Puan` : 'Yanlış!')}
                       {/* Kombo mesajı (eğer varsa) */}
                       {(relevantResult.correct && relevantResult.combo > 1) ? ` (${relevantResult.combo}x Kombo! 🔥)` : ''}
                       {relevantResult.comboBroken ? ' (Kombo Bozuldu!)' : ''}
                   </p>
               )}
           </div>
       );
   };

   const ResultsDisplay = () => { if (!gameResults) return null; return (<div className="results-display"><h2>Oyun Bitti! Sonuçlar:</h2><ol>{gameResults.map((result, i) => (<li key={result.id} style={result.id === socket?.id ? { fontWeight: 'bold' } : {}}>{i + 1}. {result.name} - {result.score} puan</li>))}</ol><p>{waitingMessage || 'Yeni oyun yakında başlayabilir...'}</p></div> ); };

   // Highlight Gösterim Alanı
   const HighlightsDisplay = () => {
       // Oyun durumuna göre göster/gizle (örn: sadece WAITING veya RUNNING sırasında)
       if (highlightMessages.length === 0 || (gameState !== GAME_STATES.WAITING_TOURNAMENT && gameState !== GAME_STATES.TOURNAMENT_RUNNING)) return null;
       return (
           <div className="highlights-area">
               {highlightMessages.map((msg, index) => (
                   <p key={index}>✨ {msg} ✨</p>
               ))}
           </div>
       );
   };


  // Ana Render
  return (
    <div className="App">
      <h1>Asrın Oyunu - Turnuva Modu</h1>
      <p>Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''}</p>
      <hr />

      {/* IDLE veya Bağlı Değil veya Reset Sonrası: Katılma Ekranı */}
      {(!isConnected || gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) && (
          <div className="join-section">
              <h3>Turnuvaya Katıl</h3>
              <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="İsminizi Girin" maxLength={20} disabled={!isConnected} />
              <button onClick={handleJoinTournament} disabled={!isConnected || !playerName.trim()}>Katıl</button>
              {/* IDLE durumundayken waiting message yerine genel bir mesaj olabilir */}
              <p>{gameState === GAME_STATES.IDLE ? (waitingMessage || 'Turnuvaya katılmak için isim girin.') : ''}</p>
          </div>
      )}

      {/* WAITING: Bekleme Ekranı */}
      {gameState === GAME_STATES.WAITING_TOURNAMENT && players.find(p=>p.id === socket?.id) && (
          <div className="waiting-section">
              <h2>Oyuncular Bekleniyor...</h2>
              <PlayerList />
              <button onClick={handlePlayerReady} disabled={isPlayerReady} className={`ready-button ${isPlayerReady ? 'ready' : ''}`}>
                  {isPlayerReady ? 'Hazırsın!' : 'Hazırım'}
              </button>
               <p>{waitingMessage}</p>
               <HighlightsDisplay />
          </div>
      )}

      {/* RUNNING: Oyun Ekranı */}
      {gameState === GAME_STATES.TOURNAMENT_RUNNING && (
          <div className="game-running-section">
              <PlayerList />
              <QuestionDisplay />
              <HighlightsDisplay />
          </div>
      )}

      {/* GAME_OVER: Sonuç Ekranı */}
      {gameState === GAME_STATES.GAME_OVER && (
          <div className="game-over-section">
              <ResultsDisplay />
              {/* Sunucudan reset beklenmeli, buton belki gereksiz */}
               {/* <button onClick={() => { setGameState(GAME_STATES.IDLE); setWaitingMessage('Yeni oyun bekleniyor.'); setIsPlayerReady(false); }}>
                   Ana Ekrana Dön
               </button> */}
          </div>
      )}

    </div>
  );
}

export default App;
