import { useState, useMemo } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText } from "lucide-react";

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
}

interface TranscriptFolderTreeProps {
  transcripts: TranscriptFile[];
  onFileClick?: (file: TranscriptFile) => void;
}

interface FolderNode {
  name: string;
  type: "folder" | "file";
  children?: FolderNode[];
  file?: TranscriptFile;
  count?: number;
}

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
    const monthOrder = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December", "Unknown"
    ];
    
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

function FolderItem({
  node,
  depth,
  onFileClick,
}: {
  node: FolderNode;
  depth: number;
  onFileClick?: (file: TranscriptFile) => void;
}) {
  const [isOpen, setIsOpen] = useState(depth === 0);

  if (node.type === "file") {
    return (
      <div
        className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-white/10 transition-colors"
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TranscriptFolderTree({ transcripts, onFileClick }: TranscriptFolderTreeProps) {
  const tree = useMemo(() => buildFolderTree(transcripts), [transcripts]);

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
        />
      ))}
    </div>
  );
}

export default TranscriptFolderTree;
