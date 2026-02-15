import { useState, useMemo, useCallback } from "react";
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, X, Image, Film, Music, Eye } from "lucide-react";

interface KnowledgeFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
}

interface KnowledgeFileTreeProps {
  files: KnowledgeFile[];
  onRemoveFile?: (fileId: string) => void;
  formatFileSize?: (size: number) => string;
}

interface TreeNode {
  name: string;
  type: "folder" | "file";
  children?: TreeNode[];
  file?: KnowledgeFile;
  count?: number;
  isAssetsFolder?: boolean;
}

const FOLDER_META: Record<string, { label: string; icon: string }> = {
  assets: { label: "Assets", icon: "🎨" },
  documents: { label: "Documents", icon: "📄" },
  "character.ai": { label: "Character.AI", icon: "💬" },
};

const MEDIA_MIME_PREFIXES = ['image/', 'video/', 'audio/'];
const MEDIA_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|bmp|ico|mp4|mov|avi|mkv|webm|mp3|wav|ogg|flac|aac|m4a)$/i;

function isMediaFile(file: KnowledgeFile): boolean {
  if (file.mimeType && MEDIA_MIME_PREFIXES.some(p => file.mimeType.startsWith(p))) return true;
  const name = file.originalName || file.filename || '';
  return MEDIA_EXTENSIONS.test(name);
}

function buildKnowledgeTree(files: KnowledgeFile[]): TreeNode[] {
  const folderMap: Record<string, Record<string, KnowledgeFile[]>> = {};
  const root: KnowledgeFile[] = [];

  for (const f of files) {
    const pathParts = f.filename.split('/');
    const instancesIdx = pathParts.indexOf('instances');
    const media = isMediaFile(f);

    if (instancesIdx >= 0 && pathParts.length > instancesIdx + 2) {
      const rawTopFolder = pathParts[instancesIdx + 2];
      const topFolder = media && rawTopFolder !== 'assets' ? 'assets' : rawTopFolder;

      if (topFolder === 'assets' || topFolder === 'documents' || topFolder === 'character.ai') {
        const subParts = pathParts.slice(instancesIdx + 3, -1);
        const subFolder = subParts.length > 0 ? subParts.join('/') : '__root__';
        if (!folderMap[topFolder]) folderMap[topFolder] = {};
        if (!folderMap[topFolder][subFolder]) folderMap[topFolder][subFolder] = [];
        folderMap[topFolder][subFolder].push(f);
      } else {
        if (media) {
          if (!folderMap['assets']) folderMap['assets'] = {};
          if (!folderMap['assets']['__root__']) folderMap['assets']['__root__'] = [];
          folderMap['assets']['__root__'].push(f);
        } else {
          root.push(f);
        }
      }
    } else {
      if (media) {
        if (!folderMap['assets']) folderMap['assets'] = {};
        if (!folderMap['assets']['__root__']) folderMap['assets']['__root__'] = [];
        folderMap['assets']['__root__'].push(f);
      } else {
        root.push(f);
      }
    }
  }

  const tree: TreeNode[] = [];

  for (const folder of ['assets', 'documents', 'character.ai']) {
    const subs = folderMap[folder];
    if (!subs) {
      tree.push({
        name: `${FOLDER_META[folder].icon} ${FOLDER_META[folder].label}`,
        type: "folder",
        count: 0,
        children: [],
        isAssetsFolder: folder === 'assets',
      });
      continue;
    }

    const children: TreeNode[] = [];
    let totalCount = 0;

    const sortedSubs = Object.keys(subs).sort((a, b) => {
      if (a === '__root__') return -1;
      if (b === '__root__') return 1;
      return a.localeCompare(b);
    });

    for (const sub of sortedSubs) {
      const subFiles = subs[sub];
      totalCount += subFiles.length;

      if (sub === '__root__') {
        for (const f of subFiles) {
          children.push({
            name: f.originalName || f.filename.split('/').pop() || f.filename,
            type: "file",
            file: f,
          });
        }
      } else {
        children.push({
          name: sub,
          type: "folder",
          count: subFiles.length,
          children: subFiles.map(f => ({
            name: f.originalName || f.filename.split('/').pop() || f.filename,
            type: "file",
            file: f,
          })),
        });
      }
    }

    tree.push({
      name: `${FOLDER_META[folder].icon} ${FOLDER_META[folder].label}`,
      type: "folder",
      count: totalCount,
      children,
      isAssetsFolder: folder === 'assets',
    });
  }

  if (root.length > 0) {
    tree.push({
      name: "📁 Other",
      type: "folder",
      count: root.length,
      children: root.map(f => ({
        name: f.originalName || f.filename.split('/').pop() || f.filename,
        type: "file",
        file: f,
      })),
    });
  }

  return tree;
}

