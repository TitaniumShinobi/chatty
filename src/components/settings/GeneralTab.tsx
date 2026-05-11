import React, { useEffect, useMemo, useState } from "react";
import {
  Palette,
  Globe,
  Volume2,
  Play,
  Check,
  Sun,
  Moon,
  Sunrise,
  Sparkles,
  TreePine,
  Heart,
  Clover,
} from "lucide-react";
import { useSettings } from "../../context/SettingsContext";
import { useTheme } from "../../lib/ThemeContext";
import {
  speakPremium,
} from "../../lib/tts";
import {
  getZenVoicePresets,
  getLinVoicePresets,
  resolveSystemVoicePreset,
  migrateLegacyVoiceValueToPresetId,
} from "../../lib/systemVoicePresets";
import StarToggleWithAssets from "../StarToggleWithAssets";
import { Z_LAYERS } from "../../lib/zLayers";

const GeneralTab: React.FC = () => {
  const { settings, updateGeneral } = useSettings();
  const {
    setTheme,
    theme,
    sunTimes,
    themeScriptSetting,
    setThemeScriptSetting,
    availableThemeScripts,
    activeThemeScript,
  } = useTheme();
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<"zen" | "lin" | null>(null);

  const themeOptions = [
    { value: "Auto", label: "Auto", icon: Sunrise },
    { value: "Light", label: "Light", icon: Sun },
    { value: "Dark", label: "Dark", icon: Moon },
  ];
  
  const themeDisplayMap: Record<string, string> = {
    auto: "Auto",
    light: "Light", 
    night: "Dark",
  };
  const currentThemeDisplay = themeDisplayMap[theme] || "Auto";

  const accentColorOptions = [
    { value: "Default", label: "Default", color: "#6B7280" },
    { value: "Blue", label: "Blue", color: "#3B82F6" },
    { value: "Green", label: "Green", color: "#10B981" },
    { value: "Yellow", label: "Yellow", color: "#F59E0B" },
    { value: "Pink", label: "Pink", color: "#EC4899" },
    { value: "Orange", label: "Orange", color: "#F97316" },
    { value: "Purple", label: "Purple", color: "#8B5CF6" },
  ];

  const languageOptions = [
    { value: "Auto-detect", label: "Auto-detect" },
    { value: "English (US)", label: "English (US)" },
    { value: "English (UK)", label: "English (UK)" },
    { value: "Spanish", label: "Spanish" },
    { value: "French", label: "French" },
    { value: "German", label: "German" },
    { value: "Italian", label: "Italian" },
    { value: "Portuguese", label: "Portuguese" },
    { value: "Russian", label: "Russian" },
    { value: "Chinese", label: "Chinese" },
    { value: "Japanese", label: "Japanese" },
    { value: "Korean", label: "Korean" },
  ];

  // One-time migration: if stored zenVoice/linVoice are legacy (sage, coral, etc.), persist preset id
  useEffect(() => {
    const zenPresetId = migrateLegacyVoiceValueToPresetId("zen", settings.general.zenVoice);
    if (zenPresetId && zenPresetId !== settings.general.zenVoice) {
      updateGeneral({ zenVoice: zenPresetId });
    }
    const linPresetId = migrateLegacyVoiceValueToPresetId("lin", settings.general.linVoice);
    if (linPresetId && linPresetId !== settings.general.linVoice) {
      updateGeneral({ linVoice: linPresetId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to migrate legacy values
  }, []);

  const zenVoiceOptions = useMemo(
    () => getZenVoicePresets().map((p) => ({ value: p.id, label: p.label })),
    [],
  );

  const linVoiceOptions = useMemo(
    () => getLinVoicePresets().map((p) => ({ value: p.id, label: p.label })),
    [],
  );

  const getZenVoiceDisplay = (storedValue: string) => {
    const resolved = resolveSystemVoicePreset("zen", storedValue);
    const preset = getZenVoicePresets().find((p) => p.id === resolved.presetId);
    return preset?.label ?? (resolved.presetId || "Zen Primary");
  };

  const getLinVoiceDisplay = (storedValue: string) => {
    const resolved = resolveSystemVoicePreset("lin", storedValue);
    const preset = getLinVoicePresets().find((p) => p.id === resolved.presetId);
    return preset?.label ?? (resolved.presetId || "Lin Primary");
  };

  const previewVoice = async (kind: "zen" | "lin") => {
    const storedValue =
      kind === "zen" ? settings.general.zenVoice : settings.general.linVoice;
    const options = kind === "zen" ? zenVoiceOptions : linVoiceOptions;
    const inList = options.some((opt) => opt.value === storedValue);
    if (!inList && options.length > 0) return;
    if (kind === "zen" && !resolveSystemVoicePreset("zen", storedValue).openvoiceVoice) return;
    if (kind === "lin" && !resolveSystemVoicePreset("lin", storedValue).openvoiceVoice) return;

    const sample =
      kind === "zen"
        ? "Hello. I'm Zen. I'm here with you."
        : "Hey. It's Lin. I'm ready when you are.";

    setPreviewing(kind);
    try {
      const resolved =
        kind === "zen"
          ? resolveSystemVoicePreset("zen", storedValue)
          : resolveSystemVoicePreset("lin", storedValue);
      const syntheticThreadId =
        kind === "zen" ? "zen-001_chat_with_zen-001" : "lin-001_chat_with_lin-001";
      await speakPremium(sample, {
        voice: resolved.openvoiceVoice ?? undefined,
        threadId: syntheticThreadId,
        style: resolved.style ?? undefined,
        speechProfile: resolved.speechProfile ?? undefined,
      });
    } catch (error) {
      console.warn(`[GeneralTab] ${kind} voice preview failed`, error);
    } finally {
      setPreviewing((current) => (current === kind ? null : current));
    }
  };

  const handleDropdownToggle = (dropdown: string) => {
    setOpenDropdown(openDropdown === dropdown ? null : dropdown);
  };

  const handleOptionSelect = (setting: string, value: string) => {
    updateGeneral({ [setting]: value });

    // === THEME INTEGRATION - START ===
    // Also update the theme context when theme setting changes
    // ThemeContext expects: 'auto' | 'light' | 'night'
    if (setting === "theme") {
      // Map display values to theme context values
      const themeMap: Record<string, "auto" | "light" | "night"> = {
        Auto: "auto",
        Light: "light",
        Dark: "night",
      };
      const themeValue = themeMap[value] || "auto";
      setTheme(themeValue);
    }
    // === THEME INTEGRATION - END ===

    setOpenDropdown(null);
  };

  return (
    <div>
      <h3
        className="text-lg font-medium mb-4"
        style={{ color: "var(--chatty-text)" }}
      >
        General
      </h3>
      <div className="space-y-3">
        {/* Appearance (Light/Dark/Auto) */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("appearance")}
          >
            <div className="flex items-center gap-3">
              <Palette
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Appearance
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Show timezone and sun times when Auto is selected */}
              {theme === "auto" && sunTimes && (
                <span
                  className="text-xs"
                  style={{ color: "var(--chatty-text)", opacity: 0.5 }}
                >
                  {Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()?.replace(/_/g, ' ')} · {(() => {
                    const now = new Date();
                    const isAfterSunrise = now > sunTimes.sunrise;
                    const isAfterSunset = now > sunTimes.sunset;
                    if (!isAfterSunrise) {
                      return `Sunrise ${sunTimes.sunrise.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
                    } else if (!isAfterSunset) {
                      return `Sunset ${sunTimes.sunset.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
                    } else {
                      return `Sunrise ${sunTimes.sunrise.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
                    }
                  })()}
                </span>
              )}
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {currentThemeDisplay}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "appearance" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              {themeOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <div
                    key={option.value}
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                    style={{
                      backgroundColor:
                        currentThemeDisplay === option.value
                          ? "var(--chatty-highlight)"
                          : "transparent",
                    }}
                    onClick={() => handleOptionSelect("theme", option.value)}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        size={16}
                        style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
                      />
                      <span
                        className="text-sm"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        {option.label}
                      </span>
                    </div>
                    {currentThemeDisplay === option.value && (
                      <Check
                        size={16}
                        style={{ color: "var(--chatty-text)" }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Theme (Color Scheme) */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("themeScript")}
          >
            <div className="flex items-center gap-3">
              <Sparkles
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Theme
              </span>
            </div>
            <div className="flex items-center gap-2">
              {activeThemeScript && (
                <span
                  className="text-xs px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: "var(--chatty-highlight)",
                    color: "var(--chatty-text)",
                    opacity: 0.8,
                  }}
                >
                  Active
                </span>
              )}
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {themeScriptSetting === "none"
                  ? "None"
                  : themeScriptSetting === "auto"
                    ? "Auto"
                    : availableThemeScripts.find(
                        (s) => s.id === themeScriptSetting,
                      )?.name || themeScriptSetting}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "themeScript" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-56"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                style={{
                  backgroundColor:
                    themeScriptSetting === "none" ? "var(--chatty-highlight)" : "transparent",
                }}
                onClick={() => {
                  setThemeScriptSetting("none");
                  setOpenDropdown(null);
                }}
              >
                <div className="flex items-center gap-3">
                  <Palette
                    size={16}
                    style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
                  />
                  <span
                    className="text-sm"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    None
                  </span>
                </div>
                {themeScriptSetting === "none" && (
                  <Check size={16} style={{ color: "var(--chatty-text)" }} />
                )}
              </div>
              <div
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                style={{
                  backgroundColor:
                    themeScriptSetting === "auto" ? "var(--chatty-highlight)" : "transparent",
                }}
                onClick={() => {
                  setThemeScriptSetting("auto");
                  setOpenDropdown(null);
                }}
              >
                <div className="flex items-center gap-3">
                  <Sparkles
                    size={16}
                    style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
                  />
                  <div>
                    <span
                      className="text-sm"
                      style={{ color: "var(--chatty-text)" }}
                    >
                      Auto
                    </span>
                    <p
                      className="text-xs"
                      style={{ color: "var(--chatty-text)", opacity: 0.6 }}
                    >
                      Calendar-based themes
                    </p>
                  </div>
                </div>
                {themeScriptSetting === "auto" && (
                  <Check size={16} style={{ color: "var(--chatty-text)" }} />
                )}
              </div>
              <div
                className="border-t"
                style={{ borderColor: "var(--chatty-line)" }}
              />
              {availableThemeScripts.map((script) => (
                <div
                  key={script.id}
                  className="flex items-center justify-between p-3 cursor-pointer transition-colors hover:bg-[var(--chatty-highlight)]/40"
                  style={{
                    backgroundColor:
                      themeScriptSetting === script.id
                        ? "var(--chatty-highlight)"
                        : "transparent",
                  }}
                  onClick={() => {
                    setThemeScriptSetting(script.id);
                    setOpenDropdown(null);
                  }}
                >
                  <div className="flex items-center gap-3">
                    {script.id === "valentines" ? (
                      <Heart
                        size={16}
                        style={{ color: "#d4005f", opacity: 0.9 }}
                      />
                    ) : script.id === "stpatrick" ? (
                      <Clover
                        size={16}
                        style={{ color: "#228B22", opacity: 0.9 }}
                      />
                    ) : (
                      <TreePine
                        size={16}
                        style={{ color: "#228B22", opacity: 0.9 }}
                      />
                    )}
                    <div>
                      <span
                        className="text-sm"
                        style={{ color: "var(--chatty-text)" }}
                      >
                        {script.name}
                      </span>
                      <p
                        className="text-xs"
                        style={{ color: "var(--chatty-text)", opacity: 0.6 }}
                      >
                        {script.id === "christmas"
                          ? "Fri Dec 25"
                          : script.id === "valentines"
                            ? "Sat Feb 14"
                            : script.id === "stpatrick"
                              ? "Tue Mar 17"
                              : ""}
                      </p>
                    </div>
                  </div>
                  {themeScriptSetting === script.id && (
                    <Check size={16} style={{ color: "var(--chatty-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accent Color */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("accentColor")}
          >
            <div className="flex items-center gap-3">
              <Palette
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Accent color
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  backgroundColor:
                    accentColorOptions.find(
                      (opt) => opt.value === settings.general.accentColor,
                    )?.color || "#10B981",
                }}
              />
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {settings.general.accentColor}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "accentColor" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              {accentColorOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{
                    backgroundColor:
                      settings.general.accentColor === option.value
                        ? "var(--chatty-highlight)"
                        : "transparent",
                  }}
                  onClick={() =>
                    handleOptionSelect("accentColor", option.value)
                  }
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: option.color }}
                    />
                    <span
                      className="text-sm"
                      style={{ color: "var(--chatty-text)" }}
                    >
                      {option.label}
                    </span>
                  </div>
                  {settings.general.accentColor === option.value && (
                    <Check size={16} style={{ color: "var(--chatty-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Language */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("language")}
          >
            <div className="flex items-center gap-3">
              <Globe
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Language
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {settings.general.language}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "language" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-64 max-h-60 overflow-y-auto"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              {languageOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{
                    backgroundColor:
                      settings.general.language === option.value
                        ? "var(--chatty-highlight)"
                        : "transparent",
                  }}
                  onClick={() => handleOptionSelect("language", option.value)}
                >
                  <span
                    className="text-sm"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    {option.label}
                  </span>
                  {settings.general.language === option.value && (
                    <Check size={16} style={{ color: "var(--chatty-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spoken Language */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("spokenLanguage")}
          >
            <div className="flex items-center gap-3">
              <Globe
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Spoken language
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {settings.general.spokenLanguage}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "spokenLanguage" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-64 max-h-60 overflow-y-auto"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              {languageOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{
                    backgroundColor:
                      settings.general.spokenLanguage === option.value
                        ? "var(--chatty-highlight)"
                        : "transparent",
                  }}
                  onClick={() =>
                    handleOptionSelect("spokenLanguage", option.value)
                  }
                >
                  <span
                    className="text-sm"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    {option.label}
                  </span>
                  {settings.general.spokenLanguage === option.value && (
                    <Check size={16} style={{ color: "var(--chatty-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
          <p
            className="text-xs mt-1 px-3"
            style={{ color: "var(--chatty-text)", opacity: 0.7 }}
          >
            For best results, select the language you mainly speak. If it's not
            listed, it may still be supported via auto-detection.
          </p>
        </div>

        {/* Zen voice */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("zenVoice")}
          >
            <div className="flex items-center gap-3">
              <Volume2
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Zen voice
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  void previewVoice("zen");
                }}
                disabled={
                  previewing === "zen" ||
                  !zenVoiceOptions.some(
                    (option) => option.value === settings.general.zenVoice,
                  )
                }
                title="Preview Zen voice (uses same engine as conversation)"
              >
                <Play size={12} style={{ color: "var(--chatty-text)" }} />
              </button>
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {getZenVoiceDisplay(settings.general.zenVoice)}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "zenVoice" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              {zenVoiceOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{
                    backgroundColor:
                      settings.general.zenVoice === option.value ||
                      resolveSystemVoicePreset("zen", settings.general.zenVoice).presetId === option.value
                        ? "var(--chatty-highlight)"
                        : "transparent",
                  }}
                  onClick={() => {
                    updateGeneral({ zenVoice: option.value });
                    setOpenDropdown(null);
                  }}
                >
                  <span
                    className="text-sm"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    {option.label}
                  </span>
                  {(settings.general.zenVoice === option.value ||
                    resolveSystemVoicePreset("zen", settings.general.zenVoice).presetId === option.value) && (
                    <Check size={16} style={{ color: "var(--chatty-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
          <p
            className="text-xs mt-1 px-3"
            style={{ color: "var(--chatty-text)", opacity: 0.7 }}
          >
            Preview uses the same server voice as in conversation.
          </p>
        </div>

        {/* Lin voice */}
        <div className="relative dropdown-container">
          <div
            className="flex items-center justify-between p-3 cursor-pointer transition-colors"
            onClick={() => handleDropdownToggle("linVoice")}
          >
            <div className="flex items-center gap-3">
              <Volume2
                size={16}
                style={{ color: "var(--chatty-icon)", opacity: 0.7 }}
              />
              <span
                className="text-sm transition-colors hover:opacity-80"
                style={{ color: "var(--chatty-text)" }}
              >
                Lin voice
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1 rounded hover:bg-gray-100 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  void previewVoice("lin");
                }}
                disabled={
                  previewing === "lin" ||
                  !linVoiceOptions.some(
                    (option) => option.value === settings.general.linVoice,
                  )
                }
                title="Preview Lin voice (uses same engine as conversation)"
              >
                <Play size={12} style={{ color: "var(--chatty-text)" }} />
              </button>
              <span
                className="text-sm"
                style={{ color: "var(--chatty-text)", opacity: 0.7 }}
              >
                {getLinVoiceDisplay(settings.general.linVoice)}
              </span>
              <span style={{ color: "var(--chatty-text)", opacity: 0.7 }}>
                ›
              </span>
            </div>
          </div>
          {openDropdown === "linVoice" && (
            <div
              className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border w-48"
              style={{
                backgroundColor: "var(--chatty-bg-main)",
                borderColor: "var(--chatty-line)",
                zIndex: Z_LAYERS.popover,
              }}
            >
              {linVoiceOptions.map((option) => (
                <div
                  key={option.value}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-100 transition-colors"
                  style={{
                    backgroundColor:
                      settings.general.linVoice === option.value ||
                      resolveSystemVoicePreset("lin", settings.general.linVoice).presetId === option.value
                        ? "var(--chatty-highlight)"
                        : "transparent",
                  }}
                  onClick={() => {
                    updateGeneral({ linVoice: option.value });
                    setOpenDropdown(null);
                  }}
                >
                  <span
                    className="text-sm"
                    style={{ color: "var(--chatty-text)" }}
                  >
                    {option.label}
                  </span>
                  {(settings.general.linVoice === option.value ||
                    resolveSystemVoicePreset("lin", settings.general.linVoice).presetId === option.value) && (
                    <Check size={16} style={{ color: "var(--chatty-text)" }} />
                  )}
                </div>
              ))}
            </div>
          )}
          <p
            className="text-xs mt-1 px-3"
            style={{ color: "var(--chatty-text)", opacity: 0.7 }}
          >
            Preview uses the same server voice as in conversation.
          </p>
        </div>

        {/* Show Additional Models */}
        <div className="flex items-center justify-between p-3">
          <span className="text-sm" style={{ color: "var(--chatty-text)" }}>
            Show additional models
          </span>
          <StarToggleWithAssets
            toggled={settings.general.showAdditionalModels}
            onToggle={(toggled) =>
              updateGeneral({ showAdditionalModels: toggled })
            }
            size="md"
          />
        </div>
      </div>
    </div>
  );
};

export default GeneralTab;
