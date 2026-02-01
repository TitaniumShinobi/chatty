import React from 'react';

export type ChartProviderType = 'tradingview';

export interface ChartProviderProps {
  symbol: string;
  timeframe?: string;
  height?: number | string;
  theme?: 'light' | 'dark';
  provider?: ChartProviderType;
}

export interface TradingViewChartProps {
  symbol: string;
  timeframe?: string;
  height?: number | string;
  theme?: 'light' | 'dark';
}

const TIMEFRAME_MAP: Record<string, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
  '1w': 'W',
  '1M': 'M',
  'D': 'D',
  'W': 'W',
  'M': 'M',
};

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  timeframe = '15m',
  height = 400,
  theme = 'dark',
}) => {
  const interval = TIMEFRAME_MAP[timeframe] || timeframe.replace(/[^0-9DWM]/g, '') || '15';

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <iframe
        src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${symbol}&interval=${interval}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=${theme}&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&showpopupbutton=1&locale=en&utm_source=chatty`}
        style={{
          width: '100%',
          height: '100%',
          border: 'none',
        }}
        title="TradingView Chart"
        allow="clipboard-write"
      />
    </div>
  );
};

export const ChartProvider: React.FC<ChartProviderProps> = ({
  symbol,
  timeframe = '15m',
  height = 400,
  theme = 'dark',
  provider = 'tradingview',
}) => {
  switch (provider) {
    case 'tradingview':
    default:
      return <TradingViewChart symbol={symbol} timeframe={timeframe} height={height} theme={theme} />;
  }
};

export default ChartProvider;
