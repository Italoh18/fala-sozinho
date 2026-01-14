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
          score: 0,
          annotatedTranscript: []
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
        
        TRANSCRIÇÃO (role 'user' é o usuário, 'model' é o simulador, 'system' são eventos):
        ${JSON.stringify(transcript)}

        TAREFA:
        1. Avalie a clareza da fala.
        2. Dê uma nota de 1 a 10.
        3. Dê uma sugestão breve.
        4. Gere um "annotatedTranscript": reconstrua o diálogo em ordem cronológica dividindo em blocos.
           - Se o usuário falou de forma fluida, type="user_clear".
           - Se o usuário gaguejou, hesitou muito ou foi confuso, type="user_unclear".
           - Se foi uma fala do simulador ou uma interrupção, type="model".
        Certifique-se de que a lista 'annotatedTranscript' conte a história completa da sessão.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
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
              },
              annotatedTranscript: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    type: { type: Type.STRING, enum: ['user_clear', 'user_unclear', 'model'] }
                  }
                }
              }
            },
            required: ['clarity', 'suggestion', 'score', 'annotatedTranscript']
          }
        }
      });

      const result = response.text ? JSON.parse(response.text) : null;
      
      const finalResult = result || {
        clarity: 'Pouco Clara',
        suggestion: 'Não foi possível gerar análise detalhada.',
        score: 5,
        annotatedTranscript: []
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
        score: 0,
        annotatedTranscript: []
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
        <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 mb-6 tracking-tight drop-shadow-sm">
          Fala Sozinho
        </h1>
        <p className="text-xl md:text-2xl text-slate-300 max-w-2xl mx-auto font-light mb-8 leading-relaxed">
          Treine habilidades sociais com <span className="text-white font-semibold">Desconforto Controlado</span>.
          Fale em voz alta e enfrente interrupções e silêncios realistas.
        </p>

        {history.length > 0 && (
          <button 
            onClick={() => setCurrentState(AppState.HISTORY)}
            className="text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-4 decoration-indigo-500/30 hover:decoration-indigo-400"
          >
            Ver Histórico de Sessões ({history.length})
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-20">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard 
            key={scenario.id} 
            scenario={scenario} 
            onSelect={handleSelectScenario} 
          />
        ))}
      </div>
      
      <footer className="fixed bottom-0 left-0 right-0 p-4 text-center text-slate-500 text-xs bg-slate-900/80 backdrop-blur-sm border-t border-slate-800">
        <p>Requer microfone e API Key configurada. Sem armazenamento de dados em nuvem.</p>
      </footer>
    </div>
  );

  const renderHistory = () => (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8 flex items-center gap-4">
        <button 
          onClick={() => setCurrentState(AppState.LANDING)}
          className="p-2 rounded-full hover:bg-slate-800 transition-colors text-slate-400 hover:text-white"
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
            <div key={item.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 flex justify-between items-center hover:bg-slate-800 transition-colors">
               <div>
                  <p className="text-xs text-slate-400 mb-1">{formatDate(item.date)}</p>
                  <h3 className="text-lg font-bold text-white mb-1">{item.scenarioTitle}</h3>
                  <div className="flex items-center gap-3 text-sm">
                    <span className="bg-slate-700/50 px-2 py-0.5 rounded text-slate-300 border border-slate-600/30">⏱️ {formatTime(item.durationSeconds)}</span>
                    <span className={`px-2 py-0.5 rounded border ${
                       item.feedback.clarity === 'Muito Clara' ? 'bg-green-900/20 text-green-400 border-green-500/20' :
                       item.feedback.clarity === 'Clara' ? 'bg-blue-900/20 text-blue-400 border-blue-500/20' :
                       'bg-yellow-900/20 text-yellow-400 border-yellow-500/20'
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
        <button onClick={() => setCurrentState(AppState.LANDING)} className="text-slate-400 hover:text-white mb-4 transition-colors">
          ← Escolher outro cenário
        </button>
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <span className="text-4xl">{selectedScenario?.icon}</span>
          {selectedScenario?.title}
        </h2>
        <p className="text-slate-400 mt-2 text-lg">Configure o material de apoio para sua fala.</p>
      </div>

      <div className="bg-slate-800/50 rounded-xl p-1 mb-6 flex border border-slate-700/50">
        <button 
          onClick={() => setTextMode('generic')}
          className={`flex-1 py-3 rounded-lg font-medium transition-all ${textMode === 'generic' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
        >
          Textos Sugeridos
        </button>
        <button 
          onClick={() => setTextMode('custom')}
          className={`flex-1 py-3 rounded-lg font-medium transition-all ${textMode === 'custom' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'}`}
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
                className={`p-5 rounded-xl border cursor-pointer transition-all duration-300 ${readingText === text.content ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500 shadow-lg shadow-indigo-500/10' : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800 hover:border-slate-600'}`}
              >
                <h4 className="font-bold text-white mb-2">{text.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{text.content}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full">
            <textarea 
              className="w-full h-64 bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent focus:outline-none resize-none transition-all placeholder:text-slate-600"
              placeholder="Cole ou escreva seu texto aqui (ex: sua apresentação, seu pitch, ou o que pretende falar)..."
              value={readingText}
              onChange={(e) => setReadingText(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="mt-8 border-t border-slate-700/50 pt-6">
        <p className="text-sm text-slate-400 mb-4 text-center">
          {readingText 
            ? "O texto selecionado aparecerá na tela durante a simulação." 
            : "Você iniciará sem texto de apoio (improviso)."}
        </p>
        <button
          onClick={handleProceedToSession}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/25 transition-all active:scale-[0.98] hover:translate-y-[-2px]"
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
        <div className={`absolute inset-0 transition-colors duration-1000 ${isTalking ? 'bg-red-500/5' : 'bg-transparent'}`} />

        {/* Header */}
        <div className="z-10 w-full max-w-4xl flex justify-between items-center py-6 px-2">
          <div className="flex items-center gap-3">
            <span className="text-3xl filter drop-shadow-md">{selectedScenario.icon}</span>
            <span className="font-bold text-slate-200 hidden md:inline text-lg">{selectedScenario.title}</span>
          </div>
          <div className="font-mono text-xl text-indigo-300 bg-slate-800/80 backdrop-blur px-4 py-2 rounded-lg border border-slate-700/50 shadow-sm">
            {formatTime(sessionDuration)}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="z-10 w-full max-w-4xl flex-1 flex flex-col md:flex-row gap-8 items-center justify-center py-4">
          
          {/* Visualizer Column */}
          <div className="flex flex-col items-center justify-center order-2 md:order-1 w-full md:w-auto">
             <div className="relative w-72 h-72 md:w-80 md:h-80 flex items-center justify-center">
              {isConnected ? (
                <>
                   <Visualizer 
                     isActive={true} 
                     volume={isTalking ? 0.8 : volume} 
                     color={isTalking ? '#f87171' : '#22d3ee'} 
                   />
                   <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className={`text-lg font-mono font-bold tracking-widest transition-colors duration-300 ${isTalking ? 'text-red-400 animate-pulse' : 'text-cyan-400'}`}>
                        {isTalking ? 'INTERROMPENDO...' : 'ESCUTANDO...'}
                      </p>
                   </div>
                </>
              ) : (
                <button 
                  onClick={connect}
                  className="group w-56 h-56 rounded-full border-4 border-indigo-500/30 hover:border-indigo-500 flex items-center justify-center bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 hover:text-white transition-all duration-300 shadow-[0_0_60px_-15px_rgba(99,102,241,0.3)] active:scale-95 active:shadow-inner"
                >
                  <div className="text-center">
                    <span className="text-4xl block mb-2 group-hover:scale-110 transition-transform">🎙️</span>
                    <span className="text-xl font-bold tracking-wider">COMEÇAR</span>
                  </div>
                </button>
              )}
            </div>
             
             {/* Controls */}
             <div className="w-full max-w-xs mt-8">
                <button
                  onClick={handleEndSession}
                  className="w-full px-6 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-medium transition-colors border border-slate-600/50 hover:border-slate-500 shadow-lg"
                >
                  {isConnected ? '🛑 Parar e Avaliar' : '← Voltar'}
                </button>
             </div>
          </div>

          {/* Text/Script Column */}
          {readingText && (
            <div className="w-full md:w-1/2 h-80 md:h-[28rem] order-1 md:order-2 bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 overflow-y-auto shadow-inner custom-scrollbar relative backdrop-blur-sm">
               <div className="sticky top-0 bg-slate-900/90 backdrop-blur-md pb-4 mb-2 border-b border-slate-800 z-10 -mx-2 px-2">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                    <span>📄</span> Seu Texto de Apoio
                  </span>
               </div>
               <p className="text-xl md:text-2xl text-slate-200 leading-relaxed whitespace-pre-wrap font-serif opacity-90">
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
       <div className="w-20 h-20 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-8"></div>
       <h2 className="text-3xl font-bold text-white mb-2">Analisando Clareza...</h2>
       <p className="text-slate-400 animate-pulse">Gerando feedback detalhado</p>
    </div>
  );

  const renderFeedback = () => (
    <div className="max-w-3xl mx-auto px-4 py-16 text-center">
      <div className="mb-10 animate-float">
        <div className="inline-block p-6 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/10 mb-6 border border-green-500/20 shadow-[0_0_30px_-10px_rgba(34,197,94,0.3)]">
          <span className="text-5xl">🏁</span>
        </div>
        <h2 className="text-4xl font-bold text-white mb-4">Sessão Finalizada</h2>
        <p className="text-slate-400 text-lg">
          Você treinou por <strong className="text-white bg-slate-800 px-2 py-1 rounded">{formatTime(sessionDuration)}</strong>
        </p>
      </div>

      <div className="bg-slate-800/60 backdrop-blur-sm p-8 rounded-3xl border border-slate-700 mb-10 text-left shadow-2xl relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
        
        {/* Score Badge */}
        <div className="absolute top-6 right-6 flex flex-col items-center bg-slate-900/80 backdrop-blur p-4 rounded-2xl border border-slate-700 shadow-xl">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">Nota Final</span>
            <div className="flex items-baseline gap-1">
                <span className={`text-5xl font-black tracking-tighter ${
                    (feedbackResult?.score || 0) >= 8 ? 'text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.3)]' :
                    (feedbackResult?.score || 0) >= 5 ? 'text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.3)]' : 'text-red-400 drop-shadow-[0_0_10px_rgba(248,113,113,0.3)]'
                }`}>
                    {feedbackResult?.score}
                </span>
                <span className="text-xl text-slate-600 font-bold">/10</span>
            </div>
        </div>

        <h3 className="text-2xl font-bold text-white mb-8 border-b border-slate-700 pb-4 pr-32">Análise da Fala</h3>
        
        <div className="mb-8">
           <p className="text-xs uppercase tracking-wider text-slate-500 mb-2 font-bold">Nível de Clareza</p>
           <div className={`inline-flex items-center gap-3 px-4 py-2 rounded-lg border ${
              feedbackResult?.clarity === 'Muito Clara' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 
              feedbackResult?.clarity === 'Clara' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400'
           }`}>
              <span className="text-xl">
                {feedbackResult?.clarity === 'Muito Clara' ? '✨' : feedbackResult?.clarity === 'Clara' ? '👍' : '⚠️'}
              </span>
              <span className="font-bold text-lg">{feedbackResult?.clarity}</span>
           </div>
        </div>

        <div className="mb-10">
          <p className="text-xs uppercase tracking-wider text-slate-500 mb-3 font-bold">Sugestão Principal do Treinador</p>
          <div className="text-lg text-slate-200 leading-relaxed bg-slate-900/50 p-6 rounded-2xl border-l-4 border-indigo-500 shadow-inner">
            "{feedbackResult?.suggestion}"
          </div>
        </div>

        {/* Visual Transcript */}
        {feedbackResult?.annotatedTranscript && feedbackResult.annotatedTranscript.length > 0 && (
          <div>
            <div className="flex justify-between items-end mb-4">
                 <p className="text-xs uppercase tracking-wider text-slate-500 font-bold">Transcrição da Sessão</p>
                 <div className="flex gap-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-slate-400"></span> Fluido</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]"></span> Hesitante</span>
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"></span> Interrupção</span>
                 </div>
            </div>
            
            <div className="bg-slate-900/80 rounded-2xl p-6 border border-slate-700/50 flex flex-wrap content-start gap-1.5 max-h-80 overflow-y-auto custom-scrollbar leading-relaxed shadow-inner">
              {feedbackResult.annotatedTranscript.map((item, idx) => (
                <span 
                  key={idx} 
                  className={`
                    px-1.5 py-0.5 rounded transition-all duration-300
                    ${item.type === 'user_clear' ? 'text-slate-300 hover:text-white hover:bg-slate-800' : ''}
                    ${item.type === 'user_unclear' ? 'text-yellow-200 bg-yellow-500/10 border-b-2 border-yellow-500/30 decoration-yellow-500/50' : ''}
                    ${item.type === 'model' ? 'text-red-300 font-bold bg-red-900/30 px-2 rounded-md mx-1 border border-red-500/20' : ''}
                  `}
                >
                  {item.text}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex gap-4 w-full md:w-auto mx-auto">
            <button
                onClick={handleShare}
                className="flex-1 px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-lg border border-slate-600 transition-all flex items-center justify-center gap-2 hover:shadow-lg active:scale-95"
            >
                <span>🔗</span> Compartilhar
            </button>
            <button
                onClick={handleReset}
                className="flex-[2] px-10 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white rounded-xl font-bold text-lg shadow-lg shadow-indigo-500/30 transition-all hover:-translate-y-1 active:scale-95"
            >
                Treinar Novamente
            </button>
        </div>
        
        <button
             onClick={() => setCurrentState(AppState.HISTORY)}
             className="text-slate-500 hover:text-slate-300 text-sm mt-2 underline underline-offset-4 decoration-slate-700 transition-colors"
        >
            Ver meu histórico
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-200 selection:bg-indigo-500/30 font-sans">
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