export interface ThemeScript {
  id: string;
  name: string;
  description: string;
  activePeriod: {
    startMonth: number;
    startDay: number;
    endMonth: number;
    endDay: number;
  };
  colors: {
    night?: {
      bgMain?: string;
      bgSidebar?: string;
      bgMessage?: string;
      highlight?: string;
    };
    light?: {
      bgMain?: string;
      bgSidebar?: string;
      bgMessage?: string;
      highlight?: string;
    };
  };
  starColors: {
    starburst?: string;
    nova?: string;
    ray?: string;
  };
}

export function getChristmasThemeScript(): ThemeScript {
  return {
    id: "christmas",
    name: "Christmas",
    description:
      "Festive holiday theme with deep forest greens and snow-white stars",
    activePeriod: {
      startMonth: 12,
      startDay: 1,
      endMonth: 1,
      endDay: 1,
    },
    colors: {
      night: {
        bgMain: "#0f1f0f",
        bgSidebar: "#0f1f0f",
        bgMessage: "#152515",
        highlight: "#152515",
      },
    },
    starColors: {
      starburst: "#fffff0",
      nova: "#ffffff",
      ray: "#ffd700",
    },
  };
}

export function getValentinesThemeScript(): ThemeScript {
  return {
    id: "valentines",
    name: "Valentine's Day",
    description: "Romantic theme with passion rose and golden rays",
    activePeriod: {
      startMonth: 2,
      startDay: 1,
      endMonth: 2,
      endDay: 15,
    },
    colors: {
      night: {
        bgMain: "#2e0f22",
        bgSidebar: "#2e0f22",
        bgMessage: "rgba(212, 0, 95, 0.15)",
        highlight: "#4a1f36",
      },
      light: {
        bgMain: "#f1dff2",
        bgSidebar: "#f1dff2",
        bgMessage: "rgba(212, 0, 95, 0.1)",
        highlight: "#d9c9d6",
      },
    },
    starColors: {
      starburst: "#ffffeb",
      nova: "#d4005f",
      ray: "#ffef42",
    },
  };
}

export function getBlackHistoryMonthThemeScript(): ThemeScript {
  return {
    id: "black-history-month",
    name: "Black History Month",
    description:
      "Planned theme for celebrating Black history and culture (assets pending)",
    activePeriod: {
      startMonth: 2,
      startDay: 1,
      endMonth: 2,
      endDay: 28,
    },
    colors: {
      night: {},
      light: {},
    },
    starColors: {},
  };
}

export function getWinterOlympicsThemeScript(year: number): ThemeScript | null {
  const isOlympicYear = year % 4 === 2;
  if (!isOlympicYear) return null;

  return {
    id: "winter-olympics",
    name: "Winter Olympics",
    description:
      "Planned theme for celebrating the Winter Olympics (assets pending)",
    activePeriod: {
      startMonth: 2,
      startDay: 4,
      endMonth: 2,
      endDay: 20,
    },
    colors: {
      night: {},
      light: {},
    },
    starColors: {},
  };
}

export function isDateInPeriod(
  date: Date,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number,
): boolean {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  if (startMonth <= endMonth) {
    if (month < startMonth || month > endMonth) return false;
    if (month === startMonth && day < startDay) return false;
    if (month === endMonth && day > endDay) return false;
    return true;
  } else {
    if (month >= startMonth) {
      if (month === startMonth && day < startDay) return false;
      return true;
    }
    if (month <= endMonth) {
      if (month === endMonth && day > endDay) return false;
      return true;
    }
    return false;
  }
}

export function isThemeScriptActive(
  script: ThemeScript,
  date: Date = new Date(),
): boolean {
  const { startMonth, startDay, endMonth, endDay } = script.activePeriod;
  return isDateInPeriod(date, startMonth, startDay, endMonth, endDay);
}

export function getActiveThemeScript(
  date: Date = new Date(),
): ThemeScript | null {
  const valentines = getValentinesThemeScript();
  if (isThemeScriptActive(valentines, date)) {
    return valentines;
  }
  const christmas = getChristmasThemeScript();
  if (isThemeScriptActive(christmas, date)) {
    return christmas;
  }
  return null;
}

export function getAvailableThemeScripts(): ThemeScript[] {
  const year = new Date().getFullYear();
  return [
    getChristmasThemeScript(),
    getValentinesThemeScript(),
    getBlackHistoryMonthThemeScript(),
    getWinterOlympicsThemeScript(year),
  ].filter((s): s is ThemeScript => s !== null);
}

/*
Schedule of Events and Themes:

01-01                                          -- New Years Day
3rd Monday of January                          -- MLK Day
Four year cycle (2026, 2030)                  -- Winter Olympics
02-01                                          -- Black History Month
02-14                                          -- Valentines Day
02-16                                          -- Washington's Birthday
03-17                                          -- St Patrick's Day
1 week before resurrection Sunday              -- Palm Sunday
Friday before resurrection Sunday              -- Good Friday
1st Sun after spring equinox + full moon cycle -- Resurrection Sunday
04-01                                          -- April Fools
05-25                                          -- Memorial Day
06-19                                          -- Juneteenth
07-04                                          -- US Independence Day
Four year cycle (2024, 2028)                  -- Summer Olympics
09-07                                          -- Labor Day
10-31                                          -- Halloween
11-11                                          -- Veterans Day
4th Thursday in November                       -- Thanksgiving
12-01 to 12-31                                 -- Christmas
12-26 to 01-01                                 -- Kwanzaa
*/
