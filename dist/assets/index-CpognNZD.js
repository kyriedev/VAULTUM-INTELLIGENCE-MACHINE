(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))s(r);new MutationObserver(r=>{for(const i of r)if(i.type==="childList")for(const n of i.addedNodes)n.tagName==="LINK"&&n.rel==="modulepreload"&&s(n)}).observe(document,{childList:!0,subtree:!0});function a(r){const i={};return r.integrity&&(i.integrity=r.integrity),r.referrerPolicy&&(i.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?i.credentials="include":r.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function s(r){if(r.ep)return;r.ep=!0;const i=a(r);fetch(r.href,i)}})();function Me(){return{snapshot:null,panels:[],activeIntent:"macro-regime",searchQuery:"",lastUpdatedAt:null}}function Re(e){return{conclusion:e[0]??"AI reasoning layer idle.",bullets:e.slice(1,4),metrics:[{label:"Planner",value:"minimum-tool",tone:"bullish"},{label:"Discipline",value:"uncertainty-on",tone:"alert"},{label:"Mode",value:"terminal analyst",tone:"neutral"}],alerts:e.length>3?[e[e.length-1]??""]:[],status:"mixed"}}const he={};function Ue(){const e=[];return he?.VITE_OPENROUTER_ENABLED==="true"&&e.push("cloud-open-weight"),he?.VITE_OLLAMA_ENABLED==="true"&&e.push("ollama-local"),e.push("browser-utility","deterministic-fallback"),{provider:e[0],uncertaintyDiscipline:!0,providers:e}}function Ie(e){return e.replace(/\s+/g," ").trim()}function Ne(e){return e.map(Ie).filter(Boolean).slice(0,3).join(" ")}function Ae(e){const t=e.join(" ").toLowerCase();return/(stress|shock|escalat|rate-limit|missing|warning|dealer|gamma|carry)/.test(t)?"urgent":/(mixed|fragile|uncertain|risk)/.test(t)?"watch":"routine"}function Be(e){const t=Ue(),a=Ae(e);return`[${t.provider} | ${a}] ${Ne(e)}`}const Xe={};function Ge(e){return e.replace(/\/+$/,"")}function Oe(){const e=(Xe?.VITE_API_BASE||"/api").trim();return Ge(e||"/api")}function K(e){const t=Oe(),a=e.startsWith("/")?e.slice(1):e;if(/^https?:\/\//i.test(t)){const s=t.endsWith("/")?t:`${t}/`;return new URL(a,s).toString()}return`${t}/${a}`}function Ve(e){return{summary:e.length?`degraded: ${e.length} caveat(s)`:"fresh enough for interpretation",warnings:e}}function je(e){const t=e.riskScores?.scores??{},a=Object.entries(t).sort((s,r)=>r[1]-s[1])[0];return{"geopolitical-risk":{conclusion:e.proxyTension?.conclusion??"Geopolitical market-impact context unavailable.",metrics:[{label:"Top Risk",value:a?`${a[0]} ${a[1]}`:"unavailable",tone:a&&a[1]>=70?"alert":"neutral"},{label:"Regions",value:String((e.proxyTension?.regions??[]).length||0),tone:"neutral"},{label:"Gold Support",value:e.proxyTension?.conclusion?.toLowerCase().includes("gold")?"active":"mixed",tone:e.proxyTension?.conclusion?.toLowerCase().includes("gold")?"bullish":"neutral"}],bullets:[`Top risk bucket: ${a?`${a[0]} ${a[1]}`:"unavailable"}.`,`Regional stress: ${(e.proxyTension?.regions??[]).map(s=>`${s.region} ${s.status}`).join(" | ")||"unavailable"}.`,"Market impact should be judged through oil, gold, shipping, sanctions, and carry channels."],table:{columns:["Region","Status"],rows:(e.proxyTension?.regions??[]).slice(0,5).map(s=>[s.region,s.status])},alerts:(e.proxyTension?.regions??[]).some(s=>/elevated|high|critical/i.test(s.status))?["Escalation-sensitive regions are active enough to matter for oil, gold, and FX carry pricing."]:[],status:"mixed"},"news-intel":{conclusion:e.countryBrief?.brief??"Country brief unavailable; fallback to classified news/search context.",metrics:[{label:"Documents",value:String((e.searchResults?.results??[]).length||0),tone:"neutral"},{label:"Brief",value:e.countryBrief?.brief?"available":"degraded",tone:e.countryBrief?.brief?"bullish":"alert"}],bullets:[...(e.searchResults?.results??[]).slice(0,3).map(s=>`${s.type}: ${s.title}`),"Confirmed signal must be separated from inferred implication and missing-data risk."],table:{columns:["Type","Headline"],rows:(e.searchResults?.results??[]).slice(0,5).map(s=>[s.type,s.title])},status:"mixed"}}}function Ye(e){return{"liquidity-stress":{conclusion:e.stress?.conclusion??"Liquidity stress unavailable.",metrics:[{label:"DXY",value:e.stress?.drivers?.dxy!=null?`${e.stress.drivers.dxy>=0?"+":""}${e.stress.drivers.dxy.toFixed(2)}%`:"n/a",tone:(e.stress?.drivers?.dxy??0)>0?"alert":"neutral"},{label:"VIX",value:e.stress?.drivers?.vix!=null?`${e.stress.drivers.vix>=0?"+":""}${e.stress.drivers.vix.toFixed(2)}%`:"n/a",tone:(e.stress?.drivers?.vix??0)>0?"alert":"neutral"},{label:"10Y",value:e.stress?.drivers?.us10y!=null?`${e.stress.drivers.us10y>=0?"+":""}${e.stress.drivers.us10y.toFixed(2)}%`:"n/a",tone:(e.stress?.drivers?.us10y??0)>0?"alert":"neutral"},{label:"JPY",value:e.stress?.drivers?.jpy!=null?`${e.stress.drivers.jpy>=0?"+":""}${e.stress.drivers.jpy.toFixed(2)}%`:"n/a",tone:(e.stress?.drivers?.jpy??0)>0?"alert":"neutral"},{label:"Safe Haven",value:e.haven?.score!=null?String(e.haven.score):"n/a",tone:(e.haven?.score??0)>=60?"alert":"neutral"},{label:"Risk State",value:e.crossAsset?.riskState??e.crossAsset?.regime??"unknown",tone:e.crossAsset?.riskState==="risk-off"?"alert":"neutral"}],bullets:[`Cross-asset regime: ${e.crossAsset?.regime??"unknown"}.`,`Carry stress: ${e.carry?.conclusion??"unknown"}.`,`Safe haven pressure: ${e.haven?.conclusion??"unknown"}.`],table:{columns:["Liquidity Lens","Reading"],rows:[["DXY Driver",e.stress?.drivers?.dxy!=null?`${e.stress.drivers.dxy.toFixed(2)}%`:"n/a"],["VIX Driver",e.stress?.drivers?.vix!=null?`${e.stress.drivers.vix.toFixed(2)}%`:"n/a"],["Carry Stress",e.carry?.conclusion??"unknown"],["Cross-Asset Regime",e.crossAsset?.regime??"unknown"]]},alerts:(e.stress?.drivers?.dxy??0)>.5&&(e.stress?.drivers?.vix??0)>3?["Dollar and volatility are rising together; funding stress is more credible than a one-factor move."]:[],status:e.stress?"mixed":"stale"}}}function pe(e){return e?.observations?.find(t=>t.value!=null)?.value??null}function qe(e){const t=e.macroSignals??{},a=pe(e.fred2y),s=pe(e.fred10y),r=e.energyPrices?.prices??[];return{"macro-regime":{conclusion:`Macro regime reads ${t.regime??"unknown"}, with gold bias ${t.goldBias??"unknown"} and safe-haven pressure ${t.safeHavenPressure??"unknown"}.`,metrics:[{label:"Regime",value:t.regime??"unknown",tone:t.regime?.includes("risk-off")?"alert":"neutral"},{label:"Gold Bias",value:t.goldBias??"unknown",tone:t.goldBias==="bullish"?"bullish":t.goldBias==="bearish"?"bearish":"neutral"},{label:"Safe Haven",value:t.safeHavenPressure??"unknown",tone:t.safeHavenPressure==="high"?"alert":"neutral"},{label:"2Y Yield",value:a!=null?`${a.toFixed(2)}%`:"n/a",tone:"neutral"},{label:"10Y Yield",value:s!=null?`${s.toFixed(2)}%`:"n/a",tone:"neutral"},{label:"Carry Stress",value:t.inferred?.carryStress??"unknown",tone:t.inferred?.carryStress==="elevated"?"alert":"neutral"}],bullets:[`Confirmed signal: 2Y ${a??"n/a"} / 10Y ${s??"n/a"} with DXY ROC ${t.confirmed?.dxyRoc20??"n/a"}.`,`Inferred implication: dollar liquidity pressure is ${t.inferred?.dollarLiquidityPressure??"unknown"} and carry stress is ${t.inferred?.carryStress??"unknown"}.`,`Energy overlay: ${r.map(i=>`${i.symbol} ${i.change>=0?"+":""}${i.change?.toFixed?.(2)??i.change}%`).join(", ")||"unavailable"}.`],table:{columns:["Driver","Reading"],rows:[["Regime",t.regime??"unknown"],["Gold Bias",t.goldBias??"unknown"],["Safe Haven",t.safeHavenPressure??"unknown"],["Dollar Liquidity",t.inferred?.dollarLiquidityPressure??"unknown"],["Carry Stress",t.inferred?.carryStress??"unknown"],["10Y Yield",s!=null?`${s.toFixed(2)}%`:"n/a"]]},alerts:t.regime?.includes("risk-off")?["Risk-off macro regime is active; equity beta and carry should require tighter confirmation."]:[],status:"mixed"},economic:{conclusion:"Economic panel frames the policy path through rates, energy, BIS policy divergence, and credit backdrop rather than isolated prints.",metrics:[{label:"Rates Lens",value:e.bisPolicyRates?.rates?.length?"live":"partial",tone:e.bisPolicyRates?.rates?.length?"bullish":"alert"},{label:"FX Lens",value:e.bisExchangeRates?.pairs?.length?"live":"partial",tone:e.bisExchangeRates?.pairs?.length?"bullish":"alert"},{label:"Credit Lens",value:e.bisCredit?.credit?.length?"live":"partial",tone:e.bisCredit?.credit?.length?"bullish":"alert"}],bullets:[`Policy rates: ${(e.bisPolicyRates?.rates??[]).map(i=>`${i.bank} ${i.rate}`).join(" | ")||"unavailable"}.`,`Exchange-rate lens: ${(e.bisExchangeRates?.pairs??[]).map(i=>`${i.pair} ${i.bias}`).join(" | ")||"unavailable"}.`,`Credit lens: ${(e.bisCredit?.credit??[]).map(i=>`${i.country} ${i.regime}`).join(" | ")||"unavailable"}.`],table:{columns:["Macro Lens","Top Reading","Status"],rows:[["Policy",e.bisPolicyRates?.rates?.[0]?`${e.bisPolicyRates.rates[0].bank} ${e.bisPolicyRates.rates[0].rate}`:"unavailable",e.bisPolicyRates?.rates?.length?"available":"degraded"],["FX",e.bisExchangeRates?.pairs?.[0]?`${e.bisExchangeRates.pairs[0].pair} ${e.bisExchangeRates.pairs[0].bias}`:"unavailable",e.bisExchangeRates?.pairs?.length?"available":"degraded"],["Credit",e.bisCredit?.credit?.[0]?`${e.bisCredit.credit[0].country} ${e.bisCredit.credit[0].regime}`:"unavailable",e.bisCredit?.credit?.length?"available":"degraded"]]},status:"mixed"}}}function v(e,t){return e?.find(a=>a.symbol===t)??null}function d(e){return e==null||Number.isNaN(e)?"n/a":`${e>=0?"+":""}${e.toFixed(2)}%`}function N(e){return(e??0)>=0?"bullish":"bearish"}function He(e){const t=e.marketQuotes?.quotes??[],a=e.commodityQuotes?.quotes??[],s=e.sectorSummary?.sectors??[],r=v(t,"^GSPC"),i=v(t,"^IXIC"),n=v(t,"^VIX"),l=v(t,"DX-Y.NYB"),o=v(t,"^TNX"),m=v(t,"GC=F")??v(a,"GC=F"),g=v(a,"CL=F"),b=[...s].sort((c,h)=>h.change-c.change)[0],f=["EURUSD=X","GBPUSD=X","USDJPY=X","GBPJPY=X","EURJPY=X"].map(c=>v(t,c)).filter(c=>!!c);return{"market-radar":{conclusion:`SPX ${d(r?.change)} / NDX ${d(i?.change)} / VIX ${d(n?.change)} keep the tape in a ${(n?.change??0)>3||(r?.change??0)<0?"fragile":"constructive"} regime.`,metrics:[{label:"SPX",value:d(r?.change),tone:(r?.change??0)>=0?"bullish":"bearish"},{label:"NDX",value:d(i?.change),tone:(i?.change??0)>=0?"bullish":"bearish"},{label:"VIX",value:d(n?.change),tone:(n?.change??0)>0?"alert":"neutral"},{label:"DXY",value:d(l?.change),tone:(l?.change??0)>0?"alert":"bullish"},{label:"US10Y",value:d(o?.change),tone:(o?.change??0)>0?"alert":"bullish"},{label:"Gold",value:d(m?.change),tone:(m?.change??0)>=0?"bullish":"bearish"}],charts:[{label:"SPX",points:r?.sparkline??[],tone:N(r?.change)},{label:"NDX",points:i?.sparkline??[],tone:N(i?.change)},{label:"DXY",points:l?.sparkline??[],tone:(l?.change??0)>0?"alert":"bullish"},{label:"Gold",points:m?.sparkline??[],tone:N(m?.change)}].filter(c=>c.points.length),table:{columns:["Instrument","Price","Change"],rows:[["SPX",r?.price?.toFixed(2)??"n/a",d(r?.change)],["NDX",i?.price?.toFixed(2)??"n/a",d(i?.change)],["VIX",n?.price?.toFixed(2)??"n/a",d(n?.change)],["DXY",l?.price?.toFixed(2)??"n/a",d(l?.change)],["US10Y",o?.price?.toFixed(2)??"n/a",d(o?.change)],["Gold",m?.price?.toFixed(2)??"n/a",d(m?.change)]]},bullets:[`Dollar context: DXY ${d(l?.change)} and US10Y ${d(o?.change)} remain the primary macro filter.`,`Sector leadership: ${b?`${b.symbol} ${d(b.change)}`:"sector data limited"}.`,`ETF flow overlay: ${e.etfFlows?.summary?.netDirection??"unavailable"}.`],alerts:e.etfFlows?.summary?.netDirection==="outflows"?["ETF flow backdrop is risk-negative and can weaken equity breadth confirmation."]:[],status:"mixed"},"gold-engine":{conclusion:`Gold trades at ${m?.price?.toFixed(2)??"n/a"} with ${d(m?.change)} day change, keeping bullion sensitive to yields, dollar, and safe-haven flow.`,metrics:[{label:"Gold Spot Proxy",value:m?.price?.toFixed(2)??"n/a",tone:(m?.change??0)>=0?"bullish":"bearish"},{label:"Gold Change",value:d(m?.change),tone:(m?.change??0)>=0?"bullish":"bearish"},{label:"DXY Filter",value:d(l?.change),tone:(l?.change??0)>0?"alert":"bullish"},{label:"10Y Yield Filter",value:d(o?.change),tone:(o?.change??0)>0?"alert":"bullish"},{label:"WTI Confirmation",value:d(g?.change),tone:(g?.change??0)>0?"alert":"neutral"},{label:"Risk Regime",value:(n?.change??0)>0?"stress rising":"stress contained",tone:(n?.change??0)>0?"alert":"bullish"}],charts:[{label:"Gold",points:m?.sparkline??[],tone:N(m?.change)},{label:"DXY",points:l?.sparkline??[],tone:(l?.change??0)>0?"alert":"bullish"},{label:"US10Y",points:o?.sparkline??[],tone:(o?.change??0)>0?"alert":"neutral"},{label:"VIX",points:n?.sparkline??[],tone:(n?.change??0)>0?"alert":"neutral"}].filter(c=>c.points.length),bullets:[`Confirmed signal: gold ${d(m?.change)} versus DXY ${d(l?.change)}.`,`Inferred implication: ${(m?.change??0)>0&&(o?.change??0)<=0?"macro support is constructive":"macro support is mixed"}.`,"Watch real-yield repricing and geopolitically driven safe-haven demand for confirmation."],table:{columns:["Driver","Reading"],rows:[["Gold",`${m?.price?.toFixed(2)??"n/a"} / ${d(m?.change)}`],["DXY",`${l?.price?.toFixed(2)??"n/a"} / ${d(l?.change)}`],["US10Y",`${o?.price?.toFixed(2)??"n/a"} / ${d(o?.change)}`],["VIX",`${n?.price?.toFixed(2)??"n/a"} / ${d(n?.change)}`]]},status:"confirmed"},"fx-board":{conclusion:`FX board is driven by dollar direction and JPY carry sensitivity, with DXY ${d(l?.change)} setting the near-term filter.`,metrics:[{label:"DXY",value:d(l?.change),tone:(l?.change??0)>0?"alert":"bullish"},{label:"EURUSD",value:d(v(t,"EURUSD=X")?.change),tone:(v(t,"EURUSD=X")?.change??0)>=0?"bullish":"bearish"},{label:"GBPUSD",value:d(v(t,"GBPUSD=X")?.change),tone:(v(t,"GBPUSD=X")?.change??0)>=0?"bullish":"bearish"},{label:"USDJPY",value:d(v(t,"USDJPY=X")?.change),tone:(v(t,"USDJPY=X")?.change??0)>=0?"alert":"bullish"},{label:"GBPJPY",value:d(v(t,"GBPJPY=X")?.change),tone:(v(t,"GBPJPY=X")?.change??0)>=0?"alert":"bearish"},{label:"EURJPY",value:d(v(t,"EURJPY=X")?.change),tone:(v(t,"EURJPY=X")?.change??0)>=0?"alert":"bearish"}],charts:f.slice(0,4).map(c=>({label:c.symbol.replace("=X",""),points:c.sparkline??[],tone:N(c.change)})).filter(c=>c.points.length),bullets:[`EURUSD ${d(v(t,"EURUSD=X")?.change)}, GBPUSD ${d(v(t,"GBPUSD=X")?.change)}, USDJPY ${d(v(t,"USDJPY=X")?.change)}.`,`JPY crosses: GBPJPY ${d(v(t,"GBPJPY=X")?.change)} and EURJPY ${d(v(t,"EURJPY=X")?.change)}.`,"Central-bank divergence and carry stress should dominate pair bias over headline noise."],table:{columns:["Pair","Price","Move"],rows:f.map(c=>[c.symbol.replace("=X",""),c.price.toFixed(4),d(c.change)])},status:"mixed"},commodities:{conclusion:`Oil ${d(g?.change)} and gold ${d(m?.change)} keep the commodity complex split between supply risk and safe-haven demand.`,metrics:[{label:"WTI",value:d(g?.change),tone:(g?.change??0)>0?"alert":"neutral"},{label:"Brent",value:d(v(a,"BZ=F")?.change),tone:(v(a,"BZ=F")?.change??0)>0?"alert":"neutral"},{label:"NatGas",value:d(v(a,"NG=F")?.change),tone:(v(a,"NG=F")?.change??0)>0?"alert":"neutral"},{label:"Copper",value:d(v(a,"HG=F")?.change),tone:(v(a,"HG=F")?.change??0)>=0?"bullish":"bearish"},{label:"Silver",value:d(v(a,"SI=F")?.change),tone:(v(a,"SI=F")?.change??0)>=0?"bullish":"bearish"},{label:"Gold",value:d(m?.change),tone:(m?.change??0)>=0?"bullish":"bearish"}],charts:["GC=F","CL=F","BZ=F","HG=F"].map(c=>v(a,c)).filter(c=>!!c).map(c=>({label:c.symbol,points:c.sparkline??[],tone:N(c.change)})).filter(c=>c.points.length),table:{columns:["Commodity","Price","Move"],rows:["GC=F","CL=F","BZ=F","NG=F","SI=F","HG=F"].map(c=>v(a,c)).filter(c=>!!c).map(c=>[c.symbol,c.price.toFixed(2),d(c.change)])},bullets:[`WTI ${g?.price?.toFixed(2)??"n/a"}, Gold ${m?.price?.toFixed(2)??"n/a"}, Silver ${v(a,"SI=F")?.price?.toFixed(2)??"n/a"}.`,`Copper ${d(v(a,"HG=F")?.change)} and NatGas ${d(v(a,"NG=F")?.change)} frame growth versus stress.`,"Commodity interpretation should separate inflation impulse from pure geopolitical premium."],alerts:(g?.change??0)>2?["Oil shock risk is elevated enough to feed back into inflation and safe-haven pricing."]:[],status:"mixed"}}}function We(e){return{"options-gamma":{conclusion:e.gamma?`${e.gamma.symbol} proxy walls cluster at ${e.gamma.putWall} / ${e.gamma.gammaFlip} / ${e.gamma.callWall} with ${e.gamma.volatilityZone}.`:"Options gamma levels unavailable.",metrics:[{label:"Call Wall",value:e.gamma?.callWall!=null?String(e.gamma.callWall):"n/a",tone:"bullish"},{label:"Put Wall",value:e.gamma?.putWall!=null?String(e.gamma.putWall):"n/a",tone:"bearish"},{label:"Gamma Flip",value:e.gamma?.gammaFlip!=null?String(e.gamma.gammaFlip):"n/a",tone:"alert"},{label:"Net Gamma",value:e.gamma?.netGamma!=null?String(e.gamma.netGamma):"n/a",tone:(e.gamma?.netGamma??0)>=0?"bullish":"bearish"},{label:"Vol Zone",value:e.gamma?.volatilityZone??"unknown",tone:e.gamma?.volatilityZone?.includes("expansion")?"alert":"neutral"},{label:"Vol %ile",value:e.gamma?.volPercentile!=null?`${e.gamma.volPercentile}`:"n/a",tone:(e.gamma?.volPercentile??0)>=70?"alert":"neutral"}],charts:e.gamma?[{label:"Vol Stack",points:[e.gamma.realizedVol60??0,e.gamma.realizedVol20??0,e.gamma.volPercentile??0,Math.max((e.gamma.rangeExpansion??0)*25,0)],tone:e.gamma.netGamma!=null&&e.gamma.netGamma<0?"alert":"bullish"}]:[],bullets:[`Source mode: ${e.gamma?.mode??e.snapshots?.mode??"unknown"}.`,`Spot ${e.gamma?.price??"n/a"} | ATR14 ${e.gamma?.atr14??"n/a"} | RV20 ${e.gamma?.realizedVol20??"n/a"}% | tick momentum ${e.gamma?.tickMomentum??"n/a"}%.`,...(e.snapshots?.snapshots??[]).slice(0,2).map(t=>`${t.tenor}: ${t.bias}`),e.gamma?.sourceLabel??e.snapshots?.sourceLabel??"Treat options structure as market context, not certainty."],table:{columns:["Tenor","Bias","IV"],rows:(e.snapshots?.snapshots??[]).slice(0,5).map(t=>[t.tenor,t.bias,t.impliedVol!=null?`${t.impliedVol.toFixed(1)}%`:"n/a"])},alerts:e.gamma?.keyStrikes?.length?[`Key strikes clustered near ${e.gamma.keyStrikes.slice(0,3).join(", ")}; expect pinning or squeeze behavior around those zones.`,e.gamma.sourceLabel??"Synthetic proxy mode."]:e.gamma?.sourceLabel?[e.gamma.sourceLabel]:[],status:e.gamma?"mixed":"stale"},"dealer-pressure":{conclusion:e.dealer?.conclusion??"Dealer pressure unavailable.",metrics:[{label:"Bias",value:e.dealer?.bias??"unknown",tone:e.dealer?.bias?.includes("expansion")?"alert":"neutral"},{label:"Pressure",value:e.dealer?.pressureScore!=null?`${e.dealer.pressureScore}`:"n/a",tone:(e.dealer?.pressureScore??0)>=65?"alert":"neutral"},{label:"Expansion",value:e.dealer?.expansionRisk??"unknown",tone:e.dealer?.expansionRisk==="high"?"alert":"neutral"},{label:"RV20",value:e.dealer?.realizedVol20!=null?`${e.dealer.realizedVol20}%`:"n/a",tone:(e.dealer?.realizedVol20??0)>=(e.dealer?.realizedVol60??999)?"alert":"neutral"}],charts:e.dealer?[{label:"Pressure Stack",points:[e.dealer.realizedVol60??0,e.dealer.realizedVol20??0,e.dealer.volPercentile??0,e.dealer.pressureScore??0],tone:e.dealer.pressureScore!=null&&e.dealer.pressureScore>=65?"alert":"neutral"}]:[],bullets:[`Bias: ${e.dealer?.bias??"unknown"}.`,`Structure source: ${e.dealer?.sourceSymbol??e.snapshots?.sourceSymbol??e.dealer?.symbol??"n/a"}.`,`Price ${e.dealer?.price??"n/a"} | ATR14 ${e.dealer?.atr14??"n/a"} | range expansion ${e.dealer?.rangeExpansion??"n/a"} | tick momentum ${e.dealer?.tickMomentum??"n/a"}%.`,e.dealer?.sourceLabel??"Dealer flow matters most around crowded strikes and catalyst windows."],table:{columns:["Lens","Reading"],rows:[["Symbol",e.dealer?.symbol??e.snapshots?.symbol??"n/a"],["Source",e.dealer?.sourceSymbol??e.snapshots?.sourceSymbol??"n/a"],["Bias",e.dealer?.bias??"unknown"],["Expansion Risk",e.dealer?.expansionRisk??"unknown"]]},alerts:e.dealer?.sourceLabel?[e.dealer.sourceLabel]:[],status:e.dealer?"mixed":"stale"}}}function Ke(e){try{const t=localStorage.getItem(e);return t?JSON.parse(t):null}catch{return null}}function Je(e,t){localStorage.setItem(e,JSON.stringify(t))}function A(e,t){return e.find(a=>a.symbol===t)??null}function ge(e,t=5){const a=e?.sparkline??[];if(a.length<=t)return e?.change??0;const s=a[a.length-t-1],r=a[a.length-1];return!s||!r?e?.change??0:Number(((r-s)/s*100).toFixed(2))}function Qe(e){const t=[...e?.sparkline??[]].filter(r=>Number.isFinite(r));if(!t.length)return 50;const a=t[t.length-1],s=t.filter(r=>r<=a).length;return Math.round(s/t.length*100)}function Ze(e){const t=(e.marketQuotes?.quotes??[]).map(s=>({symbol:s.symbol,asset:s.symbol,price:s.price,change:s.change,sparkline:s.sparkline??[],sourceQuality:s.symbol.endsWith("=X")?"estimated":"proxy"})),a=(e.commodityQuotes?.quotes??[]).map(s=>({symbol:s.symbol,asset:s.symbol,price:s.price,change:s.change,sparkline:s.sparkline??[],sourceQuality:"proxy"}));return{marketQuotes:t,commodityQuotes:a,macroSeries:[{id:"DGS2",latest:e.fred2y?.observations?.[0]?.value??null,observations:e.fred2y?.observations??[]},{id:"DGS10",latest:e.fred10y?.observations?.[0]?.value??null,observations:e.fred10y?.observations??[]}],riskEvents:(e.proxyTension?.regions??[]).map(s=>({region:s.region,status:s.status,score:/critical|high|elevated/i.test(s.status)?80:/watch/i.test(s.status)?55:35})),tradeBarriers:(e.tradeBarriers?.barriers??[]).map(s=>({name:s.barrier,marketEffect:s.marketEffect})),predictionSignals:(e.prediction?.markets??[]).map(s=>({title:s.title,probability:s.probability,volume:s.volume})),gammaSnapshot:{symbol:e.gammaLevels?.symbol??"XAUUSD",callWall:e.gammaLevels?.callWall??null,putWall:e.gammaLevels?.putWall??null,gammaFlip:e.gammaLevels?.gammaFlip??null,netGamma:e.gammaLevels?.netGamma??null},dealerPressureSnapshot:{symbol:e.dealerPressure?.symbol??"XAUUSD",bias:e.dealerPressure?.bias??"unknown",conclusion:e.dealerPressure?.conclusion??"unknown",pressureScore:e.dealerPressure?.pressureScore??null},cotSnapshot:{market:e.cotSummary?.market??"GOLD",zScore:e.cotSummary?.zScore??null,netPosition:e.cotSummary?.netPosition??null,crowdedRisk:e.cotSummary?.crowdedRisk??"unknown"},volumeProfileSnapshot:{market:e.volumeProfile?.market??"XAUUSD",poc:e.volumeProfile?.poc??null,valueAreaHigh:e.volumeProfile?.valueAreaHigh??null,valueAreaLow:e.volumeProfile?.valueAreaLow??null,mode:e.volumeProfile?.mode??"unknown",pocDistance:e.volumeProfile?.pocDistance??null,valueAreaPosition:e.volumeProfile?.valueAreaPosition??"unknown"},pivotPointSnapshot:{market:e.pivotLevels?.market??"XAUUSD",pivot:e.pivotLevels?.pivot??null,supports:e.pivotLevels?.supports??[],resistances:e.pivotLevels?.resistances??[],pivotDistance:e.pivotLevels?.pivotDistance??null,structure:e.pivotLevels?.structure??"unknown",dynamicLevel:e.pivotLevels?.dynamicLevel??null,dynamicState:e.pivotLevels?.dynamicState??"unknown",confluenceSummary:e.pivotLevels?.confluenceSummary??"Institutional map unavailable.",mappedSupport:e.pivotLevels?.mappedSupport??null,mappedResistance:e.pivotLevels?.mappedResistance??null,signalMap:e.pivotLevels?.signalMap??{buySignal:!1,sellSignal:!1,bullSweep:!1,bearSweep:!1,bias:"pivot signal unavailable",referenceLevel:null,referenceRole:null},institutionalLevels:e.pivotLevels?.institutionalLevels??[]},bennerCycleSnapshot:{market:e.bennerCycle?.market??"XAUUSD",phase:e.bennerCycle?.phase??"unknown",bias:e.bennerCycle?.bias??"unknown",turnWindow:e.bennerCycle?.turnWindow??"unknown",confidence:e.bennerCycle?.confidence??"low",compatibility:e.bennerCycle?.compatibility??"unknown"},orderflowSnapshot:{market:e.orderflowEngine?.market??"XAUUSD",mode:e.orderflowEngine?.mode??"unavailable",feedQuality:e.orderflowEngine?.feedQuality??"unknown",dominance:e.orderflowEngine?.dominance??"unknown",buySellPressure:e.orderflowEngine?.buySellPressure??null,bidAskPressureRatio:e.orderflowEngine?.bidAskPressureRatio??null,quoteImbalance:e.orderflowEngine?.quoteImbalance??null,exhaustionSignal:e.orderflowEngine?.exhaustionSignal??"none",absorptionSignal:e.orderflowEngine?.absorptionSignal??"none",structureState:e.orderflowEngine?.structureState??"unknown",priceDeltaDivergence:e.orderflowEngine?.priceDeltaDivergence??"none",divergenceBias:e.orderflowEngine?.divergenceBias??"neutral",divergenceDetail:e.orderflowEngine?.divergenceDetail??"orderflow divergence unavailable",priceTrend:e.orderflowEngine?.priceTrend??"flat",deltaTrend:e.orderflowEngine?.deltaTrend??"flat",sourceLabel:e.orderflowEngine?.sourceLabel??"unknown"},buyerSellerPressureSnapshot:{market:e.buyerSellerPressure?.market??"XAUUSD",mode:e.buyerSellerPressure?.mode??"unavailable",score:e.buyerSellerPressure?.score??null,dominance:e.buyerSellerPressure?.dominance??"unknown",sourceLabel:e.buyerSellerPressure?.sourceLabel??"unknown",price:e.buyerSellerPressure?.price??null,priceChange:e.buyerSellerPressure?.priceChange??null,dailyTrend5d:e.buyerSellerPressure?.dailyTrend5d??null,rangeEfficiency:e.buyerSellerPressure?.rangeEfficiency??null,relativeVolume:e.buyerSellerPressure?.relativeVolume??null,intradayImpulse:e.buyerSellerPressure?.intradayImpulse??null,cumulativePressure:e.buyerSellerPressure?.cumulativePressure??null,vwapDeviation:e.buyerSellerPressure?.vwapDeviation??null,rangeExpansion:e.buyerSellerPressure?.rangeExpansion??null,structureState:e.buyerSellerPressure?.structureState??"unknown"}}}function ze(e,t){const a=[...e.marketQuotes,...e.commodityQuotes],s=A(a,"DX-Y.NYB"),r=A(a,"^TNX"),i=A(a,"^VIX"),n=A(a,"GC=F"),l=A(a,"CL=F"),o=A(a,"USDJPY=X"),m=t.sectorSummary?.sectors??[],g=m.find(h=>h.symbol==="XLK")?.change??0,b=m.find(h=>h.symbol==="XLU")?.change??0,f=e.predictionSignals[0],c=t.macroSignals?.goldBias==="bullish"&&(e.buyerSellerPressureSnapshot.score??0)<0||(e.gammaSnapshot.netGamma??0)<0&&t.crossAssetRegime?.riskState==="risk-off"||(e.orderflowSnapshot.buySellPressure??0)<-12&&t.macroSignals?.goldBias==="bullish"?18:6;return{dxy_5d_roc:ge(s,5),us10y_change_5d:ge(r,5),vix_percentile:Qe(i),gold_vs_yield_divergence:Number(((n?.change??0)-(r?.change??0)).toFixed(2)),gold_safe_haven_score:Math.round((n?.change??0)*12+(i?.change??0)*4-(s?.change??0)*6),oil_supply_risk_score:Math.round((l?.change??0)*10+e.riskEvents.reduce((h,p)=>h+p.score,0)/Math.max(e.riskEvents.length,1)/4),jpy_carry_stress_score:Math.round((o?.change??0)*20+(i?.change??0)*5),macro_regime_score:t.macroSignals?.regime==="risk-off tightening"?-60:t.macroSignals?.regime==="risk-on easing"?55:8,sector_defensive_spread:Number((b-g).toFixed(2)),event_negativity_score:Math.round(e.riskEvents.reduce((h,p)=>h+p.score,0)/Math.max(e.riskEvents.length,1)),geopolitical_escalation_score:Math.round(e.riskEvents.filter(h=>h.score>=70).length*25),gamma_flip_distance:e.gammaSnapshot.gammaFlip!=null&&n?.price!=null?Number((n.price-e.gammaSnapshot.gammaFlip).toFixed(2)):null,call_wall_distance:e.gammaSnapshot.callWall!=null&&n?.price!=null?Number((n.price-e.gammaSnapshot.callWall).toFixed(2)):null,put_wall_distance:e.gammaSnapshot.putWall!=null&&n?.price!=null?Number((n.price-e.gammaSnapshot.putWall).toFixed(2)):null,dealer_pressure_bias:e.dealerPressureSnapshot.bias.includes("expansion")?-35:10,cot_net_position_score:e.cotSnapshot.netPosition!=null?Math.round(e.cotSnapshot.netPosition/5e3):null,cot_crowding_score:e.cotSnapshot.crowdedRisk==="high"?72:e.cotSnapshot.zScore!=null?Math.round(e.cotSnapshot.zScore*20):40,benner_cycle_phase:e.bennerCycleSnapshot.phase,benner_cycle_bias:e.bennerCycleSnapshot.bias.includes("bullish")?30:-20,pivot_distance:e.pivotPointSnapshot.pivotDistance,mapped_level_signal_score:e.pivotPointSnapshot.signalMap.buySignal?20:e.pivotPointSnapshot.signalMap.sellSignal?-20:e.pivotPointSnapshot.signalMap.bullSweep?10:e.pivotPointSnapshot.signalMap.bearSweep?-10:0,weighted_volume_profile_poc_distance:e.volumeProfileSnapshot.pocDistance,value_area_position:e.volumeProfileSnapshot.valueAreaPosition,orderflow_pressure_score:e.orderflowSnapshot.buySellPressure,orderflow_quote_imbalance:e.orderflowSnapshot.quoteImbalance,orderflow_bid_ask_ratio:e.orderflowSnapshot.bidAskPressureRatio,orderflow_delta_divergence_score:e.orderflowSnapshot.divergenceBias==="bullish"?18:e.orderflowSnapshot.divergenceBias==="bearish"?-18:0,buyer_seller_pressure_score:e.buyerSellerPressureSnapshot.score,prediction_signal_score:f?Math.round(f.probability*100):50,data_freshness_penalty:t.warnings.length*8,conflicting_signal_penalty:c}}function et(e){return Math.abs(e)>=60?"high":Math.abs(e)>=30?"medium":"low"}function $(e,t,a,s,r,i){return{score:e,state:t,bias:a,confidence:i.length>=3?"low":et(e),supportingFeatures:s,invalidationConditions:r,freshnessWarnings:i}}function tt(e,t){const a=t.warnings,s=Number(e.macro_regime_score??0),r=Number(e.gold_safe_haven_score??0)+Number(e.dealer_pressure_bias??0)+Number(e.buyer_seller_pressure_score??0)/3+Number(e.orderflow_pressure_score??0)/3-Number(e.conflicting_signal_penalty??0),i=Number(e.oil_supply_risk_score??0)-Number(e.data_freshness_penalty??0),n=Number(e.jpy_carry_stress_score??0)+Number(e.vix_percentile??0)/2,l=Number(e.geopolitical_escalation_score??0)+Number(e.event_negativity_score??0)/2,o=(e.value_area_position==="above-value"?25:e.value_area_position==="inside-value"?8:-18)-Math.abs(Number(e.weighted_volume_profile_poc_distance??0))/2,m=(Number(e.pivot_distance??0)>=0?16:-16)+Number(e.mapped_level_signal_score??0),g=Number(e.buyer_seller_pressure_score??0),b=Number(e.orderflow_pressure_score??0),f=Number(e.benner_cycle_bias??0),c=-Math.abs(Number(e.gamma_flip_distance??0))+Number(e.dealer_pressure_bias??0),h=Number(e.cot_crowding_score??0)-50;return{MacroEngine:$(s,s<-20?"risk-off":s>20?"risk-on":"mixed",s<0?"defensive":"constructive",["macro_regime_score","dxy_5d_roc","us10y_change_5d"],["DXY and yields stop confirming","VIX percentile compresses materially"],a),GoldEngine:$(r,r>25?"supported":r<-20?"pressured":"mixed",r>0?"bullish":r<0?"bearish":"neutral",["gold_safe_haven_score","dealer_pressure_bias","buyer_seller_pressure_score","benner_cycle_bias"],["Gold loses pivot/value-area support","DXY and yields rise together"],a),FxEngine:$(Number(e.jpy_carry_stress_score??0),Number(e.jpy_carry_stress_score??0)>25?"carry-stressed":"balanced",Number(e.dxy_5d_roc??0)>0?"usd-firm":"usd-soft",["dxy_5d_roc","jpy_carry_stress_score","sector_defensive_spread"],["JPY stress fades","DXY momentum reverses"],a),OilEngine:$(i,i>20?"supply-premium-rising":"growth-dragging",i>0?"bullish":"bearish",["oil_supply_risk_score","geopolitical_escalation_score"],["Geopolitical premium fades","Demand proxies weaken"],a),LiquidityEngine:$(n,n>40?"stressed":"contained",n>40?"risk-off":"neutral",["jpy_carry_stress_score","vix_percentile","dxy_5d_roc"],["VIX compresses","JPY stabilizes"],a),GeopoliticalImpactEngine:$(l,l>45?"elevated-impact":"watch",l>45?"risk-negative":"mixed",["event_negativity_score","geopolitical_escalation_score"],["Regional tension falls back"],a),TradeImpactEngine:$(Number(e.event_negativity_score??0)-20,Number(e.event_negativity_score??0)>55?"trade-friction-elevated":"structural",Number(e.event_negativity_score??0)>55?"headwind":"neutral",["event_negativity_score","sector_defensive_spread"],["Restriction pressure softens"],a),PredictionContextEngine:$(Number(e.prediction_signal_score??50)-50,Number(e.prediction_signal_score??50)>60?"crowd-bias-strong":"crowd-bias-moderate",Number(e.prediction_signal_score??50)>50?"supportive":"skeptical",["prediction_signal_score"],["Prediction probability mean-reverts"],a),GammaEngine:$(c,c<-10?"short-gamma-fragile":"pinning-risk",c<0?"bearish-vol":"neutral",["gamma_flip_distance","call_wall_distance","put_wall_distance"],["Net gamma flips positive"],a),DealerPressureEngine:$(Number(e.dealer_pressure_bias??0),Number(e.dealer_pressure_bias??0)<0?"expansion-bias":"contained",Number(e.dealer_pressure_bias??0)<0?"risk-negative":"neutral",["dealer_pressure_bias"],["Dealer pressure score relaxes"],a),CotEngine:$(h,h>10?"crowded":"balanced",h>10?"contrarian-risk":"neutral",["cot_net_position_score","cot_crowding_score"],["Crowding score drops"],a),VolumeProfileEngine:$(o,e.value_area_position==="above-value"?"acceptance-above-poc":e.value_area_position==="below-value"?"rejection-below-poc":"inside-value",o>0?"constructive":"fragile",["weighted_volume_profile_poc_distance","value_area_position"],["Price loses value-area acceptance"],a),PivotEngine:$(m,Number(e.pivot_distance??0)>=0?"above-pivot":"below-pivot",Number(e.pivot_distance??0)>=0?"constructive":"defensive",["pivot_distance"],["Price reclaims or loses pivot structure"],a),BennerCycleEngine:$(f,String(e.benner_cycle_phase??"unknown"),f>0?"constructive":"cautionary",["benner_cycle_phase","benner_cycle_bias"],["Cycle window rolls over"],a),BuyerSellerPressureEngine:$(g,g>15?"buyers-dominant":g<-15?"sellers-dominant":"balanced",g>0?"bullish":g<0?"bearish":"neutral",["buyer_seller_pressure_score"],["Pressure score flips"],a),OrderflowEngine:$(b,b>18?"buyers-controlling":b<-18?"sellers-controlling":"balanced-auction",b>0?"bullish":b<0?"bearish":"neutral",["orderflow_pressure_score","orderflow_quote_imbalance","orderflow_bid_ask_ratio"],["Orderflow pressure and imbalance roll over"],a),CrossAssetRegimeEngine:$(s+n/2,t.crossAssetRegime?.regime??"mixed-transition",t.crossAssetRegime?.riskState==="risk-off"?"defensive":"constructive",["macro_regime_score","vix_percentile","sector_defensive_spread"],["Cross-asset confirmation weakens"],a)}}function at(e){return{marketRegime:e.CrossAssetRegimeEngine.state,goldBias:e.GoldEngine.bias,fxBiasMap:{EURUSD:e.FxEngine.bias==="usd-firm"?"neutral-to-bearish":"neutral-to-bullish",GBPUSD:e.FxEngine.bias==="usd-firm"?"bearish":"neutral",USDJPY:e.LiquidityEngine.state==="stressed"?"carry-stress-elevated":"mixed",GBPJPY:e.LiquidityEngine.state==="stressed"?"fragile":"constructive",EURJPY:e.LiquidityEngine.state==="stressed"?"fragile":"constructive"},volatilityState:e.GammaEngine.state,geopoliticalPressureState:e.GeopoliticalImpactEngine.state,positioningState:e.CotEngine.state,optionsState:`${e.DealerPressureEngine.state} / ${e.OrderflowEngine.state}`,executionCautionState:e.LiquidityEngine.state==="stressed"||e.CotEngine.state==="crowded"?"high-caution":"normal-caution"}}function st(e,t,a){const s=(a.GoldEngine.score>0?1:-1)+(a.VolumeProfileEngine.score>0?1:-1)+(a.PivotEngine.score>0?1:-1)+(a.BuyerSellerPressureEngine.score>0?1:-1)+(a.OrderflowEngine.score>0?1:-1);return{directionalBias:a.GoldEngine.bias==="bullish"?"long-bias":a.GoldEngine.bias==="bearish"?"short-bias":"neutral",regimeFit:t.marketRegime,setupQuality:s>=2?"high":s>=0?"medium":"low",confirmationChecklist:["Macro regime and cross-asset regime remain aligned","Price accepts above pivot / value area for longs or below for shorts","Buyer/seller pressure stays supportive in current mode","Orderflow engine confirms the same directional auction"],invalidationChecklist:["Pressure score flips materially against the thesis","Orderflow imbalance and bid/ask pressure ratio reverse","DXY and yields move against the setup together","Price loses pivot and POC acceptance"],bestConditionsForEntry:[t.executionCautionState==="high-caution"?"Wait for post-event stabilization before entry":"Prefer pullbacks into pivot/POC support or resistance retests","Enter only when volume structure and regime bias point the same direction"],avoidTradeConditions:["Fresh geopolitical headlines without price confirmation","Conflicting options, pressure, and macro signals",`Freshness penalty above ${e.data_freshness_penalty??0}`],confidenceBand:s>=2?"medium-high":s>=0?"medium":"low"}}function rt(e,t,a){const s=Math.max(0,Math.min(100,Number(e.event_negativity_score??0)/2+Number(e.cot_crowding_score??0)/3+Number(e.data_freshness_penalty??0)+Number(e.conflicting_signal_penalty??0)+(t.LiquidityEngine.state==="stressed"?18:6))),r=s>=80?"extreme":s>=60?"high":s>=35?"moderate":"low",i=[r==="extreme"||r==="high"?"VOLATILITY_RISK":null,a.length?"DATA_QUALITY_RISK":null,Number(e.cot_crowding_score??0)>=70?"POSITIONING_CROWDING":null,Number(e.conflicting_signal_penalty??0)>=15?"SIGNAL_CONFLICT":null,t.LiquidityEngine.state==="stressed"?"LIQUIDITY_STRESS":null].filter(n=>!!n);return{riskScore:Math.round(s),cautionLevel:r,sizeAdjustmentHint:r==="extreme"?"stand down":r==="high"?"trade smaller / wider confirmation needed":r==="moderate"?"reduced size":"normal size subject to setup quality",tradeSuppressionFlag:r==="extreme"||a.length>=4,reasonCodes:i}}function it(e,t,a){const s=e.pivotPointSnapshot.pivot,r=e.volumeProfileSnapshot.poc,i=e.pivotPointSnapshot.mappedResistance?.price??e.pivotPointSnapshot.resistances[0],n=e.pivotPointSnapshot.mappedSupport?.price??e.pivotPointSnapshot.supports[0],l=e.volumeProfileSnapshot.valueAreaLow,o=e.volumeProfileSnapshot.valueAreaHigh,m=e.orderflowSnapshot.feedQuality,g=e.pivotPointSnapshot.dynamicLevel,b=[n,l,s,r,g].filter(h=>h!=null),f=[i,o,e.gammaSnapshot.callWall,g].filter(h=>h!=null),c=[e.gammaSnapshot.gammaFlip,s,r,g].filter(h=>h!=null);return{entryZone:b.length?`${Math.min(...b).toFixed(2)} - ${Math.max(...b).toFixed(2)}`:"structure unavailable",trimZone:f.length?f.slice(0,3).map(h=>h.toFixed(2)).join(" / "):"use resistance and call-wall cluster",noTradeZone:c.length?c.slice(0,3).map(h=>h.toFixed(2)).join(" / "):"avoid mid-value chop",invalidationLevel:n!=null?`${n.toFixed(2)}`:"use structural invalidation below value support",targetLogic:i!=null?`First objective toward ${i.toFixed(2)}; then reassess at overhead resistance / call-wall cluster.`:"Use value-area edge and gamma walls as first target logic.",tradeThesisSummary:`${t.directionalBias} aligned with ${t.regimeFit}, ${e.bennerCycleSnapshot.phase} cycle context, ${e.buyerSellerPressureSnapshot.dominance}, ${e.orderflowSnapshot.dominance}, and ${e.pivotPointSnapshot.signalMap.bias}.`,feedQuality:m,orderflowSummary:`${e.orderflowSnapshot.dominance} / ratio ${e.orderflowSnapshot.bidAskPressureRatio??"n/a"} / imbalance ${e.orderflowSnapshot.quoteImbalance??"n/a"} / divergence ${e.orderflowSnapshot.priceDeltaDivergence} / ${e.orderflowSnapshot.absorptionSignal}.`,executionChecklist:["Wait for structure confirmation at pivot / POC","Confirm pressure mode and direction","Confirm orderflow engine is aligned with the thesis",`Respect risk engine caution level: ${a.cautionLevel}`],alertConditions:["Price reclaims / loses pivot","Pressure score crosses balance threshold","Orderflow imbalance rolls over","Macro or geopolitical headline shifts regime state"],sessionTimingNotes:["Favor liquid overlap windows for FX execution","Avoid initiating into unscheduled geopolitical shock volatility"],doNotExecute:a.tradeSuppressionFlag}}function nt(e){const t=Ze(e),a=ze(t,e),s=tt(a,e),r=at(s),i=st(a,r,s),n=rt(a,s,e.warnings),l=it(t,i,n);return{normalized:t,features:a,engines:s,marketContext:r,decision:i,risk:n,execution:l}}function ot(e){const{normalized:t,engines:a,marketContext:s,decision:r,risk:i,execution:n}=e,l=t.buyerSellerPressureSnapshot.mode,o=t.volumeProfileSnapshot.mode;return{"market-radar":{conclusion:`${s.marketRegime} with ${s.executionCautionState}; decision bias ${r.directionalBias}.`,status:i.tradeSuppressionFlag?"stale":"confirmed",metrics:[{label:"Regime",value:s.marketRegime,tone:s.marketRegime.includes("risk-off")?"alert":"bullish"},{label:"Setup",value:r.setupQuality,tone:r.setupQuality==="high"?"bullish":r.setupQuality==="low"?"bearish":"neutral"},{label:"Risk",value:`${i.riskScore}`,tone:i.cautionLevel==="high"||i.cautionLevel==="extreme"?"alert":"neutral"},{label:"Execute",value:n.doNotExecute?"blocked":"allowed",tone:n.doNotExecute?"bearish":"bullish"}],table:{columns:["Context","State"],rows:[["Gold Bias",s.goldBias],["Volatility",s.volatilityState],["Positioning",s.positioningState],["Options",s.optionsState]]},bullets:[`Directional bias: ${r.directionalBias}.`,`Setup quality: ${r.setupQuality} with confidence ${r.confidenceBand}.`,`Risk caution: ${i.cautionLevel} / size hint ${i.sizeAdjustmentHint}.`],alerts:n.doNotExecute?["Do not execute: risk engine is suppressing new entries until signal conflict / event risk improves."]:[]},"gold-engine":{conclusion:`Gold engine is ${a.GoldEngine.state} with ${t.bennerCycleSnapshot.phase} cycle context and ${t.buyerSellerPressureSnapshot.dominance} pressure.`,status:"confirmed",metrics:[{label:"Gold Bias",value:a.GoldEngine.bias,tone:a.GoldEngine.bias==="bullish"?"bullish":"bearish"},{label:"Cycle",value:t.bennerCycleSnapshot.phase,tone:t.bennerCycleSnapshot.bias.includes("bullish")?"bullish":"alert"},{label:"Pressure",value:t.buyerSellerPressureSnapshot.dominance,tone:(t.buyerSellerPressureSnapshot.score??0)>0?"bullish":"bearish"},{label:"Pivot",value:t.pivotPointSnapshot.structure,tone:t.pivotPointSnapshot.structure==="above-pivot"?"bullish":"bearish"}],table:{columns:["Gold Overlay","Reading"],rows:[["Volume Profile",`${o} / ${t.volumeProfileSnapshot.valueAreaPosition}`],["POC Distance",`${t.volumeProfileSnapshot.pocDistance??"n/a"}`],["Pivot Distance",`${t.pivotPointSnapshot.pivotDistance??"n/a"}`],["Turn Window",t.bennerCycleSnapshot.turnWindow]]},bullets:[`Execution zone: ${n.entryZone}.`,`Invalidation: ${n.invalidationLevel}.`,`Target logic: ${n.targetLogic}.`],alerts:t.buyerSellerPressureSnapshot.mode!=="direct"?[`Pressure is ${l}; it is not true aggressor flow and must be treated as proxy structure.`]:[]},"execution-playbook":{conclusion:n.tradeThesisSummary,status:n.doNotExecute?"stale":"confirmed",metrics:[{label:"Entry",value:n.entryZone,tone:"bullish"},{label:"Trim",value:n.trimZone,tone:"neutral"},{label:"No Trade",value:n.noTradeZone,tone:"alert"},{label:"Invalidation",value:n.invalidationLevel,tone:"bearish"},{label:"Feed",value:n.feedQuality,tone:n.feedQuality==="strong"?"bullish":n.feedQuality==="usable"?"neutral":"alert"},{label:"Execute",value:n.doNotExecute?"blocked":"active",tone:n.doNotExecute?"bearish":"bullish"}],table:{columns:["Execution Lens","Reading"],rows:[["Target Logic",n.targetLogic],["Orderflow",n.orderflowSummary],["Risk",i.cautionLevel],["Setup",r.setupQuality]]},bullets:[`Checklist: ${n.executionChecklist.join(" | ")}.`,`Alert conditions: ${n.alertConditions.join(" | ")}.`,`Session notes: ${n.sessionTimingNotes.join(" | ")}.`],alerts:n.doNotExecute?["Do not execute new positions until signal conflict and risk caution improve."]:[]},"fx-board":{conclusion:`FX board reads ${s.fxBiasMap.EURUSD} in EURUSD and ${s.fxBiasMap.USDJPY} in USDJPY under ${a.FxEngine.state}.`,status:"mixed",metrics:[{label:"EURUSD",value:s.fxBiasMap.EURUSD,tone:s.fxBiasMap.EURUSD.includes("bullish")?"bullish":"bearish"},{label:"GBPUSD",value:s.fxBiasMap.GBPUSD,tone:s.fxBiasMap.GBPUSD.includes("bullish")?"bullish":"bearish"},{label:"USDJPY",value:s.fxBiasMap.USDJPY,tone:s.fxBiasMap.USDJPY.includes("elevated")?"alert":"neutral"},{label:"JPY Stress",value:a.LiquidityEngine.state,tone:a.LiquidityEngine.state==="stressed"?"alert":"neutral"}],bullets:["FX bias is driven by dollar liquidity, carry stress, and structure overlays.",`Pivot/volume context: ${t.pivotPointSnapshot.structure} / ${t.volumeProfileSnapshot.valueAreaPosition}.`,`Pressure mode: ${l}.`]},commodities:{conclusion:`Commodities sit in ${a.OilEngine.state} for oil and ${a.GoldEngine.state} for gold.`,status:"mixed",metrics:[{label:"Oil",value:a.OilEngine.bias,tone:a.OilEngine.bias==="bullish"?"alert":"bearish"},{label:"Gold",value:a.GoldEngine.bias,tone:a.GoldEngine.bias==="bullish"?"bullish":"bearish"},{label:"Geo",value:a.GeopoliticalImpactEngine.state,tone:"alert"},{label:"Volume",value:t.volumeProfileSnapshot.valueAreaPosition,tone:t.volumeProfileSnapshot.valueAreaPosition==="above-value"?"bullish":"bearish"}],bullets:["Oil should be read through supply risk and shipping/sanctions channels.","Gold should be read through real-rate, haven, positioning, and structure channels.",`Buyer/seller pressure mode: ${l}.`]},"liquidity-stress":{conclusion:`${a.LiquidityEngine.state} with ${i.cautionLevel} caution and ${s.executionCautionState}.`,status:i.cautionLevel==="high"||i.cautionLevel==="extreme"?"confirmed":"mixed",metrics:[{label:"Liquidity",value:a.LiquidityEngine.state,tone:a.LiquidityEngine.state==="stressed"?"alert":"neutral"},{label:"Risk",value:i.cautionLevel,tone:i.cautionLevel==="high"||i.cautionLevel==="extreme"?"alert":"neutral"},{label:"Crowding",value:t.cotSnapshot.crowdedRisk,tone:t.cotSnapshot.crowdedRisk==="high"?"alert":"neutral"},{label:"Suppression",value:n.doNotExecute?"yes":"no",tone:n.doNotExecute?"bearish":"bullish"}],bullets:[`Risk reasons: ${i.reasonCodes.join(", ")||"none material"}.`,`Size adjustment: ${i.sizeAdjustmentHint}.`,`Execution note: ${n.tradeThesisSummary}.`]},"benner-cycle":{conclusion:`Benner cycle is in ${t.bennerCycleSnapshot.phase} with ${t.bennerCycleSnapshot.bias} interpretation.`,status:"mixed",metrics:[{label:"Phase",value:t.bennerCycleSnapshot.phase,tone:t.bennerCycleSnapshot.bias.includes("bullish")?"bullish":"alert"},{label:"Bias",value:t.bennerCycleSnapshot.bias,tone:t.bennerCycleSnapshot.bias.includes("bullish")?"bullish":"bearish"},{label:"Turn",value:t.bennerCycleSnapshot.turnWindow,tone:"neutral"},{label:"Confidence",value:t.bennerCycleSnapshot.confidence,tone:t.bennerCycleSnapshot.confidence==="high"?"bullish":"neutral"}],bullets:[t.bennerCycleSnapshot.compatibility,"Use Benner as a temporal overlay, not a standalone trigger.","Cross-check the cycle window with macro regime and live structure."]},"volume-profile":{conclusion:`Volume profile is ${t.volumeProfileSnapshot.valueAreaPosition} with pivot structure ${t.pivotPointSnapshot.structure} and ${t.pivotPointSnapshot.signalMap.bias}.`,status:t.volumeProfileSnapshot.poc!=null?"confirmed":"stale",metrics:[{label:"POC",value:`${t.volumeProfileSnapshot.poc??"n/a"}`,tone:"neutral"},{label:"VAH",value:`${t.volumeProfileSnapshot.valueAreaHigh??"n/a"}`,tone:"neutral"},{label:"VAL",value:`${t.volumeProfileSnapshot.valueAreaLow??"n/a"}`,tone:"neutral"},{label:"Pivot",value:`${t.pivotPointSnapshot.pivot??"n/a"}`,tone:t.pivotPointSnapshot.structure==="above-pivot"?"bullish":"bearish"},{label:"Mapped S",value:t.pivotPointSnapshot.mappedSupport?.price!=null?`${t.pivotPointSnapshot.mappedSupport.price}`:"n/a",tone:"bullish"},{label:"Mapped R",value:t.pivotPointSnapshot.mappedResistance?.price!=null?`${t.pivotPointSnapshot.mappedResistance.price}`:"n/a",tone:"bearish"}],table:{columns:["Structure","Reading"],rows:[["Profile Mode",o],["Value Area",t.volumeProfileSnapshot.valueAreaPosition],["Pivot Distance",`${t.pivotPointSnapshot.pivotDistance??"n/a"}`],["POC Distance",`${t.volumeProfileSnapshot.pocDistance??"n/a"}`],["Dynamic Level",`${t.pivotPointSnapshot.dynamicLevel??"n/a"} / ${t.pivotPointSnapshot.dynamicState}`],["Institutional Map",t.pivotPointSnapshot.confluenceSummary],["Latest Signal",t.pivotPointSnapshot.signalMap.bias]]},bullets:[`Acceptance/rejection engine bias: ${a.VolumeProfileEngine.bias}.`,`Pivot engine bias: ${a.PivotEngine.bias}.`,t.pivotPointSnapshot.confluenceSummary,"Use structure for entry timing, not as a standalone macro call."],alerts:o!=="proxy"?[]:["Volume profile is proxy-derived from current source mix; OTC FX should be treated as estimated structure."]},"buyer-seller-pressure":{conclusion:`${t.buyerSellerPressureSnapshot.dominance} with mode ${l}.`,status:l==="unavailable"?"stale":"mixed",metrics:[{label:"Mode",value:l,tone:l==="direct"?"bullish":l==="proxy"?"alert":"bearish"},{label:"Score",value:`${t.buyerSellerPressureSnapshot.score??"n/a"}`,tone:(t.buyerSellerPressureSnapshot.score??0)>0?"bullish":"bearish"},{label:"Dominance",value:t.buyerSellerPressureSnapshot.dominance,tone:(t.buyerSellerPressureSnapshot.score??0)>0?"bullish":"bearish"},{label:"Engine",value:a.BuyerSellerPressureEngine.state,tone:"neutral"},{label:"rVol",value:t.buyerSellerPressureSnapshot.relativeVolume!=null?t.buyerSellerPressureSnapshot.relativeVolume.toFixed(2):"n/a",tone:(t.buyerSellerPressureSnapshot.relativeVolume??1)>=1.1?"alert":"neutral"},{label:"VWAP Dev",value:t.buyerSellerPressureSnapshot.vwapDeviation!=null?`${t.buyerSellerPressureSnapshot.vwapDeviation>=0?"+":""}${t.buyerSellerPressureSnapshot.vwapDeviation.toFixed(2)}%`:"n/a",tone:(t.buyerSellerPressureSnapshot.vwapDeviation??0)>0?"bullish":"bearish"}],charts:t.buyerSellerPressureSnapshot.score!=null?[{label:"Pressure Stack",points:[t.buyerSellerPressureSnapshot.intradayImpulse??0,t.buyerSellerPressureSnapshot.cumulativePressure??0,t.buyerSellerPressureSnapshot.rangeEfficiency??0,t.buyerSellerPressureSnapshot.score??0],tone:(t.buyerSellerPressureSnapshot.score??0)>0?"bullish":"bearish"}]:[],table:{columns:["Pressure Lens","Reading"],rows:[["Source",t.buyerSellerPressureSnapshot.sourceLabel],["Structure",t.buyerSellerPressureSnapshot.structureState],["Volume Profile",t.volumeProfileSnapshot.valueAreaPosition],["Pivot Structure",t.pivotPointSnapshot.structure],["Intraday Impulse",`${t.buyerSellerPressureSnapshot.intradayImpulse??"n/a"}`],["Cumulative Pressure",`${t.buyerSellerPressureSnapshot.cumulativePressure??"n/a"}`],["Execution Bias",r.directionalBias]]},bullets:["Buyer/seller pressure is capability-aware and never presented as direct flow unless the source supports it.",`Current pressure supports ${r.directionalBias}.`,`5d trend ${t.buyerSellerPressureSnapshot.dailyTrend5d??"n/a"}% / session VWAP deviation ${t.buyerSellerPressureSnapshot.vwapDeviation??"n/a"}%.`,`Execution block: ${n.doNotExecute?"active":"inactive"}.`],alerts:l!=="direct"?[`Pressure is ${l}; it is a proxy-derived estimate, not true bid/ask aggressor flow.`]:[]},"orderflow-engine":{conclusion:`${t.orderflowSnapshot.dominance} with ${t.orderflowSnapshot.feedQuality} feed quality, ${t.orderflowSnapshot.structureState}, and ${t.orderflowSnapshot.priceDeltaDivergence}.`,status:t.orderflowSnapshot.buySellPressure!=null?"mixed":"stale",metrics:[{label:"Feed",value:t.orderflowSnapshot.feedQuality,tone:t.orderflowSnapshot.feedQuality==="strong"?"bullish":t.orderflowSnapshot.feedQuality==="usable"?"neutral":"alert"},{label:"Pressure",value:`${t.orderflowSnapshot.buySellPressure??"n/a"}`,tone:(t.orderflowSnapshot.buySellPressure??0)>0?"bullish":"bearish"},{label:"B/A Ratio",value:t.orderflowSnapshot.bidAskPressureRatio!=null?t.orderflowSnapshot.bidAskPressureRatio.toFixed(2):"n/a",tone:(t.orderflowSnapshot.bidAskPressureRatio??1)>1?"bullish":"bearish"},{label:"Imbalance",value:`${t.orderflowSnapshot.quoteImbalance??"n/a"}`,tone:(t.orderflowSnapshot.quoteImbalance??0)>0?"bullish":"bearish"},{label:"Divergence",value:t.orderflowSnapshot.priceDeltaDivergence,tone:t.orderflowSnapshot.divergenceBias==="bullish"?"bullish":t.orderflowSnapshot.divergenceBias==="bearish"?"bearish":"neutral"},{label:"Absorption",value:t.orderflowSnapshot.absorptionSignal,tone:t.orderflowSnapshot.absorptionSignal==="none"?"neutral":"alert"},{label:"Exhaustion",value:t.orderflowSnapshot.exhaustionSignal,tone:t.orderflowSnapshot.exhaustionSignal==="none"?"neutral":"alert"}],bullets:[t.orderflowSnapshot.sourceLabel,`Auction state: ${t.orderflowSnapshot.structureState}.`,`Price trend ${t.orderflowSnapshot.priceTrend} while delta trend is ${t.orderflowSnapshot.deltaTrend}.`,t.orderflowSnapshot.divergenceDetail,"This is a live proxy engine, not raw exchange bid/ask tape."],alerts:t.orderflowSnapshot.feedQuality==="weak"?["Footprint-style readings are estimated for this asset because the feed does not provide a true centralized tape."]:[]}}}function lt(e){return{"cot-positioning":{conclusion:e.cot?.summary??"COT positioning unavailable.",metrics:[{label:"Market",value:e.cot?.market??e.regime?.market??"n/a",tone:"neutral"},{label:"Z-Score",value:e.cot?.zScore!=null?String(e.cot.zScore):"n/a",tone:(e.cot?.zScore??0)>=1.5?"alert":"neutral"},{label:"Crowding",value:e.cot?.crowdedRisk??"unknown",tone:e.cot?.crowdedRisk==="high"?"alert":"neutral"},{label:"Bias",value:e.regime?.bias??"unknown",tone:e.regime?.bias==="bullish"?"bullish":e.regime?.bias==="bearish"?"bearish":"neutral"},{label:"Report Date",value:e.cot?.reportDate??"n/a",tone:"neutral"},{label:"L/S Ratio",value:e.cot?.longShortRatio!=null?e.cot.longShortRatio.toFixed(2):"n/a",tone:(e.cot?.longShortRatio??1)>=1.4?"bullish":(e.cot?.longShortRatio??1)<=.8?"bearish":"neutral"}],bullets:[`Market: ${e.cot?.market??e.regime?.market??"n/a"}.`,`Position z-score: ${e.cot?.zScore??"n/a"}.`,`Regime: ${e.regime?.regime??"unknown"}.`,`Source: ${e.cot?.source??e.regime?.source??"unknown"}.`],table:{columns:["Positioning Lens","Reading"],rows:[["Non-Commercial Long",e.cot?.nonCommercialLong!=null?String(e.cot.nonCommercialLong):"n/a"],["Non-Commercial Short",e.cot?.nonCommercialShort!=null?String(e.cot.nonCommercialShort):"n/a"],["Net Position",e.cot?.netPosition!=null?String(e.cot.netPosition):"n/a"],["Commercial Net",e.cot?.commercialNetPosition!=null?String(e.cot.commercialNetPosition):"n/a"],["Weekly Change",e.cot?.change!=null?String(e.cot.change):"n/a"],["Regime",e.regime?.regime??"unknown"]]},alerts:e.cot?.crowdedRisk==="high"?["Crowded trade risk is elevated; squeeze and reversal odds are materially higher."]:e.cot?.source?[`Feed source: ${e.cot.source}.`]:[],status:e.cot?.reportDate?"confirmed":e.cot?"mixed":"stale"}}}function ct(e){const t=e.prediction?.markets??[];return{prediction:{conclusion:t.length?`Prediction markets show ${t[0].title} at ${(t[0].probability*100).toFixed(1)}% with volume ${t[0].volume.toFixed(0)}.`:"Prediction-market context unavailable or blocked; treat crowd-belief layer as missing.",metrics:[{label:"Top Odds",value:t[0]?`${(t[0].probability*100).toFixed(1)}%`:"n/a",tone:t[0]&&t[0].probability>=.6?"alert":"neutral"},{label:"Top Volume",value:t[0]?t[0].volume.toFixed(0):"n/a",tone:"neutral"},{label:"Markets",value:String(t.length),tone:t.length?"bullish":"alert"}],bullets:t.slice(0,3).map(a=>`${a.title} ${(a.probability*100).toFixed(1)}% vol ${a.volume.toFixed(0)}`),table:{columns:["Market","Probability","Volume"],rows:t.slice(0,5).map(a=>[a.title,`${(a.probability*100).toFixed(1)}%`,a.volume.toFixed(0)])},alerts:e.prediction?.unavailable?["Prediction-market crowd-belief layer is unavailable; do not infer consensus from absence of data."]:[],status:t.length?"mixed":"stale"}}}async function u(e,t,a={}){try{const s=await fetch(K(`${e}/v1/${t}`),{method:"POST",headers:{"Content-Type":"application/json","Cache-Control":"no-store"},body:JSON.stringify(a)});if(!s.ok)return null;const r=await s.json();return r.ok?r.data??null:null}catch{return null}}function dt(e=[]){return{mode:"rpc-backed terminal",refreshIntervalMs:12e4,feedStatus:e}}function ut(...e){return Object.assign({},...e)}function mt(e){const t=e.flows?.flows?.slice(-1)[0],a=e.restrictions?.restrictions?.[0];return{"trade-policy":{conclusion:"Trade policy remains a slower structural macro force expressed through flows, tariffs, restrictions, and strategic barriers.",metrics:[{label:"Flow Year",value:t?String(t.year):"n/a",tone:"neutral"},{label:"Exports",value:t?t.exports.toFixed(0):"n/a",tone:"neutral"},{label:"Imports",value:t?t.imports.toFixed(0):"n/a",tone:"neutral"},{label:"Top Tariff",value:a?`${a.tariffRate.toFixed(1)}%`:"n/a",tone:a&&a.tariffRate>=10?"alert":"neutral"}],bullets:[t?`Latest trade flow: ${t.reporter}/${t.partner} exports ${t.exports.toFixed(0)} imports ${t.imports.toFixed(0)}.`:"Trade flow data unavailable.",a?`Highest current tariff proxy: ${a.reporter} ${a.tariffRate.toFixed(1)}%.`:"Restriction data unavailable.",`${(e.tariffTrends?.trends??[]).map(s=>`${s.bloc}: ${s.trend}`).join(" | ")||"Tariff trend data unavailable."}`],table:{columns:["Lens","Reading"],rows:[["Latest Flow",t?`${t.reporter}/${t.partner} ${t.year}`:"unavailable"],["Restriction",a?`${a.reporter} ${a.tariffRate.toFixed(1)}%`:"unavailable"],["Tariff Trend",e.tariffTrends?.trends?.[0]?`${e.tariffTrends.trends[0].bloc} ${e.tariffTrends.trends[0].trend}`:"unavailable"],["Barrier",e.barriers?.barriers?.[0]?`${e.barriers.barriers[0].barrier} / ${e.barriers.barriers[0].marketEffect}`:"unavailable"]]},alerts:a&&a.tariffRate>=10?["Tariff and restriction pressure is high enough to matter for FX, commodity demand, and policy risk premia."]:[],status:"mixed"}}}const be="vaultum-bootstrap-snapshot";function E(e,t,a){t&&e.push(a)}async function vt(){try{const e=await fetch(K("bootstrap"),{headers:{"Cache-Control":"no-store"}});if(!e.ok)return null;const t=await e.json();return t.ok?t.data??null:null}catch{return null}}async function ht(e=!1){const t=e?null:Ke(be);if(t)return t;const a=await vt(),[s,r,i,n,l,o,m,g,b,f,c,h,p,F,Z,V,Pe,oe,xe,le,T,j,Y,Ce,z,Ee,De,Le,_e,ce,ee,q,Fe,I,de]=await Promise.all([a?.marketQuotes??u("market","list-market-quotes",{symbols:["^GSPC","^IXIC","^VIX","DX-Y.NYB","^TNX","^IRX","EURUSD=X","GBPUSD=X","USDJPY=X","GBPJPY=X","EURJPY=X","GC=F"]}),u("market","list-commodity-quotes",{symbols:["GC=F","CL=F","BZ=F","NG=F","SI=F","HG=F"]}),u("market","get-sector-summary",{}),u("market","list-etf-flows",{}),u("market","get-fear-greed-index",{}),a?.macroSignals??u("macro","get-macro-signals",{}),u("macro","get-fred-series",{seriesId:"DGS2",limit:30}),u("macro","get-fred-series",{seriesId:"DGS10",limit:30}),u("macro","get-energy-prices",{}),u("macro","get-bis-policy-rates",{}),u("macro","get-bis-exchange-rates",{}),u("macro","get-bis-credit",{}),a?.riskScores??u("intelligence","get-risk-scores",{}),u("intelligence","get-country-intel-brief",{countryCode:"SAU"}),u("intelligence","search-news-documents",{query:"gold oil dollar yields",maxRecords:3}),u("intelligence","get-proxy-tension-status",{}),u("trade","get-trade-flows",{reporter:"840",partner:"156"}),a?.tradeRestrictions??u("trade","get-trade-restrictions",{}),u("trade","get-tariff-trends",{reporter:"840",partner:"156"}),u("trade","get-trade-barriers",{}),a?.prediction??u("prediction","list-prediction-markets",{query:"gold",mode:"markets"}),u("options","get-gamma-levels",{symbol:"XAUUSD"}),u("options","get-dealer-pressure",{symbol:"XAUUSD"}),u("options","list-options-snapshots",{symbol:"XAUUSD"}),u("positioning","get-cot-summary",{market:"GOLD"}),u("positioning","get-positioning-regime",{market:"GOLD"}),a?.liquidityStress??u("liquidity","get-liquidity-stress",{}),u("liquidity","get-carry-stress",{}),u("liquidity","get-safe-haven-pressure",{}),u("liquidity","get-cross-asset-regime",{}),u("benner","get-cycle-state",{market:"XAUUSD"}),u("volume","get-profile",{market:"XAUUSD",timeframe:"1d"}),u("pivots","get-levels",{market:"XAUUSD",timeframe:"1d"}),u("orderflow","get-engine",{market:"XAUUSD",timeframe:"1h"}),u("pressure","get-buyer-seller-pressure",{market:"XAUUSD",mode:"auto"})]),w=[];E(w,!s?.quotes?.length,"Market quote feed unavailable or rate-limited."),E(w,!l?.compositeScore&&l?.compositeScore!==0,"Fear and greed sentiment engine unavailable."),E(w,!o?.regime,"Macro regime engine degraded or unavailable."),E(w,T?.unavailable||!T?.markets?.length,"Prediction market layer missing or blocked."),E(w,!j?.symbol,"Options gamma layer is unavailable or returning incomplete structure."),E(w,j?.mode==="synthetic-live","Options structure uses a live synthetic proxy engine; direct options-flow and dealer books are not wired yet."),E(w,!z?.reportDate,"Official CFTC positioning feed unavailable for the selected market."),E(w,!f?.rates?.length||!c?.pairs?.length||!h?.credit?.length,"One or more BIS macro feeds are unavailable."),E(w,oe?.unavailable,"WTO trade restriction layer unavailable."),E(w,q?.unavailable,"Volume profile layer is estimated or unavailable for the selected market."),E(w,!I?.buySellPressure&&I?.buySellPressure!==0,"Orderflow engine unavailable for the selected market."),E(w,I?.feedQuality==="weak","Orderflow/footprint quality is weak for this asset; readings are estimated rather than tape-true.");const S=nt({marketQuotes:s,commodityQuotes:r,sectorSummary:i,macroSignals:o,fred2y:m,fred10y:g,proxyTension:V,tradeBarriers:le,prediction:T,gammaLevels:j,dealerPressure:Y,cotSummary:z,crossAssetRegime:ce,warnings:w,bennerCycle:ee,volumeProfile:q,pivotLevels:Fe,orderflowEngine:I,buyerSellerPressure:de}),ue=ut(He({marketQuotes:s,commodityQuotes:r,sectorSummary:i,etfFlows:n}),qe({macroSignals:o,fred2y:m,fred10y:g,energyPrices:b,bisPolicyRates:f,bisExchangeRates:c,bisCredit:h}),je({riskScores:p,proxyTension:V,countryBrief:F,searchResults:Z}),mt({flows:Pe,restrictions:oe,tariffTrends:xe,barriers:le}),ct({prediction:T}),We({gamma:j,dealer:Y,snapshots:Ce}),lt({cot:z,regime:Ee}),Ye({stress:De,carry:Le,haven:_e,crossAsset:ce}),ot(S)),me=[o?.regime?`Macro regime ${o.regime}`:null,S.marketContext.goldBias?`Gold bias ${S.marketContext.goldBias}`:null,`${S.marketContext.executionCautionState} / risk ${S.risk.cautionLevel}`,l?.compositeScore!=null?`Sentiment ${l.compositeScore.toFixed(1)} ${l.compositeLabel}`:null,I?.summary??null,Y?.conclusion??null,T?.markets?.[0]?`${T.markets[0].title} ${(T.markets[0].probability*100).toFixed(1)}%`:null,`${ee?.phase??"unknown"} cycle / ${q?.valueAreaPosition??"unknown"} profile`].filter(Te=>!!Te);ue["ai-insights"]=Re([Be([`Conclusion: ${S.decision.directionalBias} with ${S.marketContext.marketRegime} and ${S.risk.cautionLevel} risk.`,`Confirmed signal: ${o?.regime??"macro regime unavailable"}.`,`Inferred implication: ${Y?.conclusion??"dealer pressure unavailable"}.`,`Estimated/proxy signal: pressure ${de?.mode??"unknown"} / orderflow ${I?.mode??"unknown"} / profile ${q?.mode??"unknown"}.`,`Missing data: ${w.join(" ")||"no major bootstrap gaps detected."}`]),...me.slice(0,3),w[0]??"No major freshness warning."]);const ve={generatedAt:new Date().toISOString(),intent:"macro-regime",primaryAsset:"XAUUSD",runtime:dt(a?.feedStatus??[]),freshness:Ve(w),conclusion:`${S.decision.directionalBias}, ${S.marketContext.marketRegime}, ${S.marketContext.executionCautionState}.`,supportingSignals:me.slice(0,5),caveats:w,confirmationMap:{confirm:S.decision.confirmationChecklist,invalidate:S.decision.invalidationChecklist},marketContext:S.marketContext,decision:S.decision,risk:S.risk,execution:S.execution,bennerCycleMap:ee??void 0,panels:ue,searchIndex:[{label:"XAUUSD",kind:"asset",tags:["gold","safe haven","dealer pressure"]},{label:"DXY",kind:"asset",tags:["dollar","liquidity","funding"]},{label:"USDJPY",kind:"asset",tags:["carry","jpy","stress"]},{label:"Trade Policy",kind:"workflow",tags:["tariff","wto","restriction"]},{label:"Options Gamma",kind:"workflow",tags:["gamma","call wall","put wall"]},{label:"Dealer Pressure",kind:"workflow",tags:["dealer","hedging","volatility"]},{label:"COT Positioning",kind:"workflow",tags:["cftc","positioning","crowding"]},{label:"Liquidity Stress",kind:"workflow",tags:["dxy","vix","jpy","cross-asset"]},{label:"Benner Cycle",kind:"workflow",tags:["cycle","turning point","temporal"]},{label:"Monte Carlo",kind:"workflow",tags:["scenario","probability","distribution","path"]},{label:"Economic Calendar",kind:"workflow",tags:["calendar","macro","event risk","GBPUSD"]},{label:"Fear & Greed",kind:"workflow",tags:["sentiment","risk appetite","fear","greed"]},{label:"Market Brief",kind:"workflow",tags:["brief","desk note","opening plan","watchlist"]},{label:"Volume Profile",kind:"workflow",tags:["poc","value area","nodes"]},{label:"Buyer/Seller Pressure",kind:"workflow",tags:["pressure","proxy flow","execution"]},{label:"Orderflow Engine",kind:"workflow",tags:["footprint","imbalance","absorption","execution"]},{label:"Execution Playbook",kind:"workflow",tags:["entry","exit","target","invalidation"]},{label:"Finance Streams",kind:"workflow",tags:["youtube","bloomberg","desk tv","live"]},{label:"TradingView Screener",kind:"workflow",tags:["tradingview","screener","watchlist","matrix"]}]};return Je(be,ve),ve}class pt{constructor(t){this.context=t}async bootstrap(){await this.refresh(!1)}async refreshAll(){await this.refresh(!0)}async refresh(t){const a=await ht(t);this.context.snapshot=a,this.context.lastUpdatedAt=a.generatedAt,this.context.activeIntent=a.intent,window.__vaultumSnapshot=a;const s=document.getElementById("vaultum-freshness"),r=document.getElementById("vaultum-intent"),i=document.getElementById("vaultum-primary-asset"),n=document.getElementById("vaultum-update-mode");s&&(s.textContent=a.freshness.summary),r&&(r.textContent=a.intent.replace(/-/g," ")),i&&(i.textContent=a.primaryAsset),n&&(n.textContent=a.runtime.mode),window.dispatchEvent(new CustomEvent("vaultum:snapshot-updated",{detail:a}))}}const gt=[{id:"orientation",step:"01",title:"Orientation",description:"Start with the chart, the desk brief, the sentiment composite, and the radar so you know what tape you are looking at before drilling down.",panelIds:["live-chart","market-brief","market-radar","fear-greed","execution-playbook","monte-carlo","tv-screener","ai-insights"]},{id:"macro-drivers",step:"02",title:"Macro Drivers",description:"Read the broad regime first: macro state, FX pressure, commodities, and economic context explain the environment behind the move.",panelIds:["macro-regime","fx-board","commodities","economic","gold-engine"]},{id:"structure",step:"03",title:"Structure And Positioning",description:"Use options, positioning, liquidity, pivots, and profile tools to decide whether the move is likely to trend, pin, squeeze, or fail.",panelIds:["options-gamma","dealer-pressure","cot-positioning","liquidity-stress","volume-profile","buyer-seller-pressure","orderflow-engine","benner-cycle"]},{id:"context",step:"04",title:"Context And Catalyst",description:"Finish with geopolitical, trade, prediction, and news context so you know which outside catalysts can confirm or break the trade thesis.",panelIds:["geopolitical-risk","trade-policy","prediction","news-intel","finance-streams"]},{id:"system",step:"05",title:"System",description:"Check runtime state only when you need to confirm freshness, provider health, or degraded modes.",panelIds:["runtime-config"]}];class bt{constructor(t){this.context=t}container=null;registered=[];mount(t){this.container=t}register(t){this.registered.push(t),this.context.panels.push(t.definition)}render(){if(!this.container)return;this.container.innerHTML="";const t=new Map(this.registered.map(r=>[r.definition.id,r])),a=new Set;gt.forEach(r=>{const i=r.panelIds.map(o=>t.get(o)).filter(o=>!!o);if(!i.length)return;const n=document.createElement("section");n.className="vaultum-section",n.innerHTML=`
        <div class="vaultum-section-header">
          <div class="vaultum-section-step">${r.step}</div>
          <div>
            <h2>${r.title}</h2>
            <p>${r.description}</p>
          </div>
        </div>
        <div class="vaultum-section-grid"></div>
      `;const l=n.querySelector(".vaultum-section-grid");i.forEach(o=>{a.add(o.definition.id),l.appendChild(o.render())}),this.container?.appendChild(n)});const s=this.registered.filter(r=>!a.has(r.definition.id));if(s.length){const r=document.createElement("section");r.className="vaultum-section",r.innerHTML=`
        <div class="vaultum-section-header">
          <div class="vaultum-section-step">06</div>
          <div>
            <h2>Additional Panels</h2>
            <p>Panels that are available but not yet assigned to a guided section.</p>
          </div>
        </div>
        <div class="vaultum-section-grid"></div>
      `;const i=r.querySelector(".vaultum-section-grid");s.forEach(n=>i.appendChild(n.render())),this.container?.appendChild(r)}}}class ft{constructor(t,a){this.context=t,this.dataLoader=a}timer=null;onSnapshotUpdated=()=>this.start();start(){this.stop();const t=this.resolveIntervalMs();this.timer=window.setInterval(()=>{this.dataLoader.refreshAll()},t),window.removeEventListener("vaultum:snapshot-updated",this.onSnapshotUpdated),window.addEventListener("vaultum:snapshot-updated",this.onSnapshotUpdated)}stop(){this.timer!==null&&(window.clearInterval(this.timer),this.timer=null),window.removeEventListener("vaultum:snapshot-updated",this.onSnapshotUpdated)}resolveIntervalMs(){const t=this.context.snapshot?.runtime.refreshIntervalMs??12e4,a=this.context.snapshot?.freshness.warnings.length??0;return a>=3?Math.min(t*2,3e5):a===0?Math.max(6e4,Math.round(t*.75)):t}}class yt{constructor(t){this.context=t}container=null;mount(t){this.container=t}updateQuery(t){this.context.searchQuery=t.trim(),this.render()}render(){if(!this.container)return;const t=this.context.searchQuery.toLowerCase();if(!t){this.container.innerHTML="";return}const a=(this.context.snapshot?.searchIndex??[]).filter(s=>`${s.label} ${s.tags.join(" ")}`.toLowerCase().includes(t));this.container.innerHTML=a.length?a.slice(0,8).map(s=>`<div class="vaultum-search-item"><strong>${s.label}</strong><span>${s.kind}</span></div>`).join(""):'<div class="vaultum-search-empty">No matching terminal objects.</div>'}}class wt{constructor(t,a){this.context=t,this.searchManager=a}container=null;isOpen=!1;mount(t){this.container=t,this.render(),window.addEventListener("keydown",a=>{(a.metaKey||a.ctrlKey)&&a.key.toLowerCase()==="k"&&(a.preventDefault(),this.toggle())})}toggle(){this.isOpen=!this.isOpen,this.render()}render(){this.container&&(this.container.innerHTML=this.isOpen?`
      <div class="vaultum-command-overlay">
        <div class="vaultum-command-modal">
          <div class="vaultum-command-header">
            <strong>VAULTUM Command Palette</strong>
            <button id="vaultum-command-close" class="vaultum-btn">Close</button>
          </div>
          <div class="vaultum-command-body">
            <button class="vaultum-command-item" data-intent="macro-regime">Focus macro regime</button>
            <button class="vaultum-command-item" data-intent="geopolitical-impact">Focus geopolitical impact</button>
            <button class="vaultum-command-item" data-intent="options-gamma-positioning">Focus options pressure</button>
            <button class="vaultum-command-item" data-intent="cross-asset-correlation">Focus cross-asset</button>
          </div>
        </div>
      </div>
    `:"",this.container.querySelector("#vaultum-command-close")?.addEventListener("click",()=>this.toggle()),this.container.querySelectorAll(".vaultum-command-item").forEach(t=>{t.addEventListener("click",()=>{this.context.activeIntent=t.dataset.intent;const a=document.getElementById("vaultum-intent");a&&(a.textContent=this.context.activeIntent.replace(/-/g," ")),this.searchManager.render(),this.toggle()})}))}}class D{constructor(t){this.definition=t}render(){const t=document.createElement("section");return t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body">${this.renderBody()}</div>
    `,window.addEventListener("vaultum:snapshot-updated",()=>{const a=t.querySelector(".vaultum-panel-body");a&&(a.innerHTML=this.renderBody())}),t}}class St extends D{constructor(t){super({id:"runtime-config",title:"Runtime Config",kicker:"Terminal State",tag:"runtime",tone:"neutral"}),this.context=t}renderBody(){const t=this.context.snapshot;return t?`
      <div class="vaultum-callout">
        <strong>Mode: ${t.runtime.mode}</strong>
        <span>Refresh interval: ${Math.round(t.runtime.refreshIntervalMs/1e3)}s</span>
      </div>
      <div class="vaultum-metric-grid">
        <div class="vaultum-metric neutral"><span>Last Update</span><strong>${new Date(t.generatedAt).toLocaleTimeString()}</strong></div>
        <div class="vaultum-metric ${t.freshness.warnings.length?"alert":"bullish"}"><span>Freshness</span><strong>${t.freshness.summary}</strong></div>
        <div class="vaultum-metric neutral"><span>Intent</span><strong>${t.intent}</strong></div>
      </div>
      ${t.runtime.feedStatus?.length?`
        <div class="vaultum-table-wrap">
          <table class="vaultum-table">
            <thead>
              <tr><th>Feed</th><th>Role</th><th>State</th><th>Detail</th></tr>
            </thead>
            <tbody>
              ${t.runtime.feedStatus.map(a=>`
                <tr>
                  <td>${a.provider}</td>
                  <td>${a.role}</td>
                  <td>${a.state}</td>
                  <td>${a.detail}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `:""}
      <ul class="vaultum-bullets">
        ${(t.freshness.warnings.length?t.freshness.warnings:["No major freshness warning currently active."]).map(a=>`<li>${a}</li>`).join("")}
      </ul>
    `:'<div class="vaultum-callout"><strong>Bootstrapping</strong><span>Runtime config will populate after the first snapshot.</span></div>'}}function _(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function $t(e){return e?.length?`
    <div class="vaultum-metric-grid">
      ${e.map(t=>`
        <div class="vaultum-metric ${t.tone??"neutral"}">
          <span>${_(t.label)}</span>
          <strong>${_(t.value)}</strong>
        </div>
      `).join("")}
    </div>
  `:""}function kt(e){return!e?.columns?.length||!e.rows?.length?"":`
    <div class="vaultum-table-wrap">
      <table class="vaultum-table">
        <thead>
          <tr>${e.columns.map(t=>`<th>${_(t)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${e.rows.map(t=>`<tr>${t.map(a=>`<td>${_(a)}</td>`).join("")}</tr>`).join("")}
        </tbody>
      </table>
    </div>
  `}function Pt(e){if(!e.length)return"";const t=100,a=28,s=Math.min(...e),i=Math.max(...e)-s||1;return e.map((n,l)=>{const o=l/Math.max(e.length-1,1)*t,m=a-(n-s)/i*a;return`${o.toFixed(2)},${m.toFixed(2)}`}).join(" ")}function xt(e){return e?.length?`
    <div class="vaultum-chart-grid">
      ${e.map(t=>`
        <div class="vaultum-chart-card ${t.tone??"neutral"}">
          <div class="vaultum-chart-label">${_(t.label)}</div>
          <svg class="vaultum-sparkline" viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
            <polyline points="${Pt(t.points)}"></polyline>
          </svg>
        </div>
      `).join("")}
    </div>
  `:""}function Ct(e){return e?.length?`
    <div class="vaultum-alert-stack">
      ${e.map(t=>`<div class="vaultum-alert-row">${_(t)}</div>`).join("")}
    </div>
  `:""}class k extends D{renderBody(){const a=window.__vaultumSnapshot?.panels[this.definition.id];return a?`
      <div class="vaultum-callout">
        <strong>${_(a.conclusion)}</strong>
        <span>Status: ${_(a.status)}</span>
      </div>
      ${$t(a.metrics)}
      ${xt(a.charts)}
      ${kt(a.table)}
      <ul class="vaultum-bullets">
        ${a.bullets.map(s=>`<li>${_(s)}</li>`).join("")}
      </ul>
      ${Ct(a.alerts)}
    `:'<div class="vaultum-callout"><strong>Waiting for snapshot</strong><span>Panel will populate when the terminal bootstrap completes.</span></div>'}}class Et extends k{constructor(){super({id:"market-radar",title:"Market Radar",kicker:"Regime",tag:"radar",tone:"bullish"})}}const Dt={},ie="vaultum:market-focus";function J(){const e=Dt?.VITE_DEFAULT_ASSET||"XAUUSD";return window.__vaultumMarketFocus??{market:e.toUpperCase(),timeframe:"1h"}}function Lt(e){const t={market:String(e.market||"XAUUSD").toUpperCase(),timeframe:String(e.timeframe||"1h").toLowerCase()};window.__vaultumMarketFocus=t,window.dispatchEvent(new CustomEvent(ie,{detail:t}))}function Q(e){const t=a=>{const s=a.detail;s&&e(s)};return window.addEventListener(ie,t),()=>window.removeEventListener(ie,t)}async function _t(e,t){return u("intelligence","get-market-brief",{market:e,timeframe:t})}function P(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function Ft(e){return e==null||Number.isNaN(e)?"n/a":`${e>=0?"+":""}${e.toFixed(2)}%`}class Tt extends D{marketFocus=J();data=null;loading=!1;error="";loadedKey="";constructor(){super({id:"market-brief",title:"Market Brief",kicker:"Desk Open",tag:"brief",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderBody(),this.ensureData(s)};return Q(r=>{this.marketFocus=r,this.data=null,this.error="",s()}),window.addEventListener("vaultum:snapshot-updated",()=>{this.loadedKey="",this.ensureData(s)}),s(),t}renderBody(){const t=`${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`;return this.loading&&!this.data?`<div class="vaultum-callout"><strong>Building market brief</strong><span>Loading the live desk note for ${P(t)}.</span></div>`:this.error&&!this.data?`<div class="vaultum-callout"><strong>Market brief unavailable</strong><span>${P(this.error)}</span></div>`:this.data?`
      <div class="vaultum-brief-shell">
        <div class="vaultum-brief-hero">
          <div class="vaultum-callout">
            <strong>${P(this.data.summary)}</strong>
            <span>${P(this.data.sourceLabel)}</span>
          </div>
          <div class="vaultum-brief-stats">
            ${this.metricCard("Stance",this.data.stance)}
            ${this.metricCard("Confidence",this.data.confidence)}
            ${this.metricCard("Sentiment",this.data.metrics.sentiment!=null?`${this.data.metrics.sentiment.toFixed(1)} ${this.data.metrics.sentimentLabel}`:"n/a")}
            ${this.metricCard("MC Target",this.data.metrics.targetHitProbability!=null?`${this.data.metrics.targetHitProbability.toFixed(1)}%`:"n/a")}
          </div>
        </div>
        <div class="vaultum-brief-grid">
          <div class="vaultum-brief-card">
            <span>Action Plan</span>
            <strong>${P(this.data.actionPlan)}</strong>
          </div>
          <div class="vaultum-brief-card">
            <span>Risk Watch</span>
            <strong>${P(this.data.riskWatch)}</strong>
          </div>
        </div>
        <div class="vaultum-brief-watchlist">
          ${this.data.watchlist.map(a=>`
            <div class="vaultum-brief-row is-${a.stance}">
              <div>
                <strong>${P(a.display)}</strong>
                <span>${P(a.note)}</span>
              </div>
              <div class="vaultum-brief-price">
                <em>${a.price!=null?P(a.price.toFixed(2)):"n/a"}</em>
                <strong>${P(Ft(a.change))}</strong>
              </div>
            </div>
          `).join("")}
        </div>
        <div class="vaultum-brief-checklist">
          ${this.data.confirmationChecklist.map(a=>`
            <div class="vaultum-brief-pill">${P(a)}</div>
          `).join("")}
        </div>
      </div>
    `:'<div class="vaultum-callout"><strong>Waiting for market brief</strong><span>The pre-session desk note will appear here.</span></div>'}metricCard(t,a){return`
      <div class="vaultum-metric neutral">
        <span>${P(t)}</span>
        <strong>${P(a)}</strong>
      </div>
    `}async ensureData(t){const a=`${this.marketFocus.market}:${this.marketFocus.timeframe}`;if(!this.loading&&!(this.loadedKey===a&&(this.data||this.error))){this.loading=!0,this.error="",t();try{this.data=await _t(this.marketFocus.market,this.marketFocus.timeframe),this.loadedKey=a,this.data||(this.error=`No brief returned for ${this.marketFocus.market}.`)}catch(s){this.data=null,this.loadedKey=a,this.error=s instanceof Error?s.message:"Market brief request failed."}this.loading=!1,t()}}}class Mt extends k{constructor(){super({id:"macro-regime",title:"Macro Regime",kicker:"Macro",tag:"rates/liquidity",tone:"neutral"})}}async function Rt(){return u("market","get-fear-greed-index",{})}function L(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function te(e){return e<=20?"#f05d5e":e<=40?"#f5a65b":e<=60?"#f0d264":e<=80?"#77dd77":"#4fd18b"}class Ut extends D{data=null;loading=!1;loaded=!1;error="";constructor(){super({id:"fear-greed",title:"Fear & Greed",kicker:"Sentiment Composite",tag:"sentiment",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderBody(),this.ensureData(s)};return s(),window.addEventListener("vaultum:snapshot-updated",()=>{this.loaded=!1,this.ensureData(s)}),t}renderBody(){return this.loading&&!this.data?'<div class="vaultum-callout"><strong>Building sentiment composite</strong><span>Pulling the live fear and greed stack from the current market session.</span></div>':this.error&&!this.data?`<div class="vaultum-callout"><strong>Fear &amp; Greed unavailable</strong><span>${L(this.error)}</span></div>`:this.data?`
      <div class="vaultum-fg-shell">
        <div class="vaultum-fg-hero">
          <div class="vaultum-fg-gauge" style="--fg-color:${te(this.data.compositeScore)};--fg-score:${this.data.compositeScore};">
            <div class="vaultum-fg-ring">
              <div class="vaultum-fg-score">${Math.round(this.data.compositeScore)}</div>
              <span>${L(this.data.compositeLabel)}</span>
            </div>
          </div>
          <div class="vaultum-fg-copy">
            <strong>${L(this.data.summary)}</strong>
            <span>${L(this.data.sourceLabel)}</span>
            <div class="vaultum-fg-regimes">
              <div><em>Macro</em><strong>${L(this.data.regimes.macro)}</strong></div>
              <div><em>Liquidity</em><strong>${L(this.data.regimes.liquidity)}</strong></div>
              <div><em>Cross-Asset</em><strong>${L(this.data.regimes.crossAsset)}</strong></div>
            </div>
          </div>
        </div>
        <div class="vaultum-fg-grid">
          ${this.data.categories.map(a=>`
            <div class="vaultum-fg-card">
              <div class="vaultum-fg-card-head">
                <strong>${L(a.label)}</strong>
                <span style="color:${te(a.score)}">${a.score.toFixed(0)}</span>
              </div>
              <div class="vaultum-fg-bar">
                <i style="width:${Math.max(a.score,8)}%;background:${te(a.score)}"></i>
              </div>
              <p>${L(a.detail)}</p>
            </div>
          `).join("")}
        </div>
        ${this.data.warnings.length?`
          <div class="vaultum-alert-stack">
            ${this.data.warnings.map(a=>`<div class="vaultum-alert-row">${L(a)}</div>`).join("")}
          </div>
        `:""}
      </div>
    `:'<div class="vaultum-callout"><strong>Waiting for sentiment data</strong><span>The live composite will appear here.</span></div>'}async ensureData(t){if(!(this.loading||this.loaded)){this.loading=!0,this.error="",t();try{this.data=await Rt(),this.loaded=!0,this.data||(this.error="No sentiment payload returned.")}catch(a){this.data=null,this.loaded=!0,this.error=a instanceof Error?a.message:"Fear and greed request failed."}this.loading=!1,t()}}}class It extends k{constructor(){super({id:"gold-engine",title:"Gold Engine",kicker:"Driver Map",tag:"xauusd",tone:"bullish"})}}class Nt extends k{constructor(){super({id:"fx-board",title:"FX Board",kicker:"Central Bank Divergence",tag:"fx",tone:"neutral"})}}class At extends k{constructor(){super({id:"commodities",title:"Commodities",kicker:"Supply / Demand",tag:"oil-metals",tone:"alert"})}}async function Bt(e){return u("calendar","get-economic-calendar",{market:e})}function x(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function Xt(e){return e==="high"?"High":e==="medium"?"Medium":e==="low"?"Low":"Holiday"}function Gt(e){return e==="high"?"alert":e==="medium"?"neutral":e==="low"?"bullish":"neutral"}function Ot(e){const t=new Date(e.date);return new Intl.DateTimeFormat(void 0,{hour:"2-digit",minute:"2-digit"}).format(t)}function Vt(e){return e.minutesUntil==null?"time unavailable":Math.abs(e.minutesUntil)<5?"now":e.minutesUntil>0?`in ${e.minutesUntil}m`:`${Math.abs(e.minutesUntil)}m ago`}class jt extends D{marketFocus=J();data=null;loading=!1;error="";loadedKey="";constructor(){super({id:"economic",title:"Economic Calendar",kicker:"Macro Catalyst Map",tag:"calendar",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderBody(),this.ensureData(s)};return Q(r=>{this.marketFocus=r,s()}),s(),t}renderBody(){const t=`${this.marketFocus.market} macro tape`;if(this.loading&&!this.data)return`<div class="vaultum-callout"><strong>Loading calendar</strong><span>Pulling live releases for ${x(t)}.</span></div>`;if(this.error&&!this.data)return`<div class="vaultum-callout"><strong>Calendar unavailable</strong><span>${x(this.error)}</span></div>`;if(!this.data)return'<div class="vaultum-callout"><strong>Waiting for calendar</strong><span>Relevant releases for the selected market will appear here.</span></div>';const a=this.data.events.slice(0,8);return`
      <div class="vaultum-calendar-shell">
        <div class="vaultum-calendar-hero">
          <div class="vaultum-callout">
            <strong>${x(this.data.summary)}</strong>
            <span>${x(`${this.data.focusCurrencies.join(" / ")} | ${this.data.source}`)}</span>
          </div>
          <div class="vaultum-calendar-stats">
            <div class="vaultum-metric ${this.data.highImpactCount>0?"alert":"neutral"}">
              <span>High Impact</span>
              <strong>${x(String(this.data.highImpactCount))}</strong>
            </div>
            <div class="vaultum-metric ${this.data.upcomingCount>0?"bullish":"neutral"}">
              <span>Upcoming</span>
              <strong>${x(String(this.data.upcomingCount))}</strong>
            </div>
            <div class="vaultum-metric neutral">
              <span>Focus</span>
              <strong>${x(this.data.focusCountries.join(" / "))}</strong>
            </div>
          </div>
        </div>
        <div class="vaultum-calendar-list">
          ${a.length?a.map(s=>`
            <div class="vaultum-calendar-row ${s.isUpcoming?"is-upcoming":"is-past"}">
              <div class="vaultum-calendar-time">
                <strong>${x(Ot(s))}</strong>
                <span>${x(Vt(s))}</span>
              </div>
              <div class="vaultum-calendar-copy">
                <strong>${x(`${s.currency} ${s.event}`)}</strong>
                <span>${x(`${s.country} • ${s.category}`)}</span>
                <em>${x(`A ${s.actual??"-"} | F ${s.forecast??"-"} | P ${s.previous??"-"}`)}</em>
              </div>
              <div class="vaultum-calendar-impact ${Gt(s.impact)}">${x(Xt(s.impact))}</div>
            </div>
          `).join(""):'<div class="vaultum-callout"><strong>No scheduled releases</strong><span>No relevant calendar events were returned for today.</span></div>'}
        </div>
      </div>
    `}async ensureData(t){const a=this.marketFocus.market;if(!this.loading&&!(this.loadedKey===a&&(this.data||this.error))){this.loading=!0,this.error="",t();try{this.data=await Bt(this.marketFocus.market),this.loadedKey=a,this.data||(this.error=`No economic calendar data returned for ${this.marketFocus.market}.`)}catch(s){this.data=null,this.loadedKey=a,this.error=s instanceof Error?s.message:"Economic calendar request failed."}this.loading=!1,t()}}}class Yt extends k{constructor(){super({id:"geopolitical-risk",title:"Geopolitical Risk",kicker:"Proxy Stress",tag:"geo",tone:"alert"})}}class qt extends k{constructor(){super({id:"trade-policy",title:"Trade Policy",kicker:"Tariffs / Restrictions",tag:"wto",tone:"alert"})}}class Ht extends k{constructor(){super({id:"prediction",title:"Prediction Markets",kicker:"Crowd Belief Layer",tag:"pricing",tone:"neutral"})}}class Wt extends k{constructor(){super({id:"options-gamma",title:"Options Gamma",kicker:"Dealer Pressure",tag:"gamma",tone:"bearish"})}}class Kt extends k{constructor(){super({id:"dealer-pressure",title:"Dealer Pressure",kicker:"Market Structure",tag:"dealers",tone:"bearish"})}}const Jt="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js",fe="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js";let ae=null;async function Qt(){return window.pdfjsLib?(window.pdfjsLib.GlobalWorkerOptions.workerSrc=fe,window.pdfjsLib):(ae||(ae=new Promise((e,t)=>{const a=document.createElement("script");a.src=Jt,a.async=!0,a.onload=()=>{if(!window.pdfjsLib){t(new Error("pdf.js did not initialize"));return}window.pdfjsLib.GlobalWorkerOptions.workerSrc=fe,e(window.pdfjsLib)},a.onerror=()=>t(new Error("Unable to load pdf.js")),document.head.appendChild(a)})),ae)}async function Zt(e){const a=await(await Qt()).getDocument({data:await e.arrayBuffer()}).promise;return(await Promise.all(Array.from({length:a.numPages},async(r,i)=>(await(await a.getPage(i+1)).getTextContent()).items.map(o=>o.str??"").join(" ")))).join(`

`)}const ne="vaultum-cot-upload-analysis",R="(-?[\\d,]+(?:\\.\\d+)?)";function ke(e){return e.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}function O(e){if(!e)return null;const t=Number(e.replace(/,/g,"").trim());return Number.isFinite(t)?t:null}function zt(e){return e.replace(/\u00a0/g," ").replace(/[ \t]+/g," ").replace(/\r/g,`
`).replace(/\n{3,}/g,`

`).trim()}function ea(e){return e.split(/\n+/).map(t=>t.trim()).filter(Boolean)}function ta(e){const t=e.toLowerCase();return t.includes("gold")||t.includes("comex")?"GOLD":t.includes("silver")?"SILVER":t.includes("crude oil")||t.includes("nymex")||t.includes("wti")?"WTI":"UNKNOWN"}function aa(e){const t=[/\b(?:as of|report date|date)\s*[:\-]?\s*([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})/i,/\b(?:as of|report date|date)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,/\b([A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4})\b/,/\b(\d{4}-\d{2}-\d{2})\b/];for(const a of t){const s=e.match(a);if(s?.[1])return s[1]}return"unknown"}function ye(e,t){for(const a of t){const s=e.match(new RegExp(`${ke(a)}[^\\d-]{0,24}${R}`,"i")),r=O(s?.[1]);if(r!=null)return r}return null}function se(e,t,a){const s=a.map(ke).join("|"),r=[new RegExp(`(?:${s})[\\s\\S]{0,120}?long(?:s| positions?)?[^\\d-]{0,24}${R}[\\s\\S]{0,120}?short(?:s| positions?)?[^\\d-]{0,24}${R}[\\s\\S]{0,80}?change[^\\d-]{0,24}${R}`,"i"),new RegExp(`(?:${s})[\\s\\S]{0,120}?long(?:s| positions?)?[^\\d-]{0,24}${R}[\\s\\S]{0,120}?short(?:s| positions?)?[^\\d-]{0,24}${R}`,"i")];for(const l of r){const o=e.match(l);if(o)return{long:O(o[1]),short:O(o[2]),change:O(o[3])}}const i=t.find(l=>a.some(o=>l.toLowerCase().includes(o.toLowerCase())));if(!i)return{long:null,short:null,change:null};const n=[...i.matchAll(new RegExp(R,"g"))].map(l=>O(l[1])).filter(l=>l!=null);return{long:n[0]??null,short:n[1]??null,change:n[2]??null}}function sa(e){const t=e.openInterest&&e.nonCommercialNet!=null?e.nonCommercialNet/e.openInterest*100:null,a=e.nonCommercialRatio??1,s=e.nonCommercialNet==null?"unknown":e.nonCommercialNet>0?"bullish speculative bias":e.nonCommercialNet<0?"bearish speculative bias":"balanced speculative bias",r=Math.max(t!=null?Math.abs(t):0,Math.abs(a-1)*20),i=r>=14?"extreme":r>=8?"strong":r>=4?"moderate":"light",n=e.nonCommercialChange==null?"weekly change not parsed":e.nonCommercialChange>0?"spec length building":e.nonCommercialChange<0?"spec length unwinding":"positioning stable";return{bias:s,strength:i,change:n}}function ra(e){return[`${e.market} upload reads as ${e.bias}`,e.strength!=="light"?`with ${e.strength} conviction`:"with light conviction",e.nonCommercialNet!=null?`spec net ${e.nonCommercialNet.toLocaleString()}`:"spec net unavailable",e.commercialNet!=null?`commercial net ${e.commercialNet.toLocaleString()}`:"commercial net unavailable",e.nonCommercialRatio!=null?`long/short ${e.nonCommercialRatio.toFixed(2)}`:"ratio unavailable",e.change].join(", ")+"."}async function ia(e){const t=e.name.toLowerCase().endsWith(".pdf")?"pdf":"text",a=t==="pdf"?await Zt(e):await e.text();return na(a,e.name,t)}function na(e,t="manual-input",a="text"){const s=zt(e),r=ea(s),i=ta(s),n=aa(s),l=se(s,r,["non-commercial","noncommercial","managed money"]),o=se(s,r,["commercial","producer merchant","swap dealer"]),m=se(s,r,["non-reportable","nonreportable","small trader"]),g=ye(s,["open interest","open_interest"]),b=ye(s,["spreading","spread positions","spread"]),f=l.long!=null&&l.short!=null?l.long-l.short:null,c=o.long!=null&&o.short!=null?o.long-o.short:null,h=l.long!=null&&l.short?Number((l.long/l.short).toFixed(2)):null,p=o.long!=null&&o.short?Number((o.long/o.short).toFixed(2)):null,F=sa({openInterest:g,nonCommercialNet:f,nonCommercialRatio:h,nonCommercialChange:l.change}),Z=[l.long==null||l.short==null?"Non-commercial long/short values were only partially parsed.":null,o.long==null||o.short==null?"Commercial long/short values were only partially parsed.":null,g==null?"Open interest was not found in the uploaded report.":null,i==="UNKNOWN"?"Market could not be identified from the upload text.":null].filter(V=>!!V);return{sourceName:t,sourceKind:a,market:i,reportDate:n,source:a==="pdf"?"Uploaded PDF report":"Uploaded text report",openInterest:g,nonCommercialLong:l.long,nonCommercialShort:l.short,commercialLong:o.long,commercialShort:o.short,nonReportableLong:m.long,nonReportableShort:m.short,spreading:b,nonCommercialChange:l.change,commercialChange:o.change,nonCommercialNet:f,commercialNet:c,nonCommercialRatio:h,commercialRatio:p,bias:F.bias,strength:F.strength,change:F.change,summary:ra({market:i,nonCommercialNet:f,commercialNet:c,nonCommercialRatio:h,bias:F.bias,strength:F.strength,change:F.change}),warnings:Z,rawPreview:s.slice(0,1400)}}function oa(){if(typeof window>"u")return null;try{const e=window.localStorage.getItem(ne);return e?JSON.parse(e):null}catch{return null}}function la(e){typeof window>"u"||window.localStorage.setItem(ne,JSON.stringify(e))}function ca(){typeof window>"u"||window.localStorage.removeItem(ne)}async function da(e){const[t,a]=await Promise.all([u("positioning","get-cot-summary",{market:e}),u("positioning","get-positioning-regime",{market:e})]);return{cot:t,regime:a}}const ua=["GOLD","SILVER","WTI"];class ma extends D{selectedMarket="GOLD";liveCot=null;liveRegime=null;loadedMarket="";liveLoading=!1;liveError="";uploadLoading=!1;uploadError="";uploadAnalysis=oa();constructor(){super({id:"cot-positioning",title:"COT Positioning",kicker:"Official + Upload Lab",tag:"cftc",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderCotBody(),this.bindEvents(a,s),this.ensureLiveCot(s)};return s(),window.addEventListener("vaultum:snapshot-updated",()=>s()),t}renderBody(){return""}renderCotBody(){const t=this.liveCot,a=this.liveRegime,s=this.uploadAnalysis,r=this.buildComparison(t,s);return`
      <div class="vaultum-cot-shell">
        <div class="vaultum-cot-guide">
          <div class="vaultum-cot-guide-card"><span>1</span><strong>Official feed</strong><p>Weekly CFTC disaggregated positioning is fetched live from the backend.</p></div>
          <div class="vaultum-cot-guide-card"><span>2</span><strong>Upload report</strong><p>Drop a PDF or text export and VAULTUM will extract long, short, net, ratio, and change fields.</p></div>
          <div class="vaultum-cot-guide-card"><span>3</span><strong>Translate bias</strong><p>The panel converts raw contracts into bias, strength, crowding, and weekly positioning change.</p></div>
        </div>

        <div class="vaultum-cot-market-row">
          ${ua.map(i=>`
            <button class="vaultum-cot-market ${i===this.selectedMarket?"is-active":""}" data-cot-market="${i}">${i}</button>
          `).join("")}
          <button class="vaultum-cot-market" data-cot-refresh="true">${this.liveLoading?"Refreshing...":"Refresh Live Feed"}</button>
        </div>

        <div class="vaultum-cot-hero">
          <div class="vaultum-cot-card">
            <div class="vaultum-cot-card-head">
              <div>
                <div class="vaultum-ai-label">Official CFTC Snapshot</div>
                <strong>${this.escape(t?.summary??(this.liveLoading?"Loading official COT positioning...":"Official COT snapshot unavailable."))}</strong>
              </div>
              <span>${this.escape(a?.regime??t?.source??"live-feed")}</span>
            </div>
            <div class="vaultum-cot-stat-grid">
              ${this.renderStat("Market",t?.market??this.selectedMarket)}
              ${this.renderStat("Report Date",t?.reportDate??"n/a")}
              ${this.renderStat("Bias",a?.bias??"unknown")}
              ${this.renderStat("Crowding",t?.crowdedRisk??"unknown")}
              ${this.renderStat("Spec Net",this.formatNumber(t?.netPosition))}
              ${this.renderStat("L/S Ratio",this.formatDecimal(t?.longShortRatio))}
            </div>
            <div class="vaultum-cot-table">
              ${this.renderRow("Non-Commercial",this.formatNumber(t?.nonCommercialLong),this.formatNumber(t?.nonCommercialShort),this.formatNumber(t?.netPosition))}
              ${this.renderRow("Commercial",this.formatNumber(t?.commercialLong),this.formatNumber(t?.commercialShort),this.formatNumber(t?.commercialNetPosition))}
              ${this.renderRow("Non-Reportable",this.formatNumber(t?.nonReportableLong),this.formatNumber(t?.nonReportableShort),"n/a")}
            </div>
            <ul class="vaultum-bullets">
              <li>Source: ${this.escape(t?.source??"Official CFTC feed not returned yet.")}</li>
              <li>Weekly change: ${this.formatSigned(t?.change)}</li>
              <li>Spreading: ${this.formatNumber(t?.spreading)}</li>
            </ul>
            ${this.liveError?`<div class="vaultum-alert-row">${this.escape(this.liveError)}</div>`:""}
          </div>

          <div class="vaultum-cot-card">
            <div class="vaultum-cot-card-head">
              <div>
                <div class="vaultum-ai-label">Upload COT Report</div>
                <strong>${this.escape(s?.summary??"Upload a PDF or text report to extract long/short, net, change, and ratio data.")}</strong>
              </div>
              <span>${this.escape(s?.source??"local-parser")}</span>
            </div>
            <div class="vaultum-cot-upload-box">
              <label class="vaultum-cot-drop">
                <input id="vaultum-cot-upload" type="file" accept=".pdf,.txt,text/plain,application/pdf" />
                <strong>${this.uploadLoading?"Parsing report...":"Choose PDF or TXT"}</strong>
                <span>Best results come from text-based COT reports. VAULTUM will keep the extracted result on this browser.</span>
              </label>
              <div class="vaultum-cot-upload-actions">
                <button class="vaultum-btn" data-cot-clear="true">Clear Upload</button>
              </div>
            </div>
            <div class="vaultum-cot-stat-grid">
              ${this.renderStat("Uploaded Market",s?.market??"n/a")}
              ${this.renderStat("Report Date",s?.reportDate??"n/a")}
              ${this.renderStat("Bias",s?.bias??"unknown")}
              ${this.renderStat("Strength",s?.strength??"unknown")}
              ${this.renderStat("Spec Net",this.formatNumber(s?.nonCommercialNet))}
              ${this.renderStat("L/S Ratio",this.formatDecimal(s?.nonCommercialRatio))}
            </div>
            <div class="vaultum-cot-table">
              ${this.renderRow("Non-Commercial",this.formatNumber(s?.nonCommercialLong),this.formatNumber(s?.nonCommercialShort),this.formatNumber(s?.nonCommercialNet))}
              ${this.renderRow("Commercial",this.formatNumber(s?.commercialLong),this.formatNumber(s?.commercialShort),this.formatNumber(s?.commercialNet))}
              ${this.renderRow("Non-Reportable",this.formatNumber(s?.nonReportableLong),this.formatNumber(s?.nonReportableShort),"n/a")}
            </div>
            <ul class="vaultum-bullets">
              <li>Uploaded source: ${this.escape(s?.sourceName??"none")}</li>
              <li>Weekly change: ${this.escape(s?.change??"not parsed")}</li>
              <li>Open interest: ${this.formatNumber(s?.openInterest)}</li>
            </ul>
            ${this.uploadError?`<div class="vaultum-alert-row">${this.escape(this.uploadError)}</div>`:""}
          </div>
        </div>

        <div class="vaultum-cot-compare-grid">
          <div class="vaultum-cot-card">
            <div class="vaultum-ai-label">Bias Translation</div>
            <strong>${this.escape(r.headline)}</strong>
            <ul class="vaultum-bullets">${r.points.map(i=>`<li>${this.escape(i)}</li>`).join("")}</ul>
          </div>
          <div class="vaultum-cot-card">
            <div class="vaultum-ai-label">Extraction Notes</div>
            <ul class="vaultum-bullets">
              ${(s?.warnings?.length?s.warnings:["No upload parsed yet."]).map(i=>`<li>${this.escape(i)}</li>`).join("")}
            </ul>
            <pre class="vaultum-ai-raw vaultum-cot-raw">${this.escape(s?.rawPreview??"Upload text preview will appear here after parsing.")}</pre>
          </div>
        </div>
      </div>
    `}bindEvents(t,a){t.querySelectorAll("[data-cot-market]").forEach(s=>{s.addEventListener("click",async()=>{const r=s.dataset.cotMarket;!r||r===this.selectedMarket||(this.selectedMarket=r,await this.loadLiveCot(r,a,!0))})}),t.querySelector('[data-cot-refresh="true"]')?.addEventListener("click",async()=>{await this.loadLiveCot(this.selectedMarket,a,!0)}),t.querySelector("#vaultum-cot-upload")?.addEventListener("change",async s=>{const i=s.target.files?.[0];if(i){this.uploadError="",this.uploadLoading=!0,a();try{const n=await ia(i);if(this.uploadAnalysis=n,la(n),n.market==="GOLD"||n.market==="SILVER"||n.market==="WTI"){this.selectedMarket=n.market,await this.loadLiveCot(n.market,a,!0);return}}catch(n){this.uploadError=n instanceof Error?n.message:"Unable to parse the uploaded report."}this.uploadLoading=!1,a()}}),t.querySelector('[data-cot-clear="true"]')?.addEventListener("click",()=>{this.uploadAnalysis=null,this.uploadError="",ca(),a()})}async ensureLiveCot(t){this.liveLoading||this.loadedMarket===this.selectedMarket&&(this.liveCot||this.liveError)||await this.loadLiveCot(this.selectedMarket,t,!1)}async loadLiveCot(t,a,s){if(!this.liveLoading&&!(!s&&this.loadedMarket===t&&(this.liveCot||this.liveError))){this.liveLoading=!0,this.liveError="",a();try{const r=await da(t);this.liveCot=r.cot,this.liveRegime=r.regime,this.loadedMarket=t,r.cot?.reportDate||(this.liveError=`Official CFTC feed did not return a report date for ${t}.`)}catch(r){this.liveCot=null,this.liveRegime=null,this.loadedMarket=t,this.liveError=r instanceof Error?r.message:`Unable to load official COT data for ${t}.`}this.liveLoading=!1,this.uploadLoading=!1,a()}}buildComparison(t,a){return!t&&!a?{headline:"No official snapshot or uploaded report is available yet.",points:["Use the market buttons to pull live weekly CFTC data, then upload a PDF or TXT report to compare the extraction."]}:t&&!a?{headline:"Official CFTC positioning is live; upload a report to compare it against your document workflow.",points:[`Current live bias: ${this.safeText(this.liveRegime?.bias??t.crowdedRisk??"unknown")}.`,`Spec long/short ratio is ${this.safeText(this.formatDecimal(t.longShortRatio))}.`,"Upload parsing is useful for broker notes, research PDFs, or old archived COT reports."]}:!t&&a?{headline:"Upload parsing worked, but the live official feed is missing for the selected market.",points:[`Uploaded bias: ${this.safeText(a.bias)} with ${this.safeText(a.strength)} strength.`,`Uploaded weekly change: ${this.safeText(a.change)}.`,"Refresh the official feed to compare your report against the current backend source."]}:{headline:(t&&a?(this.liveRegime?.bias??"").toLowerCase().includes(a.bias.includes("bullish")?"bullish":a.bias.includes("bearish")?"bearish":"neutral"):!1)?"Uploaded report agrees with the current official CFTC bias.":"Uploaded report and current official CFTC read are not perfectly aligned.",points:[`Official bias: ${this.safeText(this.liveRegime?.bias??"unknown")} | uploaded bias: ${this.safeText(a?.bias??"unknown")}.`,`Official spec net: ${this.safeText(this.formatNumber(t?.netPosition))} | uploaded spec net: ${this.safeText(this.formatNumber(a?.nonCommercialNet))}.`,`Official ratio: ${this.safeText(this.formatDecimal(t?.longShortRatio))} | uploaded ratio: ${this.safeText(this.formatDecimal(a?.nonCommercialRatio))}.`]}}renderStat(t,a){return`
      <div class="vaultum-cot-stat">
        <span>${this.escape(t)}</span>
        <strong>${this.escape(a)}</strong>
      </div>
    `}renderRow(t,a,s,r){return`
      <div class="vaultum-cot-row">
        <span>${this.escape(t)}</span>
        <span>Long ${this.escape(a)}</span>
        <span>Short ${this.escape(s)}</span>
        <span>Net ${this.escape(r)}</span>
      </div>
    `}formatNumber(t){return t==null||!Number.isFinite(t)?"n/a":Math.round(t).toLocaleString()}formatDecimal(t){return t==null||!Number.isFinite(t)?"n/a":t.toFixed(2)}formatSigned(t){return t==null||!Number.isFinite(t)?"n/a":`${t>=0?"+":""}${Math.round(t).toLocaleString()}`}safeText(t){return t||"n/a"}escape(t){return t.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}}class va extends k{constructor(){super({id:"liquidity-stress",title:"Liquidity Stress",kicker:"Dollar Funding",tag:"liquidity",tone:"alert"})}}function y(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function re(e){return["bullish","bearish","alert","neutral"].includes(e)?e:"neutral"}function ha(e){return e.regimes[0]?.tone??"neutral"}function pa(e){return e?.alerts?.length?`
    <div class="vaultum-alert-stack">
      ${e.alerts.map(t=>`<div class="vaultum-alert-row">${y(t)}</div>`).join("")}
    </div>
  `:""}class ga extends D{constructor(){super({id:"benner-cycle",title:"Benner Cycle Map",kicker:"Temporal Overlay",tag:"cycle",tone:"neutral"})}renderBody(){const t=window.__vaultumSnapshot,a=t?.bennerCycleMap,s=t?.panels?.["benner-cycle"];if(!a||!s)return'<div class="vaultum-callout"><strong>Waiting for Benner map</strong><span>The cycle map will populate after the first terminal snapshot.</span></div>';const r=a.activeRegimes[0]?.tone??"neutral",i=a.activeRegimes[0],n=a.macroEvents.slice(0,4),l=a.upcomingRegimes.slice(0,4);return`
      <div class="vaultum-benner-shell">
        <div class="vaultum-benner-top">
          <div class="vaultum-callout">
            <strong>${y(s.conclusion)}</strong>
            <span>${y(a.educationalNotice)}</span>
          </div>
          <div class="vaultum-benner-hero">
            <div class="vaultum-benner-status ${re(r)}">
              <span>Current Year</span>
              <strong>${a.year}</strong>
              <em>${y(i?`${i.code} • ${i.title}`:a.regimeLabel)}</em>
            </div>
            <div class="vaultum-benner-status neutral">
              <span>Turn Window</span>
              <strong>${y(a.turnWindow)}</strong>
              <em>${y(a.overlapLabel)}</em>
            </div>
            <div class="vaultum-benner-status neutral">
              <span>Bias</span>
              <strong>${y(a.bias)}</strong>
              <em>${y(a.compatibility)}</em>
            </div>
          </div>
        </div>

        <div class="vaultum-benner-grid">
          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Cycle Map</strong>
              <span>${y(a.backgroundPriority)}</span>
            </div>
            <div class="vaultum-benner-year-grid">
              ${a.timeline.map(o=>`
                <div class="vaultum-benner-year ${re(ha(o))} ${o.isCurrent?"is-current":""}">
                  <span>${o.year}</span>
                  <strong>${y(o.label.toUpperCase())}</strong>
                  <em>${y(o.regimes.map(m=>m.code).join(" / ")||"quiet")}</em>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Legend</strong>
              <span>Educational overlay</span>
            </div>
            <div class="vaultum-benner-legend">
              ${a.legend.map(o=>`
                <div class="vaultum-benner-legend-item ${re(o.tone)}">
                  <strong>${y(o.code)}</strong>
                  <span>${y(o.title)}</span>
                  <em>${y(o.phase)}</em>
                </div>
              `).join("")}
            </div>
            <ul class="vaultum-bullets">
              ${a.notes.map(o=>`<li>${y(o)}</li>`).join("")}
            </ul>
          </div>
        </div>

        <div class="vaultum-benner-grid">
          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Upcoming Windows</strong>
              <span>Forward scan</span>
            </div>
            <div class="vaultum-benner-list">
              ${l.map(o=>`
                <div class="vaultum-benner-list-item">
                  <strong>${o.year}</strong>
                  <span>${y(`${o.code} • ${o.title}`)}</span>
                  <em>${y(`${o.yearsAhead===0?"active now":`in ${o.yearsAhead}y`}`)}</em>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="vaultum-benner-card">
            <div class="vaultum-benner-card-head">
              <strong>Macro Event Anchors</strong>
              <span>Context only</span>
            </div>
            <div class="vaultum-benner-list">
              ${n.map(o=>`
                <div class="vaultum-benner-list-item">
                  <strong>${y(o.date)}</strong>
                  <span>${y(o.title)}</span>
                  <em>${y(`${o.tag} • ${o.yearsFromCurrent>=0?"+":""}${o.yearsFromCurrent}y`)}</em>
                </div>
              `).join("")}
            </div>
          </div>
        </div>

        ${pa(s)}
      </div>
    `}}class ba extends k{constructor(){super({id:"volume-profile",title:"Volume Profile / Levels",kicker:"Structure",tag:"profile",tone:"neutral"})}}class fa extends k{constructor(){super({id:"buyer-seller-pressure",title:"Buyer / Seller Pressure",kicker:"Flow Proxy",tag:"pressure",tone:"alert"})}}class ya extends k{constructor(){super({id:"orderflow-engine",title:"Orderflow Engine",kicker:"Footprint Proxy",tag:"flow",tone:"alert"})}}class wa extends k{constructor(){super({id:"execution-playbook",title:"Execution Playbook",kicker:"Entry / Exit Map",tag:"execution",tone:"bullish"})}}class Sa extends k{constructor(){super({id:"news-intel",title:"News Intelligence",kicker:"Signal Separation",tag:"news",tone:"neutral"})}}async function $a(e){return u("ai","ask-vaultum",{question:e})}async function ka(){return u("ai","summarize-regime",{})}const Pa=["What is the current gold bias and what confirms it?","Explain the current macro regime in desk language.","What is USDJPY saying about carry stress right now?","How should I read dealer pressure and gamma for XAUUSD?","Should I enter XAUUSD near 3345 and why?","Should I exit gold near resistance here or hold?"];class xa extends D{response=null;loading=!1;lastQuestion="";constructor(){super({id:"ai-insights",title:"AI Insights",kicker:"Reasoning Layer",tag:"ai",tone:"bullish"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderAiBody(),this.bindEvents(a,s)};return s(),window.addEventListener("vaultum:snapshot-updated",()=>s()),t}renderBody(){return""}renderAiBody(){const t=window.__vaultumSnapshot,a=t?.panels?.["ai-insights"],s=this.response?.conclusion??a?.conclusion??"AI reasoning layer idle.",r=this.response?.supportingSignals??a?.bullets??[],i=this.response?.caveats??[],n=this.response?.watchItems??[],l=this.response?.toolsUsed??[],o=this.response?.confirmedSignals??[],m=this.response?.inferredImplications??[],g=this.response?.estimatedSignals??[],b=this.response?.missingData??[],f=this.response?.providerTrace??["ollama:local-if-configured","groq:cloud-if-configured","openrouter:cloud-if-configured","deterministic-fallback:vaultum-rule-engine"],c=this.response?.marketDataTrace??["TradingView is chart UI only; backend feeds power the actual quote context.","Market quotes use Finnhub where configured and Yahoo Finance for indices, futures, FX, and fallbacks."],h=this.response?`Provider ${this.escape(this.response.provider)} | confidence ${this.escape(this.response.confidence)}`:`Status ${this.escape(a?.status??"mixed")}`;return`
      <div class="vaultum-ai-shell">
        <div class="vaultum-ai-hero">
          <div class="vaultum-ai-query-card">
            <div class="vaultum-ai-chip-row">
              <span class="vaultum-ai-chip is-provider">${this.escape(this.response?.provider??"bootstrap.ai-insights")}</span>
              <span class="vaultum-ai-chip is-confidence ${this.response?.confidence??"medium"}">${this.escape((this.response?.confidence??"medium").toUpperCase())}</span>
              <span class="vaultum-ai-chip">${this.escape(this.response?.intent??t?.intent??"macro-regime")}</span>
            </div>
            <div class="vaultum-ai-hero-copy">
              <strong>Ask for the why, not just the print.</strong>
              <span>VAULTUM will route through the provider chain, surface market-feed provenance, and keep proxy data labeled honestly.</span>
            </div>
            <div class="vaultum-ai-prompt-wall">
              ${Pa.map(p=>`
                <button class="vaultum-ai-prompt" data-ai-prompt="${this.escape(p)}">${this.escape(p)}</button>
              `).join("")}
            </div>
            <div class="vaultum-ai-query">
              <textarea id="vaultum-ai-question" class="vaultum-ai-textarea" placeholder="Ask about gold bias, macro regime, USDJPY carry stress, sanctions impact, gamma pressure, or COT positioning">${this.escape(this.lastQuestion)}</textarea>
              <div class="vaultum-ai-actions">
                <div class="vaultum-ai-hint">Ctrl+Enter runs the query. Provider failures now cascade through the fallback chain.</div>
                <div class="vaultum-ai-action-group">
                  <button id="vaultum-ai-regime" class="vaultum-btn">Summarize Regime</button>
                  <button id="vaultum-ai-ask" class="vaultum-btn vaultum-btn-primary">${this.loading?"Running...":"Ask VAULTUM"}</button>
                </div>
              </div>
            </div>
          </div>

          <div class="vaultum-ai-status-card">
            <div class="vaultum-ai-status-head">
              <div>
                <div class="vaultum-ai-label">Run Status</div>
                <strong>${this.escape(s)}</strong>
              </div>
              <span>${this.escape(h)}</span>
            </div>
            <div class="vaultum-ai-mini-grid">
              <div class="vaultum-ai-mini-card">
                <div class="vaultum-ai-label">Provider Chain</div>
                <ul class="vaultum-bullets">${f.map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
              </div>
              <div class="vaultum-ai-mini-card">
                <div class="vaultum-ai-label">Market Feeds</div>
                <ul class="vaultum-bullets">${c.map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
              </div>
              <div class="vaultum-ai-mini-card">
                <div class="vaultum-ai-label">Tool Trace</div>
                <ul class="vaultum-bullets">${(l.length?l:["bootstrap.ai-insights"]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
              </div>
            </div>
          </div>
        </div>

        <div class="vaultum-ai-response">
          <div class="vaultum-ai-conclusion">
            <div class="vaultum-ai-label">Desk Conclusion</div>
            <strong>${this.escape(s)}</strong>
            <span>${this.escape(h)}</span>
          </div>
          <div class="vaultum-ai-grid">
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Supporting Signals</div>
              <ul class="vaultum-bullets">${r.map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Confirmed Signals</div>
              <ul class="vaultum-bullets">${(o.length?o:["No confirmed-signal block yet."]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Inferred Implications</div>
              <ul class="vaultum-bullets">${(m.length?m:["No inferred implication block yet."]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Estimated / Proxy</div>
              <ul class="vaultum-bullets">${(g.length?g:["No estimated/proxy block yet."]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Missing / Uncertain</div>
              <ul class="vaultum-bullets">${(b.length?b:["No explicit missing-data warning from the last run."]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Caveats</div>
              <ul class="vaultum-bullets">${(i.length?i:["No major caveat surfaced yet."]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">What To Watch</div>
              <ul class="vaultum-bullets">${(n.length?n:["Use the input box to query the live terminal context."]).map(p=>`<li>${this.escape(p)}</li>`).join("")}</ul>
            </div>
            <div class="vaultum-ai-block">
              <div class="vaultum-ai-label">Context Snapshot</div>
              <pre class="vaultum-ai-raw vaultum-ai-context">${this.escape(this.response?.contextSnapshot??"Run a question to inspect the full context trace.")}</pre>
            </div>
          </div>
          ${this.response?.answer?`
            <div class="vaultum-ai-answer-card">
              <div class="vaultum-ai-label">Desk Note</div>
              <pre class="vaultum-ai-raw">${this.escape(this.response.answer)}</pre>
            </div>
          `:""}
        </div>
      </div>
    `}bindEvents(t,a){const s=async r=>{const i=t.querySelector("#vaultum-ai-question"),n=(r??i?.value??"").trim();n&&(this.lastQuestion=n,this.loading=!0,a(),this.response=await $a(n)??this.buildFailureResponse(n),this.loading=!1,a())};t.querySelectorAll("[data-ai-prompt]").forEach(r=>{r.addEventListener("click",async()=>{const i=r.dataset.aiPrompt??"",n=t.querySelector("#vaultum-ai-question");n&&(n.value=i),await s(i)})}),t.querySelector("#vaultum-ai-ask")?.addEventListener("click",async()=>{await s()}),t.querySelector("#vaultum-ai-question")?.addEventListener("input",r=>{this.lastQuestion=r.target.value}),t.querySelector("#vaultum-ai-question")?.addEventListener("keydown",async r=>{r.key==="Enter"&&(r.ctrlKey||r.metaKey)&&(r.preventDefault(),await s())}),t.querySelector("#vaultum-ai-regime")?.addEventListener("click",async()=>{this.lastQuestion="Summarize the current macro regime for trading.",this.loading=!0,a();const r=await ka();this.response=r?{provider:"deterministic-fallback:vaultum-rule-engine",providerTrace:["deterministic-fallback:vaultum-rule-engine"],marketDataTrace:["Regime summary is generated from the current backend domain snapshot.","TradingView is chart UI only; quote context comes from backend feeds."],intent:"macro-regime",toolsUsed:["macro.get_macro_signals","liquidity.get_cross_asset_regime"],confidence:"medium",conclusion:r.summary,supportingSignals:["Macro summary generated from current backend domain state."],caveats:["Use this as a compact note; query the panel for asset-specific detail."],watchItems:["Watch yields, dollar, gold, and VIX for regime confirmation."],confirmedSignals:[],inferredImplications:[],estimatedSignals:[],missingData:[],answer:r.summary,contextSnapshot:r.summary}:this.buildFailureResponse(this.lastQuestion),this.loading=!1,a()})}buildFailureResponse(t){return{provider:"deterministic-fallback:vaultum-rule-engine",providerTrace:["ollama:local-if-configured","groq:cloud-if-configured","openrouter:cloud-if-configured","deterministic-fallback:vaultum-rule-engine"],marketDataTrace:["TradingView is chart UI only; backend feeds power the actual quote context.","If live providers fail, Vaultum now falls back to deterministic analysis plus cached feed metadata where available."],intent:"macro-regime",toolsUsed:[],confidence:"low",conclusion:"AI request failed to return a live provider response.",supportingSignals:[`Question queued: ${t}`],caveats:["The RPC call did not return a response, so this panel is showing a local failure fallback."],watchItems:["Check provider credentials or upstream connectivity, then rerun the query."],confirmedSignals:[],inferredImplications:[],estimatedSignals:[],missingData:["Live AI provider response unavailable."],answer:"No structured AI response was returned by the backend.",contextSnapshot:`Question: ${t}
Status: local fallback`}}escape(t){return t.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}}async function Ca(e,t){return u("orderflow","get-engine",{market:e,timeframe:t})}async function Ea(e,t){return u("pivots","get-levels",{market:e,timeframe:t})}const we="vaultum-tradingview-script",Da="https://s3.tradingview.com/tv.js",La="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js";async function _a(){return window.TradingView?.widget?window.TradingView:(window.__vaultumTradingViewLoader||(window.__vaultumTradingViewLoader=new Promise((e,t)=>{const a=document.getElementById(we);if(a){a.addEventListener("load",()=>{window.TradingView?.widget?e(window.TradingView):t(new Error("TradingView loaded without widget constructor."))},{once:!0}),a.addEventListener("error",()=>t(new Error("Failed to load TradingView script.")),{once:!0});return}const s=document.createElement("script");s.id=we,s.async=!0,s.src=Da,s.addEventListener("load",()=>{window.TradingView?.widget?e(window.TradingView):t(new Error("TradingView loaded without widget constructor."))},{once:!0}),s.addEventListener("error",()=>t(new Error("Failed to load TradingView script.")),{once:!0}),document.head.appendChild(s)})),window.__vaultumTradingViewLoader)}function Fa(e){if(!window.TradingView?.widget)throw new Error("TradingView is not available.");new window.TradingView.widget({container_id:e.containerId,autosize:!0,symbol:e.symbol,interval:e.interval,timezone:"Etc/UTC",theme:e.theme??"dark",style:"1",locale:"en",toolbar_bg:e.toolbarBg??"#101010",hide_top_toolbar:e.hideTopToolbar??!1,hide_legend:e.hideLegend??!1,hide_side_toolbar:e.hideSideToolbar??!1,allow_symbol_change:e.allowSymbolChange??!1,save_image:!1,withdateranges:!1,studies:[],overrides:e.overrides??{}})}function Ta(e,t){e.innerHTML="",e.classList.add("tradingview-widget-container");const a=document.createElement("div");a.className="tradingview-widget-container__widget";const s=document.createElement("script");s.type="text/javascript",s.async=!0,s.src=La,s.text=JSON.stringify({width:t.width??"100%",height:t.height??"100%",locale:t.locale??"en",colorTheme:t.colorTheme??"dark",showChart:!0,chartOnly:!1,showFloatingTooltip:!1,tabs:t.tabs??[]}),e.appendChild(a),e.appendChild(s)}const B={XAUUSD:{key:"XAUUSD",label:"Gold Spot",subtitle:"Primary asset chart",tvSymbol:"OANDA:XAUUSD"},DXY:{key:"DXY",label:"Dollar Index",subtitle:"Macro funding filter",tvSymbol:"TVC:DXY"},EURUSD:{key:"EURUSD",label:"EUR / USD",subtitle:"Major FX pair",tvSymbol:"FX:EURUSD"},GBPUSD:{key:"GBPUSD",label:"GBP / USD",subtitle:"Sterling dollar pair",tvSymbol:"FX:GBPUSD"},USDJPY:{key:"USDJPY",label:"USD / JPY",subtitle:"Carry stress proxy",tvSymbol:"FX:USDJPY"},SPX:{key:"SPX",label:"S&P 500",subtitle:"Risk appetite index",tvSymbol:"SP:SPX"},NDX:{key:"NDX",label:"Nasdaq 100",subtitle:"Growth beta index",tvSymbol:"NASDAQ:NDX"},VIX:{key:"VIX",label:"Volatility Index",subtitle:"Risk stress gauge",tvSymbol:"CBOE:VIX"},WTI:{key:"WTI",label:"WTI Crude",subtitle:"Oil shock proxy",tvSymbol:"TVC:USOIL"},BTCUSD:{key:"BTCUSD",label:"BTC / USD",subtitle:"Crypto risk proxy",tvSymbol:"BINANCE:BTCUSDT"}},Se=[{key:"15m",tvInterval:"15"},{key:"30m",tvInterval:"30"},{key:"1h",tvInterval:"60"},{key:"4h",tvInterval:"240"},{key:"1d",tvInterval:"D"}];class Ma extends D{selectedPresetKey=null;selectedInterval="1h";selectedMode="chart";widgetError="";renderVersion=0;widgetContainerId="vaultum-live-chart-widget";orderflowData=null;orderflowLoading=!1;orderflowError="";loadedOrderflowKey="";pivotData=null;pivotLoading=!1;pivotError="";loadedPivotKey="";lastPublishedFocus="";constructor(){super({id:"live-chart",title:"Live Chart",kicker:"TradingView + Footprint Proxy",tag:"chart",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{this.publishFocus(),a.innerHTML=this.renderChartBody(),this.bindEvents(a,s),this.ensurePivots(s),this.ensureOrderflow(s),this.mountWidget(a,++this.renderVersion)};return s(),window.addEventListener("vaultum:snapshot-updated",()=>s()),t}renderBody(){return""}renderChartBody(){const t=this.resolvePreset(),a=this.snapshot()?.execution,s=this.isPrimaryPreset(t.key)?[this.renderGuidanceCard("Execution Zone",a?.entryZone??"structure unavailable"),this.renderGuidanceCard("Trim Zone",a?.trimZone??"await resistance cluster"),this.renderGuidanceCard("No Trade",a?.noTradeZone??"avoid mid-value chop"),this.renderGuidanceCard("Invalidation",a?.invalidationLevel??"n/a")]:[this.renderGuidanceCard("Mapped Support",this.pivotData?.mappedSupport?.price!=null?this.pivotData.mappedSupport.price.toFixed(2):"pending"),this.renderGuidanceCard("Mapped Resist",this.pivotData?.mappedResistance?.price!=null?this.pivotData.mappedResistance.price.toFixed(2):"pending"),this.renderGuidanceCard("Signal Map",this.pivotData?.signalMap?.bias??"pending"),this.renderGuidanceCard("Dynamic",this.pivotData?.dynamicLevel!=null?`${this.pivotData.dynamicLevel.toFixed(2)} / ${this.pivotData.dynamicState}`:"pending")];return`
      <div class="vaultum-tv-shell">
        <div class="vaultum-tv-toolbar">
          <div class="vaultum-tv-market-group">
            ${this.availablePresets().map(r=>`
              <button class="vaultum-tv-chip ${r.key===t.key?"is-active":""}" data-chart-preset="${r.key}">
                ${r.label}
              </button>
            `).join("")}
          </div>
          <div class="vaultum-tv-tf-group">
            ${Se.map(r=>`
              <button class="vaultum-tv-chip ${r.key===this.selectedInterval?"is-active":""}" data-chart-interval="${r.key}">
                ${r.key.toUpperCase()}
              </button>
            `).join("")}
          </div>
          <div class="vaultum-tv-view-group">
            <button class="vaultum-tv-chip ${this.selectedMode==="chart"?"is-active":""}" data-chart-mode="chart">Chart</button>
            <button class="vaultum-tv-chip ${this.selectedMode==="footprint"?"is-active":""}" data-chart-mode="footprint">Footprint Proxy</button>
          </div>
        </div>
        <div class="vaultum-tv-meta">
          <div>
            <strong>${this.escape(t.label)}</strong>
            <span>${this.escape(t.subtitle)}</span>
          </div>
          <div class="vaultum-tv-meta-stack">
            <div class="vaultum-tv-symbol">${this.escape(t.tvSymbol)} | ${this.selectedInterval.toUpperCase()}</div>
            <div class="vaultum-tv-feed">${this.escape(this.feedSummary())}</div>
          </div>
        </div>
        <div class="vaultum-tv-stage ${this.selectedMode==="footprint"?"is-footprint":""}">
          <div id="${this.widgetContainerId}" class="vaultum-tv-widget">
            <div class="vaultum-tv-loading">Loading TradingView chart...</div>
          </div>
          ${this.renderChartOverlay()}
        </div>
        <div class="vaultum-tv-guidance">
          ${s.join("")}
        </div>
      </div>
    `}renderChartOverlay(){if(this.selectedMode==="footprint")return this.renderFootprintOverlay();if(this.pivotLoading)return'<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Loading structure map...</strong><span>Building live institutional levels from current candles.</span></div></div>';if(this.pivotError)return`<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Structure map unavailable</strong><span>${this.escape(this.pivotError)}</span></div></div>`;if(!this.pivotData)return"";const t=this.orderflowData?.priceDeltaDivergence??"none",a=this.orderflowData?.divergenceDetail??"delta alignment pending";return`
      <div class="vaultum-tv-overlay is-chart">
        <div class="vaultum-tv-chart-head">
          <div class="vaultum-tv-overlay-card vaultum-tv-overlay-card--wide">
            <div class="vaultum-tv-overlay-label">Structure Map</div>
            <strong>${this.escape(this.pivotData.confluenceSummary)}</strong>
            <div class="vaultum-tv-overlay-metrics">
              ${this.renderOverlayMetric("Pivot",this.pivotData.pivot!=null?this.pivotData.pivot.toFixed(2):"n/a")}
              ${this.renderOverlayMetric("Dynamic",this.pivotData.dynamicLevel!=null?this.pivotData.dynamicLevel.toFixed(2):"n/a")}
              ${this.renderOverlayMetric("Signal",this.pivotData.signalMap.bias)}
              ${this.renderOverlayMetric("Delta",t)}
              ${this.renderOverlayMetric("Mapped S",this.pivotData.mappedSupport?.price!=null?this.pivotData.mappedSupport.price.toFixed(2):"n/a")}
              ${this.renderOverlayMetric("Mapped R",this.pivotData.mappedResistance?.price!=null?this.pivotData.mappedResistance.price.toFixed(2):"n/a")}
            </div>
            <div class="vaultum-tv-detector-row">
              <span class="vaultum-tv-detector ${this.detectorTone(this.pivotData.signalMap.buySignal||this.pivotData.signalMap.bullSweep,this.pivotData.signalMap.sellSignal||this.pivotData.signalMap.bearSweep)}">${this.escape(this.pivotData.signalMap.bias)}</span>
              <span class="vaultum-tv-detector ${this.detectorTone(this.orderflowData?.divergenceBias==="bullish",this.orderflowData?.divergenceBias==="bearish")}">${this.escape(a)}</span>
              ${this.orderflowData?.absorptionSignal&&this.orderflowData.absorptionSignal!=="none"?`<span class="vaultum-tv-detector is-alert">${this.escape(this.orderflowData.absorptionSignal)}</span>`:""}
            </div>
          </div>
        </div>
        ${this.renderStructureRail()}
      </div>
    `}renderFootprintOverlay(){return this.selectedMode!=="footprint"?"":this.orderflowLoading||this.pivotLoading?'<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Loading footprint proxy...</strong><span>Building orderflow ladder and detector state from live candles.</span></div></div>':this.orderflowError?`<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Footprint proxy unavailable</strong><span>${this.escape(this.orderflowError)}</span></div></div>`:this.pivotError?`<div class="vaultum-tv-overlay"><div class="vaultum-tv-overlay-card"><strong>Footprint structure unavailable</strong><span>${this.escape(this.pivotError)}</span></div></div>`:this.orderflowData?`
      <div class="vaultum-tv-overlay">
        <div class="vaultum-tv-overlay-grid">
          <div class="vaultum-tv-overlay-card">
            <div class="vaultum-tv-overlay-label">Orderflow Engine</div>
            <strong>${this.escape(this.orderflowData.summary)}</strong>
            <div class="vaultum-tv-overlay-metrics">
              ${this.renderOverlayMetric("Feed",this.orderflowData.feedQuality)}
              ${this.renderOverlayMetric("Mode",this.orderflowData.mode)}
              ${this.renderOverlayMetric("Pressure",String(this.orderflowData.buySellPressure))}
              ${this.renderOverlayMetric("B/A",this.orderflowData.bidAskPressureRatio.toFixed(2))}
              ${this.renderOverlayMetric("Imb",String(this.orderflowData.quoteImbalance))}
              ${this.renderOverlayMetric("Delta",this.orderflowData.priceDeltaDivergence)}
              ${this.renderOverlayMetric("VWAP",`${this.orderflowData.vwapDeviation>=0?"+":""}${this.orderflowData.vwapDeviation.toFixed(2)}%`)}
            </div>
          </div>
          <div class="vaultum-tv-overlay-card">
            <div class="vaultum-tv-overlay-label">Detectors</div>
            <div class="vaultum-tv-detector-row">
              <span class="vaultum-tv-detector ${this.orderflowData.absorptionSignal==="none"?"":"is-alert"}">${this.escape(this.orderflowData.absorptionSignal)}</span>
              <span class="vaultum-tv-detector ${this.orderflowData.exhaustionSignal==="none"?"":"is-alert"}">${this.escape(this.orderflowData.exhaustionSignal)}</span>
              <span class="vaultum-tv-detector">${this.escape(this.orderflowData.structureState)}</span>
              <span class="vaultum-tv-detector ${this.detectorTone(this.orderflowData.divergenceBias==="bullish",this.orderflowData.divergenceBias==="bearish")}">${this.escape(this.orderflowData.divergenceDetail)}</span>
              ${this.pivotData?.signalMap?.buySignal?'<span class="vaultum-tv-detector is-alert">buy reject</span>':""}
              ${this.pivotData?.signalMap?.sellSignal?'<span class="vaultum-tv-detector is-alert">sell reject</span>':""}
              ${this.pivotData?.signalMap?.bullSweep?'<span class="vaultum-tv-detector is-alert">bull sweep</span>':""}
              ${this.pivotData?.signalMap?.bearSweep?'<span class="vaultum-tv-detector is-alert">bear sweep</span>':""}
            </div>
            <div class="vaultum-tv-overlay-label">Imbalance Ladder</div>
            <div class="vaultum-tv-ladder">
              ${this.orderflowData.imbalanceLadder.slice(0,10).map(t=>`
                <div class="vaultum-tv-ladder-row">
                  <span>${this.escape(t.price.toFixed(2))}</span>
                  <div class="vaultum-tv-ladder-bar">
                    <i class="${t.delta>=0?"is-buy":"is-sell"}" style="width:${Math.max(t.intensity,8)}%"></i>
                  </div>
                  <strong>${this.escape(t.delta.toFixed(2))}</strong>
                </div>
              `).join("")}
            </div>
            ${this.pivotData?`
              <div class="vaultum-tv-overlay-label">Mapped Structure</div>
              <div class="vaultum-tv-ladder">
                ${this.renderLevelRows(this.pivotData.institutionalLevels.slice(0,4))}
              </div>
            `:""}
          </div>
        </div>
        <div class="vaultum-tv-footer-flow">
          ${this.orderflowData.recentBars.slice(-8).map(t=>`
            <div class="vaultum-tv-flow-bar ${t.delta>=0?"is-buy":"is-sell"}">
              <span>${this.escape(t.close.toFixed(2))}</span>
              <strong>${this.escape(t.delta.toFixed(2))}</strong>
            </div>
          `).join("")}
        </div>
      </div>
    `:""}renderStructureRail(){if(!this.pivotData)return"";const t=[],a=(s,r,i,n)=>{r==null||t.some(o=>Math.abs(o.price-r)<=Math.max(Math.abs(r)*8e-4,.15))||t.push({label:s,price:r,detail:i,tone:n})};return a("Mapped R",this.pivotData.mappedResistance?.price,this.pivotData.mappedResistance?`mapped x${this.pivotData.mappedResistance.touches}`:"mapped","resistance"),a("R1",this.pivotData.resistances[0],"classic resistance","resistance"),a("Pivot",this.pivotData.pivot,this.pivotData.structure,"pivot"),a("Dynamic",this.pivotData.dynamicLevel,this.pivotData.dynamicState,"dynamic"),a("S1",this.pivotData.supports[0],"classic support","support"),a("Mapped S",this.pivotData.mappedSupport?.price,this.pivotData.mappedSupport?`mapped x${this.pivotData.mappedSupport.touches}`:"mapped","support"),t.sort((s,r)=>r.price-s.price),`
      <aside class="vaultum-tv-rail">
        <div class="vaultum-tv-rail-card">
          <div class="vaultum-tv-rail-head">
            <div>
              <span>Right Rail</span>
              <strong>Mapped structure</strong>
            </div>
            <em>${this.pivotData.price!=null?`spot ${this.pivotData.price.toFixed(2)}`:"spot pending"}</em>
          </div>
          <div class="vaultum-tv-rail-list">
            ${t.map(s=>`
              <div class="vaultum-tv-rail-row is-${s.tone}">
                <div class="vaultum-tv-rail-tag">${this.escape(s.label)}</div>
                <div class="vaultum-tv-rail-price">${this.escape(s.price.toFixed(2))}</div>
                <div class="vaultum-tv-rail-note">${this.escape(s.detail)}</div>
              </div>
            `).join("")}
          </div>
        </div>
      </aside>
    `}renderLevelRows(t){return t.length?t.map(a=>`
      <div class="vaultum-tv-ladder-row">
        <span>${this.escape(a.price.toFixed(2))}</span>
        <div class="vaultum-tv-ladder-bar">
          <i class="${a.role==="support"?"is-buy":"is-sell"}" style="width:${Math.max(a.power*18,12)}%"></i>
        </div>
        <strong>${this.escape(`${a.role[0]?.toUpperCase()??"L"} x${a.touches}`)}</strong>
      </div>
    `).join(""):'<div class="vaultum-tv-ladder-row"><span>n/a</span><div class="vaultum-tv-ladder-bar"><i class="is-buy" style="width:8%"></i></div><strong>waiting</strong></div>'}renderGuidanceCard(t,a){return`
      <div class="vaultum-tv-guidance-card">
        <span>${this.escape(t)}</span>
        <strong>${this.escape(a)}</strong>
      </div>
    `}renderOverlayMetric(t,a){return`
      <div class="vaultum-tv-overlay-metric">
        <span>${this.escape(t)}</span>
        <strong>${this.escape(a)}</strong>
      </div>
    `}bindEvents(t,a){t.querySelectorAll("[data-chart-preset]").forEach(s=>{s.addEventListener("click",()=>{const r=s.dataset.chartPreset;!r||r===this.selectedPresetKey||(this.selectedPresetKey=r,this.widgetError="",this.loadedOrderflowKey="",this.loadedPivotKey="",a())})}),t.querySelectorAll("[data-chart-interval]").forEach(s=>{s.addEventListener("click",()=>{const r=s.dataset.chartInterval;!r||r===this.selectedInterval||(this.selectedInterval=r,this.widgetError="",this.loadedOrderflowKey="",this.loadedPivotKey="",a())})}),t.querySelectorAll("[data-chart-mode]").forEach(s=>{s.addEventListener("click",()=>{const r=s.dataset.chartMode;!r||r===this.selectedMode||(this.selectedMode=r,a())})})}async mountWidget(t,a){const s=t.querySelector(`#${this.widgetContainerId}`);if(!s)return;const r=this.resolvePreset(),i=Se.find(n=>n.key===this.selectedInterval)?.tvInterval??"60";s.innerHTML='<div class="vaultum-tv-loading">Loading TradingView chart...</div>';try{if(await _a(),a!==this.renderVersion)return;this.widgetError="",s.innerHTML="",Fa({containerId:this.widgetContainerId,symbol:r.tvSymbol,interval:i,toolbarBg:"#101010",overrides:{"mainSeriesProperties.candleStyle.upColor":"#96f2b8","mainSeriesProperties.candleStyle.downColor":"#ff9b9b","mainSeriesProperties.candleStyle.borderUpColor":"#96f2b8","mainSeriesProperties.candleStyle.borderDownColor":"#ff9b9b","mainSeriesProperties.candleStyle.wickUpColor":"#96f2b8","mainSeriesProperties.candleStyle.wickDownColor":"#ff9b9b","paneProperties.background":"#101010","paneProperties.backgroundType":"solid","paneProperties.vertGridProperties.color":"rgba(255,255,255,0.06)","paneProperties.horzGridProperties.color":"rgba(255,255,255,0.06)","scalesProperties.textColor":"#8c8c8c"}})}catch{if(a!==this.renderVersion)return;this.widgetError=`TradingView failed to load for ${r.label}.`,s.innerHTML=`
        <div class="vaultum-callout">
          <strong>Chart unavailable</strong>
          <span>TradingView script did not initialize for ${this.escape(r.tvSymbol)}.</span>
        </div>
      `}}async ensureOrderflow(t){const a=`${this.resolvePreset().key}:${this.orderflowTimeframe()}`;if(!this.orderflowLoading&&!(this.loadedOrderflowKey===a&&(this.orderflowData||this.orderflowError))){this.orderflowLoading=!0,this.orderflowError="",t();try{this.orderflowData=await Ca(this.resolvePreset().key,this.orderflowTimeframe()),this.loadedOrderflowKey=a,this.orderflowData||(this.orderflowError=`Orderflow engine did not return data for ${this.resolvePreset().key}.`)}catch(s){this.orderflowData=null,this.loadedOrderflowKey=a,this.orderflowError=s instanceof Error?s.message:"Unable to load orderflow engine."}this.orderflowLoading=!1,t()}}async ensurePivots(t){const a=`${this.resolvePreset().key}:${this.structureTimeframe()}`;if(!this.pivotLoading&&!(this.loadedPivotKey===a&&(this.pivotData||this.pivotError))){this.pivotLoading=!0,this.pivotError="",t();try{this.pivotData=await Ea(this.resolvePreset().key,this.structureTimeframe()),this.loadedPivotKey=a,this.pivotData||(this.pivotError=`Pivot engine did not return data for ${this.resolvePreset().key}.`)}catch(s){this.pivotData=null,this.loadedPivotKey=a,this.pivotError=s instanceof Error?s.message:"Unable to load pivot map."}this.pivotLoading=!1,t()}}orderflowTimeframe(){return this.selectedInterval==="15m"?"15m":this.selectedInterval==="30m"?"30m":this.selectedInterval==="4h"?"4h":"1h"}structureTimeframe(){return this.selectedInterval==="1d"?"1d":"1h"}feedSummary(){return this.pivotLoading?"Building structure map...":this.pivotError&&!this.orderflowData?"Pivot engine unavailable":this.orderflowLoading?"Checking feed quality...":this.orderflowError?"Orderflow engine unavailable":!this.orderflowData&&this.pivotData?this.pivotData.sourceLabel??"Live structure map active":this.orderflowData?`Feed ${this.orderflowData.feedQuality} | ${this.orderflowData.mode} | ${this.orderflowData.sourceSymbol}`:"Live proxy feed pending"}availablePresets(){const a=[this.resolvePrimaryPresetKey(),"DXY","EURUSD","GBPUSD","USDJPY","SPX","NDX","VIX","WTI","BTCUSD"];return[...new Set(a)].map(s=>B[s]).filter(s=>!!s)}resolvePreset(){const t=B[this.resolvePrimaryPresetKey()]??B.XAUUSD;return(!this.selectedPresetKey||!B[this.selectedPresetKey])&&(this.selectedPresetKey=t.key),B[this.selectedPresetKey]??t}resolvePrimaryPresetKey(){const t=this.snapshot()?.primaryAsset?.toUpperCase()??"XAUUSD";return B[t]?t:"XAUUSD"}isPrimaryPreset(t){return t===this.resolvePrimaryPresetKey()}publishFocus(){const t=this.resolvePreset(),a=`${t.key}:${this.selectedInterval}`;a!==this.lastPublishedFocus&&(this.lastPublishedFocus=a,Lt({market:t.key,timeframe:this.selectedInterval}))}detectorTone(t,a){return t?"is-bullish":a?"is-bearish":""}snapshot(){return window.__vaultumSnapshot??null}escape(t){return t.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}}async function Ra(e,t){return u("scenario","get-monte-carlo",{market:e,timeframe:t})}function C(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function H(e){return e>=60?"bullish":e<=40?"bearish":"neutral"}class Ua extends D{marketFocus=J();data=null;loading=!1;error="";loadedKey="";constructor(){super({id:"monte-carlo",title:"Monte Carlo",kicker:"Scenario Engine",tag:"scenario",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderBody(),this.ensureData(s)};return Q(r=>{this.marketFocus=r,s()}),s(),t}renderBody(){const t=`${this.marketFocus.market} | ${this.marketFocus.timeframe.toUpperCase()}`;return this.loading&&!this.data?`<div class="vaultum-callout"><strong>Running scenario engine</strong><span>Building Monte Carlo distribution for ${C(t)}.</span></div>`:this.error&&!this.data?`<div class="vaultum-callout"><strong>Scenario engine unavailable</strong><span>${C(this.error)}</span></div>`:this.data?`
      <div class="vaultum-mc-shell">
        <div class="vaultum-callout">
          <strong>${C(this.data.summary)}</strong>
          <span>${C(this.data.sourceLabel)}</span>
        </div>
        <div class="vaultum-mc-grid">
          ${this.metricCard("Bias",this.data.pathBias,H(this.data.targetHitProbability))}
          ${this.metricCard("Target Hit",`${this.data.targetHitProbability.toFixed(1)}%`,H(this.data.targetHitProbability))}
          ${this.metricCard("Invalidation",`${this.data.invalidationProbability.toFixed(1)}%`,H(100-this.data.invalidationProbability))}
          ${this.metricCard("Support Hold",`${this.data.supportHoldProbability.toFixed(1)}%`,H(this.data.supportHoldProbability))}
          ${this.metricCard("Expected Close",this.data.expectedClose.toFixed(2),this.data.expectedMovePct>=0?"bullish":"bearish")}
          ${this.metricCard("Expected Move",`${this.data.expectedMovePct>=0?"+":""}${this.data.expectedMovePct.toFixed(2)}%`,this.data.expectedMovePct>=0?"bullish":"bearish")}
        </div>
        <div class="vaultum-mc-bands">
          ${["p10","p25","p50","p75","p90"].map(a=>`
            <div class="vaultum-mc-band">
              <span>${C(a.toUpperCase())}</span>
              <strong>${C(this.data.scenarioBands[a].toFixed(2))}</strong>
            </div>
          `).join("")}
        </div>
        <div class="vaultum-mc-scenarios">
          ${this.data.scenarioMap.map(a=>`
            <div class="vaultum-mc-row">
              <div>
                <strong>${C(a.name)}</strong>
                <span>${C(a.detail)}</span>
              </div>
              <em>${C(a.probability.toFixed(1))}%</em>
            </div>
          `).join("")}
        </div>
        <div class="vaultum-mc-footer">
          <span>${C(`${this.data.market} over ${this.data.horizonLabel} with ${this.data.simulations} simulations.`)}</span>
          <strong>${C(`drivers: ${this.data.drivers.slice(0,4).join(" | ")}`)}</strong>
        </div>
      </div>
    `:'<div class="vaultum-callout"><strong>Waiting for scenario data</strong><span>Monte Carlo path probabilities will appear here.</span></div>'}metricCard(t,a,s){return`
      <div class="vaultum-metric ${s}">
        <span>${C(t)}</span>
        <strong>${C(a)}</strong>
      </div>
    `}async ensureData(t){const a=`${this.marketFocus.market}:${this.marketFocus.timeframe}`;if(!this.loading&&!(this.loadedKey===a&&(this.data||this.error))){this.loading=!0,this.error="",t();try{this.data=await Ra(this.marketFocus.market,this.marketFocus.timeframe),this.loadedKey=a,this.data||(this.error=`No scenario data returned for ${this.marketFocus.market}.`)}catch(s){this.data=null,this.loadedKey=a,this.error=s instanceof Error?s.message:"Monte Carlo scenario request failed."}this.loading=!1,t()}}}async function Ia(e){try{const t=new URL(K("youtube/live"),window.location.origin);t.searchParams.set("channel",e);const a=await fetch(t.toString(),{headers:{"Cache-Control":"no-store"}});return a.ok?await a.json():null}catch{return null}}function Na(e){const t=new URL(K("youtube/embed"),window.location.origin);return t.searchParams.set("videoId",e),t.searchParams.set("autoplay","0"),t.searchParams.set("mute","0"),t.toString()}const M=[{id:"bloomberg",label:"Bloomberg TV",handle:"@BloombergTelevision",note:"macro, rates, equities"},{id:"yahoo",label:"Yahoo Finance",handle:"@YahooFinance",note:"broad market desk"},{id:"schwab",label:"Schwab Network",handle:"@SchwabNetwork",note:"U.S. trading desk"},{id:"cnbctv18",label:"CNBC TV18",handle:"@CNBCTV18",note:"global market handoff"},{id:"kitco",label:"Kitco News",handle:"@KitcoNEWS",note:"gold and metals context"}];function X(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}class Aa extends D{status=new Map;selectedChannelId=M[0].id;loading=!1;loaded=!1;constructor(){super({id:"finance-streams",title:"Finance Streams",kicker:"Live Desk TV",tag:"media",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderBody(),this.bindEvents(a,s),this.ensureChannels(s)};return s(),window.setInterval(()=>{this.ensureChannels(s,!0)},3e5),t}renderBody(){const t=M.filter(n=>this.status.get(n.id)?.videoId),a=M.find(n=>n.id===this.selectedChannelId)??M[0],s=this.status.get(a.id)??null,r=s?.videoId?s:t.length?this.status.get(t[0].id)??null:null,i=s?.videoId?a:t[0]??a;return`
      <div class="vaultum-stream-shell">
        <div class="vaultum-stream-player">
          ${this.loading&&!this.loaded?'<div class="vaultum-callout"><strong>Checking live channels</strong><span>Refreshing the current finance stream lineup.</span></div>':""}
          ${r?.videoId?`
            <iframe
              class="vaultum-stream-iframe"
              src="${X(Na(r.videoId))}"
              title="${X(`${i.label} live stream`)}"
              allow="autoplay; encrypted-media; picture-in-picture"
              referrerpolicy="strict-origin-when-cross-origin"
              allowfullscreen
            ></iframe>
          `:`
            <div class="vaultum-callout">
              <strong>No confirmed live stream right now</strong>
              <span>Vaultum is polling the curated finance desk channels and will surface whichever one is live first.</span>
            </div>
          `}
        </div>
        <div class="vaultum-stream-list">
          ${M.map(n=>{const o=!!this.status.get(n.id)?.videoId;return`
              <button class="vaultum-stream-card ${n.id===i.id?"is-active":""}" data-channel-id="${X(n.id)}">
                <div>
                  <strong>${X(n.label)}</strong>
                  <span>${X(n.note)}</span>
                </div>
                <em class="${o?"is-live":"is-off"}">${o?"live":"offline"}</em>
              </button>
            `}).join("")}
        </div>
      </div>
    `}bindEvents(t,a){t.querySelectorAll("[data-channel-id]").forEach(s=>{s.addEventListener("click",()=>{const r=s.dataset.channelId;!r||r===this.selectedChannelId||(this.selectedChannelId=r,a())})})}async ensureChannels(t,a=!1){if(this.loading||this.loaded&&!a)return;this.loading=!0,t(),(await Promise.all(M.map(async i=>({id:i.id,data:await Ia(i.handle)})))).forEach(i=>this.status.set(i.id,i.data));const r=M.find(i=>this.status.get(i.id)?.videoId);r&&!this.status.get(this.selectedChannelId)?.videoId&&(this.selectedChannelId=r.id),this.loaded=!0,this.loading=!1,t()}}const U={forex:{key:"forex",label:"FX",description:"Major FX pairs and dollar filters.",tabs:[{title:"Majors",symbols:[{s:"FX:EURUSD",d:"EURUSD"},{s:"FX:GBPUSD",d:"GBPUSD"},{s:"FX:USDJPY",d:"USDJPY"},{s:"FX:USDCHF",d:"USDCHF"},{s:"FX:AUDUSD",d:"AUDUSD"},{s:"TVC:DXY",d:"DXY"}]},{title:"JPY / Carry",symbols:[{s:"FX:USDJPY",d:"USDJPY"},{s:"FX:EURJPY",d:"EURJPY"},{s:"FX:GBPJPY",d:"GBPJPY"},{s:"FX:AUDJPY",d:"AUDJPY"},{s:"CBOE:VIX",d:"VIX"},{s:"TVC:US10Y",d:"US10Y"}]}]},futures:{key:"futures",label:"Futures",description:"Core macro futures and commodity contracts.",tabs:[{title:"Macro",symbols:[{s:"COMEX:GC1!",d:"Gold"},{s:"NYMEX:CL1!",d:"WTI"},{s:"CBOT:ZN1!",d:"10Y Note"},{s:"CME_MINI:ES1!",d:"ES"},{s:"CME_MINI:NQ1!",d:"NQ"},{s:"TVC:DXY",d:"DXY"}]},{title:"Metals / Energy",symbols:[{s:"COMEX:GC1!",d:"Gold"},{s:"COMEX:SI1!",d:"Silver"},{s:"COMEX:HG1!",d:"Copper"},{s:"NYMEX:CL1!",d:"WTI"},{s:"NYMEX:NG1!",d:"NatGas"},{s:"ICEUS:B1!",d:"Brent"}]}]},stocks:{key:"stocks",label:"Stocks",description:"Index leaders, breadth proxies, and rates filters.",tabs:[{title:"Indices",symbols:[{s:"SP:SPX",d:"SPX"},{s:"NASDAQ:NDX",d:"NDX"},{s:"AMEX:SPY",d:"SPY"},{s:"NASDAQ:QQQ",d:"QQQ"},{s:"CBOE:VIX",d:"VIX"},{s:"TVC:US10Y",d:"US10Y"}]},{title:"Risk / Defense",symbols:[{s:"AMEX:XLK",d:"XLK"},{s:"AMEX:XLF",d:"XLF"},{s:"AMEX:XLE",d:"XLE"},{s:"AMEX:XLP",d:"XLP"},{s:"AMEX:HYG",d:"HYG"},{s:"NASDAQ:TLT",d:"TLT"}]}]}};function G(e){return e.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}function W(e){return/^(EUR|GBP|USD|JPY|AUD|NZD|CAD|CHF)/.test(e)?U.forex:/(WTI|XAU|GOLD|BTC)/.test(e)?U.futures:/(SPX|NDX|VIX)/.test(e)?U.stocks:U.futures}class Ba extends D{marketFocus=J();selectedPresetKey=W(this.marketFocus.market).key;containerId="vaultum-screener-widget";renderVersion=0;constructor(){super({id:"tv-screener",title:"TradingView Screener",kicker:"Watchlist Matrix",tag:"screener",tone:"neutral"})}render(){const t=document.createElement("section");t.className=`vaultum-panel ${this.definition.tone??"neutral"}`,t.dataset.panelId=this.definition.id,t.innerHTML=`
      <div class="vaultum-panel-header">
        <div>
          <div class="vaultum-panel-kicker">${this.definition.kicker}</div>
          <h2>${this.definition.title}</h2>
        </div>
        <div class="vaultum-panel-tag">${this.definition.tag}</div>
      </div>
      <div class="vaultum-panel-body"></div>
    `;const a=t.querySelector(".vaultum-panel-body"),s=()=>{a.innerHTML=this.renderBody(),this.bindEvents(a,s),this.mountWidget(a,++this.renderVersion)};return Q(r=>{this.marketFocus=r,this.selectedPresetKey=W(r.market).key,s()}),s(),t}renderBody(){const t=U[this.selectedPresetKey]??W(this.marketFocus.market);return`
      <div class="vaultum-screener-shell">
        <div class="vaultum-screener-toolbar">
          ${Object.values(U).map(a=>`
            <button class="vaultum-tv-chip ${a.key===t.key?"is-active":""}" data-screener-preset="${G(a.key)}">
              ${G(a.label)}
            </button>
          `).join("")}
        </div>
        <div class="vaultum-screener-meta">
          <strong>${G(t.description)}</strong>
          <span>Chart focus: ${G(this.marketFocus.market)} | ${G(this.marketFocus.timeframe.toUpperCase())}</span>
        </div>
        <div id="${this.containerId}" class="vaultum-screener-stage">
          <div class="vaultum-tv-loading">Loading TradingView screener...</div>
        </div>
      </div>
    `}bindEvents(t,a){t.querySelectorAll("[data-screener-preset]").forEach(s=>{s.addEventListener("click",()=>{const r=s.dataset.screenerPreset;!r||r===this.selectedPresetKey||(this.selectedPresetKey=r,a())})})}mountWidget(t,a){const s=t.querySelector(`#${this.containerId}`);if(!s)return;const r=U[this.selectedPresetKey]??W(this.marketFocus.market);queueMicrotask(()=>{a===this.renderVersion&&Ta(s,{height:520,colorTheme:"dark",tabs:r.tabs})})}}const Xa=[new Ma,new Tt,new Et,new Ut,new Ba,new wa,new Ua,new Mt,new It,new Nt,new At,new jt,new Yt,new qt,new Ht,new Wt,new Kt,new ma,new va,new ga,new ba,new fa,new ya,new Sa,new Aa,new xa];function $e(){return window.matchMedia("(display-mode: standalone)").matches||!!navigator.standalone}function Ga(e){if(!e)return;let t=null;const a=()=>{e.hidden=!1,e.disabled=!0,e.textContent="Installed"},s=()=>{e.hidden=!0,e.disabled=!1,e.textContent="Install App"};if($e()){a();return}s(),window.addEventListener("beforeinstallprompt",r=>{r.preventDefault(),t=r,e.hidden=!1,e.disabled=!1,e.textContent="Install App"}),window.addEventListener("appinstalled",()=>{t=null,a()}),e.addEventListener("click",async()=>{if(!t){e.hidden=!1,e.disabled=!0,e.textContent="Use browser install",window.setTimeout(()=>{$e()||(e.disabled=!1,e.textContent="Install App")},1800);return}await t.prompt(),await t.userChoice.catch(()=>null),t=null,s()})}function Oa(){"serviceWorker"in navigator&&window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js").catch(()=>{})})}class Va{root;context;dataLoader;layout;refreshScheduler;searchManager;commandPalette;constructor(t){const a=document.getElementById(t);if(!a)throw new Error(`Missing root container: ${t}`);this.root=a,this.context=Me(),this.layout=new bt(this.context),this.dataLoader=new pt(this.context),this.refreshScheduler=new ft(this.context,this.dataLoader),this.searchManager=new yt(this.context),this.commandPalette=new wt(this.context,this.searchManager)}async init(){this.root.innerHTML="",this.root.appendChild(this.renderShell()),this.layout.mount(document.getElementById("vaultum-panels")),Xa.forEach(t=>this.layout.register(t)),this.layout.register(new St(this.context)),this.searchManager.mount(document.getElementById("vaultum-search-results")),this.commandPalette.mount(document.getElementById("vaultum-command-palette")),Ga(document.getElementById("vaultum-install-app")),await this.dataLoader.bootstrap(),this.layout.render(),this.refreshScheduler.start()}renderShell(){const t=document.createElement("div");return t.className="vaultum-shell",t.innerHTML=`
      <header class="vaultum-header">
        <div class="vaultum-header-brand">
          <img class="vaultum-brand-mark" src="/brand/vaultum-lotus.svg" alt="Vaultum lotus mark" />
          <div>
            <div class="vaultum-eyebrow">VAULTUM TERMINAL</div>
            <h1>Institutional Market Intelligence Terminal</h1>
            <p>Macro regime, structure, positioning, execution, and catalyst context arranged in one guided workflow so the desk sees the same story in the same order.</p>
          </div>
        </div>
        <div class="vaultum-header-actions">
          <button id="vaultum-install-app" class="vaultum-btn" hidden>Install App</button>
          <button id="vaultum-refresh" class="vaultum-btn">Refresh Snapshot</button>
          <button id="vaultum-command-open" class="vaultum-btn vaultum-btn-primary">Command Palette</button>
        </div>
      </header>
      <section class="vaultum-topbar">
        <div class="vaultum-topbar-card"><span class="label">Intent</span><strong id="vaultum-intent">macro regime</strong></div>
        <div class="vaultum-topbar-card"><span class="label">Primary Asset</span><strong id="vaultum-primary-asset">XAUUSD</strong></div>
        <div class="vaultum-topbar-card"><span class="label">Runtime</span><strong id="vaultum-update-mode">rpc-backed terminal</strong></div>
        <div class="vaultum-topbar-card"><span class="label">Freshness</span><strong id="vaultum-freshness">booting</strong></div>
      </section>
      <section class="vaultum-flow">
        <div class="vaultum-flow-card">
          <span>1. Read The Tape</span>
          <strong>Chart + Brief + Market Radar</strong>
          <p>See the active asset, the desk note, and whether broad tape is constructive or fragile before doing anything else.</p>
        </div>
        <div class="vaultum-flow-card">
          <span>2. Read The Drivers</span>
          <strong>Macro + FX + Commodities</strong>
          <p>Find the pressure source before trusting the move.</p>
        </div>
        <div class="vaultum-flow-card">
          <span>3. Read The Structure</span>
          <strong>Gamma + COT + Liquidity</strong>
          <p>Decide whether positioning will pin, squeeze, or accelerate price.</p>
        </div>
        <div class="vaultum-flow-card">
          <span>4. Ask For A Decision</span>
          <strong>AI + Screener</strong>
          <p>Use the AI panel and the TradingView screener after the context is loaded, not before.</p>
        </div>
      </section>
      <section class="vaultum-search">
        <input id="vaultum-search" type="search" placeholder="Search assets, FX pairs, regimes, countries, options walls, or signals" />
        <div id="vaultum-search-results" class="vaultum-search-results"></div>
      </section>
      <main id="vaultum-panels" class="vaultum-panels"></main>
      <div id="vaultum-command-palette"></div>
    `,t.querySelector("#vaultum-refresh")?.addEventListener("click",()=>{this.dataLoader.refreshAll()}),t.querySelector("#vaultum-command-open")?.addEventListener("click",()=>{this.commandPalette.toggle()}),t.querySelector("#vaultum-search")?.addEventListener("input",a=>{const s=a.target.value;this.searchManager.updateQuery(s)}),t}}const ja=new Va("app");Oa();ja.init();
