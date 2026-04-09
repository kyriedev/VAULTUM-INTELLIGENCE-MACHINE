import assert from 'node:assert/strict';

import {
  parseFinvizForexPerformance,
  parseFinvizInsiderTable,
  parseFinvizNewsTables,
  parseFinvizQuotePage,
  parseFinvizScreenerTable,
} from '../server/vaultum/_shared/finviz.ts';

export function runFinvizParserTests(): void {
  {
    const html = `
      <section id="news">
        <table class="styled-table-new">
          <tr><td></td><td>Apr-03-26 08:00AM</td><td><a href="/news.ashx?id=1">Stocks rally on softer dollar</a></td></tr>
        </table>
        <table class="styled-table-new">
          <tr><td></td><td>Apr-03-26 09:15AM</td><td><a href="https://example.com/blog">Macro blog outlook</a></td></tr>
        </table>
      </section>
    `;
    const parsed = parseFinvizNewsTables(html);
    assert.equal(parsed.news[0]?.title, 'Stocks rally on softer dollar');
    assert.equal(parsed.blogs[0]?.source, 'example.com');
  }

  {
    const html = `
      <h2 class="quote-header_ticker-wrapper_company">Apple Inc.</h2>
      <div class="quote-links">
        <a>Technology</a>
        <a>Consumer Electronics</a>
        <a>USA</a>
        <a>NASDAQ</a>
      </div>
      <table class="snapshot-table2">
        <tr>
          <td>Market Cap</td><td>3.0T</td>
          <td>Perf Week</td><td>+2.1%</td>
          <td>RSI (14)</td><td>58.4</td>
        </tr>
      </table>
      <td class="fullview-profile">Maker of iPhones and Macs.</td>
      <table class="fullview-news-outer">
        <tr><td>Apr-03-26 09:30AM</td><td><a href="https://news.example/aapl">Apple adds AI features</a><span>(ExampleWire)</span></td></tr>
      </table>
    `;
    const parsed = parseFinvizQuotePage(html, 'AAPL');
    assert.equal(parsed.company, 'Apple Inc.');
    assert.equal(parsed.fundamentals['Market Cap'], '3.0T');
    assert.equal(parsed.news[0]?.source, 'ExampleWire');
  }

  {
    const html = `
      <table id="insider-table">
        <tr>
          <th>Ticker</th><th>Company</th><th>Relationship</th><th>Date</th><th>Transaction</th>
          <th>Cost</th><th>#Shares</th><th>Value ($)</th><th>#Shares Total</th><th>SEC Form 4</th>
        </tr>
        <tr>
          <td><a href="/quote.ashx?t=AAPL">AAPL</a></td><td>Apple Inc.</td><td>Director</td><td>Apr 03</td><td>Buy</td>
          <td>182.00</td><td>5,000</td><td>910,000</td><td>25,000</td><td><a href="https://sec.example/form4">Form</a></td>
        </tr>
      </table>
    `;
    const parsed = parseFinvizInsiderTable(html);
    assert.equal(parsed[0]?.ticker, 'AAPL');
    assert.equal(parsed[0]?.secForm4Url, 'https://sec.example/form4');
  }

  {
    const html = `
      <table class="groups_table">
        <tr><th></th><th>Pair</th><th>Price</th><th>5m</th><th>1h</th><th>Day</th><th>Week</th><th>Month</th><th>Quarter</th><th>Half</th><th>YTD</th><th>Year</th></tr>
        <tr><td>1</td><td>EURUSD</td><td>1.0834</td><td>0.04%</td><td>0.10%</td><td>0.22%</td><td>0.58%</td><td>1.10%</td><td>2.00%</td><td>3.10%</td><td>1.50%</td><td>5.30%</td></tr>
      </table>
    `;
    const parsed = parseFinvizForexPerformance(html);
    assert.equal(parsed[0]?.pair, 'EURUSD');
    assert.equal(parsed[0]?.perfDay, 0.22);
  }

  {
    const html = `
      <table class="screener_table">
        <tr><th>No.</th><th>Ticker</th><th>Company</th><th>Sector</th><th>Industry</th><th>Country</th><th>Market Cap</th><th>P/E</th><th>Price</th><th>Change</th><th>Volume</th></tr>
        <tr><td>1</td><td>AAPL</td><td>Apple Inc.</td><td>Technology</td><td>Consumer Electronics</td><td>USA</td><td>3.0T</td><td>29.4</td><td>182.10</td><td>1.82%</td><td>55000000</td></tr>
      </table>
    `;
    const parsed = parseFinvizScreenerTable(html);
    assert.equal(parsed[0]?.ticker, 'AAPL');
    assert.equal(parsed[0]?.change, 1.82);
    assert.equal(parsed[0]?.volume, 55_000_000);
  }
}
