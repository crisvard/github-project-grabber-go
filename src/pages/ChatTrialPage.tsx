import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Loader2, Clock, AlertTriangle, Smile, Gift, Mic, MicOff, Play, Pause, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalCache, CachedMessage } from '@/hooks/useLocalCache';
import { useN8nWebhook } from '@/hooks/useN8nWebhook';
import { useN8nAudioWebhook } from '@/hooks/useN8nAudioWebhook';
import { useTrialManager } from '@/hooks/useTrialManager';
import { useAudioCredits } from '@/hooks/useAudioCredits';
import { useVoiceCredits } from '@/hooks/useVoiceCredits';
import { supabase } from '@/integrations/supabase/client';
import ProfileImageModal from '@/components/ProfileImageModal';
import EmoticonSelector from '@/components/EmoticonSelector';
import GiftSelection from '@/components/GiftSelection';
import AudioCreditsModal from '@/components/AudioCreditsModal';
import VoiceCallButton from '@/components/VoiceCallButton';
import CreditsPurchaseButton from '@/components/CreditsPurchaseButton';
import VoiceCreditsPurchaseButton from '@/components/VoiceCreditsPurchaseButton';
import { useAudioRecording } from '@/hooks/useAudioRecording';
import { cn } from '@/lib/utils';
import TrialTimer from '@/components/TrialTimer';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useModalManager } from '@/hooks/useModalManager';
import CreditsPurchaseManager from '@/components/CreditsPurchaseManager';

const ChatTrialPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectTextAudioPlan } = useSubscription();
  const { messages, addMessage, updateMessage } = useLocalCache();
  const { sendToN8n, isLoading: n8nLoading } = useN8nWebhook();
  const { sendAudioToN8n, isLoading: audioN8nLoading } = useN8nAudioWebhook();
  const { isTrialActive, hoursRemaining, loading: trialLoading } = useTrialManager();
  const { isRecording, startRecording, stopRecording, audioBlob, resetAudio, audioUrl } = useAudioRecording();
  const { credits, hasCredits, consumeCredit, refreshCredits, isLoading: creditsLoading } = useAudioCredits();
  const { credits: voiceCredits, refreshCredits: refreshVoiceCredits } = useVoiceCredits();
  const { activeModal, openAudioCreditsModal, openVoiceCreditsModal, closeModal } = useModalManager();
  
  const [input, setInput] = useState('');
  const [messageCount, setMessageCount] = useState(0);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [showEmoticonSelector, setShowEmoticonSelector] = useState(false);
  const [showGiftSelection, setShowGiftSelection] = useState(false);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [agentData, setAgentData] = useState({
    name: 'Isa',
    avatar_url: '/lovable-uploads/05b895be-b990-44e8-970d-590610ca6e4d.png'
  });
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const maxTrialMessages = 10;

  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) {
      viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover, height=device-height');
    }

    const handleScroll = () => {
      if (window.innerHeight < window.outerHeight) {
        window.scrollTo(0, 1);
      }
    };

    setTimeout(handleScroll, 100);
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (viewport) {
        viewport.setAttribute('content', 'width=device-width, initial-scale=1');
      }
    };
  }, []);

  useEffect(() => {
    const fetchUserAvatar = async () => {
      if (!user?.id) return;

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('avatar_url')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Erro ao buscar avatar do usuário:', error);
          return;
        }

        if (profile?.avatar_url) {
          setUserAvatarUrl(profile.avatar_url);
          console.log('Avatar do usuário carregado:', profile.avatar_url);
        }
      } catch (error) {
        console.error('Erro ao carregar avatar do usuário:', error);
      }
    };

    fetchUserAvatar();
  }, [user?.id]);


  // ====================================================================
  // ============== INÍCIO DA SEÇÃO MODIFICADA (useEffect) ==============
  // ====================================================================
  useEffect(() => {
    if (!trialLoading && !isTrialActive && user) {
      toast.error('Seu trial de 72 horas expirou! Faça upgrade para continuar conversando.');
      // O REDIRECIONAMENTO AUTOMÁTICO FOI REMOVIDO DAQUI
      // para permitir que o usuário escolha uma das opções na tela.
    }
  }, [isTrialActive, trialLoading, user, navigate]);
  // ====================================================================
  // ================ FIM DA SEÇÃO MODIFICADA (useEffect) ===============
  // ====================================================================


  useEffect(() => {
    const fetchAgentData = async () => {
      if (!user?.id) return;

      try {
        const { data: selectedAgent, error: selectedError } = await supabase
          .from('user_selected_agent')
          .select('agent_id')
          .eq('user_id', user.id)
          .single();

        if (selectedError) {
          console.error('Erro ao buscar agente selecionado:', selectedError);
          return;
        }

        if (selectedAgent) {
          const { data: agent, error: agentError } = await supabase
            .from('ai_agents')
            .select('name, avatar_url')
            .eq('id', selectedAgent.agent_id)
            .single();

          if (agentError) {
            console.error('Erro ao buscar dados do agente:', agentError);
            return;
          }

          if (agent) {
            setAgentData({
              name: agent.name,
              avatar_url: agent.avatar_url
            });
          }
        }
      } catch (error) {
        console.error('Erro ao carregar dados do agente:', error);
      }
    };

    fetchAgentData();
  }, [user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const creditsSuccess = urlParams.get('credits_success');
    const creditsAmount = urlParams.get('credits');
    const creditsCanceled = urlParams.get('credits_canceled');
    
    if (creditsSuccess === 'true' && creditsAmount) {
      toast.success(`${creditsAmount} créditos adicionados com sucesso!`);
      refreshCredits();
      window.history.replaceState({}, document.title, '/chat-trial');
    }
    
    if (creditsCanceled === 'true') {
      toast.error('Compra de créditos cancelada');
      window.history.replaceState({}, document.title, '/chat-trial');
    }

    const voiceCreditsSuccess = urlParams.get('voice_credits_success');
    const voiceCreditsAmount = urlParams.get('credits');
    const voiceCreditsCanceled = urlParams.get('voice_credits_canceled');
    
    if (voiceCreditsSuccess === 'true' && voiceCreditsAmount) {
      toast.success(`${voiceCreditsAmount} créditos de chamada de voz adicionados com sucesso!`);
      refreshVoiceCredits();
      window.history.replaceState({}, document.title, '/chat-trial');
    }
    
    if (voiceCreditsCanceled === 'true') {
      toast.error('Compra de créditos de chamada de voz cancelada');
      window.history.replaceState({}, document.title, '/chat-trial');
    }

    const giftSuccess = urlParams.get('gift_success');
    const giftId = urlParams.get('gift_id');
    const giftName = urlParams.get('gift_name');
    const giftCanceled = urlParams.get('gift_canceled');
    
    if (giftSuccess === 'true' && giftId && giftName) {
      handleGiftPaymentSuccess(giftId, decodeURIComponent(giftName));
      window.history.replaceState({}, document.title, '/chat-trial');
    }
    
    if (giftCanceled === 'true') {
      toast.error('Compra de presente cancelada');
      window.history.replaceState({}, document.title, '/chat-trial');
    }
  }, []);

  const handleAvatarClick = () => {
    setIsProfileModalOpen(true);
  };

  const handleGoBack = () => {
    navigate('/profile');
  };

  const handleUpgrade = async () => {
    await selectTextAudioPlan();
  };

  const handleSendMessage = async () => {
    if (!input.trim() || n8nLoading || !user || !isTrialActive) return;

    if (messageCount >= maxTrialMessages) {
      toast.error('Limite de mensagens do trial atingido! Faça upgrade para continuar.');
      return;
    }

    const messageText = input.trim();
    setInput('');
    setMessageCount(prev => prev + 1);

    addMessage({
      type: 'user',
      transcription: messageText,
      timestamp: new Date().toISOString()
    });

    try {
      const responseText = await sendToN8n(messageText, user.email!);
      
      addMessage({
        type: 'assistant',
        transcription: responseText,
        timestamp: new Date().toISOString()
      });

    } catch (error: any) {
      console.error('Error generating response:', error);
      addMessage({
        type: 'assistant',
        transcription: `Desculpe, ocorreu um erro ao processar sua mensagem: "${messageText}"`,
        timestamp: new Date().toISOString()
      });
    }
  };

  // ... (demais funções handle... permanecem iguais)
  const handleEmoticonClick = () => {
    setShowEmoticonSelector(!showEmoticonSelector);
    setShowGiftSelection(false);
  };

  const handleGiftClick = () => {
    setShowGiftSelection(!showGiftSelection);
    setShowEmoticonSelector(false);
  };

  const handleEmoticonSelect = (emoticon: string) => {
    setInput(prev => prev + emoticon);
    setShowEmoticonSelector(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleGiftSelect = async (giftId: string, giftName: string, giftPrice: number) => {
    try {
      console.log("Selecionando presente:", { giftId, giftName, giftPrice });
      
      const { data, error } = await supabase.functions.invoke('create-gift-checkout', {
        body: {
          giftId
        }
      });

      if (error) {
        console.error("Erro na function invoke:", error);
        throw error;
      }

      if (data?.error) {
        console.error("Erro retornado pela função:", data.error);
        throw new Error(data.error);
      }

      console.log("Checkout session criada:", data);

      if (data?.url) {
        console.log("Redirecionando para:", data.url);
        window.location.href = data.url;
      } else {
        throw new Error("URL de checkout não recebida");
      }
      
      setShowGiftSelection(false);
    } catch (error: any) {
      console.error('Error processing gift:', error);
      toast.error('Erro ao processar presente: ' + (error.message || 'Tente novamente'));
    }
  };

  const handleGiftPaymentSuccess = (giftId: string, giftName: string) => {
    const giftEmojis: { [key: string]: string } = {
      "00000000-0000-0000-0000-000000000001": "🌹",
      "00000000-0000-0000-0000-000000000002": "🍫", 
      "00000000-0000-0000-0000-000000000003": "🧸",
      "00000000-0000-0000-0000-000000000004": "💐"
    };

    addMessage({
      type: 'user',
      transcription: `Enviou um presente: ${giftName} ${giftEmojis[giftId] || '🎁'}`,
      timestamp: new Date().toISOString()
    });
    
    toast.success(`Presente ${giftName} enviado com sucesso!`);

    setTimeout(() => {
      addMessage({
        type: 'assistant',
        transcription: `Que presente lindo! Muito obrigada pelo ${giftName}! ${giftEmojis[giftId] || '🎁'} ❤️`,
        timestamp: new Date().toISOString()
      });
    }, 1500);
  };

  const handlePlayAudio = (messageId: string, audioUrl: string) => {
    if (audioRef.current && currentlyPlaying === messageId) {
        audioRef.current.pause();
        setCurrentlyPlaying(null);
    } else {
        if (audioRef.current) {
            audioRef.current.pause();
        }
        audioRef.current = new Audio(audioUrl);
        audioRef.current.play().catch(e => console.error("Error playing audio:", e));
        setCurrentlyPlaying(messageId);
        audioRef.current.onended = () => {
            setCurrentlyPlaying(null);
        };
        audioRef.current.onerror = () => {
            setCurrentlyPlaying(null);
            toast.error("Erro ao reproduzir o áudio.");
        }
    }
  };

  const getAssistantAudioResponse = async (audioBlob: Blob, audioUrl: string) => {
    if (!user) return;
    try {
      const result = await sendAudioToN8n(audioBlob, user.email!);
      
      const assistantMessageId = addMessage({
        type: 'assistant',
        transcription: result.text,
        timestamp: new Date().toISOString(),
        audioUrl: result.audioUrl
      });

      if (result.audioUrl) {
        handlePlayAudio(assistantMessageId, result.audioUrl);
      }

    } catch (error: any) {
      console.error('Error generating audio response:', error);
      addMessage({
        type: 'assistant',
        transcription: `Desculpe, ocorreu um erro ao processar seu áudio.`,
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleAudioToggle = async () => {
    if (isRecording) { 
      stopRecording(); 
    } else {
      if (n8nLoading || audioN8nLoading) return;
      if (messageCount >= maxTrialMessages) {
        toast.error('Limite de mensagens do trial atingido! Faça upgrade para continuar.');
        return;
      }
      
      console.log('ChatTrialPage: Verificando créditos de áudio:', { credits, hasCredits });
      
      if (credits <= 0) {
        console.log('ChatTrialPage: Sem créditos de áudio, abrindo popup de compra');
        openAudioCreditsModal();
        return;
      }
      
      const creditConsumed = await consumeCredit();
      if (!creditConsumed) {
        console.log('ChatTrialPage: Falha ao consumir crédito de áudio');
        openAudioCreditsModal();
        return;
      }
      
      startRecording();
    }
  };

  useEffect(() => {
    if (audioBlob && audioUrl) {
      processAudioMessage(audioBlob, audioUrl);
    }
  }, [audioBlob, audioUrl]);

  const processAudioMessage = async (blob: Blob, url: string) => {
    if (!user) return;

    setMessageCount(prev => prev + 1);
    toast.info("Processando seu áudio...");

    const userMessageId = addMessage({
        type: 'user',
        timestamp: new Date().toISOString(),
        audioUrl: url,
        transcription: 'Processando áudio...'
    });

    try {
      await getAssistantAudioResponse(blob, url);
      updateMessage(userMessageId, { transcription: 'Áudio enviado' });
      resetAudio();
    } catch (error) {
      console.error('Audio processing error:', error);
      toast.error('Erro ao processar o áudio.');
      updateMessage(userMessageId, { transcription: '(Erro no processamento do áudio)' });
      resetAudio();
    }
  };

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const remainingMessages = maxTrialMessages - messageCount;

  if (!user) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Por favor, faça login para acessar o trial.</p>
      </div>
    );
  }

  if (trialLoading) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="flex items-center gap-2">
          <Loader2 className="animate-spin" size={20} />
          <p>Verificando status do trial...</p>
        </div>
      </div>
    );
  }

  // ====================================================================
  // ===== INÍCIO DA SEÇÃO MODIFICADA (Tela de Trial Expirado) ==========
  // ====================================================================
  if (!isTrialActive) {
    return (
      <div className="h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-orange-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Trial Expirado</h2>
          <p className="text-gray-300 mb-6">Seu trial de 72 horas expirou. Faça upgrade para continuar!</p>
          
          {/* Container para os botões */}
          <div className="mt-8 flex flex-col items-center gap-4 w-full px-4">
            {/* Botão de Upgrade (Ação Primária) */}
            <Button
              onClick={handleUpgrade}
              className="w-full max-w-xs bg-orange-600 hover:bg-orange-700 font-semibold"
            >
              Fazer Upgrade
            </Button>
            {/* Botão de Voltar para o Perfil (Ação Secundária) */}
            <Button
              onClick={() => navigate('/profile')}
              variant="outline"
              className="w-full max-w-xs border-gray-500 text-gray-300 hover:bg-gray-800 hover:text-white"
            >
              Voltar para o Perfil
            </Button>
          </div>
        </div>
      </div>
    );
  }
  // ====================================================================
  // ====== FIM DA SEÇÃO MODIFICADA (Tela de Trial Expirado) ============
  // ====================================================================


  const isProcessing = n8nLoading || audioN8nLoading;
  const isLoading = isProcessing || isRecording;

  // O restante do código (a renderização do chat quando o trial está ativo) permanece o mesmo.
  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col w-full relative overflow-hidden mobile-fullscreen">
      
      <style>{`
        /* ... estilos permanecem os mesmos ... */
        .scrollbar-hide {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .mobile-fullscreen {
          height: 100vh;
          height: 100dvh;
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
        }
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom);
        }
        .pt-safe {
          padding-top: env(safe-area-inset-top);
        }
        @media (max-width: 768px) {
          body {
            overflow: hidden;
            position: fixed;
            width: 100%;
            height: 100%;
          }
          html {
            overflow: hidden;
            height: 100%;
          }
        }
      `}</style>
      <br></br>
      <TrialTimer />
      
      {/* Cabeçalho Principal */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700 flex-shrink-0 sticky top-0 z-20 pt-safe">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-gray-400 hover:text-white"
            onClick={handleGoBack}
          >
            <ArrowLeft size={20} />
          </Button>
          <Avatar className="cursor-pointer" onClick={handleAvatarClick}>
            <AvatarImage src={agentData.avatar_url} alt={agentData.name} />
            <AvatarFallback className="bg-orange-600">{agentData.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{agentData.name}</span>
            <Badge variant="secondary" className="text-xs bg-orange-600 text-white">
              <Clock size={12} className="mr-1" />
              Trial - {hoursRemaining}h restantes
            </Badge>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="flex items-center gap-1">
            <VoiceCallButton 
              agentName={agentData.name}
              agentAvatar={agentData.avatar_url}
              onRequestVoiceCredits={openVoiceCreditsModal}
            />
            <VoiceCreditsPurchaseButton className="bg-green-600 hover:bg-green-700" />
          </div>
        </div>
      </div>

      {/* Seção para o Botão de Upgrade - SEMPRE VISÍVEL */}
      <div className="w-full flex justify-center items-center py-2 px-4 bg-gray-800 border-b border-gray-700">
        <Button
          onClick={handleUpgrade}
          className="bg-orange-600 hover:bg-orange-700 text-white w-full max-w-sm font-semibold"
          size="sm"
        >
          Fazer Upgrade Agora
        </Button>
      </div>

      {(hoursRemaining <= 12 || remainingMessages <= 3) && (
        <div className="bg-orange-600/20 border-b border-orange-500/30 p-3 text-center flex-shrink-0">
          <p className="text-orange-300 text-sm">
            ⚠️ {hoursRemaining <= 12 ? `${hoursRemaining} horas restantes no seu trial` : `${remainingMessages} mensagens restantes`}. 
            <Button 
              variant="link" 
              className="text-orange-400 underline p-0 ml-1"
              onClick={handleUpgrade}
            >
              Faça upgrade agora!
            </Button>
          </p>
          <br></br>
        </div>
      )}

      {/* ... o restante do JSX do chat permanece o mesmo ... */}
       <div className="flex-1 min-h-0 relative overflow-hidden">
        <div className="h-full overflow-y-auto scrollbar-hide touch-pan-y p-4" style={{ 
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}>
          <div className="space-y-4">
            {messages.map((message) => {
              const isUserMessage = message.type === 'user';
              
              return (
                <div key={message.id} className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'} mb-4`}>
                  {!isUserMessage && (
                    <Avatar className="h-8 w-8 mr-2 flex-shrink-0 cursor-pointer" onClick={handleAvatarClick}>
                      <AvatarImage src={agentData.avatar_url} alt={agentData.name} />
                      <AvatarFallback className="bg-orange-600 text-white">
                        {agentData.name.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                  )}

                  <div className="max-w-[70%] space-y-1">
                    <div className={`px-4 py-3 rounded-2xl shadow-md ${
                      isUserMessage 
                        ? 'bg-orange-600 text-white rounded-br-none' 
                        : 'bg-gray-700 text-white rounded-bl-none'
                    }`}>
                      <p className="whitespace-pre-wrap break-words text-sm">{message.transcription}</p>
                      {message.audioUrl && (
                        <div className="flex items-center gap-2 mt-2">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-8 h-8 text-white hover:bg-white/20 rounded-full"
                            onClick={() => handlePlayAudio(message.id!, message.audioUrl!)}
                          >
                            {currentlyPlaying === message.id ? <Pause size={16} /> : <Play size={16} />}
                          </Button>
                          <div className="flex-1 h-1 bg-white bg-opacity-30 rounded-full">
                            <div className="w-1/3 h-full bg-white rounded-full"></div>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className={`text-xs text-gray-500 mt-1 ${isUserMessage ? 'text-right' : 'text-left'}`}>
                      {formatTime(message.timestamp)}
                    </div>
                  </div>

                  {isUserMessage && (
                    <Avatar className="h-8 w-8 ml-2 flex-shrink-0">
                      {userAvatarUrl ? (
                        <AvatarImage src={userAvatarUrl} alt="User" />
                      ) : (
                        <AvatarFallback className="bg-blue-600 text-white">
                          {user.email?.charAt(0).toUpperCase() || 'U'}
                        </AvatarFallback>
                      )}
                    </Avatar>
                  )}
                </div>
              );
            })}
          </div>
          
          <div ref={messagesEndRef} />
        </div>
      </div>
      
      <CreditsPurchaseManager
        activeModal={activeModal}
        onClose={closeModal}
      />

      {showEmoticonSelector && (
        <EmoticonSelector 
          onSelect={handleEmoticonSelect} 
          onClose={() => setShowEmoticonSelector(false)} 
        />
      )}
      {showGiftSelection && (
        <GiftSelection 
          onClose={() => setShowGiftSelection(false)} 
          onSelectGift={handleGiftSelect} 
        />
      )}

      <div className="p-4 bg-gray-800 border-t border-gray-700 flex-shrink-0 sticky bottom-0 z-20 pb-safe">
        <div className="flex items-center space-x-3">
          <div className="flex-1 bg-gray-700 rounded-full px-4 py-2 flex items-center space-x-2">
            <Input
              ref={inputRef}
              className="bg-transparent border-0 text-white placeholder:text-gray-400 focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
              placeholder={
                isTrialActive && remainingMessages > 0 
                  ? "Digite uma mensagem..." 
                  : "Trial expirado - Faça upgrade para continuar"
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              disabled={isLoading || !isTrialActive || remainingMessages <= 0}
            />
            
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleEmoticonClick}
                className={`flex-shrink-0 w-8 h-8 ${
                  showEmoticonSelector 
                    ? 'text-orange-400 bg-gray-600' 
                    : 'text-gray-400 hover:text-orange-400'
                }`}
                disabled={n8nLoading || !isTrialActive || remainingMessages <= 0}
              >
                <Smile size={16} />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={handleGiftClick}
                className={`flex-shrink-0 w-8 h-8 ${
                  showGiftSelection 
                    ? 'text-orange-400 bg-gray-600' 
                    : 'text-gray-400 hover:text-orange-400'
                }`}
                disabled={n8nLoading || !isTrialActive || remainingMessages <= 0}
              >
                <Gift size={16} />
              </Button>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <div className="relative flex flex-col items-center">
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "w-12 h-12 rounded-full bg-orange-600 hover:bg-orange-700 text-white flex-shrink-0",
                  isRecording && "bg-red-600 hover:bg-red-700 animate-pulse"
                )}
                onClick={handleAudioToggle}
                disabled={isProcessing || !isTrialActive || remainingMessages <= 0}
              >
                {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
              </Button>
              
              {credits <= 0 && (
                <div 
                  className="absolute inset-0 bg-black bg-opacity-30 rounded-full cursor-pointer flex items-center justify-center z-10"
                  onClick={() => {
                    console.log('ChatTrialPage: Máscara clicada - abrindo popup de compra de áudio');
                    openAudioCreditsModal();
                  }}
                >
                </div>
              )}
              
              {!creditsLoading && (
                <span className="absolute -bottom-1 text-xs text-orange-400 font-medium bg-gray-800 px-1 rounded">
                  {credits}
                </span>
              )}
            </div>
            <CreditsPurchaseButton className="bg-green-600 hover:bg-green-700" />
          </div>
        </div>
        <br></br>
      </div>
       
      <ProfileImageModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        imageUrl={agentData.avatar_url}
        agentName={agentData.name}
      />
    </div>
  );
};

export default ChatTrialPage;