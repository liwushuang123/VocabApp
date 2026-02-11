"use client";

import { useState, useEffect, useCallback } from "react";
import { createWord } from "@/lib/services/words";

interface WordPopupProps {
  word: string;
  onClose: () => void;
}

interface WordData {
  word: string;
  translation: string;
  definition: string;
  example: string;
  audioUrl: string | null;
}

export default function WordPopup({ word, onClose }: WordPopupProps) {
  const [data, setData] = useState<WordData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    setSaved(false);

    // Fetch both Chinese translation and English definition in parallel
    const translatePromise = fetch(`/api/translate?word=${encodeURIComponent(word)}`)
      .then((res) => (res.ok ? res.json() : { translation: null }))
      .catch(() => ({ translation: null }));

    const dictPromise = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`)
      .then((res) => (res.ok ? res.json() : Promise.reject("not found")))
      .then((entries) => {
        const entry = entries[0];
        const meaning = entry.meanings?.[0];
        const def = meaning?.definitions?.[0];
        const phonetic = entry.phonetics?.find((p: { audio?: string }) => p.audio);
        return {
          word: entry.word,
          definition: def?.definition || "No definition found",
          example: def?.example || "",
          audioUrl: phonetic?.audio || null,
        };
      })
      .catch(() => ({
        word,
        definition: "Definition not found",
        example: "",
        audioUrl: null,
      }));

    Promise.all([translatePromise, dictPromise]).then(([zhData, enData]) => {
      setData({
        word: enData.word,
        translation: zhData.translation || "",
        definition: enData.definition,
        example: enData.example,
        audioUrl: enData.audioUrl,
      });
      setLoading(false);
    });
  }, [word]);

  const playAudio = useCallback(() => {
    if (data?.audioUrl) {
      new Audio(data.audioUrl).play();
    } else {
      // Fallback: Web Speech API
      const utterance = new SpeechSynthesisUtterance(word);
      utterance.lang = "en-US";
      speechSynthesis.speak(utterance);
    }
  }, [data, word]);

  const saveWord = async () => {
    if (!data || saving) return;
    setSaving(true);

    try {
      await createWord({
        word: data.word,
        translation: data.translation,
        definition: data.definition,
        example: data.example,
        audio_url: data.audioUrl,
        category: "learning",
        repetitions: 0,
        ease_factor: 2.5,
        interval_days: 0,
        next_review_at: new Date().toISOString(),
      });
      setSaved(true);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("already exists")) {
        setSaved(true);
      } else {
        console.error("Failed to save word:", error);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 p-5 shadow-xl max-h-[60vh] overflow-y-auto"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
          </div>
        ) : data ? (
          <div className="space-y-3">
            {/* Word + pronunciation */}
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">{data.word}</h2>
              <button
                onClick={playAudio}
                className="p-2 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100"
                aria-label="Play pronunciation"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                  <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
                  <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
                </svg>
              </button>
            </div>

            {/* Chinese translation */}
            {data.translation && (
              <div className="text-2xl text-gray-800 font-medium">{data.translation}</div>
            )}

            {/* Definition */}
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Definition</div>
              <div className="text-gray-700">{data.definition}</div>
            </div>

            {/* Example */}
            {data.example && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Example</div>
                <div className="text-gray-600 italic">{data.example}</div>
              </div>
            )}

            {/* Save button */}
            <button
              onClick={saveWord}
              disabled={saved || saving}
              className={`w-full py-3 rounded-xl font-medium text-sm transition-colors ${
                saved
                  ? "bg-green-50 text-green-600 border border-green-200"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {saved ? "Saved!" : saving ? "Saving..." : "Save to Vocabulary"}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
