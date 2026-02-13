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
  onMoveFile?: (file: TranscriptFile, year: string | null, month: string | null, source?: string) => void;
}

interface FolderNode {
  name: string;
  type: "folder" | "file";
  children?: FolderNode[];
  file?: TranscriptFile;
  count?: number;
  icon?: string;
  folderKind?: "source" | "year" | "month" | "unsorted";
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const SOURCE_META: Record<string, { label: string; icon: string }> = {
  chatgpt: { label: "ChatGPT", icon: "🤖" },
  gemini: { label: "Gemini", icon: "✨" },
  grok: { label: "Grok", icon: "🔮" },
  copilot: { label: "Copilot", icon: "🪁" },
  claude: { label: "Claude", icon: "🎭" },
  chai: { label: "Chai", icon: "🍵" },
  "character.ai": { label: "Character.AI", icon: "👤" },
  deepseek: { label: "DeepSeek", icon: "🔍" },
  codex: { label: "Codex", icon: "💻" },
  github_copilot: { label: "GitHub Copilot", icon: "🐙" },
  other: { label: "Other", icon: "📝" },
  documents: { label: "Documents", icon: "📄" },
  transcripts: { label: "Transcripts", icon: "📝" },
  unknown: { label: "Unsorted", icon: "📁" },
};

const SCAFFOLD_SOURCES = ["chatgpt", "character.ai", "codex", "github_copilot"];

function buildFolderTree(transcripts: TranscriptFile[]): FolderNode[] {
  const sourceMap: Record<string, Record<string, Record<string, TranscriptFile[]>>> = {};
  const unsorted: TranscriptFile[] = [];

  for (const t of transcripts) {
    const src = t.source || "unknown";
    if (!sourceMap[src]) sourceMap[src] = {};

    if (t.year) {
      if (!sourceMap[src][t.year]) sourceMap[src][t.year] = {};
      const monthKey = t.month || "Unknown";
      if (!sourceMap[src][t.year][monthKey]) sourceMap[src][t.year][monthKey] = [];
      sourceMap[src][t.year][monthKey].push(t);
    } else {
      if (!sourceMap[src]["__unsorted__"]) sourceMap[src]["__unsorted__"] = { __files__: [] as unknown as TranscriptFile[] };
      (sourceMap[src]["__unsorted__"] as unknown as Record<string, TranscriptFile[]>).__files__ = 
        (sourceMap[src]["__unsorted__"] as unknown as Record<string, TranscriptFile[]>).__files__ || [];
      unsorted.push(t);
      if (!sourceMap[src]["__unsorted__"]["Unsorted"]) sourceMap[src]["__unsorted__"]["Unsorted"] = [];
      sourceMap[src]["__unsorted__"]["Unsorted"].push(t);
    }
  }

  for (const scaffoldSource of SCAFFOLD_SOURCES) {
    if (!sourceMap[scaffoldSource]) {
      sourceMap[scaffoldSource] = {};
    }
  }

  const tree: FolderNode[] = [];

  const sourceOrder = Object.keys(sourceMap).sort((a, b) => {
    const aFiles = countSourceFiles(sourceMap[a]);
    const bFiles = countSourceFiles(sourceMap[b]);
    if (aFiles !== bFiles) return bFiles - aFiles;
    return a.localeCompare(b);
  });

  for (const source of sourceOrder) {
    const years = sourceMap[source];
    const meta = SOURCE_META[source] || { label: source, icon: "📁" };
    const totalFiles = countSourceFiles(years);

    const yearNodes: FolderNode[] = [];

    const sortedYears = Object.keys(years)
      .filter(y => y !== "__unsorted__")
      .sort((a, b) => parseInt(b) - parseInt(a));

    for (const year of sortedYears) {
      const months = years[year];
      const monthOrder = [...MONTHS, "Unknown"];

      const sortedMonths = Object.keys(months).sort((a, b) => {
        return monthOrder.indexOf(a) - monthOrder.indexOf(b);
      });

      const monthNodes: FolderNode[] = sortedMonths.map(month => ({
        name: month,
        type: "folder" as const,
        count: months[month].length,
        folderKind: "month" as const,
        children: months[month].map(f => ({
          name: f.name,
          type: "file" as const,
          file: f,
        })),
      }));

      const yearTotal = Object.values(months).reduce((sum, arr) => sum + arr.length, 0);

      yearNodes.push({
        name: year,
        type: "folder",
        count: yearTotal,
        folderKind: "year",
        children: monthNodes,
      });
    }

    if (years["__unsorted__"]) {
      const unsortedFiles = years["__unsorted__"]["Unsorted"] || [];
      if (unsortedFiles.length > 0) {
        yearNodes.push({
          name: "Unsorted",
          type: "folder",
          count: unsortedFiles.length,
          folderKind: "unsorted",
          children: unsortedFiles.map(f => ({
            name: f.name,
            type: "file",
            file: f,
          })),
        });
      }
    }

    tree.push({
      name: `${meta.icon} ${meta.label}`,
      type: "folder",
      count: totalFiles,
      folderKind: "source",
      children: yearNodes,
    });
  }

  return tree;
}

function countSourceFiles(years: Record<string, Record<string, TranscriptFile[]>>): number {
  let count = 0;
  for (const year of Object.keys(years)) {
    for (const month of Object.keys(years[year])) {
      count += years[year][month].length;
    }
  }
  return count;
}

function MoveDialog({
  file,
  existingYears,
  existingSources,
  onMove,
  onClose,
}: {
  file: TranscriptFile;
  existingYears: string[];
  existingSources: string[];
  onMove: (file: TranscriptFile, year: string | null, month: string | null, source?: string) => void;
  onClose: () => void;
}) {
  const [year, setYear] = useState(file.year || "");
  const [month, setMonth] = useState(file.month || "");
  const [source, setSource] = useState(file.source || "");
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
    onMove(file, finalYear || null, month || null, source || undefined);
    onClose();
  };

