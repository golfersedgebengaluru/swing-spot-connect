import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Mic, Square, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export type VoiceField = "notes" | "drills" | "progress";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  field: VoiceField;
  rows?: number;
  placeholder?: string;
}

/**
 * Textarea with mic dictation + AI polish powered by Gemini.
 * - Mic records audio via MediaRecorder, sends to `coaching-voice` edge function for transcription.
 * - ✨ Polish sends the current text to the same function for field-specific cleanup.
 * No audio is stored — only the resulting text is kept in form state.
 */
export function VoiceTextarea({ label, value, onChange, field, rows = 3, placeholder }: Props) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const pickMime = (): string => {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) return m;
    }
    return "";
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = (rec.mimeType || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (blob.size < 1024) {
          toast({ title: "Recording too short", description: "Try again and speak for a moment longer." });
          return;
        }
        await transcribe(blob, type);
      };
      rec.start();
      setRecording(true);
    } catch (err) {
      toast({
        title: "Microphone unavailable",
        description: err instanceof Error ? err.message : "Permission denied.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    setRecording(false);
  };

  const transcribe = async (blob: Blob, mime: string) => {
    setTranscribing(true);
    try {
      const ext =
        mime === "audio/webm" ? "webm" :
        mime === "audio/mp4" ? "m4a" :
        mime === "audio/ogg" ? "ogg" :
        mime === "audio/mpeg" || mime === "audio/mp3" ? "mp3" :
        "webm";
      const form = new FormData();
      form.append("audio", blob, `recording.${ext}`);
      const { data, error } = await supabase.functions.invoke("coaching-voice", { body: form });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const text = (data as any)?.text?.trim() || "";
      if (!text) {
        toast({ title: "Nothing transcribed", description: "We didn't pick up any speech. Try again." });
        return;
      }
      const next = value ? `${value.trimEnd()}\n${text}` : text;
      onChange(next);
    } catch (err) {
      toast({
        title: "Transcription failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setTranscribing(false);
    }
  };

  const polish = async () => {
    if (!value.trim()) {
      toast({ title: "Nothing to polish", description: "Add some text first." });
      return;
    }
    setPolishing(true);
    try {
      const { data, error } = await supabase.functions.invoke("coaching-voice", {
        body: { text: value, field },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const text = (data as any)?.text?.trim() || "";
      if (text) onChange(text);
    } catch (err) {
      toast({
        title: "Polish failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setPolishing(false);
    }
  };

  const busy = recording || transcribing || polishing;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-1">
          {!recording ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={startRecording}
              disabled={busy}
              aria-label={`Dictate ${label}`}
              title="Dictate (Gemini)"
            >
              {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              <span className="ml-1 text-xs">{transcribing ? "Transcribing…" : "Dictate"}</span>
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={stopRecording}
              aria-label="Stop recording"
            >
              <Square className="h-4 w-4" />
              <span className="ml-1 text-xs">Stop</span>
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={polish}
            disabled={busy || !value.trim()}
            title="Polish with AI (Gemini)"
            aria-label={`Polish ${label} with AI`}
          >
            {polishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            <span className="ml-1 text-xs">Polish</span>
          </Button>
        </div>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        disabled={transcribing || polishing}
      />
      {recording && (
        <p className="text-xs text-destructive flex items-center gap-1.5" role="status">
          <span className="inline-block h-2 w-2 rounded-full bg-destructive animate-pulse" />
          Recording… click Stop when done.
        </p>
      )}
    </div>
  );
}
