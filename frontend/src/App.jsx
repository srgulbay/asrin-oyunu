import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import './App.css';
import { io } from "socket.io-client";

// --- MUI Imports ---
import { ThemeProvider } from '@mui/material/styles'; // ThemeProvider kaldırılmıştı, geri ekleyelim (App seviyesinde)
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Box from '@mui/material/Box';
import Grid from '@mui/material/Grid';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
// --- Framer Motion Imports ---
import { motion, AnimatePresence } from 'framer-motion'; // Eklendi
// --- Component Imports ---
import JoinScreen from './components/JoinScreen';
import WaitingLobby from './components/WaitingLobby';
import GameInterface from './components/GameInterface';
import ResultsScreen from './components/ResultsScreen';
import PlayerList from './components/PlayerList';
import AnnouncerLog from './components/AnnouncerLog';
import createAppTheme from './theme';

const SERVER_URL = import.meta.env.VITE_BACKEND_URL;
const GAME_STATES = { IDLE: 'idle', WAITING_TOURNAMENT: 'waiting_tournament', TOURNAMENT_RUNNING: 'tournament_running', GAME_OVER: 'game_over' };
const MAX_LOG_MESSAGES = 20;

function App() {
  // State Hookları... (önceki gibi)
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState('Sunucuya bağlanılıyor...');
  const [playerName, setPlayerName] = useState('');
  const [gameState, setGameState] = useState(GAME_STATES.IDLE);
  const [players, setPlayers] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameResults, setGameResults] = useState(null);
  const [waitingMessage, setWaitingMessage] = useState('');
  const [lastAnswerResult, setLastAnswerResult] = useState(null);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [announcerLog, setAnnouncerLog] = useState([]);
  const [mode, setMode] = useState('light');
  const questionTimerIntervalRef = useRef(null);

  // Tema Modu... (önceki gibi)
  useEffect(() => { const currentHour = new Date().getHours(); const calculatedMode = (currentHour >= 18 || currentHour < 6) ? 'dark' : 'light'; setMode(calculatedMode); }, []);
  const theme = useMemo(() => createAppTheme(mode), [mode]);

  // Socket Bağlantısı ve Olayları... (önceki gibi)
  useEffect(() => {
      if (!SERVER_URL) { console.error("HATA: VITE_BACKEND_URL tanımlanmamış!"); setConnectionMessage('HATA: Backend adresi yapılandırılmamış!'); return; }
      const newSocket = io(SERVER_URL, { transports: ['websocket', 'polling'] }); setSocket(newSocket);
      newSocket.on("connect", () => { setIsConnected(true); setConnectionMessage('Sunucuya Bağlandı.'); console.log("Socket ID:", newSocket.id);}); newSocket.on("connect_error", (err) => { setIsConnected(false); setConnectionMessage(`Bağlantı hatası: ${err.message}`); console.error("Bağlantı hatası detayı:", err);}); newSocket.on("disconnect", (reason) => { setIsConnected(false); setConnectionMessage('Bağlantı kesildi.'); setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setIsPlayerReady(false); setAnnouncerLog([]); console.log("Disconnect sebebi:", reason); }); newSocket.on('error_message', (data) => { alert(`Sunucu Hatası: ${data.message}`); }); newSocket.on('reset_game', (data) => { setGameState(GAME_STATES.IDLE); setPlayers([]); setCurrentQuestion(null); setGameResults(null); setWaitingMessage(data.message || 'Yeni oyun bekleniyor.'); setLastAnswerResult(null); setIsPlayerReady(false); setAnnouncerLog( prev => [{id: crypto.randomUUID(), text: data.message || 'Yeni oyun bekleniyor.', type:'info', timestamp: Date.now()}, ...prev].slice(0, MAX_LOG_MESSAGES) ); }); newSocket.on('initial_state', (data) => { setGameState(data.gameState); setPlayers(data.players || []); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); setAnnouncerLog([]); });
      const handleStateUpdate = (data) => { setGameState(data.gameState); setPlayers(data.players || []); if (data.currentQuestionIndex === -1) setCurrentQuestion(null); if (data.gameState === GAME_STATES.WAITING_TOURNAMENT) { setWaitingMessage(''); const myPlayer = data.players.find(p => p.id === newSocket.id); setIsPlayerReady(myPlayer?.isReady || false); } if (data.gameState === GAME_STATES.TOURNAMENT_RUNNING) setIsPlayerReady(false); if (data.gameState !== GAME_STATES.TOURNAMENT_RUNNING) if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleNewQuestion = (questionData) => { setCurrentQuestion({ ...questionData, answered: false, timedOut: false }); setGameResults(null); setLastAnswerResult(null); setGameState(GAME_STATES.TOURNAMENT_RUNNING); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); let timeLeft = questionData.timeLimit; setTimeRemaining(timeLeft); questionTimerIntervalRef.current = setInterval(() => { setTimeRemaining(prevTime => { if (prevTime <= 1) { clearInterval(questionTimerIntervalRef.current); return 0; } return prevTime - 1; }); }, 1000); }; const handleQuestionTimeout = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) { setCurrentQuestion(prev => ({...prev, timedOut: true})); const currentPlayerScore = players.find(p => p.id === newSocket?.id)?.score || 0; setLastAnswerResult({ timeout: true, questionIndex: data.questionIndex, correct: false, score: currentPlayerScore }); } if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleAnswerResult = (data) => { if (currentQuestion && data.questionIndex === currentQuestion.index) setLastAnswerResult(data); }; const handleGameOver = (data) => { setGameState(GAME_STATES.GAME_OVER); setCurrentQuestion(null); setGameResults(data.results); setLastAnswerResult(null); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); }; const handleWaitingUpdate = (data) => { if (gameState === GAME_STATES.WAITING_TOURNAMENT) setWaitingMessage(data.message); }; const handleAnnouncerMessage = (newMessage) => { setAnnouncerLog(prevLog => [{...newMessage, id: newMessage.id || crypto.randomUUID() }, ...prevLog].slice(0, MAX_LOG_MESSAGES)); };
      newSocket.on('tournament_state_update', handleStateUpdate); newSocket.on('new_question', handleNewQuestion); newSocket.on('question_timeout', handleQuestionTimeout); newSocket.on('answer_result', handleAnswerResult); newSocket.on('game_over', handleGameOver); newSocket.on('waiting_update', handleWaitingUpdate); newSocket.on('announcer_message', handleAnnouncerMessage);
      return () => { newSocket.off('tournament_state_update', handleStateUpdate); newSocket.off('new_question', handleNewQuestion); newSocket.off('question_timeout', handleQuestionTimeout); newSocket.off('answer_result', handleAnswerResult); newSocket.off('game_over', handleGameOver); newSocket.off('waiting_update', handleWaitingUpdate); newSocket.off('announcer_message', handleAnnouncerMessage); if(questionTimerIntervalRef.current) clearInterval(questionTimerIntervalRef.current); newSocket.disconnect(); };
  }, []);

  // Kullanıcı Eylemleri... (önceki gibi)
  const handleJoinTournament = useCallback(() => { /* ... */ if (socket && isConnected && playerName.trim()) { socket.emit('join_tournament', { name: playerName.trim() }); setWaitingMessage('Sunucuya katılım isteği gönderildi...'); setIsPlayerReady(false); } else if (!playerName.trim()){ alert('Lütfen katılmak için bir isim girin.'); } else { setConnectionMessage('Önce sunucuya bağlanmalısınız.'); } }, [socket, isConnected, playerName]);
  const handleAnswerSubmit = useCallback((answer) => { /* ... */ if (socket && gameState === GAME_STATES.TOURNAMENT_RUNNING && currentQuestion && !currentQuestion.answered && !currentQuestion.timedOut) { socket.emit('submit_answer', { questionIndex: currentQuestion.index, answer: answer }); setCurrentQuestion(prev => ({...prev, answered: true})); } }, [socket, gameState, currentQuestion]);
  const handlePlayerReady = useCallback(() => { /* ... */ if (socket && isConnected && gameState === GAME_STATES.WAITING_TOURNAMENT && !isPlayerReady) { socket.emit('player_ready'); setIsPlayerReady(true); setWaitingMessage('Hazır olduğunuz belirtildi. Diğerleri bekleniyor...'); } }, [socket, isConnected, gameState, isPlayerReady]);

  // Render Edilecek Component'i Belirleme... (önceki gibi)
  const renderCurrentScreen = () => {
       if (!isConnected && connectionMessage.includes('Bağlantı hatası')) { return <Typography color="error" align="center" sx={{ mt: 2}}>{connectionMessage}</Typography>; }
       if (!isConnected) { return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>; }
       if (gameState === GAME_STATES.IDLE || (gameState === GAME_STATES.WAITING_TOURNAMENT && !players.find(p=>p.id === socket?.id))) { return <JoinScreen playerName={playerName} setPlayerName={setPlayerName} handleJoinTournament={handleJoinTournament} isConnected={isConnected} waitingMessage={waitingMessage}/>; }
       if (gameState === GAME_STATES.WAITING_TOURNAMENT) { return <WaitingLobby players={players} handlePlayerReady={handlePlayerReady} isPlayerReady={isPlayerReady} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       if (gameState === GAME_STATES.TOURNAMENT_RUNNING) { return <GameInterface currentQuestion={currentQuestion} timeRemaining={timeRemaining} handleAnswerSubmit={handleAnswerSubmit} lastAnswerResult={lastAnswerResult}/>; }
       if (gameState === GAME_STATES.GAME_OVER) { return <ResultsScreen gameResults={gameResults} waitingMessage={waitingMessage} currentSocketId={socket?.id}/>; }
       return <Box sx={{ display: 'flex', justifyContent: 'center', padding: 5 }}><CircularProgress /></Box>;
  };

  // === Ana Render - GÜNCELLENDİ (AnimatePresence Eklendi) ===
  const showSidebars = (gameState === GAME_STATES.WAITING_TOURNAMENT || gameState === GAME_STATES.TOURNAMENT_RUNNING || gameState === GAME_STATES.GAME_OVER) && players.length > 0 && isConnected;

  // Animasyon tanımları (Basit fade)
   const screenVariants = {
       hidden: { opacity: 0 },
       visible: { opacity: 1 },
       exit: { opacity: 0 }
   };

  return (
    <ThemeProvider theme={theme}>
       <CssBaseline />
       <Container maxWidth="xl" sx={{ marginTop: 2, paddingBottom: 4 }}>
           <Box sx={{ textAlign: 'center', marginBottom: 2 }}>
               <Typography variant="h1" component="h1" gutterBottom> Asrın Oyunu </Typography>
               <Typography variant="subtitle1" color="text.secondary"> Bağlantı: {connectionMessage} {isConnected ? `(ID: ${socket?.id})` : ''} </Typography>
           </Box>
           <hr />
           <Grid container spacing={2} sx={{ marginTop: 2 }} alignItems="flex-start">
               {/* Sol Sidebar */}
               {showSidebars && (
                   <Grid xs={12} md={3} order={{ xs: 2, md: 1 }}>
                        <Box sx={{ position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                           <Paper variant="outlined" sx={{ p: 1, height: '100%' }}>
                               <PlayerList players={players} gameState={gameState} currentSocketId={socket?.id} />
                           </Paper>
                        </Box>
                   </Grid>
               )}
                {/* Orta Alan */}
                 <Grid xs={12} md={ showSidebars ? 6 : 12 } order={{ xs: 1, md: 2 }} >
                   <Box sx={{ position: 'relative' /* AnimatePresence için gerekli olabilir */ }}>
                       {/* AnimatePresence ile ekran geçişlerini anime et */}
                       <AnimatePresence mode="wait">
                           {/* Render edilen component'i motion.div ile sarmala */}
                           <motion.div
                               key={gameState} // Oyun durumu değiştiğinde animasyon tetiklenir
                               variants={screenVariants}
                               initial="hidden"
                               animate="visible"
                               exit="exit"
                               transition={{ duration: 0.3 }}
                           >
                               {renderCurrentScreen()}
                           </motion.div>
                       </AnimatePresence>
                   </Box>
                </Grid>
               {/* Sağ Sidebar */}
               {showSidebars && (
                   <Grid xs={12} md={3} order={{ xs: 3, md: 3 }}>
                         <Box sx={{ position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
                           <Paper variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                             <AnnouncerLog announcerLog={announcerLog} />
                           </Paper>
                         </Box>
                   </Grid>
               )}
           </Grid>
        </Container>
    </ThemeProvider>
  );
}

export default App;
