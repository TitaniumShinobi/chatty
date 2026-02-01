import React from 'react';

export type ChartProviderType = 'tradingview';

export interface ChartProviderProps {
  symbol: string;
  height?: number | string;
  theme?: 'light' | 'dark';
  provider?: ChartProviderType;
}

export interface TradingViewChartProps {
  symbol: string;
  height?: number | string;
  theme?: 'light' | 'dark';
}

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  height = 400,
  theme = 'dark',
}) => {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <iframe
        src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${symbol}&interval=15&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=[]&theme=${theme}&style=1&timezone=exchange&withdateranges=1&showpopupbutton=1&studies_overrides={}&overrides={}&enabled_features=[]&disabled_features=[]&showpopupbutton=1&locale=en&utm_source=chatty`}
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
  height = 400,
  theme = 'dark',
  provider = 'tradingview',
}) => {
  switch (provider) {
    case 'tradingview':
    default:
      return <TradingViewChart symbol={symbol} height={height} theme={theme} />;
  }
};

export default ChartProvider;
