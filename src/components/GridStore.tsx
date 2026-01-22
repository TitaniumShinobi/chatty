import React, { useState, useMemo } from "react";
import { Search, X, Calendar, Code, Sparkles, Heart, Newspaper, FileText, FolderKanban, Mic, GraduationCap, Play, Cloud, Package, ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";

interface AppItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "featured" | "productivity" | "lifestyle" | "creative";
  hasWidget: boolean;
  comingSoon?: boolean;
}

interface GridStoreProps {
  onClose: () => void;
  onSelectApp?: (appId: string) => void;
}

const GridStore: React.FC<GridStoreProps> = ({ onClose, onSelectApp }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("featured");

  const apps: AppItem[] = [
    {
      id: "calendar",
      name: "Calendar",
      description: "Schedule and manage your events",
      icon: <Calendar size={24} />,
      category: "productivity",
      hasWidget: true,
    },
    {
      id: "code",
      name: "Code",
      description: "Write and run code snippets",
      icon: <Code size={24} />,
      category: "productivity",
      hasWidget: false,
    },
    {
      id: "create",
      name: "Create",
      description: "Generate creative content",
      icon: <Sparkles size={24} />,
      category: "creative",
      hasWidget: false,
    },
    {
      id: "fxshinobi",
      name: "FXShinobi",
      description: "Trading insights and analysis",
      icon: <Play size={24} />,
      category: "lifestyle",
      hasWidget: true,
    },
    {
      id: "health",
      name: "Health",
      description: "Track wellness and fitness",
      icon: <Heart size={24} />,
      category: "lifestyle",
      hasWidget: true,
    },
    {
      id: "news",
      name: "News",
      description: "Stay updated with the latest",
      icon: <Newspaper size={24} />,
      category: "lifestyle",
      hasWidget: true,
    },
    {
      id: "pad",
      name: "Pad",
      description: "Quick notes and drafts",
      icon: <FileText size={24} />,
      category: "productivity",
      hasWidget: true,
    },
    {
      id: "projects",
      name: "Projects",
      description: "Organize and manage projects",
      icon: <FolderKanban size={24} />,
      category: "productivity",
      hasWidget: true,
    },
    {
      id: "record",
      name: "Record",
      description: "Voice memos and recordings",
      icon: <Mic size={24} />,
      category: "creative",
      hasWidget: false,
    },
    {
      id: "study",
      name: "Study",
      description: "Learning and flashcards",
      icon: <GraduationCap size={24} />,
      category: "productivity",
      hasWidget: false,
    },
    {
      id: "vxrunner",
      name: "VXRunner",
      description: "Execute and automate tasks",
      icon: <Play size={24} />,
      category: "productivity",
      hasWidget: true,
    },
    {
      id: "weather",
      name: "Weather",
      description: "Current conditions and forecasts",
      icon: <Cloud size={24} />,
      category: "lifestyle",
      hasWidget: true,
    },
    {
      id: "zip",
      name: "Zip",
      description: "Compress and extract files",
      icon: <Package size={24} />,
      category: "productivity",
      hasWidget: false,
    },
  ];

  const categories = [
    { id: "featured", label: "Featured" },
    { id: "productivity", label: "Productivity" },
    { id: "lifestyle", label: "Lifestyle" },
    { id: "creative", label: "Creative" },
  ];

  const filteredApps = useMemo(() => {
    let result = apps;
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        app => 
          app.name.toLowerCase().includes(query) || 
          app.description.toLowerCase().includes(query)
      );
    } else if (activeCategory !== "featured") {
      result = result.filter(app => app.category === activeCategory);
    }
    
    return result;
  }, [searchQuery, activeCategory]);

  const featuredApps = useMemo(() => {
    return apps.filter(app => app.hasWidget).slice(0, 3);
  }, []);

  return (
    <div 
      className="flex flex-col h-full w-full overflow-hidden"
      style={{ 
        backgroundColor: "var(--chatty-bg)",
        color: "var(--chatty-text)"
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "var(--chatty-border)" }}>
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--chatty-highlight)]"
            style={{ color: "var(--chatty-text)" }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-semibold">Apps</h1>
            <p className="text-sm opacity-70">Extend Chatty with powerful tools</p>
          </div>
        </div>
        
        {/* Search */}
        <div 
          className="flex items-center gap-2 rounded-lg px-4 py-2 w-64"
          style={{ 
            backgroundColor: "var(--chatty-bg-input, var(--chatty-highlight))",
            border: "1px solid var(--chatty-border)"
          }}
        >
          <Search size={16} style={{ opacity: 0.5 }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search apps..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: "var(--chatty-text)" }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}>
              <X size={14} style={{ opacity: 0.5 }} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Featured Section */}
        {!searchQuery && activeCategory === "featured" && (
          <div className="mb-8">
            <div 
              className="rounded-xl p-6 mb-6"
              style={{ 
                background: "linear-gradient(135deg, var(--chatty-accent, #4F46E5) 0%, var(--chatty-accent-hover, #6366F1) 100%)"
              }}
            >
              <div className="flex items-start gap-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar size={32} className="text-white" />
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-1">Calendar</h2>
                  <p className="text-white/80 text-sm mb-4">Schedule and manage your events with AI assistance</p>
                  <button 
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ 
                      backgroundColor: "white",
                      color: "var(--chatty-accent, #4F46E5)"
                    }}
                    onClick={() => onSelectApp?.("calendar")}
                  >
                    Open
                  </button>
                </div>
                <div className="hidden md:flex gap-2">
                  {featuredApps.slice(0, 2).map(app => (
                    <div 
                      key={app.id}
                      className="w-24 h-24 rounded-lg flex flex-col items-center justify-center gap-1"
                      style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
                    >
                      <div className="text-white">{app.icon}</div>
                      <span className="text-xs text-white/80">{app.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex gap-2 mb-6">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => {
                setActiveCategory(cat.id);
                setSearchQuery("");
              }}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                activeCategory === cat.id
                  ? "bg-[var(--chatty-accent,#4F46E5)] text-white"
                  : "hover:bg-[var(--chatty-highlight)]"
              )}
              style={{ 
                color: activeCategory === cat.id ? "white" : "var(--chatty-text)"
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Apps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredApps.map(app => (
            <button
              key={app.id}
              onClick={() => onSelectApp?.(app.id)}
              className="flex items-start gap-4 p-4 rounded-xl text-left transition-all hover:scale-[1.02]"
              style={{ 
                backgroundColor: "var(--chatty-bg-modal, var(--chatty-highlight))",
                border: "1px solid var(--chatty-border)"
              }}
            >
              <div 
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ 
                  backgroundColor: "var(--chatty-accent, #4F46E5)",
                  color: "white"
                }}
              >
                {app.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{app.name}</h3>
                  {app.hasWidget && (
                    <span 
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ 
                        backgroundColor: "var(--chatty-accent, #4F46E5)",
                        color: "white",
                        opacity: 0.8
                      }}
                    >
                      Widget
                    </span>
                  )}
                </div>
                <p className="text-sm opacity-70 truncate">{app.description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Empty State */}
        {filteredApps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 opacity-60">
            <Search size={48} className="mb-4" />
            <p className="text-lg">No apps found</p>
            <p className="text-sm">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default GridStore;
