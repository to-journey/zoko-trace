import axios from 'axios';

interface TokenPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  labels: string[];
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange?: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap?: number;
  pairCreatedAt: number;
}

export async function getPrice(tokenAddress: string) {
  const response = await axios.get<TokenPair[]>(
    `https://api.dexscreener.com/token-pairs/v1/solana/${tokenAddress}`
  );
  let maxPrice = 0;
  for (let index in response.data) {
    const priceUsd = Number(response.data[index].priceUsd);
    if (priceUsd > maxPrice) {
      maxPrice = priceUsd;
    }
  }
  return { maxPrice, symbol: response.data[0].baseToken.symbol };
}