  const yearOptions = [...new Set([...existingYears, ...(file.year ? [file.year] : [])])].sort((a, b) => parseInt(b) - parseInt(a));

  const allSources = [...new Set([...existingSources, ...Object.keys(SOURCE_META)])].filter(s => s !== "unknown" && s !== "transcripts");

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
        <label className="text-[10px] block mb-0.5" style={{ color: "var(--chatty-text)", opacity: 0.6 }}>Platform</label>
        <select
          value={source}
          onChange={e => setSource(e.target.value)}
          className="w-full p-1.5 rounded text-xs"
          style={{
            backgroundColor: "var(--chatty-bg-main)",
            border: "1px solid var(--chatty-line)",
            color: "var(--chatty-text)",
          }}
        >
          <option value="">Keep current</option>
          {allSources.map(s => {
            const meta = SOURCE_META[s] || { label: s, icon: "📁" };
            return <option key={s} value={s}>{meta.icon} {meta.label}</option>;
          })}
        </select>
      </div>

      <div>
        <label className="text-[10px] block mb-0.5" style={{ color: "var(--chatty-text)", opacity: 0.6 }}>Year</label>
        <select
          value={year}
          onChange={e => setYear(e.target.value)}
          className="w-full p-1.5 rounded text-xs"
          style={{
            backgroundColor: "var(--chatty-bg-main)",
            border: "1px solid var(--chatty-line)",
            color: "var(--chatty-text)",
          }}
        >
          <option value="">Unsorted</option>
          {yearOptions.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
          <option value="__custom__">Custom year...</option>
        </select>
      </div>

      {year === "__custom__" && (
        <div>
          <input
            type="text"
            placeholder="e.g. 2024"
            value={customYear}
            onChange={e => setCustomYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
            className="w-full p-1.5 rounded text-xs"
            style={{
              backgroundColor: "var(--chatty-bg-main)",
              border: "1px solid var(--chatty-line)",
              color: "var(--chatty-text)",
            }}
          />
        </div>
      )}

      {(finalYear || year) && (
        <div>
          <label className="text-[10px] block mb-0.5" style={{ color: "var(--chatty-text)", opacity: 0.6 }}>Month</label>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
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
  existingSources,
}: {
  node: FolderNode;
  depth: number;
  onFileClick?: (file: TranscriptFile) => void;
  onMoveFile?: (file: TranscriptFile, year: string | null, month: string | null, source?: string) => void;
  existingYears: string[];
  existingSources: string[];
}) {
  const [isOpen, setIsOpen] = useState(node.folderKind === "source" && (node.count || 0) > 0);
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
            existingSources={existingSources}
            onMove={onMoveFile}
            onClose={() => setShowMoveDialog(false)}
          />
        )}
      </div>
    );
  }

  const isSource = node.folderKind === "source";
  const isYear = node.folderKind === "year" || /^\d{4}$/.test(node.name);
  const isUnsorted = node.folderKind === "unsorted" || node.name === "Unsorted";
  const isEmpty = (node.count || 0) === 0;

  const folderColor = isSource
    ? "var(--chatty-accent)"
    : isYear
      ? "#f59e0b"
      : isUnsorted
        ? "#94a3b8"
        : "var(--chatty-accent)";

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded cursor-pointer hover:bg-white/10 transition-colors"
        style={{ paddingLeft: `${depth * 12}px`, opacity: isEmpty ? 0.5 : 1 }}
        onClick={() => !isEmpty && setIsOpen(!isOpen)}
      >
        {isEmpty ? (
          <ChevronRight size={14} style={{ color: "var(--chatty-text)", opacity: 0.3 }} />
        ) : isOpen ? (
          <ChevronDown size={14} style={{ color: "var(--chatty-text)", opacity: 0.6 }} />
        ) : (
          <ChevronRight size={14} style={{ color: "var(--chatty-text)", opacity: 0.6 }} />
        )}
        {isOpen && !isEmpty ? (
          <FolderOpen size={14} style={{ color: folderColor }} />
        ) : (
          <Folder size={14} style={{ color: folderColor }} />
        )}
        <span
          className={`text-sm flex-1 ${isSource ? "font-semibold" : "font-medium"}`}
          style={{ color: "var(--chatty-text)" }}
        >
          {node.name}
        </span>
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--chatty-bg-message)",
            color: "var(--chatty-text)",
            opacity: isEmpty ? 0.4 : 0.7,
          }}
        >
          {node.count || 0}
        </span>
      </div>
      {isOpen && !isEmpty && node.children && (
        <div>
          {node.children.map((child, idx) => (
            <FolderItem
              key={`${child.name}-${idx}`}
              node={child}
              depth={depth + 1}
              onFileClick={onFileClick}
              onMoveFile={onMoveFile}
              existingYears={existingYears}
              existingSources={existingSources}
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

  const existingSources = useMemo(() => {
    const sources = new Set<string>();
    for (const t of transcripts) {
      if (t.source) sources.add(t.source);
    }
    return Array.from(sources);
  }, [transcripts]);

  if (transcripts.length === 0) {
    return (
      <div className="space-y-0.5">
        {SCAFFOLD_SOURCES.map(source => {
          const meta = SOURCE_META[source];
          return (
            <div
              key={source}
              className="flex items-center gap-2 py-1.5 px-2 rounded"
              style={{ opacity: 0.5 }}
            >
              <ChevronRight size={14} style={{ color: "var(--chatty-text)", opacity: 0.3 }} />
              <Folder size={14} style={{ color: "var(--chatty-accent)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--chatty-text)" }}>
                {meta.icon} {meta.label}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--chatty-bg-message)",
                  color: "var(--chatty-text)",
                  opacity: 0.4,
                }}
              >
                0
              </span>
            </div>
          );
        })}
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
          existingSources={existingSources}
        />
      ))}
    </div>
  );
}

export default TranscriptFolderTree;
