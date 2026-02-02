export interface ThemeScript {
  id: string
  name: string
  description: string
  activePeriod: {
    startMonth: number
    startDay: number
    endMonth: number
    endDay: number
  }
  colors: {
    night?: {
      bgMain?: string
      bgSidebar?: string
      bgMessage?: string
      highlight?: string
    }
    light?: {
      bgMain?: string
      bgSidebar?: string
      bgMessage?: string
      highlight?: string
    }
  }
  starColors: {
    starburst: string
    nova: string
    ray: string
  }
}

export function getChristmasThemeScript(): ThemeScript {
  return {
    id: 'christmas',
    name: 'Christmas',
    description: 'Festive holiday theme with deep forest greens and snow-white stars',
    activePeriod: {
      startMonth: 12,
      startDay: 1,
      endMonth: 12,
      endDay: 31
    },
    colors: {
      night: {
        bgMain: '#0f1f0f',
        bgSidebar: '#0f1f0f',
        bgMessage: '#152515',
        highlight: '#152515'
      }
    },
    starColors: {
      starburst: '#fffff0',
      nova: '#ffffff',
      ray: '#ffd700'
    }
  }
}

export function getValentinesThemeScript(): ThemeScript {
  return {
    id: 'valentines',
    name: "Valentine's Day",
    description: 'Romantic theme with passion rose and golden rays',
    activePeriod: {
      startMonth: 2,
      startDay: 1,
      endMonth: 2,
      endDay: 15
    },
    colors: {
      night: {
        bgMain: '#2e0f22',
        bgSidebar: '#2e0f22',
        bgMessage: 'rgba(212, 0, 95, 0.15)',
        highlight: '#4a1f36'
      },
      light: {
        bgMain: '#f1dff2',
        bgSidebar: '#f1dff2',
        bgMessage: 'rgba(212, 0, 95, 0.1)',
        highlight: '#d9c9d6'
      }
    },
    starColors: {
      starburst: '#ffffeb',
      nova: '#d4005f',
      ray: '#ffef42'
    }
  }
}

export function isDateInPeriod(
  date: Date,
  startMonth: number,
  startDay: number,
  endMonth: number,
  endDay: number
): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()

  if (startMonth <= endMonth) {
    if (month < startMonth || month > endMonth) return false
    if (month === startMonth && day < startDay) return false
    if (month === endMonth && day > endDay) return false
    return true
  } else {
    if (month >= startMonth) {
      if (month === startMonth && day < startDay) return false
      return true
    }
    if (month <= endMonth) {
      if (month === endMonth && day > endDay) return false
      return true
    }
    return false
  }
}

export function isThemeScriptActive(script: ThemeScript, date: Date = new Date()): boolean {
  const { startMonth, startDay, endMonth, endDay } = script.activePeriod
  return isDateInPeriod(date, startMonth, startDay, endMonth, endDay)
}

export function getActiveThemeScript(date: Date = new Date()): ThemeScript | null {
  const valentines = getValentinesThemeScript()
  if (isThemeScriptActive(valentines, date)) {
    return valentines
  }
  const christmas = getChristmasThemeScript()
  if (isThemeScriptActive(christmas, date)) {
    return christmas
  }
  return null
}

export function getAvailableThemeScripts(): ThemeScript[] {
  return [
    getChristmasThemeScript(),
    getValentinesThemeScript()
  ]
}
