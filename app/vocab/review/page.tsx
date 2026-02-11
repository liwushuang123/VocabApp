"use client";

import { useState, useEffect, useCallback } from "react";
import { sm2 } from "@/lib/spaced-repetition/sm2";
import { getDueWords, updateWord } from "@/lib/services/words";
import type { VocabWord } from "@/lib/services/words";

export default function ReviewPage() {
  const [dueWords, setDueWords] = useState<VocabWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDueWords();
  }, []);

  const loadDueWords = async () => {
    setLoading(true);
    try {
      const due = await getDueWords();
      setDueWords(due);
      if (due.length === 0) setSessionComplete(true);
    } catch (error) {
      console.error("Failed to load due words:", error);
    }
    setLoading(false);
  };

  const currentWord = dueWords[currentIndex];

  const playAudio = useCallback(() => {
    if (!currentWord) return;
    if (currentWord.audio_url) {
      new Audio(currentWord.audio_url).play();
    } else {
      const utterance = new SpeechSynthesisUtterance(currentWord.word);
      utterance.lang = "en-US";
      speechSynthesis.speak(utterance);
    }
  }, [currentWord]);

  const handleReview = async (quality: number) => {
    if (!currentWord) return;

    // Compute new SM-2 state (camelCase output)
    const newState = sm2(quality, {
      repetitions: currentWord.repetitions,
      easeFactor: currentWord.ease_factor,
      intervalDays: currentWord.interval_days,
      nextReviewAt: currentWord.next_review_at,
    });

    // Map review quality to category
    const category =
      quality === 5 ? "learned" : quality === 1 ? "difficult" : "learning";

    try {
      // Map camelCase SM-2 output → snake_case Supabase columns
      await updateWord(currentWord.id, {
        repetitions: newState.repetitions,
        ease_factor: newState.easeFactor,
        interval_days: newState.intervalDays,
        next_review_at: newState.nextReviewAt,
        category,
      });

      setReviewed((r) => r + 1);
      setRevealed(false);

      if (currentIndex + 1 < dueWords.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setSessionComplete(true);
      }
    } catch (error) {
      console.error("Failed to update word:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Review</h1>
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎉</div>
          <p className="text-lg font-medium">
            {reviewed > 0 ? "Session complete!" : "No words to review"}
          </p>
          <p className="text-gray-500 mt-2">
            {reviewed > 0
              ? `You reviewed ${reviewed} word${reviewed !== 1 ? "s" : ""}`
              : "Save some words while reading to start reviewing"}
          </p>
        </div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Review</h1>
        <span className="text-sm text-gray-400">
          {currentIndex + 1} / {dueWords.length}
        </span>
      </div>

      {/* Flashcard */}
      <div
        onClick={() => !revealed && setRevealed(true)}
        className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 min-h-[280px] flex flex-col items-center justify-center cursor-pointer"
      >
        {/* Word */}
        <div className="text-3xl font-bold mb-4">{currentWord.word}</div>

        {/* Pronunciation button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            playAudio();
          }}
          className="p-2 rounded-full bg-green-50 text-green-600 hover:bg-green-100 mb-4"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
            <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 .898.121 1.768.35 2.595.341 1.24 1.518 1.905 2.659 1.905h1.93l4.5 4.5c.945.945 2.561.276 2.561-1.06V4.06zM18.584 5.106a.75.75 0 011.06 0c3.808 3.807 3.808 9.98 0 13.788a.75.75 0 11-1.06-1.06 8.25 8.25 0 000-11.668.75.75 0 010-1.06z" />
            <path d="M15.932 7.757a.75.75 0 011.061 0 6 6 0 010 8.486.75.75 0 01-1.06-1.061 4.5 4.5 0 000-6.364.75.75 0 010-1.06z" />
          </svg>
        </button>

        {revealed ? (
          <div className="text-center space-y-3 w-full">
            {currentWord.translation && (
              <div className="text-xl text-gray-700">{currentWord.translation}</div>
            )}
            <div className="text-gray-600">{currentWord.definition}</div>
            {currentWord.example && (
              <div className="text-sm text-gray-400 italic">{currentWord.example}</div>
            )}
          </div>
        ) : (
          <div className="text-gray-400 text-sm">Tap to reveal</div>
        )}
      </div>

      {/* Review buttons */}
      {revealed && (
        <div className="flex gap-3">
          <button
            onClick={() => handleReview(1)}
            className="flex-1 py-3 bg-red-50 text-red-600 rounded-xl font-medium text-sm border border-red-100 hover:bg-red-100 transition-colors"
          >
            😣 Hard
          </button>
          <button
            onClick={() => handleReview(3)}
            className="flex-1 py-3 bg-gray-50 text-gray-600 rounded-xl font-medium text-sm border border-gray-200 hover:bg-gray-100 transition-colors"
          >
            😐 Neutral
          </button>
          <button
            onClick={() => handleReview(5)}
            className="flex-1 py-3 bg-green-50 text-green-600 rounded-xl font-medium text-sm border border-green-100 hover:bg-green-100 transition-colors"
          >
            😊 Easy
          </button>
        </div>
      )}
    </div>
  );
}
