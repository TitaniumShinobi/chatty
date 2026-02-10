import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Circle,
  Minus,
  ExternalLink,
  Calendar,
  TrendingUp,
  Calculator,
  BookOpen,
  Dumbbell,
} from 'lucide-react';

const cardStyle: React.CSSProperties = {
  backgroundColor: 'var(--chatty-bg-modal, var(--chatty-highlight))',
  border: '1px solid var(--chatty-border)',
};

interface EconomicEvent {
  time: string;
  currency: string;
  impact: 'high' | 'medium' | 'low';
  event: string;
}

const sampleEvents: EconomicEvent[] = [
  { time: '08:30', currency: 'USD', impact: 'high', event: 'Non-Farm Payrolls' },
  { time: '10:00', currency: 'EUR', impact: 'high', event: 'ECB Interest Rate Decision' },
  { time: '14:00', currency: 'GBP', impact: 'medium', event: 'BOE Gov Bailey Speaks' },
  { time: '19:30', currency: 'JPY', impact: 'low', event: 'Industrial Production' },
];

const ImpactIcon: React.FC<{ impact: 'high' | 'medium' | 'low' }> = ({ impact }) => {
  switch (impact) {
    case 'high':
      return <AlertTriangle size={14} className="text-red-500" />;
    case 'medium':
      return <Circle size={14} className="text-amber-500" />;
    case 'low':
      return <Minus size={14} className="text-gray-400" />;
  }
};

export const ForexFactoryCalendar: React.FC = () => {
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <Calendar size={18} className="text-blue-500" />
        <h3 className="font-semibold">Economic Calendar</h3>
      </div>
      
      <div className="space-y-2 mb-4">
        {sampleEvents.map((event, idx) => (
          <div
            key={idx}
            className="flex items-center gap-3 p-2 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--chatty-bg)' }}
          >
            <span className="text-xs opacity-60 w-12">{event.time}</span>
            <span className="font-medium w-10">{event.currency}</span>
            <ImpactIcon impact={event.impact} />
            <span className="flex-1 truncate">{event.event}</span>
          </div>
        ))}
      </div>
      
      <a
        href="https://www.forexfactory.com/calendar"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--chatty-highlight)' }}
      >
        Open Full Calendar
        <ExternalLink size={14} />
      </a>
    </div>
  );
};

const currencyColors: Record<string, string> = {
  USD: '#22c55e',
  EUR: '#3b82f6',
  GBP: '#a855f7',
  JPY: '#ef4444',
  CHF: '#f59e0b',
  AUD: '#06b6d4',
  NZD: '#84cc16',
  CAD: '#ec4899',
};

export const FinvizHeatmap: React.FC = () => {
  const currencies = Object.keys(currencyColors);
  
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={18} className="text-green-500" />
        <h3 className="font-semibold">FX Heatmap</h3>
      </div>
      <p className="text-xs opacity-60 mb-4">Relative currency performance</p>
      
      <div className="grid grid-cols-4 gap-1 mb-4">
        {currencies.map((currency) => (
          <div
            key={currency}
            className="aspect-square rounded flex items-center justify-center text-xs font-medium text-white"
            style={{ backgroundColor: currencyColors[currency] }}
          >
            {currency}
          </div>
        ))}
      </div>
      
      <a
        href="https://finviz.com/forex.ashx"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--chatty-highlight)' }}
      >
        View Full Heatmap
        <ExternalLink size={14} />
      </a>
    </div>
  );
};

interface CurrencyStrengthData {
  currency: string;
  strength: number;
  color: string;
}

const staticStrengthData: CurrencyStrengthData[] = [
  { currency: 'USD', strength: 75, color: '#22c55e' },
  { currency: 'EUR', strength: 62, color: '#3b82f6' },
  { currency: 'GBP', strength: 58, color: '#a855f7' },
  { currency: 'JPY', strength: 45, color: '#ef4444' },
  { currency: 'CHF', strength: 52, color: '#f59e0b' },
  { currency: 'AUD', strength: 38, color: '#06b6d4' },
  { currency: 'NZD', strength: 42, color: '#84cc16' },
  { currency: 'CAD', strength: 55, color: '#ec4899' },
];

