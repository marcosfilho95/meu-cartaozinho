import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const TARGET_SAMPLE_RATE = 16000;

const downsample = (input: Float32Array, inputRate: number) => {
  if (inputRate <= TARGET_SAMPLE_RATE) return input;
  const ratio = inputRate / TARGET_SAMPLE_RATE;
  const length = Math.floor(input.length / ratio);
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[Math.floor(i * ratio)];
  }
  return output;
};

const encodeWav = (chunks: Float32Array[], sampleRate: number) => {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  const samples = downsample(merged, sampleRate);
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (pos: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(pos + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_SAMPLE_RATE, true);
  view.setUint32(28, TARGET_SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  let pos = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(pos, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    pos += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
};

type Options = {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
};

/** Grava a voz do usuário, converte em WAV e devolve a transcrição em português. */
export const useVoiceDictation = ({ onTranscript, onError }: Options) => {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);

  const cleanup = useCallback(() => {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void contextRef.current?.close().catch(() => undefined);
    processorRef.current = null;
    sourceRef.current = null;
    streamRef.current = null;
    contextRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    if (recording || transcribing) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      const context = new AudioContext();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      chunksRef.current = [];
      processor.onaudioprocess = (event) => {
        const data = event.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(data));
        let peak = 0;
        for (let i = 0; i < data.length; i += 64) peak = Math.max(peak, Math.abs(data[i]));
        setLevel(peak);
      };
      source.connect(processor);
      processor.connect(context.destination);
      streamRef.current = stream;
      contextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
      setRecording(true);
    } catch {
      onError?.("Não foi possível acessar o microfone. Autorize o acesso e tente de novo.");
    }
  }, [onError, recording, transcribing]);

  const cancel = useCallback(() => {
    chunksRef.current = [];
    cleanup();
    setRecording(false);
  }, [cleanup]);

  const stop = useCallback(async () => {
    if (!recording) return;
    const sampleRate = contextRef.current?.sampleRate || 44100;
    const chunks = chunksRef.current;
    chunksRef.current = [];
    cleanup();
    setRecording(false);

    const blob = encodeWav(chunks, sampleRate);
    if (blob.size < 4096) {
      onError?.("Não ouvi nada. Segure o botão e fale mais perto do microfone.");
      return;
    }

    setTranscribing(true);
    try {
      const form = new FormData();
      form.append("file", blob, "recording.wav");
      const { data, error } = await supabase.functions.invoke("voice-transcribe", { body: form });
      const failure = error
        || (typeof data === "object" && data && "error" in data ? String((data as { error?: unknown }).error) : "");
      if (failure) throw new Error(typeof failure === "string" ? failure : failure.message);
      const text = String((data as { text?: string } | null)?.text || "").trim();
      if (!text) {
        onError?.("Não consegui entender o áudio. Tente falar novamente.");
        return;
      }
      onTranscript(text);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Falha ao transcrever o áudio.");
    } finally {
      setTranscribing(false);
    }
  }, [cleanup, onError, onTranscript, recording]);

  return { recording, transcribing, level, start, stop, cancel };
};
