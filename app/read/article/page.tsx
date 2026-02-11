"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import WordPopup from "@/components/pdf/WordPopup";

export default function ArticleReaderPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);

  const startReading = () => {
    if (!text.trim()) return;
    setIsReading(true);
  };

  const handleWordClick = (word: string) => {
    const cleaned = word.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
    if (cleaned.length > 1) {
      setSelectedWord(cleaned);
    }
  };

  // Split text into words and make each tappable
  const renderText = () => {
    return text.split(/(\s+)/).map((segment, i) => {
      if (/^\s+$/.test(segment)) {
        return <span key={i}>{segment}</span>;
      }
      return (
        <span
          key={i}
          onClick={() => handleWordClick(segment)}
          className="cursor-pointer hover:bg-yellow-100 active:bg-yellow-200 rounded px-0.5 transition-colors"
        >
          {segment}
        </span>
      );
    });
  };

  if (!isReading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-blue-600 text-sm">
            ← Back
          </button>
          <h1 className="text-xl font-bold">Paste Article</h1>
        </div>

        <input
          type="text"
          placeholder="Article title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <textarea
          placeholder="Paste your English article text here..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <button
          onClick={startReading}
          disabled={!text.trim()}
          className="w-full py-3 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 disabled:opacity-30 transition-colors"
        >
          Start Reading
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => setIsReading(false)} className="text-blue-600 text-sm">
          ← Back
        </button>
        <h1 className="text-lg font-semibold truncate flex-1">
          {title || "Article"}
        </h1>
      </div>

      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 leading-7 text-base">
        {renderText()}
      </div>

      {selectedWord && (
        <WordPopup
          word={selectedWord}
          onClose={() => setSelectedWord(null)}
        />
      )}
    </div>
  );
}
