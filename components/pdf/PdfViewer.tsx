"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import WordPopup from "./WordPopup";
import { updateReadingProgress } from "@/lib/services/books";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PdfViewerProps {
  fileUrl: string;
  bookId: string;
  bookTitle: string;
  initialPage?: number;
  onClose: () => void;
}

const EDGE_ZONE = 0.2;
const TAP_THRESHOLD_MS = 300;
const LONG_PRESS_MS = 400;

// ─── Utility: get word + Range at a point ─────────────────
function getWordRangeAtPoint(
  x: number,
  y: number
): { word: string; range: Range } | null {
  // Try standard API first, then fallback for broader device support
  let caretRange: Range | null = null;

  if (document.caretRangeFromPoint) {
    caretRange = document.caretRangeFromPoint(x, y);
  } else if ((document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint) {
    const pos = (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offsetNode: Node; offset: number } | null }).caretPositionFromPoint(x, y);
    if (pos) {
      caretRange = document.createRange();
      caretRange.setStart(pos.offsetNode, pos.offset);
      caretRange.collapse(true);
    }
  }

  if (!caretRange) return null;

  const node = caretRange.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent || "";
  let start = caretRange.startOffset;
  let end = caretRange.startOffset;

  while (start > 0 && /[\w'-]/.test(text[start - 1])) start--;
  while (end < text.length && /[\w'-]/.test(text[end])) end++;

  if (start === end) return null;

  const word = text
    .slice(start, end)
    .replace(/[^a-zA-Z'-]/g, "")
    .toLowerCase();
  if (word.length <= 1) return null;

  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  return { word, range };
}

// ─── Helper: compute highlight rects from a range (handles multi-line) ──
function getHighlightRects(range: Range): DOMRect[] {
  const rects = Array.from(range.getClientRects());
  if (rects.length === 0) {
    const bounding = range.getBoundingClientRect();
    if (bounding.width > 0 && bounding.height > 0) return [bounding];
    return [];
  }
  return rects;
}

function getLookupPosFromRange(range: Range) {
  const rect = range.getBoundingClientRect();
  return {
    x: Math.min(Math.max(rect.left + rect.width / 2, 50), window.innerWidth - 50),
    y: rect.top - 8,
  };
}

export default function PdfViewer({
  fileUrl,
  bookId,
  bookTitle,
  initialPage = 1,
  onClose,
}: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [pageWidth, setPageWidth] = useState(360);
  const [showControls, setShowControls] = useState(true);
  const [showPageJump, setShowPageJump] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [flashSide, setFlashSide] = useState<"left" | "right" | null>(null);

  // Selection UI state — multiple rects for multi-line selections
  const [highlightRects, setHighlightRects] = useState<DOMRect[]>([]);
  const [lookupPosition, setLookupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  const pdfDimsRef = useRef<{ w: number; h: number } | null>(null);

  // ─── Calculate optimal page width (fit-to-viewport) ──────
  const calcOptimalWidth = useCallback(() => {
    const dims = pdfDimsRef.current;
    if (!dims) return window.innerWidth;
    const ratio = dims.w / dims.h;
    const topBar = 56;
    const bottomBar = 48;
    const safeTop = 44;
    const availH = window.innerHeight - topBar - bottomBar - safeTop;
    const availW = window.innerWidth;
    return Math.min(availW, availH * ratio);
  }, []);

  useEffect(() => {
    const onResize = () => setPageWidth(calcOptimalWidth());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [calcOptimalWidth]);

  // Auto-hide controls after 4 seconds
  useEffect(() => {
    if (showControls) {
      const timer = setTimeout(() => setShowControls(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [showControls]);

  // ─── Shared: apply word selection + show highlight ────────
  const selectWordFromRange = useCallback(
    (result: { word: string; range: Range }) => {
      const { range } = result;

      // Apply range to native selection (enables adjustable handles on touch)
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

      // Show custom highlight overlay + "Look up" button
      setHighlightRects(getHighlightRects(range));
      setLookupPosition(getLookupPosFromRange(range));
    },
    []
  );

  // ─── Listen for selection changes (adjustable selection) ──
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        // Only clear if we're not showing the popup
        if (!selectedWord) {
          setHighlightRects([]);
          setLookupPosition(null);
        }
        return;
      }

      // Only update if selection is inside our reader
      const range = selection.getRangeAt(0);
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setHighlightRects([]);
        setLookupPosition(null);
        return;
      }

      // Update highlight + button position as user adjusts handles
      setHighlightRects(getHighlightRects(range));
      setLookupPosition(getLookupPosFromRange(range));
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, [selectedWord]);

  // ─── Prevent native iOS context menu on text layer ────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleContextMenu = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.closest(".react-pdf__Page__textContent")) {
        e.preventDefault();
      }
    };
    container.addEventListener("contextmenu", handleContextMenu);
    return () =>
      container.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => setNumPages(numPages),
    []
  );

  const onPageLoadSuccess = useCallback(
    (page: { originalWidth: number; originalHeight: number }) => {
      pdfDimsRef.current = { w: page.originalWidth, h: page.originalHeight };
      setPageWidth(calcOptimalWidth());
    },
    [calcOptimalWidth]
  );

  // ─── Page navigation ────────────────────────────────────
  const changePage = useCallback(
    (newPage: number) => {
      const clamped = Math.max(1, Math.min(numPages, newPage));
      setPageNumber(clamped);
      setHighlightRects([]);
      setLookupPosition(null);
      window.getSelection()?.removeAllRanges();
      updateReadingProgress(bookId, clamped).catch((err) =>
        console.error("Failed to save progress:", err)
      );
    },
    [numPages, bookId]
  );

  const flashAndFlip = useCallback(
    (direction: "left" | "right") => {
      setFlashSide(direction);
      setTimeout(() => setFlashSide(null), 300);
      changePage(direction === "right" ? pageNumber + 1 : pageNumber - 1);
    },
    [changePage, pageNumber]
  );

  // ─── Handle "Look up" button ─────────────────────────────
  const handleLookup = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      const firstWord = text.split(/\s+/)[0];
      const cleaned = firstWord.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
      if (cleaned.length > 1) {
        setHighlightRects([]);
        setLookupPosition(null);
        setSelectedWord(cleaned);
        selection?.removeAllRanges();
      }
    }
  }, []);

  // ─── Clear selection on tap outside ───────────────────────
  const clearSelection = useCallback(() => {
    setHighlightRects([]);
    setLookupPosition(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // ─── MOBILE/TABLET: Touch handlers (long-press) ──────────
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (selectedWord) return;

      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;

      touchStartRef.current = { x, y, time: Date.now() };
      longPressPosRef.current = { x, y };
      isLongPressRef.current = false;

      // Prevent native iOS/iPadOS selection on text layer — we handle it ourselves
      const target = e.target as HTMLElement;
      if (target.closest(".react-pdf__Page__textContent")) {
        e.preventDefault();
      }

      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      // Long-press timer: select word + show highlight + "Look up" button
      longPressTimerRef.current = setTimeout(() => {
        const pos = longPressPosRef.current;
        if (pos) {
          isLongPressRef.current = true;
          const result = getWordRangeAtPoint(pos.x, pos.y);
          if (result) {
            selectWordFromRange(result);
          }
        }
      }, LONG_PRESS_MS);
    },
    [selectedWord, selectWordFromRange]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const pos = longPressPosRef.current;
    if (!pos) return;
    const touch = e.touches[0];
    const dx = touch.clientX - pos.x;
    const dy = touch.clientY - pos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressPosRef.current = null;
      touchStartRef.current = null;
    }
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (selectedWord) return;

      // If long-press fired, don't navigate
      if (isLongPressRef.current) {
        isLongPressRef.current = false;
        return;
      }

      // If there's a selection with highlight showing, tap clears it
      if (highlightRects.length > 0) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          // Check if user tapped outside the selection — clear it
          const touch = e.changedTouches[0];
          const result = getWordRangeAtPoint(touch.clientX, touch.clientY);
          const selectedText = selection.toString().trim();
          if (!result || result.word !== selectedText.split(/\s+/)[0]?.replace(/[^a-zA-Z'-]/g, "").toLowerCase()) {
            clearSelection();
            return;
          }
        }
        return;
      }

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      const touch = e.changedTouches[0];
      const start = touchStartRef.current;
      if (!start) return;

      const elapsed = Date.now() - start.time;
      if (elapsed > TAP_THRESHOLD_MS) return;

      const relX = touch.clientX / window.innerWidth;
      if (relX < EDGE_ZONE) {
        flashAndFlip("left");
      } else if (relX > 1 - EDGE_ZONE) {
        flashAndFlip("right");
      } else {
        setShowControls((s) => !s);
      }
    },
    [flashAndFlip, selectedWord, highlightRects, clearSelection]
  );

  // ─── DESKTOP: Mouse handlers (double-click) ──────────────
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectedWord) return;

      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      // Clear any existing highlight on click
      if (highlightRects.length > 0) {
        clearSelection();
        return;
      }

      const relX = e.clientX / window.innerWidth;
      if (relX < EDGE_ZONE) {
        flashAndFlip("left");
      } else if (relX > 1 - EDGE_ZONE) {
        flashAndFlip("right");
      } else {
        setShowControls((s) => !s);
      }
    },
    [flashAndFlip, selectedWord, highlightRects, clearSelection]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const result = getWordRangeAtPoint(e.clientX, e.clientY);
      if (result) {
        selectWordFromRange(result);
      }
    },
    [selectWordFromRange]
  );

  // ─── Page jump ──────────────────────────────────────────
  const handlePageJump = () => {
    const num = parseInt(jumpInput, 10);
    if (num >= 1 && num <= numPages) {
      changePage(num);
      setShowPageJump(false);
      setJumpInput("");
    }
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="reading-mode fixed inset-0 flex flex-col"
      style={{ backgroundColor: "var(--reading-bg)" }}
    >
      {/* ─── Top controls overlay ─── */}
      <div
        className={`absolute top-0 left-0 right-0 z-30 transition-all duration-300 ${
          showControls
            ? "opacity-100 translate-y-0"
            : "opacity-0 -translate-y-full pointer-events-none"
        }`}
      >
        <div
          className="flex items-center justify-between px-4 py-3 bg-black/60 text-white"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <h1 className="text-sm font-medium truncate flex-1 mr-3">
            {bookTitle}
          </h1>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="text-white/80 hover:text-white text-xl leading-none px-2"
          >
            ✕
          </button>
        </div>
      </div>

      {/* ─── PDF content area ─── */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          loading={
            <div className="flex items-center justify-center h-screen">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          }
        >
          <Page
            pageNumber={pageNumber}
            width={pageWidth}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            onLoadSuccess={onPageLoadSuccess}
          />
        </Document>
      </div>

      {/* ─── Edge flash indicators ─── */}
      {flashSide === "left" && (
        <div className="flash-arrow fixed left-0 top-0 bottom-0 w-16 flex items-center justify-center pointer-events-none z-20">
          <span className="text-4xl text-gray-600">‹</span>
        </div>
      )}
      {flashSide === "right" && (
        <div className="flash-arrow fixed right-0 top-0 bottom-0 w-16 flex items-center justify-center pointer-events-none z-20">
          <span className="text-4xl text-gray-600">›</span>
        </div>
      )}

      {/* ─── Bottom page controls ─── */}
      <div
        className="absolute bottom-0 left-0 right-0 z-30"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-center gap-6 px-4 py-2.5 bg-black/60 text-white text-sm">
          <button
            onClick={() => flashAndFlip("left")}
            disabled={pageNumber <= 1}
            className="px-3 py-1 disabled:opacity-30 text-lg"
          >
            ‹
          </button>
          <button
            onClick={() => setShowPageJump(true)}
            className="hover:underline"
          >
            {pageNumber} / {numPages || "..."}
          </button>
          <button
            onClick={() => flashAndFlip("right")}
            disabled={pageNumber >= numPages}
            className="px-3 py-1 disabled:opacity-30 text-lg"
          >
            ›
          </button>
        </div>
      </div>

      {/* ─── Page jump modal ─── */}
      {showPageJump && (
        <>
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={() => setShowPageJump(false)}
          />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl p-5 shadow-xl z-50 w-64">
            <div className="text-sm font-medium mb-3">Go to page</div>
            <div className="flex gap-2">
              <input
                type="number"
                min={1}
                max={numPages}
                value={jumpInput}
                onChange={(e) => setJumpInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePageJump()}
                placeholder={`1 – ${numPages}`}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                autoFocus
              />
              <button
                onClick={handlePageJump}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                Go
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Custom word highlight overlay (multi-rect for multi-line) ─── */}
      {highlightRects.length > 0 && !selectedWord && (
        <>
          {highlightRects.map((rect, i) => (
            <div
              key={i}
              style={{
                position: "fixed",
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                background: "rgba(187, 247, 208, 0.6)",
                borderBottom: "2px solid rgba(34, 197, 94, 0.7)",
                borderRadius: 2,
                pointerEvents: "none",
                zIndex: 10,
              }}
            />
          ))}
        </>
      )}

      {/* ─── Floating "Look up" button ─── */}
      {lookupPosition && !selectedWord && (
        <button
          className="fixed z-50 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-full shadow-lg active:bg-green-700"
          style={{
            left: lookupPosition.x,
            top: lookupPosition.y,
            transform: "translate(-50%, -100%)",
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            handleLookup();
          }}
        >
          Look up
        </button>
      )}

      {/* ─── Word popup ─── */}
      {selectedWord && (
        <WordPopup
          word={selectedWord}
          onClose={() => {
            setSelectedWord(null);
            setHighlightRects([]);
            setLookupPosition(null);
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
}
