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

const EDGE_ZONE = 0.2; // 20% on each side
const TAP_THRESHOLD_MS = 300;
const LONG_PRESS_MS = 300;

// ─── Utility: get the word at a touch/click point ────────────
function getWordAtPoint(x: number, y: number): string | null {
  const range = document.caretRangeFromPoint(x, y);
  if (!range) return null;

  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent || "";
  let start = range.startOffset;
  let end = range.startOffset;

  // Expand backward to word start
  while (start > 0 && /[\w'-]/.test(text[start - 1])) start--;
  // Expand forward to word end
  while (end < text.length && /[\w'-]/.test(text[end])) end++;

  // Nothing found
  if (start === end) return null;

  const word = text.slice(start, end).replace(/[^a-zA-Z'-]/g, "").toLowerCase();
  return word.length > 1 ? word : null;
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
  const [lookupPosition, setLookupPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressRef = useRef(false);
  // Store PDF original dimensions for resize recalculation
  const pdfDimsRef = useRef<{ w: number; h: number } | null>(null);

  // ─── Calculate optimal page width (fit-to-viewport) ──────
  const calcOptimalWidth = useCallback(() => {
    const dims = pdfDimsRef.current;
    if (!dims) return window.innerWidth;

    const ratio = dims.w / dims.h;
    const topBar = 56;
    const bottomBar = 48;
    // Use CSS env for safe area if available, fallback to 44px
    const safeTop = 44;
    const availH = window.innerHeight - topBar - bottomBar - safeTop;
    const availW = window.innerWidth;
    const widthFromH = availH * ratio;
    return Math.min(availW, widthFromH);
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

  // ─── Listen for native text selection ─────────────────────
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) {
        setLookupPosition(null);
        return;
      }

      // Only show "Look up" if selection is inside our reader
      const range = selection.getRangeAt(0);
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setLookupPosition(null);
        return;
      }

      // Position the button above the selection
      const rect = range.getBoundingClientRect();
      setLookupPosition({
        x: Math.min(
          Math.max(rect.left + rect.width / 2, 50),
          window.innerWidth - 50
        ),
        y: rect.top - 8,
      });
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

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
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
    },
    []
  );

  // ─── Page load: get dimensions for fit-to-viewport ────────
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

  // ─── Handle "Look up" button click ──────────────────────
  const handleLookup = useCallback(() => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      // Take the first word if multiple words selected
      const firstWord = text.split(/\s+/)[0];
      const cleaned = firstWord.replace(/[^a-zA-Z'-]/g, "").toLowerCase();
      if (cleaned.length > 1) {
        setSelectedWord(cleaned);
        setLookupPosition(null);
        selection?.removeAllRanges();
      }
    }
  }, []);

  // ─── Touch handling (mobile) ────────────────────────────
  // Custom long-press: selects single word at touch point.
  // Short taps on edges flip pages.
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (selectedWord) return;

      const touch = e.touches[0];
      const x = touch.clientX;
      const y = touch.clientY;

      touchStartRef.current = { x, y, time: Date.now() };
      longPressPosRef.current = { x, y };
      isLongPressRef.current = false;

      // Clear any existing timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }

      // Start long-press timer — opens popup directly on word detection
      longPressTimerRef.current = setTimeout(() => {
        const pos = longPressPosRef.current;
        if (pos) {
          isLongPressRef.current = true;
          const word = getWordAtPoint(pos.x, pos.y);
          if (word) {
            setSelectedWord(word); // Open popup directly — no intermediate "Look up" step
          }
        }
      }, LONG_PRESS_MS);
    },
    [selectedWord]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const pos = longPressPosRef.current;
    if (!pos) return;

    const touch = e.touches[0];
    const dx = touch.clientX - pos.x;
    const dy = touch.clientY - pos.y;

    // If finger moved > 10px, cancel long-press
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
      // Clear long-press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }

      if (selectedWord) return;

      // If long-press fired, don't do page navigation
      if (isLongPressRef.current) {
        isLongPressRef.current = false;
        return;
      }

      // If there's an active text selection, don't flip page
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      const touch = e.changedTouches[0];
      const start = touchStartRef.current;
      if (!start) return;

      const elapsed = Date.now() - start.time;
      if (elapsed > TAP_THRESHOLD_MS) return; // Not a quick tap

      const relX = touch.clientX / window.innerWidth;

      if (relX < EDGE_ZONE) {
        flashAndFlip("left");
      } else if (relX > 1 - EDGE_ZONE) {
        flashAndFlip("right");
      } else {
        setShowControls((s) => !s);
      }
    },
    [flashAndFlip, selectedWord]
  );

  // ─── Mouse handling (desktop) ───────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (selectedWord) return;

      // If there's a text selection, don't handle as page flip
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed) return;

      const relX = e.clientX / window.innerWidth;

      if (relX < EDGE_ZONE) {
        flashAndFlip("left");
      } else if (relX > 1 - EDGE_ZONE) {
        flashAndFlip("right");
      } else {
        setShowControls((s) => !s);
      }
    },
    [flashAndFlip, selectedWord]
  );

  // Let browser handle double-click selection natively; just prevent page flip
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

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
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
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
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <button
                onClick={handlePageJump}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                Go
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─── Floating "Look up" button ─── */}
      {lookupPosition && !selectedWord && (
        <button
          className="fixed z-50 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-full shadow-lg"
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
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
}
