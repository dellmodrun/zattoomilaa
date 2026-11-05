import { writeFile } from 'node:fs/promises';

const mint = '2Hf57RjLFME8VZVfFsGxtSz2rratouuDpTQjrCtipump';
const pairsUrl = `https://api.dexscreener.com/token-pairs/v1/solana/${mint}`;
const pairs = await fetch(pairsUrl).then((response) => {
  if (!response.ok) throw new Error(`DEX Screener ${response.status}`);
  return response.json();
});
const pair = pairs
  .filter((item) => Number.isFinite(Number(item?.priceUsd)))
  .sort((a, b) => Number(b?.liquidity?.usd || 0) - Number(a?.liquidity?.usd || 0))[0];
if (!pair?.pairAddress) throw new Error('No indexed pool found');

const base = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${pair.pairAddress}`;
const [tradePayload, candlePayload] = await Promise.all([
  fetch(`${base}/trades`).then((response) => {
    if (!response.ok) throw new Error(`GeckoTerminal trades ${response.status}`);
    return response.json();
  }),
  fetch(`${base}/ohlcv/minute?aggregate=1&limit=60&currency=usd&token=base`).then((response) => {
    if (!response.ok) throw new Error(`GeckoTerminal OHLCV ${response.status}`);
    return response.json();
  }),
]);

const trades = (tradePayload?.data || []).map((row) => {
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
}).filter((item) => item.txHash && item.tokenAmount > 0);

const candles = (candlePayload?.data?.attributes?.ohlcv_list || []).map((row) => ({
  unixTime: Number(row[0]),
  o: Number(row[1]),
  h: Number(row[2]),
  l: Number(row[3]),
  c: Number(row[4]),
  v: Number(row[5]),
}));

await writeFile('market-data.json', `${JSON.stringify({
  mint,
  pool: pair.pairAddress,
  updatedAt: new Date().toISOString(),
  source: 'GeckoTerminal',
  trades,
  candles,
}, null, 2)}\n`);
console.log(`Updated ${trades.length} trades and ${candles.length} candles for ${pair.pairAddress}`);
