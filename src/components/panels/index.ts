import type { PanelComponent } from '@/components/base/panel';
import { MarketRadarPanel } from '@/components/panels/MarketRadarPanel';
import { MarketBriefPanel } from '@/components/panels/MarketBriefPanel';
import { DecisionFusionPanel } from '@/components/panels/DecisionFusionPanel';
import { MacroRegimePanel } from '@/components/panels/MacroRegimePanel';
import { FearGreedPanel } from '@/components/panels/FearGreedPanel';
import { GoldEnginePanel } from '@/components/panels/GoldEnginePanel';
import { FxBoardPanel } from '@/components/panels/FxBoardPanel';
import { CommoditiesPanel } from '@/components/panels/CommoditiesPanel';
import { EconomicCalendarPanel } from '@/components/panels/EconomicCalendarPanel';
import { GeopoliticalRiskPanel } from '@/components/panels/GeopoliticalRiskPanel';
import { TradePolicyPanel } from '@/components/panels/TradePolicyPanel';
import { PredictionPanel } from '@/components/panels/PredictionPanel';
import { OptionsGammaPanel } from '@/components/panels/OptionsGammaPanel';
import { DealerPressurePanel } from '@/components/panels/DealerPressurePanel';
import { CotPositioningPanel } from '@/components/panels/CotPositioningPanel';
import { LiquidityStressPanel } from '@/components/panels/LiquidityStressPanel';
import { BennerCyclePanel } from '@/components/panels/BennerCyclePanel';
import { VolumeProfilePanel } from '@/components/panels/VolumeProfilePanel';
import { BuyerSellerPressurePanel } from '@/components/panels/BuyerSellerPressurePanel';
import { OrderflowEnginePanel } from '@/components/panels/OrderflowEnginePanel';
import { ExecutionPlaybookPanel } from '@/components/panels/ExecutionPlaybookPanel';
import { NewsIntelPanel } from '@/components/panels/NewsIntelPanel';
import { AiInsightsPanel } from '@/components/panels/AiInsightsPanel';
import { LiveChartPanel } from '@/components/panels/LiveChartPanel';
import { MonteCarloPanel } from '@/components/panels/MonteCarloPanel';
import { FinanceStreamsPanel } from '@/components/panels/FinanceStreamsPanel';
import { TradingViewScreenerPanel } from '@/components/panels/TradingViewScreenerPanel';
import { InstitutionalMonitorPanel } from '@/components/panels/InstitutionalMonitorPanel';
import { ReportDeskPanel } from '@/components/panels/ReportDeskPanel';
import { TradeJournalPanel } from '@/components/panels/TradeJournalPanel';
import { LearningPanel } from '@/components/panels/LearningPanel';
import { AnalystOsPanel } from '@/components/panels/AnalystOsPanel';
import { DataTrustPanel } from '@/components/panels/DataTrustPanel';

export const panelRegistry: PanelComponent[] = [
  new LiveChartPanel(),
  new AnalystOsPanel(),
  new DataTrustPanel(),
  new MarketBriefPanel(),
  new DecisionFusionPanel(),
  new InstitutionalMonitorPanel(),
  new MarketRadarPanel(),
  new FearGreedPanel(),
  new TradingViewScreenerPanel(),
  new ExecutionPlaybookPanel(),
  new MonteCarloPanel(),
  new MacroRegimePanel(),
  new GoldEnginePanel(),
  new FxBoardPanel(),
  new CommoditiesPanel(),
  new EconomicCalendarPanel(),
  new GeopoliticalRiskPanel(),
  new TradePolicyPanel(),
  new PredictionPanel(),
  new OptionsGammaPanel(),
  new DealerPressurePanel(),
  new CotPositioningPanel(),
  new LiquidityStressPanel(),
  new BennerCyclePanel(),
  new VolumeProfilePanel(),
  new BuyerSellerPressurePanel(),
  new OrderflowEnginePanel(),
  new NewsIntelPanel(),
  new FinanceStreamsPanel(),
  new AiInsightsPanel(),
  new ReportDeskPanel(),
  new TradeJournalPanel(),
  new LearningPanel(),
];
