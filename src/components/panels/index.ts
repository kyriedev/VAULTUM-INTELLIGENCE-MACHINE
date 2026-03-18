import type { PanelComponent } from '@/components/base/panel';
import { MarketRadarPanel } from '@/components/panels/MarketRadarPanel';
import { MacroRegimePanel } from '@/components/panels/MacroRegimePanel';
import { GoldEnginePanel } from '@/components/panels/GoldEnginePanel';
import { FxBoardPanel } from '@/components/panels/FxBoardPanel';
import { CommoditiesPanel } from '@/components/panels/CommoditiesPanel';
import { EconomicPanel } from '@/components/panels/EconomicPanel';
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
import { NewsIntelPanel } from '@/components/panels/NewsIntelPanel';
import { AiInsightsPanel } from '@/components/panels/AiInsightsPanel';

export const panelRegistry: PanelComponent[] = [
  new MarketRadarPanel(),
  new MacroRegimePanel(),
  new GoldEnginePanel(),
  new FxBoardPanel(),
  new CommoditiesPanel(),
  new EconomicPanel(),
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
  new NewsIntelPanel(),
  new AiInsightsPanel(),
];
