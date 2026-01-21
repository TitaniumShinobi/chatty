// @ts-nocheck
import React, { useMemo, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  MessageSquare,
  Trash2,
  Search,
  Library,
  Clock,
  FolderPlus,
  PanelLeftClose,
  Shield,
  Gauge,
  Pin,
} from "lucide-react";
import { SidebarProps } from "../types";
import { cn } from "../lib/utils";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { useTheme } from "../lib/ThemeContext";

// Star assets
import brightchattyStar from "@assets/stars/brightchatty_star.svg";
import chattyStar from "@assets/stars/chatty_star.png";
import { Z_LAYERS } from "../lib/zLayers";

const Sidebar: React.FC<SidebarProps> = ({
  conversations,
  currentConversationId,
  onConversationSelect,
  onNewConversationWithGPT,
  onDeleteConversation,
  onRenameConversation,
  onOpenExplore,
  onOpenCodex,
  onOpenLibrary,
  onOpenSearch,
  onOpenProjects,
  // onShowRuntimeDashboard removed - using automatic runtime orchestration
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
  
  const isChristmasTheme = activeThemeScript?.id === 'christmas';
  const starImage = isChristmasTheme ? brightchattyStar : chattyStar;

  const isActiveRoute = useMemo(
    () => (path: string) => location.pathname === path,
    [location.pathname],
  );

  const navButtonBase = cn(
    "flex items-center w-full py-2 text-left text-sm rounded-md transition-colors",
    collapsed ? "justify-center px-0 gap-0" : "gap-3 px-3",
  );
  const activeNavColor = "#ADA587";
  const hoverColor = "var(--chatty-highlight)";
  const simforgeIcon = (() => {
    const active = isActiveRoute("/app/explore");
    if (actualTheme === "night") {
      return active
        ? "/assets/icons/simforge_day.svg"
        : "/assets/icons/simforge_night.svg";
    }
    // day theme
    return active
      ? "/assets/icons/simforge_night.svg"
      : "/assets/icons/simforge_day.svg";
  })();

  const navButtonStyle = (path: string) => ({
    backgroundColor: isActiveRoute(path) ? activeNavColor : "transparent",
    color: isActiveRoute(path)
      ? "var(--chatty-text-inverse, #ffffeb)"
      : "var(--chatty-text)",
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
      <div className={collapsed ? "px-3 pt-3 pb-2" : "p-4"}>
        {!collapsed ? (
          <div className="flex items-center justify-between gap-3">
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
                <img
                  src={starImage}
                  alt="Chatty"
                  className="chatty-star w-full h-full object-contain"
                />
                {!isChristmasTheme && (
                  <>
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
                      src="/assets/stars/fourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/fourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                    <img
                      src="/assets/stars/fourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/fourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                  </>
                )}
              </div>
            </button>

            <div className="flex items-center gap-2 ml-auto">
              {/* Runtime dashboard button removed - using automatic orchestration */}
              <button
                onClick={() => {}} // Placeholder - runtime dashboard removed
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
                <img
                  src={starImage}
                  alt="Chatty"
                  className="chatty-star w-full h-full object-contain"
                />
                {!isChristmasTheme && (
                  <>
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
                      src="/assets/stars/fourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-left"
                    />
                    <img
                      src="/assets/stars/fourpointstarburst.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-right"
                    />
                    <img
                      src="/assets/stars/fourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-left"
                    />
                    <img
                      src="/assets/stars/fourpointnova.svg"
                      alt=""
                      aria-hidden="true"
                      className="chatty-starburst chatty-starburst-nova-right"
                    />
                  </>
                )}
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

      {/* Navigation Options - Flat List Style */}
      <div className={cn(collapsed ? "px-3 pb-3" : "px-4 pb-4")}>
        <div className="space-y-1">
          <button
            onClick={() => {
              if (onOpenSearch) onOpenSearch();
            }}
            className={cn(
              "flex items-center w-full py-2 text-left text-sm rounded-md transition-colors",
              collapsed ? "justify-center px-0 gap-0" : "gap-3 px-2.5",
            )}
            style={{ color: "var(--chatty-text)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = hoverColor;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
            }}
            title="Search chats"
          >
            <Search size={16} />
            {!collapsed && <span>Search chats</span>}
          </button>

          <button
            onClick={(e) => {
              // #region agent log
              fetch(
                "http://127.0.0.1:7243/ingest/9aa5e079-2a3d-44e1-a152-645d01668332",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    location: "Sidebar.tsx:287",
                    message: "Library button click",
                    data: {
                      hasBlockingOverlay,
                      clientX: e.clientX,
                      clientY: e.clientY,
                      buttonRect: e.currentTarget.getBoundingClientRect(),
                      zIndex: window.getComputedStyle(
                        e.currentTarget as HTMLElement,
                      ).zIndex,
                      parentZIndex: window.getComputedStyle(
                        e.currentTarget.parentElement as HTMLElement,
                      ).zIndex,
                    },
                    timestamp: Date.now(),
                    sessionId: "debug-session",
                    runId: "run1",
                    hypothesisId: "B",
                  }),
                },
              ).catch(() => {});
              // #endregion
              if (onOpenLibrary) onOpenLibrary();
            }}
            className={navButtonBase}
            style={navButtonStyle("/app/library")}
            onMouseEnter={(e) => handleNavHover(e, "/app/library", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/library", false)}
          >
            <Library size={16} />
            {!collapsed && <span>Library</span>}
          </button>

          <button
            onClick={() => {
              if (onOpenCodex) onOpenCodex();
            }}
            className={navButtonBase}
            style={navButtonStyle("/app/codex")}
            onMouseEnter={(e) => handleNavHover(e, "/app/codex", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/codex", false)}
          >
            <Clock size={16} />
            {!collapsed && <span>Code</span>}
          </button>

          <button
            onClick={() => navigate("/app/vvault")}
            className={navButtonBase}
            style={navButtonStyle("/app/vvault")}
            onMouseEnter={(e) => handleNavHover(e, "/app/vvault", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/vvault", false)}
          >
            <Shield size={16} />
            {!collapsed && <span>VVAULT</span>}
          </button>

          <button
            onClick={() => {
              if (onOpenProjects) onOpenProjects();
            }}
            className={navButtonBase}
            style={navButtonStyle("/app/projects")}
            onMouseEnter={(e) => handleNavHover(e, "/app/projects", true)}
            onMouseLeave={(e) => handleNavHover(e, "/app/projects", false)}
          >
            <FolderPlus size={16} />
            {!collapsed && <span>Projects</span>}
          </button>

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
        </div>
      </div>

      {/* Address Book Section */}
      <div
        className={cn(
          "flex-1 overflow-y-auto",
          collapsed ? "px-3 pb-3" : "px-4 pb-4",
        )}
      >
        {!collapsed && (
          <h3
            className="text-xs font-medium uppercase tracking-wide mb-2"
            style={{ color: "var(--chatty-text)", opacity: 0.7 }}
          >
            Address Book
          </h3>
        )}
        <div className="space-y-1">
          {/* Existing Conversations - No borders, just hover highlights */}
          {conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={(e) => {
                console.log("🔵 [Sidebar] Button clicked:", {
                  conversationId: conversation.id,
                  conversationTitle: conversation.title,
                  hasHandler: !!onConversationSelect,
                });
                e.preventDefault();
                e.stopPropagation();
                if (onConversationSelect) {
                  console.log(
                    "🟢 [Sidebar] Calling onConversationSelect with:",
                    conversation.id,
                  );
                  try {
                    onConversationSelect(conversation.id);
                    console.log("✅ [Sidebar] onConversationSelect completed");
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
                "flex items-center justify-between w-full px-3 py-2 text-left text-sm rounded-md transition-colors group",
                conversation.id === currentConversationId &&
                  "text-[var(--chatty-text-inverse, #ffffeb)]",
              )}
              style={{
                backgroundColor:
                  conversation.id === currentConversationId
                    ? activeNavColor
                    : "transparent",
                color:
                  conversation.id === currentConversationId
                    ? "var(--chatty-text-inverse, #ffffeb)"
                    : "var(--chatty-text)",
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
              {/* Hide delete button for primary construct (Zen) */}
              {!(
                (conversation as any).isPrimary ||
                (conversation as any).constructId === "zen-001"
              ) && (
                <div
                  role="button"
                  tabIndex={0}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded transition-all ml-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteConversation(conversation.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeleteConversation(conversation.id);
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
                  aria-label={`Delete conversation ${conversation.title}`}
                >
                  <Trash2 size={12} />
                </div>
              )}
            </button>
          ))}

          {/* Empty state - VVAULT connection status */}
          {conversations.length === 0 && (
            <div
              className="text-center text-sm py-8"
              style={{ color: "var(--chatty-text)", opacity: 0.7 }}
            >
              <MessageSquare size={20} className="mx-auto mb-2 opacity-50" />
              <p>
                {isVVAULTConnected
                  ? "No conversations yet"
                  : "No connection to VVAULT."}
              </p>
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
              className="w-full rounded-md transition-colors flex items-center gap-2 p-2 justify-center opacity-50 cursor-not-allowed"
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
              "w-full rounded-md transition-colors flex items-center gap-3 p-2",
              collapsed ? "justify-center" : "hover:bg-gray-100",
            )}
          >
            {currentUser.sub || currentUser.id || currentUser.uid ? (
              <img
                src={`/api/profile-image/${currentUser.sub || currentUser.id || currentUser.uid}`}
                alt={currentUser.name}
                className="w-8 h-8 rounded-full flex-shrink-0 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  const fallback = e.currentTarget
                    .nextElementSibling as HTMLElement;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
            ) : null}
            <div
              className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                display:
                  currentUser.sub || currentUser.id || currentUser.uid
                    ? "none"
                    : "flex",
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
            className="w-full rounded-md p-2 bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Continue with Google
          </button>
        )}
      </div>

      {/* Ensure Zen is only visible in the sidebar */}
      {currentConversationId === "zen" && (
        <div
          className="zen-sidebar-item"
          style={{ zIndex: 1, position: "relative" }}
        >
          Zen
        </div>
      )}
    </div>
  );
};

export default Sidebar;