export const CurrencyStrength: React.FC = () => {
  const maxStrength = Math.max(...staticStrengthData.map((d) => d.strength));
  
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-purple-500" />
        <h3 className="font-semibold">Currency Strength</h3>
      </div>
      
      <div className="space-y-2 mb-4">
        {staticStrengthData.map((data) => (
          <div key={data.currency} className="flex items-center gap-2">
            <span className="text-xs font-medium w-8">{data.currency}</span>
            <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--chatty-bg)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(data.strength / maxStrength) * 100}%`,
                  backgroundColor: data.color,
                }}
              />
            </div>
            <span className="text-xs opacity-60 w-8 text-right">{data.strength}</span>
          </div>
        ))}
      </div>
      
      <a
        href="https://www.livecharts.co.uk/currency-strength.php"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-sm font-medium transition-colors hover:opacity-80"
        style={{ backgroundColor: 'var(--chatty-highlight)' }}
      >
        View Live Data
        <ExternalLink size={14} />
      </a>
    </div>
  );
};

export const CompoundCalculator: React.FC = () => {
  const [balance, setBalance] = useState<number>(1000);
  const [dailyPercent, setDailyPercent] = useState<number>(2);
  
  const projections = useMemo(() => {
    const rate = dailyPercent / 100;
    const day30 = balance * Math.pow(1 + rate, 30);
    const day90 = balance * Math.pow(1 + rate, 90);
    return { day30, day90 };
  }, [balance, dailyPercent]);
  
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  };
  
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <Calculator size={18} className="text-cyan-500" />
        <h3 className="font-semibold">Compounding Planner</h3>
      </div>
      
      <div className="space-y-3 mb-4">
        <div>
          <label className="text-xs opacity-60 block mb-1">Starting Balance ($)</label>
          <input
            type="number"
            value={balance}
            onChange={(e) => setBalance(Math.max(0, Number(e.target.value)))}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--chatty-bg)',
              border: '1px solid var(--chatty-border)',
              color: 'var(--chatty-text)',
            }}
          />
        </div>
        
        <div>
          <label className="text-xs opacity-60 block mb-1">Daily % Target (1-5%)</label>
          <input
            type="number"
            value={dailyPercent}
            onChange={(e) => setDailyPercent(Math.min(5, Math.max(1, Number(e.target.value))))}
            min={1}
            max={5}
            step={0.5}
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--chatty-bg)',
              border: '1px solid var(--chatty-border)',
              color: 'var(--chatty-text)',
            }}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-3">
        <div
          className="p-3 rounded-lg text-center"
          style={{ backgroundColor: 'var(--chatty-bg)' }}
        >
          <div className="text-lg font-bold text-green-500">
            {formatCurrency(projections.day30)}
          </div>
          <div className="text-xs opacity-60">30-Day Projection</div>
        </div>
        <div
          className="p-3 rounded-lg text-center"
          style={{ backgroundColor: 'var(--chatty-bg)' }}
        >
          <div className="text-lg font-bold text-green-500">
            {formatCurrency(projections.day90)}
          </div>
          <div className="text-xs opacity-60">90-Day Projection</div>
        </div>
      </div>
      
      <p className="text-xs opacity-50 mt-3 text-center">
        FV = PV × (1 + r)^n | Assumes consistent daily returns
      </p>
    </div>
  );
};

const babypipsLinks = [
  { title: 'School of Pipsology (Beginner)', url: 'https://www.babypips.com/learn/forex' },
  { title: 'Chart Patterns', url: 'https://www.babypips.com/learn/forex/chart-patterns' },
  { title: 'Trading Psychology', url: 'https://www.babypips.com/learn/forex/psychology' },
];

export const WeekendTraining: React.FC = () => {
  const isWeekend = useMemo(() => {
    const day = new Date().getDay();
    return day === 0 || day === 6;
  }, []);
  
  return (
    <div className="rounded-xl p-4" style={cardStyle}>
      <div className="flex items-center gap-2 mb-4">
        <Dumbbell size={18} className="text-orange-500" />
        <h3 className="font-semibold">Weekend Dojo</h3>
      </div>
      
      {isWeekend ? (
        <div className="space-y-2">
          <p className="text-sm opacity-70 mb-3">
            Markets are closed. Time to sharpen your skills!
          </p>
          {babypipsLinks.map((link, idx) => (
            <a
              key={idx}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 rounded-lg text-sm transition-colors hover:opacity-80"
              style={{ backgroundColor: 'var(--chatty-bg)' }}
            >
              <BookOpen size={14} className="text-blue-500" />
              <span className="flex-1">{link.title}</span>
              <ExternalLink size={12} className="opacity-50" />
            </a>
          ))}
        </div>
      ) : (
        <div className="text-center py-6">
          <TrendingUp size={32} className="text-green-500 mx-auto mb-2" />
          <p className="text-sm font-medium text-green-500">Markets are open - trade time!</p>
          <p className="text-xs opacity-50 mt-1">Check back on weekends for training resources</p>
        </div>
      )}
    </div>
  );
};

export default {
  ForexFactoryCalendar,
  FinvizHeatmap,
  CurrencyStrength,
  CompoundCalculator,
  WeekendTraining,
};
