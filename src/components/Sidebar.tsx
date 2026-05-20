// @ts-nocheck
import React, {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  MoreVertical,
  Search,
  PanelLeftClose,
  Shield,
  Gauge,
  Pin,
  X,
  Grid3X3,
} from "lucide-react";
import { SidebarProps } from "../types";
import { cn } from "../lib/utils";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { useTheme } from "../lib/ThemeContext";
import { getAddressBookEmptyMessage } from "../lib/addressBookEmptyState";
import { resolveAvatarFields } from "../lib/avatarUrl";

// Star assets
import litchattyStar from "@assets/stars/litChatty_star.svg";
import moonChattyStar from "@assets/stars/moonChatty_star.svg";
import luckyChattyStar from "@assets/stars/luckyChatty_star.svg";
import chattyStar from "@assets/stars/chatty_star.png";
import { Z_LAYERS } from "../lib/zLayers";

// simForge icons (bundle-safe; do not rely on runtime /assets paths)
import simforgeDayUrl from "../../assets/icons/simforge_day.svg?url";
import simforgeNightUrl from "../../assets/icons/simforge_night.svg?url";

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  threads = [],
  currentConversationId,
  hasAddressBookLoadError = false,
  onConversationSelect,
  onNewConversationWithGPT,
  onDeleteConversation,
  onRenameConversation,
  onOpenExplore,
  onOpenCodex,
  onOpenLibrary,
  onOpenSearch,
  onOpenProjects,
  collapsed = false,
  onToggleCollapsed,
  currentUser,
  onShowSettings,
  hasBlockingOverlay = false,
  isVVAULTConnected = true,
}) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { actualTheme, activeThemeScript } = useTheme();

  // Global search state (header magnifying glass)
  const [isGlobalSearchExpanded, setIsGlobalSearchExpanded] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [globalSearchSuggestions, setGlobalSearchSuggestions] = useState<
    string[]
  >([]);
  const globalSearchInputRef = useRef<HTMLInputElement>(null);

  // Address book search state
  const [isAddressBookSearchActive, setIsAddressBookSearchActive] =
    useState(false);
  const [addressBookSearchQuery, setAddressBookSearchQuery] = useState("");
  const [addressBookSearchResults, setAddressBookSearchResults] = useState<
    any[]
  >([]);
  const [addressBookResultsLimit, setAddressBookResultsLimit] = useState(8);
  const addressBookSearchInputRef = useRef<HTMLInputElement>(null);

  // Focus global search input when expanded
  useEffect(() => {
    if (isGlobalSearchExpanded && globalSearchInputRef.current) {
      globalSearchInputRef.current.focus();
    }
  }, [isGlobalSearchExpanded]);

  // Focus address book search when active
  useEffect(() => {
    if (isAddressBookSearchActive && addressBookSearchInputRef.current) {
      addressBookSearchInputRef.current.focus();
    }
  }, [isAddressBookSearchActive]);

  // Generate suggestions for global search - Chatty features only (not transcripts)
  useEffect(() => {
    if (globalSearchQuery.length > 0) {
      const query = globalSearchQuery.toLowerCase();
      const suggestions: string[] = [];

      // Chatty feature suggestions only
      const featureSuggestions = [
        "Settings",
        "Theme",
        "Library",
        "Projects",
        "Continuity",
        "Code",
        "simForge",
        "Address Book",
        "GPT Creator",
      ];
      featureSuggestions.forEach((feat) => {
        if (feat.toLowerCase().includes(query) && !suggestions.includes(feat)) {
          suggestions.push(feat);
        }
      });

      setGlobalSearchSuggestions(suggestions.slice(0, 6));
    } else {
      setGlobalSearchSuggestions([]);
    }
  }, [globalSearchQuery]);

  // Helper to extract text from message (handles both text and packet content)
  const extractMessageText = useCallback((msg: any): string => {
    // Direct text field
    if (msg.text) return msg.text;
    // Content field (VVAULT format)
    if (msg.content) return msg.content;
    // Packet content (assistant messages with packet array)
    if (msg.packets && Array.isArray(msg.packets)) {
      return msg.packets.map((p: any) => p.text || p.content || "").join(" ");
    }
    return "";
  }, []);

  // Search conversations/transcripts for address book
  useEffect(() => {
    if (addressBookSearchQuery.length > 0) {
      const query = addressBookSearchQuery.toLowerCase();
      const results = conversations.flatMap((conv) => {
        const matchingMessages = (conv.messages || []).filter((msg: any) => {
          const text = extractMessageText(msg);
          return text.toLowerCase().includes(query);
        });
        return matchingMessages.map((msg: any) => {
          const text = extractMessageText(msg);
          return {
            conversationId: conv.id,
            conversationTitle: conv.title,
            constructId: (conv as any).constructId,
            messagePreview:
              text.substring(0, 100) + (text.length > 100 ? "..." : ""),
            role: msg.role,
            timestamp: msg.ts,
          };
        });
      });
      setAddressBookSearchResults(results);
    } else {
      setAddressBookSearchResults([]);
    }
  }, [addressBookSearchQuery, conversations, extractMessageText]);

  // Handle global search submit
  const handleGlobalSearchSubmit = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && globalSearchQuery.trim()) {
        // Open the full search modal
        if (onOpenSearch) onOpenSearch();
        setIsGlobalSearchExpanded(false);
        setGlobalSearchQuery("");
      }
    },
    [globalSearchQuery, onOpenSearch],
  );

  // Handle address book search submit
  const handleAddressBookSearchSubmit = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        // Keep search active, just show all results
        setAddressBookResultsLimit((prev) => prev + 10);
      }
    },
    [],
  );

  // Close global search on blur
  const handleGlobalSearchBlur = useCallback(() => {
    setTimeout(() => {
      if (!globalSearchQuery) {
        setIsGlobalSearchExpanded(false);
      }
    }, 200);
  }, [globalSearchQuery]);

  const isChristmasTheme = activeThemeScript?.id === "christmas";
  const isValentinesTheme = activeThemeScript?.id === "valentines";
  const isStPatrickTheme = activeThemeScript?.id === "stpatrick";
  const hasActiveThemeScript = Boolean(activeThemeScript);
  const isNightWithoutSeasonal = actualTheme === "night" && !hasActiveThemeScript;
  const addressBookEmptyMessage = getAddressBookEmptyMessage({
    isVVAULTConnected,
    hasAddressBookLoadError,
  });
  const starImage = isChristmasTheme
    ? litchattyStar
    : isNightWithoutSeasonal
      ? moonChattyStar
      : isValentinesTheme
        ? litchattyStar
        : isStPatrickTheme
          ? luckyChattyStar
          : chattyStar;
  /* Sidebar star assets: canonical spec docs/styling/SIDEBAR_STAR_LAYER_SPEC.md */
  const defaultRayImage = "/assets/stars/fourpointray.svg";
  const defaultStarburstImage = isNightWithoutSeasonal
    ? "/assets/stars/moonfourpointstarburst.svg"
    : "/assets/stars/fourpointstarburst.svg";
  const defaultNovaImage = isNightWithoutSeasonal
    ? "/assets/stars/lemonfourpointstarburst.svg"
    : "/assets/stars/fourpointnova.svg";

  const isActiveRoute = useMemo(
    () => (path: string) => location.pathname === path,
    [location.pathname],
  );

  const navButtonBase = cn(
    "flex items-center w-full py-2 text-left text-sm rounded-full transition-colors",
    collapsed ? "justify-center px-0 gap-0" : "gap-3 px-3",
  );
  const activeNavColor = "rgba(173, 165, 135, 0.25)";
  const hoverColor = "var(--chatty-highlight)";
  const simforgeIcon = (() => {
    const active = isActiveRoute("/app/explore");
    if (actualTheme === "night") {
      return active
        ? simforgeDayUrl
        : simforgeNightUrl;
    }
    // day theme
    return active
      ? simforgeNightUrl
      : simforgeDayUrl;
  })();

  const navButtonStyle = (path: string) => ({
    backgroundColor: isActiveRoute(path) ? activeNavColor : "transparent",
    color: "var(--chatty-text)",
  });

  const handleNavHover = (
    e: React.MouseEvent<HTMLButtonElement>,
    path: string,
    entering: boolean,
  ) => {
    if (isActiveRoute(path)) return;
    e.currentTarget.style.backgroundColor = entering
      ? hoverColor
      : "transparent";
    e.currentTarget.style.color = "var(--chatty-text)";
  };

  const sidebarZIndex = hasBlockingOverlay
    ? Z_LAYERS.sidebarMuted
    : Z_LAYERS.sidebar;
  const sidebarPointerEvents = hasBlockingOverlay ? "none" : "auto";

  return (
    <div
      className={cn(
        "flex flex-col h-full transition-all duration-200 overflow-hidden",
        collapsed ? "w-16" : "w-72",
      )}
      style={{
        backgroundColor: "var(--chatty-bg-sidebar)",
        color: "var(--chatty-text)",
        isolation: "isolate",
        position: "relative",
        zIndex: sidebarZIndex,
        pointerEvents: sidebarPointerEvents,
      }}
    >
      {/* Top Section - Logo and Collapse */}
      <div className={cn(collapsed ? "px-3 pt-3 pb-2" : "p-4", "relative z-10")}>
        {!collapsed ? (
          <div className="flex items-center justify-between gap-3 relative">
            <button
              onClick={() => navigate("/app")}
              className="flex items-center justify-center relative z-10"
              aria-label="Go to home"
            >
              <div
                className={cn(
                  "chatty-star-wrapper",
                  collapsed ? "w-8 h-8" : "w-14 h-14 -ml-[7px]",
                )}
              >
                {!isChristmasTheme && !isValentinesTheme && !isStPatrickTheme && (
                  <>
                    <img
                      src={defaultNovaImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src={defaultNovaImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src={defaultRayImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src={defaultRayImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src={defaultStarburstImage}
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        "chatty-starburst chatty-starburst-left",
                        isNightWithoutSeasonal && "chatty-starburst-front-tight",
                      )}
                    />
                    <img
                      src={defaultStarburstImage}
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        "chatty-starburst chatty-starburst-right",
                        isNightWithoutSeasonal && "chatty-starburst-front-tight",
                      )}
                    />
                  </>
                )}
                {isChristmasTheme && (
                  <>
                    <img
                      src="/assets/stars/whitefourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/whitefourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src="/assets/stars/lemonfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/lemonfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                  </>
                )}
                {isValentinesTheme && (
                  <>
                    <img
                      src="/assets/stars/passionfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/passionfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src="/assets/stars/lemonfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/lemonfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                  </>
                )}
                {isStPatrickTheme && (
                  <>
                    <img
                      src="/assets/stars/goldfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/goldfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src="/assets/stars/goldfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/goldfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                  </>
                )}
                <img
                  src={starImage}
                  alt="Chatty"
                  className="chatty-star w-full h-full object-contain"
                />
              </div>
            </button>

            {/* Right side icons - hidden when search is expanded */}
            {!isGlobalSearchExpanded && (
              <>
                <div className="flex items-center gap-1 ml-auto">
                  {/* Global Search - Magnifying glass button */}
                  <button
                    onClick={() => setIsGlobalSearchExpanded(true)}
                    className="p-2 rounded transition-colors hover:bg-[var(--chatty-highlight)]"
                    style={{ color: "var(--chatty-text)" }}
                    aria-label="Search Chatty"
                    title="Search Chatty"
                  >
                    <Search size={16} />
                  </button>

                  {/* Runtime dashboard button - auto-managed */}
                  <button
                    onClick={() => {}}
                    className="p-2 rounded transition-colors opacity-50 cursor-not-allowed"
                    style={{ color: "var(--chatty-text)" }}
                    aria-label="Runtime auto-managed"
                  >
                    <Gauge size={16} />
                  </button>
                  <ThemeToggleButton className="hover:bg-[var(--chatty-highlight)]" />
                </div>

                <button
                  className="p-1 rounded transition-colors"
                  style={{ color: "var(--chatty-text)" }}
                  onClick={onToggleCollapsed}
                  aria-label="Collapse sidebar"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--chatty-highlight)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <PanelLeftClose
                    size={16}
                    style={{
                      transition: "transform 0.2s ease",
                      transform: "rotate(0deg)",
                    }}
                  />
                </button>
              </>
            )}

            {/* Global Search Form - Replaces all icons when active */}
            {isGlobalSearchExpanded && (
              <div className="flex items-center flex-1 -ml-3">
                <div
                  className="flex items-center gap-2 rounded-full px-3 py-1.5 w-full shadow-lg"
                  style={{
                    backgroundColor: "var(--chatty-bg-modal, var(--chatty-bg))",
                    border: "1px solid var(--chatty-border)",
                  }}
                >
                  <Search
                    size={14}
                    style={{
                      color: "var(--chatty-text)",
                      opacity: 0.6,
                      flexShrink: 0,
                    }}
                  />
                  <input
                    ref={globalSearchInputRef}
                    type="text"
                    value={globalSearchQuery}
                    onChange={(e) => setGlobalSearchQuery(e.target.value)}
                    onKeyDown={handleGlobalSearchSubmit}
                    onBlur={handleGlobalSearchBlur}
                    placeholder="Search features..."
                    className="flex-1 bg-transparent outline-none text-sm min-w-0"
                    style={{ color: "var(--chatty-text)" }}
                  />
                  <button
                    onClick={() => {
                      setIsGlobalSearchExpanded(false);
                      setGlobalSearchQuery("");
                    }}
                    className="p-1 rounded hover:bg-[var(--chatty-highlight)] flex-shrink-0"
                  >
                    <X size={14} style={{ color: "var(--chatty-text)" }} />
                  </button>
                </div>
                {/* Auto-suggestions dropdown */}
                {globalSearchSuggestions.length > 0 && (
                  <div
                    className="absolute top-full left-12 right-4 mt-1 rounded-2xl shadow-lg overflow-hidden"
                    style={{
                      backgroundColor:
                        "var(--chatty-bg-modal, var(--chatty-bg))",
                      border: "1px solid var(--chatty-border)",
                      zIndex: 101,
                    }}
                  >
                    {globalSearchSuggestions.map((suggestion, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setGlobalSearchQuery(suggestion);
                          if (onOpenSearch) onOpenSearch();
                          setIsGlobalSearchExpanded(false);
                          setGlobalSearchQuery("");
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--chatty-highlight)] transition-colors"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => navigate("/app")}
              className="flex items-center justify-center"
              aria-label="Go to home"
            >
              <div
                className={cn(
                  "chatty-star-wrapper",
                  collapsed ? "w-8 h-8" : "w-14 h-14 -ml-[7px]",
                )}
              >
                {!isChristmasTheme && !isValentinesTheme && !isStPatrickTheme && (
                  <>
                    <img
                      src={defaultNovaImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src={defaultNovaImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src={defaultRayImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src={defaultRayImage}
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src={defaultStarburstImage}
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        "chatty-starburst chatty-starburst-left",
                        isNightWithoutSeasonal && "chatty-starburst-front-tight",
                      )}
                    />
                    <img
                      src={defaultStarburstImage}
                      alt=""
                      aria-hidden="true"
                      className={cn(
                        "chatty-starburst chatty-starburst-right",
                        isNightWithoutSeasonal && "chatty-starburst-front-tight",
                      )}
                    />
                  </>
                )}
                {isValentinesTheme && (
                  <>
                    <img
                      src="/assets/stars/passionfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/passionfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src="/assets/stars/lemonfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/lemonfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                  </>
                )}
                {isStPatrickTheme && (
                  <>
                    <img
                      src="/assets/stars/goldfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/goldfourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-left"
                    />
                    <img
                      src="/assets/stars/fourpointray.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-ray-right"
                    />
                    <img
                      src="/assets/stars/goldfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/goldfourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                  </>
                )}
                <img
                  src={starImage}
                  alt="Chatty"
                  className="chatty-star w-full h-full object-contain"
                />
              </div>
            </button>

            <button
              className="p-1 rounded transition-colors"
              style={{ color: "var(--chatty-text)", marginLeft: "2px" }}
              onClick={onToggleCollapsed}
              aria-label="Expand sidebar"
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "var(--chatty-highlight)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <PanelLeftClose
                size={16}
                style={{
                  transition: "transform 0.2s ease",
                  transform: "rotate(180deg)",
                }}
              />
            </button>
          </div>
        )}
      </div>

      {/* Navigation Options - Streamlined Default Items */}
      <div className={cn(collapsed ? "px-3 pb-3" : "px-4 pb-4")}>
        <div className="space-y-1">
          {/* Continuity (Default) */}
          <button
            onClick={() => navigate("/app/vvault")}
            className={navButtonBase}
            style={navButtonStyle("/app/vvault")}
            onMouseEnter={(e) => handleNavHover(e, "/app/vvault", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/vvault", false)}
          >
            <Shield size={16} />
            {!collapsed && <span>Continuity</span>}
          </button>

          {/* simForge (Default) */}
          <button
            onClick={() => {
              if (onOpenExplore) return onOpenExplore();
              navigate("/app/explore");
            }}
            className={navButtonBase}
            style={navButtonStyle("/app/explore")}
            onMouseEnter={(e) => handleNavHover(e, "/app/explore", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/explore", false)}
          >
            <div className="w-4 h-4 flex items-center justify-center overflow-visible flex-shrink-0">
              <img
                src={simforgeIcon}
                alt="simForge"
                className="w-[39px] h-[39px] object-contain"
                style={{
                  transform: collapsed ? "scale(1.15)" : "scale(1)",
                  transformOrigin: "center",
                  marginTop: collapsed ? "-9px" : "0px",
                }}
              />
            </div>
            {!collapsed && <span>simForge</span>}
          </button>

          {/* Library (Default) */}
          <button
            onClick={() => {
              if (onOpenLibrary) return onOpenLibrary();
              navigate("/app/library");
            }}
            className={navButtonBase}
            style={navButtonStyle("/app/library")}
            onMouseEnter={(e) => handleNavHover(e, "/app/library", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/library", false)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
            </svg>
            {!collapsed && <span>Library</span>}
          </button>

          {/* Public MVP: unfinished systems stay implemented but hidden from navigation. */}
        </div>
      </div>

      {/* Address Book Section */}
      <div
        className={cn(
          "flex-1 overflow-y-auto relative",
          collapsed ? "px-3 pb-3" : "px-4 pb-4",
        )}
      >
        {!collapsed && (
          <div className="flex items-center justify-between mb-2">
            <h3
              className="text-xs font-medium uppercase tracking-wide"
              style={{ color: "var(--chatty-text)", opacity: 0.7 }}
            >
              Address Book ({conversations.length})
            </h3>
            {/* Address Book Search Toggle */}
            <button
              onClick={() => {
                setIsAddressBookSearchActive(!isAddressBookSearchActive);
                setAddressBookSearchQuery("");
                setAddressBookResultsLimit(8);
              }}
              className="p-1 rounded transition-colors hover:bg-[var(--chatty-highlight)]"
              style={{ color: "var(--chatty-text)", opacity: 0.6 }}
              title="Search transcripts"
            >
              <Search size={12} />
            </button>
          </div>
        )}

        {/* Address Book Inline Search - Takes over z-axis when active */}
        {isAddressBookSearchActive && !collapsed && (
          <div
            className="absolute inset-x-0 top-0 bottom-0 px-4 pb-4"
            style={{
              backgroundColor: "var(--chatty-bg-sidebar)",
              zIndex: 50,
            }}
          >
            {/* Search Input */}
            <div
              className="flex items-center gap-2 rounded-full px-2 py-1.5 mb-2"
              style={{
                backgroundColor: "var(--chatty-bg-input, var(--chatty-bg))",
                border: "1px solid var(--chatty-border)",
              }}
            >
              <Search
                size={14}
                style={{ color: "var(--chatty-text)", opacity: 0.5 }}
              />
              <input
                ref={addressBookSearchInputRef}
                type="text"
                value={addressBookSearchQuery}
                onChange={(e) => {
                  setAddressBookSearchQuery(e.target.value);
                  setAddressBookResultsLimit(8);
                }}
                onKeyDown={handleAddressBookSearchSubmit}
                placeholder="Search transcripts..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--chatty-text)" }}
              />
              <button
                onClick={() => {
                  setIsAddressBookSearchActive(false);
                  setAddressBookSearchQuery("");
                  setAddressBookSearchResults([]);
                }}
                className="p-0.5 rounded hover:bg-[var(--chatty-highlight)]"
              >
                <X size={12} style={{ color: "var(--chatty-text)" }} />
              </button>
            </div>

            {/* Search Results - Plastered in sidebar */}
            <div
              className="space-y-1 overflow-y-auto"
              style={{ maxHeight: "calc(100% - 50px)" }}
            >
              {addressBookSearchResults.length === 0 &&
                addressBookSearchQuery && (
                  <p
                    className="text-sm text-center py-4"
                    style={{ color: "var(--chatty-text)", opacity: 0.6 }}
                  >
                    No results found
                  </p>
                )}
              {addressBookSearchResults
                .slice(0, addressBookResultsLimit)
                .map((result, idx) => (
                  <button
                    key={`${result.conversationId}-${idx}`}
                    onClick={() => {
                      if (onConversationSelect) {
                        onConversationSelect(result.conversationId);
                      }
                      setIsAddressBookSearchActive(false);
                      setAddressBookSearchQuery("");
                    }}
                    className="w-full text-left p-2 rounded-full hover:bg-[var(--chatty-highlight)] transition-colors"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium"
                        style={{ opacity: 0.8 }}
                      >
                        {result.conversationTitle}
                      </span>
                      <span
                        className="text-xs px-1 rounded"
                        style={{
                          backgroundColor:
                            result.role === "user"
                              ? "var(--chatty-accent, #ADA587)"
                              : "var(--chatty-highlight)",
                          opacity: 0.7,
                        }}
                      >
                        {result.role}
                      </span>
                    </div>
                    <p className="text-xs truncate" style={{ opacity: 0.6 }}>
                      {result.messagePreview}
                    </p>
                  </button>
                ))}
              {/* Show More Button */}
              {addressBookSearchResults.length > addressBookResultsLimit && (
                <button
                  onClick={() =>
                    setAddressBookResultsLimit((prev) => prev + 10)
                  }
                  className="w-full text-center py-2 text-sm hover:bg-[var(--chatty-highlight)] rounded-full transition-colors"
                  style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                >
                  Show more (
                  {addressBookSearchResults.length - addressBookResultsLimit}{" "}
                  remaining)
                </button>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1">
          {/* Existing Conversations - With avatars aligned to nav items */}
          {conversations.map((conversation) => {
            const avatar = resolveAvatarFields(conversation as any).avatar;
            
            return (
            <button
              key={conversation.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (onConversationSelect) {
                  try {
                    onConversationSelect(conversation.id);
                  } catch (error) {
                    console.error(
                      "❌ [Sidebar] Error in onConversationSelect:",
                      error,
                    );
                  }
                } else {
                  console.error(
                    "❌ [Sidebar] onConversationSelect is not defined!",
                  );
                }
              }}
              className={cn(
                navButtonBase,
                "group",
              )}
              style={{
                backgroundColor:
                  conversation.id === currentConversationId
                    ? activeNavColor
                    : "transparent",
                color: "var(--chatty-text)",
                pointerEvents: "auto",
                cursor: "pointer",
                position: "relative",
                zIndex: 1,
              }}
              onMouseEnter={(e) => {
                if (conversation.id !== currentConversationId) {
                  e.currentTarget.style.backgroundColor = hoverColor;
                }
              }}
              onMouseLeave={(e) => {
                if (conversation.id !== currentConversationId) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              {/* Avatar - circular, aligned with nav icons */}
              {avatar ? (
                <img
                  src={avatar}
                  alt={conversation.title}
                  className="w-4 h-4 rounded-full object-cover flex-shrink-0"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    target.style.display = "none";
                    const fallback = target.nextElementSibling;
                    if (fallback) (fallback as HTMLElement).style.display = "flex";
                  }}
                />
              ) : null}
              {!avatar ? (
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-medium"
                  style={{
                    backgroundColor: "var(--chatty-highlight)",
                    color: "var(--chatty-text)",
                    opacity: 0.72,
                  }}
                  aria-hidden="true"
                >
                  {(conversation.title || "?").trim().charAt(0).toUpperCase() || "?"}
                </div>
              ) : (
                <div
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-medium"
                  style={{
                    display: "none",
                    backgroundColor: "var(--chatty-highlight)",
                    color: "var(--chatty-text)",
                    opacity: 0.72,
                  }}
                  aria-hidden="true"
                >
                  {(conversation.title || "?").trim().charAt(0).toUpperCase() || "?"}
                </div>
              )}
              {!collapsed && (
                <>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="truncate">{conversation.title}</span>
                    {/* Blue pin icon for Zen (primary construct) */}
                    {(conversation as any).isPrimary ||
                    (conversation as any).constructId === "zen-001" ? (
                      <Pin
                        size={12}
                        className="text-blue-500 flex-shrink-0"
                        style={{ color: "#3b82f6" }}
                      />
                    ) : null}
                  </div>
                  {/* Settings button for GPT constructs (not Zen/Lin) */}
                  {!(
                    (conversation as any).isPrimary ||
                    (conversation as any).constructId === "zen-001" ||
                    (conversation as any).constructId === "lin-001" ||
                    (conversation as any).constructId === "lin" ||
                    (conversation as any).constructId === "val-001" ||
                    (conversation as any).constructId === "val"
                  ) && (
                    <div
                      role="button"
                      tabIndex={0}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all ml-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        const cid = (conversation as any).constructId || "";
                        navigate(`/app/ais/edit/${cid}`);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          const cid = (conversation as any).constructId || "";
                          navigate(`/app/ais/edit/${cid}`);
                        }
                      }}
                      style={{ color: "var(--chatty-text)" }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor =
                          "var(--chatty-highlight)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = "transparent";
                      }}
                      aria-label={`Settings for ${conversation.title}`}
                    >
                      <MoreVertical size={12} />
                    </div>
                  )}
                </>
              )}
            </button>
          );
          })}

          {/* Empty state - VVAULT connection status */}
          {conversations.length === 0 && (
            <div
              className="text-center text-sm py-8"
              style={{ color: "var(--chatty-text)", opacity: 0.7 }}
            >
              <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
              <p>{addressBookEmptyMessage}</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Utilities */}
      <div
        className={cn(
          "mt-auto space-y-3",
          collapsed ? "px-3 pb-3 pt-0" : "p-4",
        )}
      >
        {collapsed && (
          <>
            {/* Runtime dashboard button removed - using automatic orchestration */}
            <button
              onClick={() => {}} // Placeholder - runtime dashboard removed
              className="w-full rounded-full transition-colors flex items-center gap-2 p-2 justify-center opacity-50 cursor-not-allowed"
              style={{ color: "var(--chatty-text)" }}
              aria-label="Runtime auto-managed"
            >
              <Gauge size={16} />
            </button>

            <div className="flex justify-center">
              <ThemeToggleButton
                collapsed={collapsed}
                className="hover:bg-[var(--chatty-highlight)]"
              />
            </div>
          </>
        )}

        {currentUser ? (
          <button
            onClick={onShowSettings}
            className={cn(
              "w-full rounded-full transition-colors flex items-center gap-3 p-2",
              collapsed ? "justify-center" : "hover:bg-[var(--chatty-highlight)]",
            )}
          >
            {currentUser.picture ? (
              <img
                src={currentUser.picture}
                alt={currentUser.name}
                className="w-8 h-8 min-w-[32px] rounded-full flex-shrink-0 object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget
                    .nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="w-8 h-8 min-w-[32px] bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                display: currentUser.picture ? "none" : "flex",
              }}
            >
              <span className="text-white text-sm font-medium">
                {currentUser.name?.charAt(0) ||
                  currentUser.email?.charAt(0) ||
                  "U"}
              </span>
            </div>
            {!collapsed && (
              <div className="flex flex-col text-left">
                <span
                  className="text-sm font-medium truncate"
                  style={{ color: "var(--chatty-text)" }}
                >
                  {currentUser.name || currentUser.email || "User"}
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--chatty-text)", opacity: 0.7 }}
                >
                  Plus
                </span>
              </div>
            )}
          </button>
        ) : (
          <button
            onClick={() => (window.location.href = "/api/auth/google")}
            className="w-full rounded-full p-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Continue with Google
          </button>
        )}
      </div>

    </div>
  );
};

export default Sidebar;
