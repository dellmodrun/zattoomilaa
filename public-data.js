(() => {
  const originalFetch = window.fetch.bind(window);
  const rpcUrl = 'https://api.mainnet-beta.solana.com';
  const dexBase = 'https://api.dexscreener.com/token-pairs/v1/solana/';
  const geckoBase = 'https://api.geckoterminal.com/api/v2/networks/solana/pools/';
  const zcashStatsUrl = 'https://api.blockchair.com/zcash/stats';
  const cache = new Map();

  const configPromise = originalFetch(`/token-config.json?v=${Date.now()}`, { cache: 'no-store' })
    .then(response => response.ok ? response.json() : { mint: null })
    .catch(() => ({ mint: null }));

  function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }

  async function cached(key, ttl, loader) {
    const existing = cache.get(key);
    if (existing && Date.now() - existing.time < ttl) return existing.value;
    const pending = Promise.resolve().then(loader).catch(error => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, { time: Date.now(), value: pending });
    return pending;
  }

  async function rpc(method, params) {
    const response = await originalFetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const payload = await response.json();
    if (!response.ok || payload.error) throw new Error(payload.error?.message || `Solana RPC ${response.status}`);
    return payload.result;
  }

  async function tokenSnapshot(mint) {
    return cached(`snapshot:${mint}`, 12_000, async () => {
      const [supplyResult, pairsResult] = await Promise.all([
        rpc('getTokenSupply', [mint, { commitment: 'confirmed' }]),
        originalFetch(dexBase + encodeURIComponent(mint)).then(async response => {
          if (!response.ok) throw new Error(`DEX Screener ${response.status}`);
          return response.json();
        }),
      ]);
      const pairs = Array.isArray(pairsResult) ? pairsResult : [];
      const pair = pairs
        .filter(item => Number.isFinite(Number(item?.priceUsd)))
        .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0] || null;
      const supply = Number(supplyResult?.value?.uiAmountString ?? supplyResult?.value?.uiAmount);
      if (!Number.isFinite(supply)) throw new Error('Token supply is unavailable');
      const price = Number(pair?.priceUsd);
      return {
        mint,
        price: Number.isFinite(price) ? price : 0,
        supply,
        decimals: Number(supplyResult?.value?.decimals || 0),
        symbol: pair?.baseToken?.address === mint ? pair.baseToken.symbol : pair?.quoteToken?.symbol || null,
        name: pair?.baseToken?.address === mint ? pair.baseToken.name : pair?.quoteToken?.name || null,
        slot: supplyResult?.context?.slot ?? 'confirmed',
        liquidity: pairs.reduce((sum, item) => sum + Number(item?.liquidity?.usd || 0), 0),
        volume24h: pairs.reduce((sum, item) => sum + Number(item?.volume?.h24 || 0), 0),
        trades24h: pairs.reduce((sum, item) => sum + Number(item?.txns?.h24?.buys || 0) + Number(item?.txns?.h24?.sells || 0), 0),
        source: 'Solana RPC + DEX Screener',
        pairAddress: pair?.pairAddress || null,
      };
    });
  }

  async function poolTrades(snapshot, mint) {
    if (!snapshot.pairAddress) return [];
    return cached(`trades:${snapshot.pairAddress}`, 12_000, async () => {
      const response = await originalFetch(`${geckoBase}${encodeURIComponent(snapshot.pairAddress)}/trades`);
      if (!response.ok) throw new Error(`GeckoTerminal trades ${response.status}`);
      const payload = await response.json();
      return (payload?.data || []).map(row => {
        const item = row?.attributes || {};
        const fromIsMint = item.from_token_address === mint;
        const toIsMint = item.to_token_address === mint;
        return {
          txHash: item.tx_hash,
          blockUnixTime: Math.floor(new Date(item.block_timestamp).getTime() / 1000),
          side: item.kind,
          owner: item.tx_from_address,
          from: {
            address: item.from_token_address,
            uiAmount: Number(item.from_token_amount),
            price: Number(item.price_from_in_usd),
          },
          to: {
            address: item.to_token_address,
            uiAmount: Number(item.to_token_amount),
            price: Number(item.price_to_in_usd),
          },
          tokenAmount: fromIsMint ? Number(item.from_token_amount) : toIsMint ? Number(item.to_token_amount) : 0,
          volumeUsd: Number(item.volume_in_usd),
        };
      }).filter(item => item.txHash && item.tokenAmount > 0);
    });
  }

  async function poolCandles(snapshot) {
    if (!snapshot.pairAddress) return [];
    return cached(`candles:${snapshot.pairAddress}`, 45_000, async () => {
      const query = '?aggregate=1&limit=60&currency=usd&token=base';
      const response = await originalFetch(`${geckoBase}${encodeURIComponent(snapshot.pairAddress)}/ohlcv/minute${query}`);
      if (!response.ok) throw new Error(`GeckoTerminal OHLCV ${response.status}`);
      const payload = await response.json();
      return (payload?.data?.attributes?.ohlcv_list || []).map(row => ({
        unixTime: Number(row[0]),
        o: Number(row[1]),
        h: Number(row[2]),
        l: Number(row[3]),
        c: Number(row[4]),
        v: Number(row[5]),
      }));
    });
  }

  async function handlePublicApi(url) {
    const mint = url.searchParams.get('mint');
    if (url.pathname === '/api/public/zcash') {
      const stats = await cached('zcash', 60_000, async () => {
        const response = await originalFetch(zcashStatsUrl);
        if (!response.ok) throw new Error(`Zcash stats ${response.status}`);
        return response.json();
      });
      const data = stats?.data || {};
      return json({
        height: data.best_block_height ?? data.blocks ?? null,
        hash: data.best_block_hash ?? null,
        time: data.best_block_time ?? null,
        source: 'Blockchair Zcash stats',
      });
    }
    if (!mint) return json({ error: 'mint is required' }, 400);
    const snapshot = await tokenSnapshot(mint);
    if (url.pathname === '/api/public/price') return json(snapshot);
    if (url.pathname === '/api/public/birdeye') {
      const endpoint = url.searchParams.get('endpoint');
      if (endpoint === 'overview') {
        return json({ data: {
          price: snapshot.price,
          circulatingSupply: snapshot.supply,
          totalSupply: snapshot.supply,
          decimals: snapshot.decimals,
          symbol: snapshot.symbol,
          name: snapshot.name,
          holder: null,
          liquidity: snapshot.liquidity,
          v24hUSD: snapshot.volume24h,
          trade24h: snapshot.trades24h,
        } });
      }
      if (endpoint === 'txs') {
        return json({ data: { items: await poolTrades(snapshot, mint) } });
      }
      if (endpoint === 'ohlcv') {
        return json({ data: { items: await poolCandles(snapshot) } });
      }
      if (endpoint === 'holders') {
        return json({ data: { items: [] } });
      }
      return json({ error: 'unsupported endpoint' }, 400);
    }
    return null;
  }

  window.fetch = async (input, init = {}) => {
    const raw = typeof input === 'string' ? input : input?.url || String(input);
    const method = String(init.method || input?.method || 'GET').toUpperCase();
    if (method !== 'GET') return originalFetch(input, init);
    if (raw.includes('xqpxbvcguvsxqhbqehap.supabase.co/rest/v1/site_config')) {
      const config = await configPromise;
      return json([{ mint: config?.mint || null, updated_at: new Date().toISOString() }]);
    }
    const url = new URL(raw, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith('/api/public/')) {
      try {
        return await handlePublicApi(url);
      } catch (error) {
        return json({ error: error?.message || 'Public data unavailable' }, 502);
      }
    }
    return originalFetch(input, init);
  };
})();
