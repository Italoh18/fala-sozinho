import React, { useState, useEffect, useMemo } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { AppState, Scenario, FeedbackResult, SessionHistoryItem } from './types';
import { SCENARIOS, GENERIC_TEXTS } from './constants';
import { ScenarioCard } from './components/ScenarioCard';
import { Visualizer } from './components/Visualizer';
import { useGeminiLive } from './hooks/useGeminiLive';

const App: React.FC = () => {
  const [currentState, setCurrentState] = useState<AppState>(AppState.LANDING);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResult | null>(null);
  const [history, setHistory] = useState<SessionHistoryItem[]>([]);
  
  // Text Handling
  const [readingText, setReadingText] = useState<string>('');
  const [textMode, setTextMode] = useState<'generic' | 'custom'>('generic');

  // Load History on Mount
  useEffect(() => {
    const saved = localStorage.getItem('falaSozinhoHistory');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse history", e);
      }
    }
  }, []);

  // Compute final system instruction including the text context
  const effectiveSystemInstruction = useMemo(() => {
    if (!selectedScenario) return '';
    let instruction = selectedScenario.systemInstruction;
    
    if (readingText.trim()) {
      instruction += `\n\nCONTEXTO ADICIONAL: O usuário tentará ler o seguinte texto para você: "${readingText}".
      Seu objetivo é interrompê-lo, questionar pontos desse texto ou duvidar do que ele está lendo, forçando-o a sair do roteiro.`;
    }
    return instruction;
  }, [selectedScenario, readingText]);

  const { connect, disconnect, getTranscript, isConnected, isTalking, volume } = useGeminiLive({
    systemInstruction: effectiveSystemInstruction,
    onDisconnect: () => {
       // Handled in End Session manually
    }
  });

  // Timer for session
  useEffect(() => {
    let interval: number;
    if (currentState === AppState.SESSION && isConnected) {
      interval = window.setInterval(() => {
        setSessionDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [currentState, isConnected]);

  // Step 1: Select Scenario
  const handleSelectScenario = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setReadingText(''); // Reset text
    setCurrentState(AppState.CONFIGURING);
  };

  // Step 2: Confirm Configuration and Start
  const handleProceedToSession = () => {
    setCurrentState(AppState.SESSION);
    setSessionDuration(0);
    setFeedbackResult(null);
  };

  const saveToHistory = (result: FeedbackResult, duration: number, scenarioTitle: string) => {
    const newItem: SessionHistoryItem = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      scenarioTitle,
      durationSeconds: duration,
      feedback: result
    };
    
    const updatedHistory = [newItem, ...history];
    setHistory(updatedHistory);
    localStorage.setItem('falaSozinhoHistory', JSON.stringify(updatedHistory));
  };

  const handleEndSession = async () => {
    const transcript = getTranscript();
    disconnect();
    setCurrentState(AppState.ANALYZING);

    try {
      if (transcript.length === 0) {
        const fallbackResult: FeedbackResult = {
          clarity: 'Pouco Clara',
          suggestion: 'Nenhuma fala detectada. Verifique seu microfone ou tente falar mais alto.',
          score: 0
        };
        setFeedbackResult(fallbackResult);
        setCurrentState(AppState.FEEDBACK);
        return;
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        Analise a seguinte transcrição de um treino de habilidades sociais.
        O usuário estava treinando: ${selectedScenario?.title}.
        ${readingText ? `O usuário estava tentando ler este texto: "${readingText}"` : ''}
        
        TRANSCRIÇÃO:
        ${JSON.stringify(transcript)}

        TAREFA:
        1. Avalie a clareza da fala.
        2. Dê uma nota de 1 a 10 para o desempenho geral (considerando confiança, clareza e reação às interrupções).
        3. Dê uma sugestão breve.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              clarity: {
                type: Type.STRING,
                enum: ['Clara', 'Pouco Clara', 'Muito Clara']
              },
              score: {
                type: Type.INTEGER,
                description: "Nota de 1 a 10"
              },
              suggestion: {
                type: Type.STRING
              }
            },
            required: ['clarity', 'suggestion', 'score']
          }
        }
      });

      const result = response.text ? JSON.parse(response.text) : null;
      
      const finalResult = result || {
        clarity: 'Pouco Clara',
        suggestion: 'Não foi possível gerar análise detalhada.',
        score: 5
      };

      setFeedbackResult(finalResult);
      if (selectedScenario) {
        saveToHistory(finalResult, sessionDuration, selectedScenario.title);
      }

    } catch (e) {
      console.error("Feedback generation error:", e);
      const errorResult: FeedbackResult = {
        clarity: 'Pouco Clara',
        suggestion: 'Erro ao analisar áudio. Tente falar mais devagar.',
        score: 0
      };
      setFeedbackResult(errorResult);
    }

    setCurrentState(AppState.FEEDBACK);
  };

  const handleReset = () => {
    disconnect();
    setSelectedScenario(null);
    setReadingText('');
    setCurrentState(AppState.LANDING);
  };

  const handleShare = async () => {
    if (!feedbackResult || !selectedScenario) return;

    const shareData = {
      title: 'Fala Sozinho - Meu Resultado',
      text: `Acabei de treinar "${selectedScenario.title}" no app Fala Sozinho. Minha nota foi ${feedbackResult.score}/10! 🗣️🔥`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        console.log('Share canceled');
      }
    } else {
      // Fallback copy to clipboard
      navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
      alert('Link e resultado copiados para a área de transferência!');
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // --- Views ---

  const renderLanding = () => (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <header className="text-center mb-16">
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-6 tracking-tight">
          Fala Sozinho
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 max-w-2xl mx-auto font-light mb-8">
          Treine habilidades sociais com <span className="text-white font-medium">Desconforto Controlado</span>.
          Fale em voz alta e enfrente interrupções e silêncios realistas.
        </p>

        {history.length > 0 && (
          <button 
            onClick={() => setCurrentState(AppState.HISTORY)}
            className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4"
          >
            Ver Histórico de Sessões ({history.length})
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard 
            key={scenario.id} 
            scenario={scenario} 
            onSelect={handleSelectScenario} 
          />
        ))}
      </div>
      
      <footer className="mt-20 text-center text-slate-600 text-sm">
        <p>Requer microfone e API Key configurada. Sem armazenamento de dados em nuvem.</p>
      </footer>
    </div>
  );

  const renderHistory = () => (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <button 
          onClick={() => setCurrentState(AppState.LANDING)}
          className="p-2 rounded-full hover:bg-slate-800 transition-colors"
        >
          ← Voltar
        </button>
        <h2 className="text-3xl font-bold text-white">Histórico</h2>
      </div>

      <div className="space-y-4">
        {history.length === 0 ? (
          <p className="text-slate-500 text-center py-12">Nenhuma sessão registrada ainda.</p>
        ) : (
          history.map((item) => (
            <div key={item.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 flex justify-between items-center hover:bg-slate-800 transition-colors">
               <div>
                  <p className="text-xs text-slate-400 mb-1">{formatDate(item.date)}</p>
                  <h3 className="text-lg font-bold text-white mb-1">{item.scenarioTitle}</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="bg-slate-700 px-2 py-0.5 rounded text-slate-300">⏱️ {formatTime(item.durationSeconds)}</span>
                    <span className={`px-2 py-0.5 rounded ${
                       item.feedback.clarity === 'Muito Clara' ? 'bg-green-900/50 text-green-400' :
                       item.feedback.clarity === 'Clara' ? 'bg-blue-900/50 text-blue-400' :
                       'bg-yellow-900/50 text-yellow-400'
                    }`}>
                      {item.feedback.clarity}
                    </span>
                  </div>
               </div>
               <div className="flex flex-col items-center">
                  <span className="text-3xl font-black text-white">{item.feedback.score}</span>
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest">Nota</span>
               </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderConfiguring = () => (
    <div className="max-w-2xl mx-auto px-4 py-12 min-h-screen flex flex-col">
      <div className="mb-8">
        <button onClick={() => setCurrentState(AppState.LANDING)} className="text-slate-400 hover:text-white mb-4">
          ← Escolher outro cenário
        </button>
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <span>{selectedScenario?.icon}</span>
          {selectedScenario?.title}
        </h2>
        <p className="text-slate-400 mt-2">Configure o material de apoio para sua fala.</p>
      </div>

      <div className="bg-slate-800 rounded-xl p-1 mb-6 flex">
        <button 
          onClick={() => setTextMode('generic')}
          className={`flex-1 py-3 rounded-lg font-medium transition-colors ${textMode === 'generic' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Textos Sugeridos
        </button>
        <button 
          onClick={() => setTextMode('custom')}
          className={`flex-1 py-3 rounded-lg font-medium transition-colors ${textMode === 'custom' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}
        >
          Escrever Texto
        </button>
      </div>

      <div className="flex-1">
        {textMode === 'generic' ? (
          <div className="grid gap-4">
            {GENERIC_TEXTS.map((text) => (
              <div 
                key={text.id}
                onClick={() => setReadingText(text.content)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${readingText === text.content ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500' : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'}`}
              >
                <h4 className="font-bold text-white mb-2">{text.title}</h4>
                <p className="text-slate-400 text-sm line-clamp-2">{text.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full">
            <textarea 
              className="w-full h-64 bg-slate-800 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-none"
              placeholder="Cole ou escreva seu texto aqui (ex: sua apresentação, seu pitch, ou o que pretende falar)..."
              value={readingText}
              onChange={(e) => setReadingText(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-slate-700 pt-6">
        <p className="text-sm text-slate-400 mb-4 text-center">
          {readingText 
            ? "O texto selecionado aparecerá na tela durante a simulação." 
            : "Você iniciará sem texto de apoio (improviso)."}
        </p>
        <button
          onClick={handleProceedToSession}
          className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
        >
          Ir para a Sala de Pressão
        </button>
      </div>
    </div>
  );

  const renderSession = () => {
    if (!selectedScenario) return null;

    return (
      <div className="flex flex-col items-center min-h-screen p-4 relative overflow-hidden">
        {/* Background ambience */}
        <div className={`absolute inset-0 transition-colors duration-1000 ${isTalking ? 'bg-red-900/10' : 'bg-transparent'}`} />

        {/* Header */}
        <div className="z-10 w-full max-w-4xl flex justify-between items-center py-4 px-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{selectedScenario.icon}</span>
            <span className="font-bold text-slate-300 hidden md:inline">{selectedScenario.title}</span>
          </div>
          <div className="font-mono text-xl text-slate-400 bg-slate-800/50 px-3 py-1 rounded-md border border-slate-700">
            {formatTime(sessionDuration)}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="z-10 w-full max-w-4xl flex-1 flex flex-col md:flex-row gap-6 items-center justify-center py-4">
          
          {/* Visualizer Column */}
          <div className="flex flex-col items-center justify-center order-2 md:order-1">
             <div className="relative w-64 h-64 md:w-80 md:h-80 flex items-center justify-center">
              {isConnected ? (
                <>
                   <Visualizer 
                     isActive={true} 
                     volume={isTalking ? 0.8 : volume} 
                     color={isTalking ? '#f87171' : '#22d3ee'} 
                   />
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className={`text-lg font-mono font-bold tracking-widest transition-colors ${isTalking ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
                        {isTalking ? 'INTERROMPENDO...' : 'ESCUTANDO...'}
                      </p>
                   </div>
                </>
              ) : (
                <button 
                  onClick={connect}
                  className="w-48 h-48 rounded-full border-4 border-indigo-500 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-indigo-300 transition-all shadow-[0_0_40px_-10px_rgba(99,102,241,0.5)] active:scale-95"
                >
                  <span className="text-xl font-bold">COMEÇAR</span>
                </button>
              )}
            </div>
             
             {/* Controls */}
             <div className="w-full max-w-xs mt-6">
                <button
                  onClick={handleEndSession}
                  className="w-full px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors border border-slate-600"
                >
                  {isConnected ? 'Parar e Avaliar' : 'Voltar'}
                </button>
             </div>
          </div>

          {/* Text/Script Column */}
          {readingText && (
            <div className="w-full md:w-1/2 h-64 md:h-96 order-1 md:order-2 bg-slate-900/50 border border-slate-700 rounded-xl p-6 overflow-y-auto shadow-inner custom-scrollbar relative">
               <div className="sticky top-0 bg-slate-900/90 backdrop-blur-sm pb-2 mb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Seu Texto de Apoio</span>
               </div>
               <p className="text-lg md:text-xl text-slate-200 leading-relaxed whitespace-pre-wrap font-serif">
                 {readingText}
               </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAnalyzing = () => (
    <div className="flex flex-col items-center justify-center min-h-screen">
       <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-6"></div>
       <h2 className="text-2xl font-bold text-white">Analisando Clareza...</h2>
    </div>
  );

  const renderFeedback = () => (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="mb-8">
        <div className="inline-block p-4 rounded-full bg-green-500/10 mb-4">
          <span className="text-4xl">🏁</span>
        </div>
        <h2 className="text-3xl font-bold text-white mb-4">Sessão Finalizada</h2>
        <p className="text-slate-300">
          Duração: <strong className="text-white">{formatTime(sessionDuration)}</strong>
        </p>
      </div>

      <div className="bg-slate-800 p-8 rounded-2xl border border-slate-700 mb-8 text-left shadow-xl relative overflow-hidden">
        {/* Score Badge */}
        <div className="absolute top-4 right-4 flex flex-col items-center bg-slate-900/50 p-3 rounded-xl border border-slate-700">
            <span className="text-[10px] uppercase tracking-widest text-slate-400">Nota</span>
            <span className={`text-3xl font-black ${
                (feedbackResult?.score || 0) >= 8 ? 'text-green-400' :
                (feedbackResult?.score || 0) >= 5 ? 'text-yellow-400' : 'text-red-400'
            }`}>
                {feedbackResult?.score}<span className="text-lg text-slate-500 font-normal">/10</span>
            </span>
        </div>

        <h3 className="text-xl font-bold text-white mb-6 border-b border-slate-700 pb-4 pr-16">Análise da Fala</h3>
        
        <div className="mb-6">
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Clareza</p>
          <div className="flex items-center gap-3">
             <span className={`text-2xl font-bold ${
               feedbackResult?.clarity === 'Muito Clara' ? 'text-green-400' : 
               feedbackResult?.clarity === 'Clara' ? 'text-blue-400' : 'text-yellow-400'
             }`}>
               {feedbackResult?.clarity}
             </span>
             {feedbackResult?.clarity === 'Muito Clara' && <span>🌟</span>}
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400 mb-1">Sugestão</p>
          <p className="text-lg text-slate-200 leading-relaxed">
            {feedbackResult?.suggestion}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-4 w-full md:w-auto mx-auto">
            <button
                onClick={handleShare}
                className="flex-1 px-6 py-4 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-lg border border-slate-600 transition-all flex items-center justify-center gap-2"
            >
                <span>🔗</span> Compartilhar
            </button>
            <button
                onClick={handleReset}
                className="flex-[2] px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-1"
            >
                Treinar Novamente
            </button>
        </div>
        
        <button
             onClick={() => setCurrentState(AppState.HISTORY)}
             className="text-slate-500 hover:text-slate-300 text-sm mt-4 underline"
        >
            Ver meu histórico
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen text-slate-200 selection:bg-indigo-500/30">
      {currentState === AppState.LANDING && renderLanding()}
      {currentState === AppState.HISTORY && renderHistory()}
      {currentState === AppState.CONFIGURING && renderConfiguring()}
      {currentState === AppState.SESSION && renderSession()}
      {currentState === AppState.ANALYZING && renderAnalyzing()}
      {currentState === AppState.FEEDBACK && renderFeedback()}
    </div>
  );
};

export default App;
