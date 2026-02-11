import { useState, useMemo, useRef, useEffect } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, MoveRight, X } from "lucide-react";

interface TranscriptFile {
  name: string;
  type?: string;
  source?: string;
  year?: string | null;
  month?: string | null;
  startDate?: string | null;
  dateConfidence?: number;
  uploadedAt?: string;
  filename?: string;
  id?: string;
}

interface TranscriptFolderTreeProps {
  transcripts: TranscriptFile[];
  onFileClick?: (file: TranscriptFile) => void;
  onMoveFile?: (file: TranscriptFile, year: string | null, month: string | null) => void;
}

interface FolderNode {
  name: string;
  type: "folder" | "file";
  children?: FolderNode[];
  file?: TranscriptFile;
  count?: number;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function buildFolderTree(transcripts: TranscriptFile[]): FolderNode[] {
  const yearMap: Record<string, Record<string, TranscriptFile[]>> = {};
  const unsorted: TranscriptFile[] = [];

  for (const t of transcripts) {
    if (t.year) {
      if (!yearMap[t.year]) yearMap[t.year] = {};
      const monthKey = t.month || "Unknown";
      if (!yearMap[t.year][monthKey]) yearMap[t.year][monthKey] = [];
      yearMap[t.year][monthKey].push(t);
    } else {
      unsorted.push(t);
    }
  }

  const tree: FolderNode[] = [];

  const sortedYears = Object.keys(yearMap).sort((a, b) => parseInt(b) - parseInt(a));
  
  for (const year of sortedYears) {
    const months = yearMap[year];
    const monthOrder = [...MONTHS, "Unknown"];
    
    const sortedMonths = Object.keys(months).sort((a, b) => {
      return monthOrder.indexOf(a) - monthOrder.indexOf(b);
    });

    const monthNodes: FolderNode[] = sortedMonths.map(month => ({
      name: month,
      type: "folder" as const,
      count: months[month].length,
      children: months[month].map(f => ({
        name: f.name,
        type: "file" as const,
        file: f,
      })),
    }));

    const totalFiles = Object.values(months).reduce((sum, arr) => sum + arr.length, 0);
    
    tree.push({
      name: year,
      type: "folder",
      count: totalFiles,
      children: monthNodes,
    });
  }

  if (unsorted.length > 0) {
    tree.push({
      name: "Unsorted",
      type: "folder",
      count: unsorted.length,
      children: unsorted.map(f => ({
        name: f.name,
        type: "file",
        file: f,
      })),
    });
  }

  return tree;
}

function MoveDialog({
  file,
  existingYears,
  onMove,
  onClose,
}: {
  file: TranscriptFile;
  existingYears: string[];
  onMove: (file: TranscriptFile, year: string | null, month: string | null) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(file.year || "");
  const [month, setMonth] = useState(file.month || "");
  const [customYear, setCustomYear] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const finalYear = year === "__custom__" ? customYear : year;

  const handleSubmit = () => {
    onMove(file, finalYear || null, month || null);
    onClose();
  };

  const yearOptions = [...new Set([...existingYears, ...(file.year ? [file.year] : [])])].sort((a, b) => parseInt(b) - parseInt(a));

  return (
    <div
      ref={dialogRef}
      className="absolute z-50 p-3 rounded-lg shadow-lg space-y-2"
      style={{
        backgroundColor: "var(--chatty-bg-sidebar)",
        border: "1px solid var(--chatty-line)",
        minWidth: "220px",
        right: 0,
        top: "100%",
        marginTop: "4px",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: "var(--chatty-text)" }}>
          Move to folder
        </span>
        <button onClick={onClose} className="p-0.5 rounded hover:bg-white/10">
          <X size={12} style={{ color: "var(--chatty-text)", opacity: 0.6 }} />
        </button>
      </div>

      <div>
        <label className="text-[10px] block mb-0.5" style={{ color: "var(--chatty-text)", opacity: 0.6 }}>Year</label>
        <select
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-full p-1.5 rounded text-xs"
          style={{
            backgroundColor: "var(--chatty-bg-main)",
            borderColor: "var(--chatty-line)",
            color: "var(--chatty-text)",
            border: "1px solid var(--chatty-line)",
          }}
        >
          <option value="">Unsorted</option>
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
          <option value="__custom__">Custom year...</option>
        </select>
        {year === "__custom__" && (
          <input
            type="text"
            placeholder="e.g. 2024"
            value={customYear}
            onChange={(e) => setCustomYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full p-1.5 rounded text-xs mt-1"
            style={{
              backgroundColor: "var(--chatty-bg-main)",
              border: "1px solid var(--chatty-line)",
              color: "var(--chatty-text)",
            }}
            autoFocus
          />
        )}
      </div>

      {(finalYear) && (
        <div>
          <label className="text-[10px] block mb-0.5" style={{ color: "var(--chatty-text)", opacity: 0.6 }}>Month</label>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full p-1.5 rounded text-xs"
            style={{
              backgroundColor: "var(--chatty-bg-main)",
              border: "1px solid var(--chatty-line)",
              color: "var(--chatty-text)",
            }}
          >
            <option value="">Unknown</option>
            {MONTHS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={year === "__custom__" && (!customYear || customYear.length !== 4)}
        className="w-full p-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40"
        style={{
          backgroundColor: "var(--chatty-accent)",
          color: "white",
        }}
      >
        Move
      </button>
    </div>
  );
}

function FolderItem({
  node,
  depth,
  onFileClick,
  onMoveFile,
  existingYears,
}: {
  node: FolderNode;
  depth: number;
  onFileClick?: (file: TranscriptFile) => void;
  onMoveFile?: (file: TranscriptFile, year: string | null, month: string | null) => void;
  existingYears: string[];
}) {
  const [isOpen, setIsOpen] = useState(depth === 0);
  const [showMoveDialog, setShowMoveDialog] = useState(false);

  if (node.type === "file") {
    return (
      <div
        className="group flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-white/10 transition-colors relative"
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        onClick={() => node.file && onFileClick?.(node.file)}
      >
        <FileText size={14} style={{ color: "var(--chatty-accent)", opacity: 0.8 }} />
        <span
          className="text-xs truncate flex-1"
          style={{ color: "var(--chatty-text)", opacity: 0.9 }}
          title={node.name}
        >
          {node.name}
        </span>
        {node.file?.dateConfidence !== undefined && node.file.dateConfidence > 0 && (
          <span
            className="text-[10px] px-1 rounded"
            style={{
              backgroundColor: node.file.dateConfidence >= 0.9 
                ? "rgba(34, 197, 94, 0.2)" 
                : node.file.dateConfidence >= 0.7 
                  ? "rgba(234, 179, 8, 0.2)" 
                  : "rgba(239, 68, 68, 0.2)",
              color: node.file.dateConfidence >= 0.9 
                ? "#22c55e" 
                : node.file.dateConfidence >= 0.7 
                  ? "#eab308" 
                  : "#ef4444",
            }}
          >
            {Math.round(node.file.dateConfidence * 100)}%
          </span>
        )}
        {onMoveFile && node.file?.id && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/20 transition-opacity"
            title="Move to folder"
            onClick={(e) => {
              e.stopPropagation();
              setShowMoveDialog(true);
            }}
          >
            <MoveRight size={12} style={{ color: "var(--chatty-text)", opacity: 0.7 }} />
          </button>
        )}
        {showMoveDialog && node.file && onMoveFile && (
          <MoveDialog
            file={node.file}
            existingYears={existingYears}
            onMove={onMoveFile}
            onClose={() => setShowMoveDialog(false)}
          />
        )}
      </div>
    );
  }

  const isYear = /^\d{4}$/.test(node.name);
  const isUnsorted = node.name === "Unsorted";

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-white/10 transition-colors"
        style={{ paddingLeft: `${depth * 12}px` }}
        onClick={() => setIsOpen(!isOpen)}
      >
        {isOpen ? (
          <ChevronDown size={14} style={{ color: "var(--chatty-text)", opacity: 0.6 }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--chatty-text)", opacity: 0.6 }} />
        )}
        {isOpen ? (
          <FolderOpen size={14} style={{ color: isYear ? "#f59e0b" : isUnsorted ? "#94a3b8" : "var(--chatty-accent)" }} />
        ) : (
          <Folder size={14} style={{ color: isYear ? "#f59e0b" : isUnsorted ? "#94a3b8" : "var(--chatty-accent)" }} />
        )}
        <span
          className="text-sm font-medium flex-1"
          style={{ color: "var(--chatty-text)" }}
        >
          {node.name}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--chatty-bg-message)",
            color: "var(--chatty-text)",
            opacity: 0.7,
          }}
        >
          {node.count}
        </span>
      </div>
      {isOpen && node.children && (
        <div>
          {node.children.map((child, idx) => (
            <FolderItem
              key={`${child.name}-${idx}`}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onMoveFile={onMoveFile}
              existingYears={existingYears}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TranscriptFolderTree({ transcripts, onFileClick, onMoveFile }: TranscriptFolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(transcripts), [transcripts]);

  const existingYears = useMemo(() => {
    const years = new Set<string>();
    for (const t of transcripts) {
      if (t.year) years.add(t.year);
    }
    return Array.from(years).sort((a, b) => parseInt(b) - parseInt(a));
  }, [transcripts]);

  if (transcripts.length === 0) {
    return (
      <div
        className="text-center py-4"
        style={{ color: "var(--chatty-text)", opacity: 0.5 }}
      >
        <FileText size={24} className="mx-auto mb-2 opacity-50" />
        <p className="text-xs">No transcripts stored</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {tree.map((node, idx) => (
        <FolderItem
          key={`${node.name}-${idx}`}
          node={node}
          depth={0}
          onFileClick={onFileClick}
          onMoveFile={onMoveFile}
          existingYears={existingYears}
        />
      ))}
    </div>
  );
}

export default TranscriptFolderTree;