function getThumbnailUrl(file: KnowledgeFile): string | null {
  if (!file.mimeType?.startsWith('image/')) return null;
  const encodedPath = encodeURIComponent(file.filename);
  return `/api/ais/file-preview?path=${encodedPath}`;
}

function MediaFallbackIcon({ file }: { file: KnowledgeFile }) {
  if (file.mimeType?.startsWith('video/')) {
    return <Film size={24} style={{ color: "#a78bfa" }} />;
  }
  if (file.mimeType?.startsWith('audio/')) {
    return <Music size={24} style={{ color: "#60a5fa" }} />;
  }
  return <Image size={24} style={{ color: "#a78bfa" }} />;
}

function MediaThumbnail({
  file,
  onRemoveFile,
}: {
  file: KnowledgeFile;
  onRemoveFile?: (fileId: string) => void;
}) {
  const [imgError, setImgError] = useState(false);
  const thumbUrl = getThumbnailUrl(file);
  const displayName = file.originalName || file.filename.split('/').pop() || file.filename;

  const handleOpen = useCallback(() => {
    if (thumbUrl && file.mimeType?.startsWith('image/')) {
      window.open(thumbUrl, '_blank', 'noopener');
    }
  }, [thumbUrl, file.mimeType]);

  return (
    <div
      className="group relative flex flex-col items-center"
      title={displayName}
      style={{ width: 80 }}
    >
      <div
        className="relative rounded-lg overflow-hidden cursor-pointer"
        style={{
          width: 80,
          height: 80,
          backgroundColor: "var(--chatty-bg-message)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
        onClick={handleOpen}
      >
        {thumbUrl && !imgError ? (
          <img
            src={thumbUrl}
            alt={displayName}
            loading="lazy"
            onError={() => setImgError(true)}
            className="w-full h-full"
            style={{ objectFit: "cover" }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <MediaFallbackIcon file={file} />
          </div>
        )}

        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5"
          style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
        >
          {thumbUrl && file.mimeType?.startsWith('image/') && (
            <button
              className="p-1.5 rounded-md hover:bg-white/20 transition-colors"
              title="View"
              onClick={(e) => {
                e.stopPropagation();
                handleOpen();
              }}
            >
              <Eye size={14} style={{ color: "#fff" }} />
            </button>
          )}
          {onRemoveFile && (
            <button
              className="p-1.5 rounded-md hover:bg-red-500/40 transition-colors"
              title="Remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemoveFile(file.id);
              }}
            >
              <X size={14} style={{ color: "#fff" }} />
            </button>
          )}
        </div>
      </div>

      <span
        className="mt-1 text-[10px] text-center leading-tight truncate w-full"
        style={{ color: "var(--chatty-text)", opacity: 0.7 }}
        title={displayName}
      >
        {displayName.length > 12 ? displayName.slice(0, 10) + '…' : displayName}
      </span>
    </div>
  );
}

function AssetsGrid({
  files,
  onRemoveFile,
}: {
  files: KnowledgeFile[];
  onRemoveFile?: (fileId: string) => void;
}) {
  return (
    <div
      className="grid gap-2 py-2 px-1"
      style={{
        gridTemplateColumns: "repeat(auto-fill, 80px)",
        justifyContent: "start",
      }}
    >
      {files.map((f) => (
        <MediaThumbnail
          key={f.id}
          file={f}
          onRemoveFile={onRemoveFile}
        />
      ))}
    </div>
  );
}

function collectMediaFiles(node: TreeNode): KnowledgeFile[] {
  const files: KnowledgeFile[] = [];
  if (node.type === 'file' && node.file) {
    files.push(node.file);
  }
  if (node.children) {
    for (const child of node.children) {
      files.push(...collectMediaFiles(child));
    }
  }
  return files;
}

function getFileIcon(file: KnowledgeFile) {
  if (file.mimeType?.startsWith('image/')) return <Image size={14} style={{ color: "#a78bfa", opacity: 0.8 }} />;
  return <FileText size={14} style={{ color: "var(--chatty-accent)", opacity: 0.8 }} />;
}

function FileItem({
  node,
  depth,
  onRemoveFile,
  formatFileSize,
}: {
  node: TreeNode;
  depth: number;
  onRemoveFile?: (fileId: string) => void;
  formatFileSize?: (size: number) => string;
}) {
  const [isOpen, setIsOpen] = useState(depth === 0 && (node.count || 0) > 0);

  if (node.type === "file" && node.file) {
    const sizeStr = formatFileSize ? formatFileSize(node.file.size) : `${(node.file.size / 1024).toFixed(1)}KB`;

    return (
      <div
        className="group flex items-center gap-2 py-1 px-2 rounded hover:bg-white/10 transition-colors"
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
      >
        {getFileIcon(node.file)}
        <span
          className="text-xs truncate flex-1"
          style={{ color: "var(--chatty-text)", opacity: 0.9 }}
          title={node.name}
        >
          {node.name}
        </span>
        <span className="text-[10px]" style={{ color: "var(--chatty-text)", opacity: 0.5 }}>
          {sizeStr}
        </span>
        {onRemoveFile && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-white/20 transition-opacity"
            title="Remove file"
            onClick={(e) => {
              e.stopPropagation();
              onRemoveFile(node.file!.id);
            }}
          >
            <X size={12} style={{ color: "var(--chatty-text)", opacity: 0.7 }} />
          </button>
        )}
      </div>
    );
  }

  const isEmpty = (node.count || 0) === 0;

  if (node.isAssetsFolder && !isEmpty) {
    const allMedia = isOpen ? collectMediaFiles(node) : [];
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
            <FolderOpen size={14} style={{ color: "#a78bfa" }} />
          ) : (
            <Folder size={14} style={{ color: "#a78bfa" }} />
          )}
          <span
            className="text-sm flex-1 font-semibold"
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
            {node.count || 0}
          </span>
        </div>
        {isOpen && (
          <div style={{ paddingLeft: `${(depth + 1) * 12}px` }}>
            <AssetsGrid files={allMedia} onRemoveFile={onRemoveFile} />
          </div>
        )}
      </div>
    );
  }

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
          <FolderOpen size={14} style={{ color: "var(--chatty-accent)" }} />
        ) : (
          <Folder size={14} style={{ color: "var(--chatty-accent)" }} />
        )}
        <span
          className={`text-sm flex-1 ${depth === 0 ? "font-semibold" : "font-medium"}`}
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
            <FileItem
              key={`${child.name}-${idx}`}
              node={child}
              depth={depth + 1}
              onRemoveFile={onRemoveFile}
              formatFileSize={formatFileSize}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeFileTree({ files, onRemoveFile, formatFileSize }: KnowledgeFileTreeProps) {
  const tree = useMemo(() => buildKnowledgeTree(files), [files]);

  if (files.length === 0) {
    return (
      <div className="space-y-0.5">
        {['assets', 'documents'].map(folder => {
          const meta = FOLDER_META[folder];
          return (
            <div
              key={folder}
              className="flex items-center gap-2 py-1.5 px-2 rounded"
              style={{ opacity: 0.5 }}
            >
              <ChevronRight size={14} style={{ color: "var(--chatty-text)", opacity: 0.3 }} />
              <Folder size={14} style={{ color: folder === 'assets' ? "#a78bfa" : "var(--chatty-accent)" }} />
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
        <FileItem
          key={`${node.name}-${idx}`}
          node={node}
          depth={0}
          onRemoveFile={onRemoveFile}
          formatFileSize={formatFileSize}
        />
      ))}
    </div>
  );
}

export default KnowledgeFileTree;
