"use client";

import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent } from "react";
import {
  READING_MESSAGES,
  SPEECH_RATES,
  SpeechPlayer,
  chooseVoice,
  domReadingEnvironment,
  isSpeechRate,
  readingChunks,
  readingLines,
  selectionChunks,
  speechRateCookie,
  speechRateLabel,
  speechRateOf,
  type ReadingMessage,
  type ReadingState,
  type SpeechRate,
  type UtteranceLike,
} from "@/modules/accessibility";

// SPEC 2026-11-15-acessibilidade, part C (SF-268; decision L2): "Ouvir esta página", "Ouvir o trecho selecionado",
// pause, continue, stop and speed, on the browser's own speech. Nothing on the page changes but these controls, whose
// state is announced politely (6.3 item 4); without speech in the browser, the controls say so and nothing breaks.

const noSubscription = () => () => {};
const browserSpeech = () =>
  typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance === "function" ? "yes" : "no";

export function SpeechControls() {
  const statusId = useId();
  // "unknown" in the server's markup and during hydration: nothing is claimed before the browser is asked.
  const speech = useSyncExternalStore(noSubscription, browserSpeech, () => "unknown");
  const speechAvailable = speech === "yes";
  const [hasPortugueseVoice, setHasPortugueseVoice] = useState<boolean | null>(null);
  const [state, setState] = useState<ReadingState>("idle");
  const [message, setMessage] = useState<string>("");
  const [rate, setRate] = useState<SpeechRate>(1);
  const playerRef = useRef<SpeechPlayer | null>(null);
  const selectionRef = useRef("");
  const pathname = usePathname();

  // The player, the kept speed and the voice, once in the browser; the voices may arrive later (voiceschanged).
  useEffect(() => {
    if (!speechAvailable) return;
    const synthesis = window.speechSynthesis;
    const player = new SpeechPlayer({
      engine: synthesis as unknown as ConstructorParameters<typeof SpeechPlayer>[0]["engine"],
      createUtterance: (text) => new window.SpeechSynthesisUtterance(text) as unknown as UtteranceLike,
      onChange: (next: ReadingState, said: ReadingMessage) => {
        setState(next);
        setMessage(READING_MESSAGES[said]);
      },
    });
    const keptRate = speechRateOf(document.cookie);
    player.setRate(keptRate);
    playerRef.current = player;
    const pickVoice = () => {
      const voice = chooseVoice(synthesis.getVoices());
      player.setVoice(voice);
      // Some browsers list no voice until asked; only a non-empty list without Portuguese means there is none.
      setHasPortugueseVoice(voice !== null || synthesis.getVoices().length === 0);
    };
    pickVoice();
    synthesis.addEventListener?.("voiceschanged", pickVoice);
    // The kept speed is shown once the player exists; the cookie is only readable in the browser.
    queueMicrotask(() => setRate(keptRate));
    return () => {
      synthesis.removeEventListener?.("voiceschanged", pickVoice);
      player.stop(true);
      playerRef.current = null;
    };
  }, [speechAvailable]);

  // Changing page stops the reading (6.3 item 3).
  useEffect(() => {
    playerRef.current?.stop(true);
  }, [pathname]);


  function readPage() {
    const main = document.querySelector("main") ?? document.body;
    const lines = readingLines(main as unknown as Parameters<typeof readingLines>[0], domReadingEnvironment);
    playerRef.current?.play(readingChunks(lines), "page");
  }

  function readSelection() {
    const chunks = selectionChunks(selectionRef.current || (window.getSelection()?.toString() ?? ""));
    selectionRef.current = "";
    if (chunks.length === 0) {
      setMessage(READING_MESSAGES.nothingSelected);
      return;
    }
    playerRef.current?.play(chunks, "selection");
  }

  function changeRate(event: ChangeEvent<HTMLSelectElement>) {
    const next = Number(event.target.value);
    if (!isSpeechRate(next)) return;
    setRate(next);
    playerRef.current?.setRate(next);
    document.cookie = speechRateCookie(next, window.location.protocol === "https:");
  }

  if (speech === "unknown") return <div className="speech-controls" data-reading="skip" />;
  if (!speechAvailable || hasPortugueseVoice === false) {
    return (
      <div className="speech-controls" data-reading="skip">
        <p className="speech-unavailable">
          {speechAvailable ? READING_MESSAGES.noPortugueseVoice : READING_MESSAGES.unsupported}
        </p>
      </div>
    );
  }

  return (
    <div aria-describedby={statusId} className="speech-controls" data-reading="skip" role="group" aria-label="Leitura em voz alta">
      <button onClick={readPage} type="button">
        Ouvir esta página
      </button>
      {/* The selection is taken when the button is pressed, before the click can clear it. */}
      <button
        onClick={readSelection}
        onPointerDown={() => {
          selectionRef.current = window.getSelection()?.toString() ?? "";
        }}
        type="button"
      >
        Ouvir o trecho selecionado
      </button>
      {state === "paused" ? (
        <button onClick={() => playerRef.current?.resume()} type="button">
          Continuar leitura
        </button>
      ) : (
        <button disabled={state !== "speaking"} onClick={() => playerRef.current?.pause()} type="button">
          Pausar leitura
        </button>
      )}
      <button disabled={state === "idle"} onClick={() => playerRef.current?.stop()} type="button">
        Parar leitura
      </button>
      <label className="speech-rate">
        Velocidade
        <select name="speechRate" onChange={changeRate} value={rate}>
          {SPEECH_RATES.map((option) => (
            <option key={option} value={option}>
              {speechRateLabel(option)}
            </option>
          ))}
        </select>
      </label>
      {/* Announced politely (6.3 item 4) without role="status": the page's own messages keep that role alone. */}
      <p aria-live="polite" className="speech-status" id={statusId}>
        {message}
      </p>
    </div>
  );
}
