import { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
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
  const [players, setPlayers] = useState([]); // Turnuvadaki oyuncular {id, name, score}
  const [currentQuestion, setCurrentQuestion] = useState(null); // Aktif soru {index, total, text, options, timeLimit}
  const [gameResults, setGameResults] = useState(null); // Oyun sonu sonuçları [{id, name, score}, ...]
  const [waitingMessage, setWaitingMessage] = useState(''); // Bekleme ekranı mesajı
  const [lastAnswerResult, setLastAnswerResult] = useState(null); // Cevap sonucu {correct, score, questionIndex, timeout}
  const [timeRemaining, setTimeRemaining] = useState(0); // Soru için kalan süre göstergesi

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
    });
    newSocket.on("connect_error", (err) => { console.error("Bağlantı hatası:", err.message); setConnectionMessage(`Bağlantı hatası: ${err.message}`); setIsConnected(false); });
    newSocket.on("disconnect", (reason) => { console.log("Bağlantı kesildi:", reason); setConnectionMessage('Bağlantı kesildi.'); setIsConnected(false); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); });

     newSocket.on('error_message', (data) => {
         console.error("Sunucudan Hata:", data.message);
         alert(`Sunucu Hatası: ${data.message}`);
     });

      newSocket.on('reset_game', (data) => {
          console.log("Oyun sıfırlandı:", data.message);
          setGameState(GAME_STATES.IDLE);
          setPlayers([]);
          setCurrentQuestion(null);
          setGameResults(null);
          setWaitingMessage(data.message || 'Yeni oyun bekleniyor.');
          setLastAnswerResult(null);
          // Belki oyuncu adını da sıfırlamak istenir?
          // setPlayerName('');
      });


    return () => { newSocket.disconnect(); };
  }, []);


  // --- Turnuva Olay Dinleyicileri ---
  useEffect(() => {
    if (!socket) return;

    const handleStateUpdate = (data) => {
        console.log('Turnuva Durumu Güncellemesi:', data);
        setGameState(data.gameState);
        setPlayers(data.players || []);
        if (data.currentQuestionIndex === -1) { // Oyun başlamadı veya bitti
            setCurrentQuestion(null);
        }
        // Eğer state WAITING ise waitingMessage'ı temizleyebiliriz, çünkü oyuncu listesi gösterilecek
        if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) {
            setWaitingMessage(''); // Belki backend'den gelen mesaj kullanılır
        }
    };

    const handleNewQuestion = (questionData) => {
        console.log('Yeni Soru Geldi:', questionData);
        setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); // answered/timedOut state'i ekle
        setGameResults(null);
        setLastAnswerResult(null);
        setGameState(GAME_STATES.TOURNAMENT_RUNNING);

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

     const handleQuestionTimeout = (data) => {
         console.log(`Soru ${data.questionIndex + 1} için süre doldu.`);
         if (currentQuestion && data.questionIndex === currentQuestion.index) {
             setCurrentQuestion(prev => ({...prev, timedOut: true}));
             setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex });
         }
         if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
     };

     const handleAnswerResult = (data) => {
         console.log('Cevap Sonucu:', data);
         setLastAnswerResult(data);
     };

    const handleGameOver = (data) => {
        console.log('Oyun Bitti! Sonuçlar:', data.results);
        setGameState(GAME_STATES.GAME_OVER);
        setCurrentQuestion(null);
        setGameResults(data.results);
        setLastAnswerResult(null);
        if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
    };

     const handleWaitingUpdate = (data) => {
         console.log('Bekleme Güncellemesi:', data.message);
         if (gameState === GAME_STATES.WAITING_TOURNAMENT) {
            setWaitingMessage(data.message);
         }
     };

    socket.on('tournament_state_update', handleStateUpdate);
    socket.on('new_question', handleNewQuestion);
    socket.on('question_timeout', handleQuestionTimeout);
    socket.on('answer_result', handleAnswerResult);
    socket.on('game_over', handleGameOver);
    socket.on('waiting_update', handleWaitingUpdate);

    return () => {
      socket.off('tournament_state_update', handleStateUpdate);
      socket.off('new_question', handleNewQuestion);
      socket.off('question_timeout', handleQuestionTimeout);
      socket.off('answer_result', handleAnswerResult);
      socket.off('game_over', handleGameOver);
      socket.off('waiting_update', handleWaitingUpdate);
      if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current);
    };
  }, [socket, gameState, currentQuestion]); // Bağımlılıkları kontrol et

  // --- Kullanıcı Eylemleri ---
  const handleJoinTournament = useCallback(() => {
    if (socket && isConnected && playerName.trim()) {
      console.log(`'${playerName}' ismiyle join_tournament gönderiliyor...`);
      socket.emit('join_tournament', { name: playerName.trim() });
      setWaitingMessage('Sunucuya katılım isteği gönderildi...'); // Geçici mesaj
    } else if (!playerName.trim()) {
        alert('Lütfen katılmak için bir isim girin.');
    } else { console.log("Socket bağlı değil."); setConnectionMessage('Önce sunucuya bağlanmalısınız.'); }
  }, [socket, isConnected, playerName]);

  const handleAnswerSubmit = useCallback((answer) => {
      if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) {
          console.log(`Cevap gönderiliyor: Soru ${currentQuestion.index + 1}, Cevap: ${answer}`);
          socket.emit('submit_answer', {
              questionIndex: currentQuestion.index,
              answer: answer
          });
           setCurrentQuestion(prev => ({...prev, answered: true})); // Cevaplandı olarak işaretle
      }
  }, [socket, gameState, currentQuestion]);

  // --- Render Fonksiyonları (JSX) ---
  const PlayerList = () => ( /* ... önceki kod ... */ <div className="player-list"><h3>Oyuncular ({players.length})</h3><ul>{players.map(p => (<li key={p.id} style={p.id === socket?.id ? { fontWeight: 'bold' } : {}}>{p.name}: {p.score} puan</li>))}</ul></div> );

  const QuestionDisplay = () => {
      if (!currentQuestion) return null;
      const { index, total, text, options, timeLimit, answered, timedOut } = currentQuestion;
      const showFeedback = lastAnswerResult && lastAnswerResult.questionIndex === index;
      return (/* ... önceki kod ... */ <div className="question-display"><h3>Soru {index + 1} / {total} <span className="timer">(Kalan Süre: {timeRemaining}sn)</span></h3><p className="question-text">{text}</p><div className="options">{options.map((option, i) => (<button key={i} onClick={() => handleAnswerSubmit(option)} disabled={answered || timedOut} >{option}</button>))}</div> {showFeedback && (<p className={`answer-feedback ${lastAnswerResult.correct ? 'correct' : (lastAnswerResult.timeout ? 'timeout' : 'incorrect')}`}>{lastAnswerResult.timeout ? 'Süre Doldu!' : (lastAnswerResult.correct ? 'Doğru!' : 'Yanlış!')}</p>)}</div> );
  };

   const ResultsDisplay = () => { /* ... önceki kod ... */ if (!gameResults) return null; return (<div className="results-display"><h2>Oyun Bitti! Sonuçlar:</h2><ol>{gameResults.map((result, i) => (<li key={result.id} style={result.id === socket?.id ? { fontWeight: 'bold' } : {}}>{i + 1}. {result.name} - {result.score} puan</li>))}</ol><p>{waitingMessage || 'Yeni oyun yakında başlayabilir...'}</p></div> ); };

  // Ana Render
  return ( /* ... önceki kod ... */ <div className="App"><h1>Asrın Oyunu - Turnuva Modu</h1><p>Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''}</p><hr /> {(!isConnected || gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) && (<div className="join-section"><h3>Turnuvaya Katıl</h3><input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="İsminizi Girin" maxLength={20} disabled={!isConnected} /><button onClick={handleJoinTournament} disabled={!isConnected || !playerName.trim()}>Katıl</button><p>{waitingMessage}</p></div>)} {gameState === GAME_STATES.WAITING_TOURNAMENT && players.find(p=>p.id === socket?.id) && (<div className="waiting-section"><h2>Rakip(ler) Bekleniyor...</h2><p>{waitingMessage}</p><PlayerList /></div>)} {gameState === GAME_STATES.TOURNAMENT_RUNNING && (<div className="game-running-section"><PlayerList /><QuestionDisplay /></div>)} {gameState === GAME_STATES.GAME_OVER && (<div className="game-over-section"><ResultsDisplay /></div>)} </div> );
}

export default App;
