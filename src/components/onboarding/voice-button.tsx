"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Round 12, group 6: voice through the browser's own speech recognition (Web
 * Speech API). The final transcript goes into the text box, the performer edits
 * it and presses Send, so voice follows exactly the typed flow. No audio is
 * recorded or uploaded, and there is no second provider. Where the API is
 * missing or refused, the button hides and a line says to type instead.
 */
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  processLocally?: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type Ctor = new () => RecognitionLike;

function recognitionCtor(): Ctor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function VoiceButton({ onText, disabled }: { onText: (text: string) => void; disabled?: boolean }) {
  const t = useTranslations("talents");
  const locale = useLocale();
  // null on the server and during hydration, then whether this browser has the API.
  const supported = useSyncExternalStore<boolean | null>(() => () => {}, () => recognitionCtor() !== null, () => null);
  const [listening, setListening] = useState(false);
  const [refused, setRefused] = useState(false);
  const [noted, setNoted] = useState(false);
  const rec = useRef<RecognitionLike | null>(null);

  useEffect(() => {
    return () => {
      rec.current?.stop();
    };
  }, []);

  if (supported === null) return null;
  if (!supported || refused) {
    return <p className="text-xs text-fg-muted">{t("onboarding.chat.micUnavailable")}</p>;
  }

  function toggle() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setRefused(true);
      return;
    }
    const r = new Ctor();
    r.lang = locale === "zh" ? "zh-CN" : locale === "pt" ? "pt-BR" : locale;
    r.interimResults = true;
    r.continuous = false;
    // Where the browser offers on-device recognition, ask for it.
    r.processLocally = true;
    r.onresult = (e) => {
      let finalText = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      }
      if (finalText.trim()) onText(finalText.trim());
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") setRefused(true);
      setListening(false);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    setNoted(true);
    try {
      r.start();
      setListening(true);
    } catch {
      setRefused(true);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {!noted && <p className="text-xs text-fg-muted">{t("onboarding.chat.micNote")}</p>}
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={toggle} aria-pressed={listening} aria-label={listening ? t("onboarding.chat.micStop") : t("onboarding.chat.mic")}>
        {listening ? <Square /> : <Mic />}
        <span className="sr-only md:not-sr-only">{listening ? t("onboarding.chat.micStop") : t("onboarding.chat.mic")}</span>
      </Button>
    </div>
  );
}
