import { useState, useRef } from 'react';
import { toast } from 'sonner';

interface AudioMessage {
  id: string;
  type: 'user' | 'assistant';
  audioBlob?: Blob;
  audioUrl?: string;
  timestamp: string;
  isPlaying?: boolean;
}

export const useElevenLabsAudio = () => {
  const [audioMessages, setAudioMessages] = useState<AudioMessage[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const ELEVENLABS_API_KEY = 'sk_9eb765fea090202fcc226bffc261d4b04b01c97013f4fcc3';
  const AGENT_ID = 'agent_01jwfmbhwtfm9aanc0r7sbqzdf';

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        if (audioChunksRef.current.length === 0) {
          toast.warning("Nenhum áudio foi gravado.");
          return;
        }
        
        let audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

        // --- START FIX FOR BUFFER SIZE ERROR ---
        // Ensure audioBlob size is a multiple of 2 (for 16-bit samples)
        // This is a common workaround for "buffer size must be a multiple of element size" errors
        // when dealing with audio data that is expected to be 16-bit PCM.
        if (audioBlob.size % 2 !== 0) {
          const padding = new Uint8Array([0]); // Add a single zero byte
          audioBlob = new Blob([audioBlob, padding], { type: 'audio/webm' });
        }
        // --- END FIX FOR BUFFER SIZE ERROR ---

        processAudioWithElevenLabs(audioBlob);
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
      
    } catch (error) {
      console.error('Erro ao iniciar gravação:', error);
      toast.error('Erro ao acessar microfone');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  const processAudioWithElevenLabs = async (audioBlob: Blob) => {
    setIsProcessing(true);
    
    try {
      // Salvar áudio do usuário no cache
      const userAudioUrl = URL.createObjectURL(audioBlob);
      const userMessage: AudioMessage = {
        id: crypto.randomUUID(),
        type: 'user',
        audioBlob,
        audioUrl: userAudioUrl,
        timestamp: new Date().toISOString()
      };
      
      setAudioMessages(prev => [...prev, userMessage]);
      
      // Usar o Conversational AI Agent do ElevenLabs
      const audioResponse = await sendToElevenLabsAgent(audioBlob);
      
      if (audioResponse) {
        console.log('ElevenLabs audioResponse received:', audioResponse); // Log para verificar o audioResponse
        const assistantAudioUrl = URL.createObjectURL(audioResponse);
        const assistantMessage: AudioMessage = {
          id: crypto.randomUUID(),
          type: 'assistant',
          audioBlob: audioResponse,
          audioUrl: assistantAudioUrl,
          timestamp: new Date().toISOString()
        };
        
        setAudioMessages(prev => [...prev, assistantMessage]);
        
        // Reproduzir automaticamente a resposta
        setTimeout(() => playAudio(assistantMessage), 500);
      } else {
        console.warn('ElevenLabs audioResponse is null or empty.'); // Log se audioResponse for nulo/vazio
        toast.error('Não foi possível obter resposta de áudio do ElevenLabs.');
      }
      
    } catch (error: any) {
      console.error('Erro ao processar áudio:', error);
      toast.error(`Erro ao processar áudio: ${error.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const sendToElevenLabsAgent = async (audioBlob: Blob): Promise<Blob | null> => {
    try {
      // Primeiro, obter a URL assinada para o agente
      const signedUrlResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`, {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        }
      });
      
      if (!signedUrlResponse.ok) {
        throw new Error(`Erro ao obter URL assinada: ${signedUrlResponse.status}`);
      }
      
      const { signed_url } = await signedUrlResponse.json();
      
      // Conectar via WebSocket com o agente
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(signed_url);
        let audioResponse: Blob | null = null;
        const audioChunks: Uint8Array[] = [];
        
        ws.onopen = () => {
          console.log('Conectado ao agente ElevenLabs');
          
          const reader = new FileReader();
          reader.onload = () => {
            const arrayBuffer = reader.result as ArrayBuffer;
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // --- START FIX FOR AUDIO STREAMING ---
            const chunkSize = 4096; // Tamanho do chunk em bytes
            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
              
              // Convert chunk to Base64
              let binary = '';
              const len = chunk.byteLength;
              for (let j = 0; j < len; j++) {
                  binary += String.fromCharCode(chunk[j]);
              }
              const base64Chunk = btoa(binary);
              
              // Send each chunk
              ws.send(JSON.stringify({
                user_audio_chunk: base64Chunk
              }));
            }
            // --- END FIX FOR AUDIO STREAMING ---
            
            // Sinalizar fim do áudio após todos os chunks
            ws.send(JSON.stringify({
              user_audio_chunk: ""
            }));
          };
          reader.readAsArrayBuffer(audioBlob);
        };
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('Mensagem recebida do ElevenLabs:', data);
            
            if (data.audio_event && data.audio_event.audio_base_64) {
              // Converter base64 para Uint8Array
              const binaryString = atob(data.audio_event.audio_base_64);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              audioChunks.push(bytes);
            }
            
            if (data.audio_event && data.audio_event.event_id === 'audio_stream_end') {
              console.log('ElevenLabs: audio_stream_end event received.'); // Log para confirmar o evento
              // Combinar todos os chunks de áudio
              const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
              const combinedAudio = new Uint8Array(totalLength);
              let offset = 0;
              for (const chunk of audioChunks) {
                combinedAudio.set(chunk, offset);
                offset += chunk.length;
              }
              
              audioResponse = new Blob([combinedAudio], { type: 'audio/mpeg' });
              ws.close();
            }
          } catch (error) {
            console.error('Erro ao processar mensagem WebSocket:', error);
          }
        };
        
        ws.onclose = () => {
          console.log('Conexão WebSocket fechada');
          resolve(audioResponse);
        };
        
        ws.onerror = (error) => {
          console.error('Erro WebSocket:', error);
          reject(new Error('Erro na conexão WebSocket'));
        };
        
        // Timeout de 30 segundos
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.close();
            reject(new Error('Timeout na conexão com o agente'));
          }
        }, 30000);
      });
      
    } catch (error) {
      console.error('Erro ao conectar com agente ElevenLabs:', error);
      return null;
    }
  };

  const playAudio = async (message: AudioMessage) => {
    if (!message.audioUrl) {
      console.warn('Attempted to play audio with no audioUrl:', message);
      return;
    }
    
    try {
      // Parar qualquer áudio em reprodução
      audioElementsRef.current.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      
      let audio = audioElementsRef.current.get(message.id);
      
      if (!audio) {
        audio = new Audio(message.audioUrl);
        audioElementsRef.current.set(message.id, audio);
        
        audio.onended = () => {
          console.log('Audio playback ended for message:', message.id);
          setAudioMessages(prev => 
            prev.map(msg => 
              msg.id === message.id ? { ...msg, isPlaying: false } : msg
            )
          );
        };
        
        audio.onerror = (e) => {
          console.error("Erro ao carregar ou tocar o áudio:", e); // Log do erro completo
          if (audio) {
            console.error('Audio element error code:', audio.error?.code);
            console.error('Audio element error message:', audio.error?.message);
          }
          toast.error("Erro ao carregar o áudio.");
          setAudioMessages(prev => 
            prev.map(msg => 
              msg.id === message.id ? { ...msg, isPlaying: false } : msg
            )
          );
        };
      }
      
      setAudioMessages(prev => 
        prev.map(msg => 
          msg.id === message.id ? { ...msg, isPlaying: true } : { ...msg, isPlaying: false }
        )
      );
      
      await audio.play();
      console.log('Attempting to play audio for message:', message.id);
      
    } catch (error) {
      console.error("Erro ao tocar áudio (catch block):", error);
      toast.error("Não foi possível tocar o áudio.");
    }
  };

  const clearAudioMessages = () => {
    // Limpar URLs dos objetos para liberar memória
    audioMessages.forEach(message => {
      if (message.audioUrl) {
        URL.revokeObjectURL(message.audioUrl);
      }
    });
    
    // Parar e limpar elementos de áudio
    audioElementsRef.current.forEach((audio) => {
      audio.pause();
      if (audio.src.startsWith('blob:')) {
        URL.revokeObjectURL(audio.src);
      }
    });
    audioElementsRef.current.clear();
    
    setAudioMessages([]);
  };

  return {
    audioMessages,
    isRecording,
    isProcessing,
    recordingTime,
    startRecording,
    stopRecording,
    playAudio,
    clearAudioMessages
  };
};
