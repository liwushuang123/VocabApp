"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getAllWords,
  deleteWord as deleteWordService,
  updateWord,
} from "@/lib/services/words";
import type { VocabWord } from "@/lib/services/words";

export default function VocabPage() {
  const [words, setWords] = useState<VocabWord[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWords();
  }, []);

  const loadWords = async () => {
    setLoading(true);
    try {
      const data = await getAllWords();
      setWords(data);
    } catch (error) {
      console.error("Failed to load words:", error);
    }
    setLoading(false);
  };

  const playAudio = useCallback((word: VocabWord) => {
    if (word.audio_url) {
      new Audio(word.audio_url).play();
    } else {
      const utterance = new SpeechSynthesisUtterance(word.word);
      utterance.lang = "en-US";
      speechSynthesis.speak(utterance);
    }
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await deleteWordService(id);
      setWords(words.filter((w) => w.id !== id));
    } catch (error) {
      console.error("Failed to delete word:", error);
    }
  };

  const handleUpdateCategory = async (id: string, category: string) => {
    try {
      const updated = await updateWord(id, { category });
      setWords(words.map((w) => (w.id === id ? updated : w)));
    } catch (error) {
      console.error("Failed to update category:", error);
    }
  };

  const filtered = words.filter((w) => {
    const matchesSearch =
      w.word.toLowerCase().includes(search.toLowerCase()) ||
      w.definition.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || w.category === filter;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vocabulary</h1>

      {/* Search */}
      <input
        type="text"
        placeholder="Search words..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
      />

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["all", "learning", "learned", "difficult"].map((cat) => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === cat
                ? "bg-green-600 text-white"
                : "bg-white text-gray-600 border border-gray-200"
            }`}
          >
            {cat === "all" ? "All" : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Word count */}
      <div className="text-sm text-gray-400">
        {filtered.length} word{filtered.length !== 1 ? "s" : ""}
      </div>

      {/* Word list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-4xl mb-3">📝</div>
          <p>No words saved yet</p>
          <p className="text-sm mt-1">Tap words while reading to save them</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((word) => (
            <div
              key={word.id}
              className="bg-white rounded-xl p-4 shadow-sm border border-gray-100"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-lg">{word.word}</span>
                  <button
                    onClick={() => playAudio(word)}
                    className="p-1 rounded-full text-green-500 hover:bg-green-50"
                    aria-label="Play pronunciation"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M10 3.75a.75.75 0 00-1.264-.546L5.203 6H3.667a.75.75 0 00-.7.48A6.985 6.985 0 002.5 9c0 .887.165 1.737.468 2.52.111.29.39.48.7.48h1.535l3.533 2.796A.75.75 0 0010 14.25V3.75zM15.95 5.05a.75.75 0 00-1.06 1.061 5.5 5.5 0 010 7.778.75.75 0 001.06 1.06 7 7 0 000-9.899z" />
                    </svg>
                  </button>
                </div>
                <button
                  onClick={() => handleDelete(word.id)}
                  className="text-xs text-red-400 hover:text-red-600"
                >
                  Delete
                </button>
              </div>

              {word.translation && (
                <div className="text-gray-600 mt-1">{word.translation}</div>
              )}

              <div className="text-sm text-gray-500 mt-1">{word.definition}</div>

              {word.example && (
                <div className="text-sm text-gray-400 italic mt-1">{word.example}</div>
              )}

              {/* Category selector */}
              <div className="flex gap-1.5 mt-3">
                {["learning", "learned", "difficult"].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleUpdateCategory(word.id, cat)}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      word.category === cat
                        ? cat === "learned"
                          ? "bg-green-100 text-green-700"
                          : cat === "difficult"
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                        : "bg-gray-50 text-gray-400"
                    }`}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
