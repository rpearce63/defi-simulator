import { useEffect, useState } from "react";
import { useHookstate, State } from "@hookstate/core";
import * as pools from "@bgd-labs/aave-address-book";

import { HealthFactorDataStore } from "../store/healthFactorDataStore";

import { ChainId } from "@aave/contract-helpers";
import BigNumber from "bignumber.js";
import { getAaveData } from "../pages/api/aave";

export type HealthFactorData = {
  address: string; // e.g. 0xc...123a or stani.eth
  resolvedAddress: string; // e.g 0xc...123a (never ens)
  fetchError: string;
  isFetching: boolean;
  lastFetched: number;
  market: AaveMarketDataType;
  marketReferenceCurrencyPriceInUSD: number;
  availableAssets?: AssetDetails[];
  fetchedData?: AaveHealthFactorData;
  workingData?: AaveHealthFactorData;
};

export type AaveHealthFactorData = {
  address?: string;
  healthFactor: number;
  totalBorrowsUSD: number;
  availableBorrowsUSD: number;
  totalCollateralMarketReferenceCurrency: number;
  totalBorrowsMarketReferenceCurrency: number;
  currentLiquidationThreshold: number;
  currentLoanToValue: number;
  userReservesData: ReserveAssetDataItem[];
  userBorrowsData: BorrowedAssetDataItem[];
  userEmodeCategoryId?: number;
  isInIsolationMode?: boolean;
  txHistory: TxHistory;
};

export type TxHistory = {
  data: TxHistoryItem[];
  isFetching: boolean;
  fetchError: string;
  lastFetched: number;
};

export type TxHistoryItem = {
  id: string;
  txHash: string;
  action:
  | "Borrow"
  | "Repay"
  | "Supply"
  | "Deposit"
  | "RedeemUnderlying"
  | "LiquidationCall";
  amount?: number; // absent for liquidationCall
  reserve?: TxHistoryReserveItem; // absent for liquidationCall
  timestamp: number;
  assetPriceUSD?: string; // absent for liquidationCall
  // vvv liquidationCall formatting, only present on that action type
  // collateral i.e. the reserve used to repay the borrowed debt
  collateralAmount?: number;
  collateralReserve?: TxHistoryReserveItem;
  collateralPriceUSD?: string;
  // principal i.e. the borrowed debt that's getting repaid
  principalAmount?: number;
  principalReserve?: TxHistoryReserveItem;
  principalPriceUSD?: string;
};

export type TxHistoryReserveItem = {
  symbol: string;
  decimals: string;
  name: string;
  underlyingAsset: string;
};

export type ReserveAssetDataItem = {
  asset: AssetDetails;
  underlyingBalance: number;
  underlyingBalanceUSD: number;
  underlyingBalanceMarketReferenceCurrency: number;
  usageAsCollateralEnabledOnUser: boolean;
};

export type BorrowedAssetDataItem = {
  asset: AssetDetails;
  stableBorrows?: number;
  variableBorrows?: number;
  totalBorrows: number;
  totalBorrowsUSD: number;
  stableBorrowAPY: number;
  totalBorrowsMarketReferenceCurrency: number;
};

export type AssetDetails = {
  symbol: string;
  name: string;
  priceInUSD: number;
  priceInMarketReferenceCurrency: number;
  baseLTVasCollateral: number;
  isActive?: boolean;
  isFrozen?: boolean;
  isIsolated?: boolean;
  isPaused?: boolean;
  reserveLiquidationThreshold: number;
  reserveFactor: number;
  usageAsCollateralEnabled: boolean;
  initialPriceInUSD: number;
  aTokenAddress?: string;
  stableDebtTokenAddress?: string;
  variableDebtTokenAddress?: string;
  underlyingAsset?: string;
  isNewlyAddedBySimUser?: boolean;
  borrowingEnabled?: boolean;
  liquidityIndex?: number;
  variableBorrowIndex?: number;
  liquidityRate?: number;
  variableBorrowRate?: number;
  stableBorrowRate?: number;
  interestRateStrategyAddress?: number;
  availableLiquidity?: number;
  borrowCap?: number;
  supplyCap?: number;
  eModeLtv?: number;
  eModeLiquidationThreshold?: number;
  eModeLabel?: string;
  eModeCategoryId?: number;
  borrowableInIsolation?: boolean;
  isSiloedBorrowing?: boolean;
  totalDebt?: number;
  totalStableDebt?: number;
  totalVariableDebt?: number;
  totalLiquidity?: number;
  flashLoanEnabled?: boolean;
  // Incentive Data
  supplyAPY?: number;
  variableBorrowAPY?: number;
  stableBorrowAPY?: number;
  supplyAPR?: number;
  variableBorrowAPR?: number;
  stableBorrowAPR?: number;
};

/**
 * left to borrow = borrowCap - totalDebt
 * left to supply = supplyCap - totalLiquidity
 *
 * baseLTVasCollateral
 * reserveLiquidationThreshold
 *
 * isFrozen
 * isPaused
 * usageAsCollateralEnabled
 *
 * borrowingEnabled
 * borrowCap
 * supplyCap
 * eModeLtv
 * eModeLiquidationThreshold
 */

export type AaveMarketDataType = {
  v3?: boolean;
  id: string;
  title: string;
  chainId: ChainId;
  api: string;
  addresses: {
    LENDING_POOL_ADDRESS_PROVIDER: string;
    UI_POOL_DATA_PROVIDER: string;
    UI_INCENTIVE_DATA_PROVIDER: string;
  };
  explorer: string;
  explorerName: string;
  subgraphUrl: string;
};

export const markets: AaveMarketDataType[] = [

  {
    v3: true,
    id: "ETHEREUM_V3",
    title: "Ethereum v3",
    chainId: ChainId.mainnet,
    api: `https://eth-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0x194324C9Af7f56E22F1614dD82E18621cb9238E7",
      UI_INCENTIVE_DATA_PROVIDER: "0x5a40cDe2b76Da2beD545efB3ae15708eE56aAF9c"
    },
    explorer: "https://etherscan.io/address/{{ADDRESS}}",
    explorerName: "Etherscan",
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3',
  },
  {
    v3: true,
    id: "ARBITRUM_V3",
    title: "Arbitrum v3",
    chainId: ChainId.arbitrum_one,
    api: `https://arb-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Arbitrum.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0xc0179321f0825c3e0F59Fe7Ca4E40557b97797a3", // pools.AaveV3Arbitrum.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4" // pools.AaveV3Arbitrum.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://arbiscan.io/address/{{ADDRESS}}",
    explorerName: "Arbiscan",
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum',
  },
  {
    v3: true,
    id: "OPTIMISM_V3",
    title: "Optimism v3",
    chainId: ChainId.optimism,
    api: `https://opt-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Optimism.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0x86b0521f92a554057e54B93098BA2A6Aaa2F4ACB", // pools.AaveV3Optimism.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0xc0179321f0825c3e0F59Fe7Ca4E40557b97797a3" // pools.AaveV3Optimism.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://optimistic.etherscan.io/address/{{ADDRESS}}",
    explorerName: "Optimistic Etherscan",
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-optimism',
  },
  {
    v3: true,
    id: "BASE_V3",
    title: "Base v3",
    chainId: ChainId.base,
    api: `https://base-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Base.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4", // pools.AaveV3Base.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0x5c5228aC8BC1528482514aF3e27E692495148717", // pools.AaveV3Base.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://basescan.org/address/{{ADDRESS}}",
    explorerName: "BaseScan",
    subgraphUrl: "", // Not set up yet
  },
  {
    v3: true,
    id: "POLYGON_V3",
    title: "Polygon v3",
    chainId: ChainId.polygon,
    api: `https://polygon-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Polygon.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0xE92cd6164CE7DC68e740765BC1f2a091B6CBc3e4", // pools.AaveV3Polygon.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0x5c5228aC8BC1528482514aF3e27E692495148717" // pools.AaveV3Polygon.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://polygonscan.com/address/{{ADDRESS}}",
    explorerName: "PolygonScan",
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-polygon',
  },
  {
    v3: true,
    id: "AVALANCHE_V3",
    title: "Avalanche v3",
    chainId: ChainId.avalanche,
    api: `https://avax-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER:
        pools.AaveV3Avalanche.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0x374a2592f0265b3bb802d75809e61b1b5BbD85B7", // pools.AaveV3Avalanche.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0xC81CCebEA6A14bA007b96C0a1600D0bA0Df383a8" // pools.AaveV3Avalanche.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://avascan.info/blockchain/all/address/{{ADDRESS}}",
    explorerName: "AvaScan",
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-avalanche',
  },
  /*
  {
    v3: true,
    id: "METIS_V3",
    title: "Metis v3",
    chainId: ChainId.metis_andromeda,
    api: `https://metis-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Metis.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0x5d4D4007A4c6336550DdAa2a7c0d5e7972eebd16", // pools.AaveV3Metis.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0xE28E2c8d240dd5eBd0adcab86fbD79df7a052034", // pools.AaveV3Metis.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://andromeda-explorer.metis.io/address/{{ADDRESS}}",
    explorerName: "Metis Explorer",
    subgraphUrl: 'https://andromeda.thegraph.metis.io/subgraphs/name/aave/protocol-v3-metis',
  },
  */
  /*
  {
    v3: true,
    id: "GNOSIS_V3",
    title: "Gnosis v3",
    chainId: ChainId.xdai,
    api: `https://gnosis-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Gnosis.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Gnosis.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: pools.AaveV3Gnosis.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://gnosisscan.io/address/{{ADDRESS}}",
    explorerName: "Gnosis Scan",
    subgraphUrl: 'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-gnosis',
  },
  */
  /*
  {
    v3: true,
    id: "SCROLL_V3",
    title: "Scroll v3",
    chainId: ChainId.scroll,
    api: "https://scroll-mainnet.rpc.grove.city/v1/10ccb305",
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3Scroll.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: pools.AaveV3Scroll.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: pools.AaveV3Scroll.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://scrollscan.com/address/{{ADDRESS}}",
    explorerName: "Scroll Scan",
    subgraphUrl: "",
  },
  */
  {
    v3: true,
    id: "BNB_V3",
    title: "BNB Chain v3",
    chainId: ChainId.bnb,
    api: `https://bnb-mainnet.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
    addresses: {
      LENDING_POOL_ADDRESS_PROVIDER: pools.AaveV3BNB.POOL_ADDRESSES_PROVIDER,
      UI_POOL_DATA_PROVIDER: "0xb12e82DF057BF16ecFa89D7D089dc7E5C1Dc057B", // pools.AaveV3BNB.UI_POOL_DATA_PROVIDER,
      UI_INCENTIVE_DATA_PROVIDER: "0x86b0521f92a554057e54B93098BA2A6Aaa2F4ACB" // pools.AaveV3BNB.UI_INCENTIVE_DATA_PROVIDER
    },
    explorer: "https://bscscan.com/address/{{ADDRESS}}",
    explorerName: "BSC Scan",
    subgraphUrl: "",
  }
];

/** Swap fee in basis points (25 bps = 0.25%) */
export const SWAP_FEE_BPS = 25;
/** Execution fee in basis points (5 bps = 0.05%) */
export const EXECUTION_FEE_BPS = 5;
/** Default slippage (1.5% = 150 bps) when dynamic slippage is not available */
export const DEFAULT_SLIPPAGE_BPS = 150;
export const SWAP_SLIPPAGE_PCT = DEFAULT_SLIPPAGE_BPS / 10000;

const SWAP_FEE_MULTIPLIER =
  (1 - (SWAP_FEE_BPS + EXECUTION_FEE_BPS) / 10000) * (1 - SWAP_SLIPPAGE_PCT);

const COW_BFF_BASE = "https://bff.cow.fi";

/**
 * Fetch recommended slippage tolerance (in basis points) from CoW Protocol BFF for a token pair.
 * Used by Aave for swap/repay simulations. Returns null on failure (use DEFAULT_SLIPPAGE_BPS).
 * @see https://bff.cow.fi/{chainId}/markets/{tokenA}-{tokenB}/slippageTolerance
 */
export async function fetchSlippageToleranceBps(
  chainId: number,
  tokenA: string,
  tokenB: string,
): Promise<number | null> {
  const a = tokenA.toLowerCase();
  const b = tokenB.toLowerCase();
  const marketSlug = `${a}-${b}`;
  try {
    const res = await fetch(
      `${COW_BFF_BASE}/${chainId}/markets/${marketSlug}/slippageTolerance`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { slippageBps?: number };
    return typeof json.slippageBps === "number" ? json.slippageBps : null;
  } catch {
    return null;
  }
}

function getSwapFeeMultiplierForSlippageBps(slippageBps: number) {
  return (
    (1 - (SWAP_FEE_BPS + EXECUTION_FEE_BPS) / 10000) *
    (1 - slippageBps / 10000)
  );
}

export function getSwapFeeBreakdown(
  swapUsd: number,
  slippageBps?: number | null,
) {
  const bps = slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const swapFeeUsd = swapUsd * (SWAP_FEE_BPS / 10000);
  const executionFeeUsd = swapUsd * (EXECUTION_FEE_BPS / 10000);
  const totalFeeUsd = swapFeeUsd + executionFeeUsd;
  const receiveUsdAfterFees = swapUsd - totalFeeUsd;
  const slippageUsd = receiveUsdAfterFees * (bps / 10000);
  const receiveUsd = receiveUsdAfterFees - slippageUsd;
  return {
    swapFeeUsd,
    executionFeeUsd,
    totalFeeUsd,
    slippageUsd,
    slippageBps: bps,
    receiveUsd,
  };
}

/** Collateral value (USD) needed so that after fees/slippage you receive receiveUsd. */
export function getCollateralUsdNeededForRepay(
  receiveUsd: number,
  slippageBps?: number | null,
) {
  const bps = slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const mult = getSwapFeeMultiplierForSlippageBps(bps);
  return receiveUsd / mult;
}

/** Turn RPC/ethers errors into a short user-facing message. */
function normalizeRpcErrorMessage(err: unknown): string {
  if (err == null) return "Unknown error";
  const e = err as { code?: string; reason?: string; message?: string; serverError?: unknown };
  const msg = typeof e.message === "string" ? e.message : "";
  if (e.code === "CALL_EXCEPTION" || e.reason === "CALL_EXCEPTION")
    return "RPC call failed. The network or contract may be temporarily unavailable. Try again.";
  if (e.code === "SERVER_ERROR" || msg.includes("missing response"))
    return "Network or RPC temporarily unavailable. Try again.";
  if (msg.length > 0 && msg.length < 200) return msg;
  if (msg.length >= 200) return msg.slice(0, 197) + "...";
  return "Failed to load data. Try again.";
}

/** hook to fetch user aave data
 * @returns { currentAddress,
    currentMarket,
    addressData,
    addressDataStore,
    afterAssetsChanged,
    addBorrowAsset,
    addReserveAsset,
    setCurrentMarket, }
 */
export function useAaveData(address: string, preventFetch: boolean = false) {
  const [isFetching, setIsFetching] = useState(false);
  const store = useHookstate(HealthFactorDataStore);
  const state = store.get({ noproxy: true });
  const { currentAddress, addressData, currentMarket, isRefreshActive } = state;
  const data = addressData?.[currentAddress];
  const addressProvided: boolean = !!(address && address?.length > 0);
  if (address?.length === 0 || address === "DEBUG")
    address = currentAddress || "";

  const isLoadingAny = !!markets.find(
    (market) => data?.[market.id]?.isFetching === true,
  );

  const fetchDeps = [currentAddress, addressProvided, isLoadingAny];
  const refreshDeps = [addressProvided, isRefreshActive, address];

  // Initial fetch for markets that don't have data yet
  useEffect(() => {
    if (preventFetch) return;
    if (addressProvided && !isLoadingAny) {
      markets.map((market) => {
        const existingData = data?.[market.id];
        const lastFetched = existingData?.lastFetched;
        if (lastFetched) return;
        if (existingData?.isFetching) return;
        setIsFetching(true);
        createInitial(market);
        const fetchData = async () => {
          try {
            const data: HealthFactorData = await getAaveData(address, market);
            store.addressData.nested(address).merge({ [market.id]: data });
          } catch (err) {
            const message = normalizeRpcErrorMessage(err);
            const hfData: HealthFactorData = {
              address,
              resolvedAddress: address,
              fetchError: message,
              isFetching: false,
              lastFetched: Date.now(),
              market,
              marketReferenceCurrencyPriceInUSD: 1,
            };
            store.addressData.nested(address).merge({ [market.id]: hfData });
          }
        };

        fetchData();
      });
    }
  }, fetchDeps);

  // Apply fresh API data while preserving in-progress simulations: update prices and derived values only.
  const applyRefreshPreservingWorkingData = (
    marketId: string,
    freshHfData: HealthFactorData,
  ) => {
    const marketRefPrice = freshHfData.marketReferenceCurrencyPriceInUSD;
    const marketEntry = store.addressData.nested(address)[marketId];
    const existing = store.addressData.nested(address)[marketId].get({
      noproxy: true,
    }) as HealthFactorData;
    const existingWorking = existing?.workingData;
    const existingFetched = existing?.fetchedData;

    marketEntry.fetchedData.set(freshHfData.fetchedData);
    marketEntry.marketReferenceCurrencyPriceInUSD.set(marketRefPrice);
    marketEntry.availableAssets.set(freshHfData.availableAssets ?? []);
    marketEntry.lastFetched.set(freshHfData.lastFetched);
    marketEntry.fetchError.set(freshHfData.fetchError ?? "");
    marketEntry.isFetching.set(false);

    if (!existingWorking) {
      store.addressData.nested(address)[marketId].workingData.set(
        freshHfData.workingData ?? freshHfData.fetchedData!,
      );
      return;
    }

    // If working matched fetched before refresh (no user simulation), just adopt fresh data so the reset icon doesn't appear.
    const hfMatch =
      existingFetched != null &&
      (existingWorking.healthFactor === existingFetched.healthFactor ||
        (Number.isFinite(existingWorking.healthFactor) &&
          Number.isFinite(existingFetched.healthFactor) &&
          Math.abs((existingWorking.healthFactor ?? 0) - (existingFetched.healthFactor ?? 0)) < 1e-6));
    const reservesLenMatch =
      (existingWorking.userReservesData?.length ?? 0) ===
      (existingFetched?.userReservesData?.length ?? 0);
    const borrowsLenMatch =
      (existingWorking.userBorrowsData?.length ?? 0) ===
      (existingFetched?.userBorrowsData?.length ?? 0);
    if (hfMatch && reservesLenMatch && borrowsLenMatch) {
      store.addressData.nested(address)[marketId].workingData.set(
        freshHfData.workingData ?? JSON.parse(JSON.stringify(freshHfData.fetchedData)),
      );
      return;
    }

    const freshBySymbol: Record<string, AssetDetails> = {};
    (freshHfData.availableAssets ?? []).forEach((a) => {
      freshBySymbol[a.symbol] = a;
    });
    const workingCopy = JSON.parse(
      JSON.stringify(existingWorking),
    ) as AaveHealthFactorData;
    workingCopy.userReservesData?.forEach((item) => {
      const freshAsset = freshBySymbol[item.asset.symbol];
      if (freshAsset) {
        item.asset = { ...freshAsset, isNewlyAddedBySimUser: item.asset.isNewlyAddedBySimUser };
      }
    });
    workingCopy.userBorrowsData?.forEach((item) => {
      const freshAsset = freshBySymbol[item.asset.symbol];
      if (freshAsset) {
        item.asset = { ...freshAsset, isNewlyAddedBySimUser: item.asset.isNewlyAddedBySimUser };
      }
    });
    const updatedWorking = updateDerivedHealthFactorData(
      workingCopy,
      marketRefPrice,
    );
    (updatedWorking as AaveHealthFactorData & { liquidationScenario?: AssetDetails[] }).liquidationScenario =
      getCalculatedLiquidationScenario(updatedWorking, marketRefPrice);
    store.addressData.nested(address)[marketId].workingData.set(updatedWorking);
  };

  // Refresh interval: only runs when isRefreshActive is true; shared so checkbox and interval stay in sync.
  // When refresh is turned back on, run an immediate refresh so values are up to date without waiting for the interval.
  // Refresh updates prices and calculations but preserves in-progress simulations (workingData).
  useEffect(() => {
    if (!preventFetch && addressProvided && isRefreshActive) {
      const runRefresh = () => {
        markets.forEach((market) => {
          const fetchData = async () => {
            try {
              const hfData: HealthFactorData = await getAaveData(address, market);
              applyRefreshPreservingWorkingData(market.id, hfData);
            } catch (err) {
              const message = normalizeRpcErrorMessage(err);
              const marketEntry = store.addressData.nested(address)[market.id];
              if (marketEntry?.fetchError != null) marketEntry.fetchError.set(message);
            }
          };
          fetchData();
        });
      };
      runRefresh();
      const intervalId = setInterval(() => {
        if (!store.get({ noproxy: true }).isRefreshActive) return;
        runRefresh();
      }, 60000);
      return () => clearInterval(intervalId);
    }
    return undefined;
  }, refreshDeps);

  useEffect(() => {
    if (address) store.currentAddress.set(address);
  }, [address]);

  useEffect(() => {
    if (!isFetching) return;
    if (!markets.find((market) => data?.[market.id]?.isFetching)) {
      setIsFetching(false);
    }
  }, [isLoadingAny]);

  // After fetching, if the current market doesn't have a position but another
  // one does, select the market that has a position (prefer highest reserve balance).
  useEffect(() => {
    if (!isFetching && addressProvided) {
      // console.log("currentMarket: ", currentMarket);
      const currentMarketHasPosition =
        data?.[currentMarket].workingData?.healthFactor &&
        (data?.[currentMarket]?.workingData?.healthFactor ?? -1) > -1;

      const currentMarketHasEdits =
        data?.[currentMarket]?.workingData?.healthFactor?.toFixed(2) !==
        data?.[currentMarket]?.fetchedData?.healthFactor?.toFixed(2);

      // Don't perform the auto-select if the user is actively editing the current market.
      if (currentMarketHasPosition && currentMarketHasEdits) return;

      const marketWithPosition = markets
        .sort((marketA, marketB) => {
          const marketDataA = data?.[marketA.id];
          const marketDataB = data?.[marketB.id];

          const totalCollA =
            marketDataA?.workingData?.totalCollateralMarketReferenceCurrency ||
            0;
          const totalCollB =
            marketDataB?.workingData?.totalCollateralMarketReferenceCurrency ||
            0;

          const priceA = marketDataA?.marketReferenceCurrencyPriceInUSD || 0;
          const priceB = marketDataB?.marketReferenceCurrencyPriceInUSD || 0;

          return totalCollB * priceB - totalCollA * priceA;
        })
        .find(
          (market) =>
            data?.[market.id]?.workingData?.healthFactor &&
            (data?.[market.id]?.workingData?.healthFactor ?? -1) > -1,
        );
      // This guard doesn't make much sense but for some reason this useEffect was being triggered
      // sometimes even when the markets hadn't just finished loading. We only want to apply
      // this logic right after loading.
      const didFetchRecently = !!markets.find(
        (market) => data?.[market.id]?.lastFetched > Date.now() - 1000,
      );
      if (marketWithPosition && didFetchRecently) {
        setCurrentMarket(marketWithPosition.id);
      }
    }
  }, [isFetching]);

  const createInitial = (market: AaveMarketDataType) => {
    const hf: HealthFactorData = {
      address,
      resolvedAddress: address, // Will be resolved when data is fetched
      fetchError: "",
      isFetching: true,
      lastFetched: 0,
      market,
      marketReferenceCurrencyPriceInUSD: 0,
    };
    store.addressData.nested(address).merge({ [market.id]: hf });
  };

  const setCurrentMarket = (marketId: string) => {
    store.currentMarket.set(marketId);
  };

  const addBorrowAsset = (symbol: string) => {
    const asset = data[currentMarket].availableAssets?.find(
      (a) => a.symbol === symbol,
    ) as AssetDetails;

    asset.isNewlyAddedBySimUser = true;

    const borrow: BorrowedAssetDataItem = {
      asset,
      totalBorrows: 0,
      totalBorrowsUSD: 0,
      totalBorrowsMarketReferenceCurrency: 0,
      stableBorrowAPY: 0,
    };

    const workingData = store.addressData.nested(address)?.[currentMarket]
      .workingData as State<AaveHealthFactorData>;

    workingData.userBorrowsData.merge([borrow]);
  };

  const addReserveAsset = (symbol: string) => {
    const asset: AssetDetails = data[currentMarket].availableAssets?.find(
      (a) => a.symbol === symbol,
    ) as AssetDetails;

    asset.isNewlyAddedBySimUser = true;

    const reserve: ReserveAssetDataItem = {
      asset,
      underlyingBalance: 0,
      underlyingBalanceUSD: 0,
      underlyingBalanceMarketReferenceCurrency: 0,
      usageAsCollateralEnabledOnUser: asset.usageAsCollateralEnabled,
    };

    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    workingData.userReservesData.merge([reserve]);
  };

  const removeAsset = (symbol: string, assetType: string) => {
    const items =
      assetType === "RESERVE"
        ? data?.[currentMarket]?.workingData?.userReservesData || []
        : data?.[currentMarket]?.workingData?.userBorrowsData || [];

    const itemIndex = items.findIndex((item) => item.asset.symbol === symbol);
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserves: State<ReserveAssetDataItem[]> =
      workingData.userReservesData;
    const borrows: State<BorrowedAssetDataItem[]> = workingData.userBorrowsData;

    assetType === "RESERVE"
      ? reserves.set((p) => {
        p.splice(itemIndex, 1);
        return p;
      })
      : borrows.set((p) => {
        p.splice(itemIndex, 1);
        return p;
      });

    updateAllDerivedHealthFactorData();
  };

  const resetCurrentMarketChanges = () => {
    store.addressData.nested(address)?.[currentMarket].workingData.set(
      JSON.parse(
        JSON.stringify(
          store.addressData[currentAddress][currentMarket].fetchedData.get({
            noproxy: true,
          }),
        ),
      ),
    );
    updateAllDerivedHealthFactorData();
    store.isRefreshActive.set(true);
  };

  const setBorrowedAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userBorrowsData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (item?.totalBorrows.get() !== quantity) {
      item?.totalBorrows.set(quantity);
      updateAllDerivedHealthFactorData();
    }
  };

  const setReserveAssetQuantity = (symbol: string, quantity: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const item = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol,
    );

    if (item?.underlyingBalance.get() !== quantity) {
      item?.underlyingBalance.set(quantity);
      updateAllDerivedHealthFactorData();
    }
  };

  /** Apply a looping-simulator state (cbBTC collateral, USDC debt) to the main position so user can model liquidation etc. */
  const applyLoopingStateToPosition = (
    collateralSymbol: string,
    collateralAmount: number,
    debtSymbol: string,
    debtAmount: number,
  ) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData?.get({ noproxy: true }) as AaveHealthFactorData | undefined;
    const hasReserve = workingData?.userReservesData?.some(
      (r) => r.asset.symbol === collateralSymbol,
    );
    const hasBorrow = workingData?.userBorrowsData?.some(
      (b) => b.asset.symbol === debtSymbol,
    );
    if (!hasReserve) addReserveAsset(collateralSymbol);
    if (!hasBorrow) addBorrowAsset(debtSymbol);
    setReserveAssetQuantity(collateralSymbol, collateralAmount);
    setBorrowedAssetQuantity(debtSymbol, debtAmount);
  };

  const setAssetPriceInUSD = (symbol: string, price: number) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserveItem = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (reserveItem && reserveItem?.asset.priceInUSD.get() !== price)
      reserveItem.asset.priceInUSD.set(price);

    const borrowItem = workingData?.userBorrowsData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (borrowItem && borrowItem?.asset.priceInUSD.get() !== price)
      borrowItem.asset.priceInUSD.set(price);
    updateAllDerivedHealthFactorData();
  };

  const setTxHistory = (address: string, history: TxHistory) => {
    const workingData = store.addressData.nested(address)?.[currentMarket]
      ?.workingData as State<AaveHealthFactorData>;
    if (workingData) workingData.txHistory?.set(history);
  };

  const applyLiquidationScenario = () => {
    const liquidationScenario = getCalculatedLiquidationScenario(
      data?.[currentMarket]?.workingData as AaveHealthFactorData,
      data?.[currentMarket]?.marketReferenceCurrencyPriceInUSD,
    ) as AssetDetails[];
    liquidationScenario?.forEach((asset) =>
      setAssetPriceInUSD(asset.symbol, asset.priceInUSD),
    );
    store.isRefreshActive.set(false);
  };

  const setUseReserveAssetAsCollateral = (symbol: string, value: boolean) => {
    const workingData = store.addressData.nested(address)[currentMarket]
      .workingData as State<AaveHealthFactorData>;
    const reserveItem = workingData?.userReservesData.find(
      (item) => item.asset.symbol.get() === symbol,
    );
    if (
      reserveItem &&
      reserveItem?.usageAsCollateralEnabledOnUser.get() !== value
    )
      reserveItem.usageAsCollateralEnabledOnUser.set(value);

    updateAllDerivedHealthFactorData();
  };

  const setCurrentAddress = (address: string) => {
    store.currentAddress.set(address);
  };

  const updateAllDerivedHealthFactorData = () => {
    const currentMarketReferenceCurrencyPriceInUSD: number = store.addressData
      .nested(address)
    [currentMarket].marketReferenceCurrencyPriceInUSD.get();

    const healthFactorItem = store.addressData.nested(address)?.[
      currentMarket
    ] as State<HealthFactorData>;

    const workingData = healthFactorItem.workingData.get({
      noproxy: true,
    }) as AaveHealthFactorData;

    const updatedWorkingData: AaveHealthFactorData =
      updateDerivedHealthFactorData(
        workingData,
        currentMarketReferenceCurrencyPriceInUSD,
      );

    healthFactorItem.workingData.set(updatedWorkingData);
  };

  const setRefreshState = () => {
    store.isRefreshActive.set(!store.isRefreshActive.get());
  };

  const setRefreshActive = (value: boolean) => {
    store.isRefreshActive.set(value);
  };

  /**
   * Simulate swapping a percentage of debt from one borrowed asset to another
   * (e.g. USDC → cbBTC). Fees and optional slippage (bps) applied. Turns off auto-refresh.
   * @param slippageBps optional; from CoW BFF or use default (150 bps)
   */
  const simulateSwapDebt = (
    sourceSymbol: string,
    targetSymbol: string,
    percentage: number,
    slippageBps?: number | null,
  ) => {
    const mult = getSwapFeeMultiplierForSlippageBps(
      slippageBps ?? DEFAULT_SLIPPAGE_BPS,
    );
    const borrows =
      data?.[currentMarket]?.workingData?.userBorrowsData ?? [];
    const sourceItem = borrows.find(
      (b) => b.asset.symbol === sourceSymbol,
    );
    if (
      !sourceItem ||
      sourceItem.totalBorrows <= 0 ||
      sourceSymbol === targetSymbol
    ) {
      return;
    }
    const swapUsd =
      sourceItem.totalBorrows * sourceItem.asset.priceInUSD * percentage;
    const availableAssets =
      data?.[currentMarket]?.availableAssets ?? [];
    const targetAsset = availableAssets.find(
      (a) => a.symbol === targetSymbol,
    );
    if (!targetAsset || !isBorrowableAsset(targetAsset)) {
      return;
    }
    const targetPrice = targetAsset.priceInUSD || 1;
    const targetQuantity = (swapUsd * mult) / targetPrice;
    const targetExisting = borrows.find(
      (b) => b.asset.symbol === targetSymbol,
    );
    const existingTargetQty = targetExisting ? targetExisting.totalBorrows : 0;
    if (!targetExisting) {
      addBorrowAsset(targetSymbol);
    }
    const newSourceQty = sourceItem.totalBorrows * (1 - percentage);
    setBorrowedAssetQuantity(sourceSymbol, newSourceQty);
    setBorrowedAssetQuantity(targetSymbol, existingTargetQty + targetQuantity);
  };

  /**
   * Simulate swapping a percentage of collateral from one supplied asset to another.
   * Fees and optional slippage (bps) applied. Turns off auto-refresh.
   */
  const simulateSwapCollateral = (
    sourceSymbol: string,
    targetSymbol: string,
    percentage: number,
    slippageBps?: number | null,
    /** Optional flat amount in source collateral units. When set, overrides percentage. */
    swapAmount?: number | null,
  ) => {
    const mult = getSwapFeeMultiplierForSlippageBps(
      slippageBps ?? DEFAULT_SLIPPAGE_BPS,
    );
    const reserves =
      data?.[currentMarket]?.workingData?.userReservesData ?? [];
    const sourceItem = reserves.find(
      (r) => r.asset.symbol === sourceSymbol,
    );
    if (
      !sourceItem ||
      sourceItem.underlyingBalance <= 0 ||
      sourceSymbol === targetSymbol
    ) {
      return;
    }
    const sourceUnitsToSwap =
      swapAmount != null && swapAmount > 0
        ? Math.min(swapAmount, sourceItem.underlyingBalance)
        : sourceItem.underlyingBalance * percentage;
    const swapUsd = sourceUnitsToSwap * sourceItem.asset.priceInUSD;
    const availableAssets =
      data?.[currentMarket]?.availableAssets ?? [];
    const targetAsset = availableAssets.find(
      (a) => a.symbol === targetSymbol,
    );
    if (!targetAsset || !isSuppliableAsset(targetAsset)) {
      return;
    }
    const targetPrice = targetAsset.priceInUSD || 1;
    const targetQuantity = (swapUsd * mult) / targetPrice;
    const targetExisting = reserves.find(
      (r) => r.asset.symbol === targetSymbol,
    );
    const existingTargetQty = targetExisting ? targetExisting.underlyingBalance : 0;
    if (!targetExisting) {
      addReserveAsset(targetSymbol);
    }
    const newSourceQty = sourceItem.underlyingBalance - sourceUnitsToSwap;
    setReserveAssetQuantity(sourceSymbol, newSourceQty);
    setReserveAssetQuantity(targetSymbol, existingTargetQty + targetQuantity);
  };

  /**
   * Simulate repaying debt: either by a manual amount (in debt asset units) or by
   * "selling" a percentage of collateral (same fee + slippage as swaps). Turns off auto-refresh.
   */
  const simulateRepayDebt = (params: {
    debtSymbol: string;
    mode: "manual" | "collateral";
    manualAmount?: number;
    collateralSymbol?: string;
    percentage?: number;
    /** When using collateral, optional fixed amount of debt to repay (in debt asset units). If set, overrides percentage. */
    collateralRepayAmount?: number;
    slippageBps?: number | null;
    /** When using collateral, optional liquidation bonus % (e.g. 5 = 5%). Collateral seized = debtRepaid * (1 + bonus/100). */
    liquidationBonusPct?: number | null;
  }) => {
    const borrows =
      data?.[currentMarket]?.workingData?.userBorrowsData ?? [];
    const debtItem = borrows.find((b) => b.asset.symbol === params.debtSymbol);
    if (!debtItem || debtItem.totalBorrows <= 0) return;

    if (params.mode === "manual" && params.manualAmount != null) {
      const amount = Math.max(0, params.manualAmount);
      const newQty = Math.max(0, debtItem.totalBorrows - amount);
      setBorrowedAssetQuantity(params.debtSymbol, newQty);
      return;
    }

    if (
      params.mode === "collateral" &&
      params.collateralSymbol != null &&
      (params.percentage != null || (params.collateralRepayAmount != null && params.collateralRepayAmount > 0))
    ) {
      const reserves =
        data?.[currentMarket]?.workingData?.userReservesData ?? [];
      const collateralItem = reserves.find(
        (r) => r.asset.symbol === params.collateralSymbol,
      );
      const debtReduceUnitsTarget =
        params.collateralRepayAmount != null && params.collateralRepayAmount > 0
          ? Math.min(params.collateralRepayAmount, debtItem.totalBorrows)
          : (params.percentage ?? 0) * debtItem.totalBorrows;
      if (!collateralItem || collateralItem.underlyingBalance <= 0 || debtReduceUnitsTarget <= 0) {
        return;
      }
      const debtPrice = debtItem.asset.priceInUSD || 1;
      const debtReduceUsdTarget = debtReduceUnitsTarget * debtPrice;
      const collateralPrice = collateralItem.asset.priceInUSD || 1;
      const bonus = params.liquidationBonusPct != null && params.liquidationBonusPct > 0
        ? params.liquidationBonusPct / 100
        : 0;

      let actualCollateralUnitsUsed: number;
      let actualDebtReduceUnits: number;

      if (bonus > 0) {
        const collateralUsdSeized = debtReduceUsdTarget * (1 + bonus);
        const collateralUnitsSeized = collateralUsdSeized / collateralPrice;
        actualCollateralUnitsUsed = Math.min(
          collateralUnitsSeized,
          collateralItem.underlyingBalance,
        );
        const actualCollateralUsdSeized = actualCollateralUnitsUsed * collateralPrice;
        actualDebtReduceUnits = Math.min(
          actualCollateralUsdSeized / (1 + bonus) / debtPrice,
          debtItem.totalBorrows,
        );
      } else {
        const mult = getSwapFeeMultiplierForSlippageBps(
          params.slippageBps ?? DEFAULT_SLIPPAGE_BPS,
        );
        const collateralUsdNeeded = debtReduceUsdTarget / mult;
        const collateralUnitsNeeded = collateralUsdNeeded / collateralPrice;
        actualCollateralUnitsUsed = Math.min(
          collateralUnitsNeeded,
          collateralItem.underlyingBalance,
        );
        const actualReceiveUsd =
          actualCollateralUnitsUsed * collateralPrice * mult;
        actualDebtReduceUnits = Math.min(
          actualReceiveUsd / debtPrice,
          debtItem.totalBorrows,
        );
      }

      const newCollateralQty = Math.max(
        0,
        collateralItem.underlyingBalance - actualCollateralUnitsUsed,
      );
      const newDebtQty = Math.max(0, debtItem.totalBorrows - actualDebtReduceUnits);
      setReserveAssetQuantity(params.collateralSymbol!, newCollateralQty);
      setBorrowedAssetQuantity(params.debtSymbol, newDebtQty);
    }
  };

  /** Projected health factor and liquidation scenario after swap debt (no state change). */
  const getProjectedHealthFactorAfterSwapDebt = (
    sourceSymbol: string,
    targetSymbol: string,
    percentage: number,
    slippageBps?: number | null,
  ): { healthFactor: number | null; liquidationScenario: AssetDetails[] } => {
    const marketData = data?.[currentMarket];
    const workingData = marketData?.workingData as AaveHealthFactorData | undefined;
    const availableAssets = marketData?.availableAssets ?? [];
    const marketRefPrice = marketData?.marketReferenceCurrencyPriceInUSD ?? 1;
    if (!workingData || !workingData.userBorrowsData)
      return { healthFactor: null, liquidationScenario: [] };
    const borrows = workingData.userBorrowsData;
    const sourceItem = borrows.find((b) => b.asset.symbol === sourceSymbol);
    if (!sourceItem || sourceItem.totalBorrows <= 0 || sourceSymbol === targetSymbol)
      return { healthFactor: null, liquidationScenario: [] };
    const mult = getSwapFeeMultiplierForSlippageBps(slippageBps ?? DEFAULT_SLIPPAGE_BPS);
    const swapUsd = sourceItem.totalBorrows * sourceItem.asset.priceInUSD * percentage;
    const targetAsset = availableAssets.find((a) => a.symbol === targetSymbol);
    if (!targetAsset || !isBorrowableAsset(targetAsset))
      return { healthFactor: null, liquidationScenario: [] };
    const targetPrice = targetAsset.priceInUSD || 1;
    const targetQuantity = (swapUsd * mult) / targetPrice;
    const targetExisting = borrows.find((b) => b.asset.symbol === targetSymbol);
    const existingTargetQty = targetExisting ? targetExisting.totalBorrows : 0;
    const clone = JSON.parse(JSON.stringify(workingData)) as AaveHealthFactorData;
    const cloneBorrows = clone.userBorrowsData;
    const cloneSource = cloneBorrows.find((b) => b.asset.symbol === sourceSymbol)!;
    cloneSource.totalBorrows = sourceItem.totalBorrows * (1 - percentage);
    const cloneTarget = cloneBorrows.find((b) => b.asset.symbol === targetSymbol);
    if (cloneTarget) {
      cloneTarget.totalBorrows = existingTargetQty + targetQuantity;
    } else {
      cloneBorrows.push({
        asset: { ...targetAsset, isNewlyAddedBySimUser: true },
        totalBorrows: existingTargetQty + targetQuantity,
        totalBorrowsUSD: 0,
        totalBorrowsMarketReferenceCurrency: 0,
        stableBorrowAPY: targetAsset.stableBorrowAPY ?? 0,
      });
    }
    const updated = updateDerivedHealthFactorData(clone, marketRefPrice);
    const liquidationScenario = getCalculatedLiquidationScenario(updated, marketRefPrice) ?? [];
    return { healthFactor: updated.healthFactor ?? null, liquidationScenario };
  };

  /** Projected health factor and liquidation scenario after swap collateral (no state change). */
  const getProjectedHealthFactorAfterSwapCollateral = (
    sourceSymbol: string,
    targetSymbol: string,
    percentage: number,
    slippageBps?: number | null,
    swapAmount?: number | null,
  ): { healthFactor: number | null; liquidationScenario: AssetDetails[] } => {
    const marketData = data?.[currentMarket];
    const workingData = marketData?.workingData as AaveHealthFactorData | undefined;
    const availableAssets = marketData?.availableAssets ?? [];
    const marketRefPrice = marketData?.marketReferenceCurrencyPriceInUSD ?? 1;
    if (!workingData || !workingData.userReservesData)
      return { healthFactor: null, liquidationScenario: [] };
    const reserves = workingData.userReservesData;
    const sourceItem = reserves.find((r) => r.asset.symbol === sourceSymbol);
    if (!sourceItem || sourceItem.underlyingBalance <= 0 || sourceSymbol === targetSymbol)
      return { healthFactor: null, liquidationScenario: [] };
    const mult = getSwapFeeMultiplierForSlippageBps(slippageBps ?? DEFAULT_SLIPPAGE_BPS);
    const sourceUnitsToSwap =
      swapAmount != null && swapAmount > 0
        ? Math.min(swapAmount, sourceItem.underlyingBalance)
        : sourceItem.underlyingBalance * percentage;
    const swapUsd = sourceUnitsToSwap * sourceItem.asset.priceInUSD;
    const targetAsset = availableAssets.find((a) => a.symbol === targetSymbol);
    if (!targetAsset || !isSuppliableAsset(targetAsset))
      return { healthFactor: null, liquidationScenario: [] };
    const targetPrice = targetAsset.priceInUSD || 1;
    const targetQuantity = (swapUsd * mult) / targetPrice;
    const targetExisting = reserves.find((r) => r.asset.symbol === targetSymbol);
    const existingTargetQty = targetExisting ? targetExisting.underlyingBalance : 0;
    const clone = JSON.parse(JSON.stringify(workingData)) as AaveHealthFactorData;
    const cloneReserves = clone.userReservesData;
    const cloneSource = cloneReserves.find((r) => r.asset.symbol === sourceSymbol)!;
    cloneSource.underlyingBalance = sourceItem.underlyingBalance - sourceUnitsToSwap;
    const cloneTarget = cloneReserves.find((r) => r.asset.symbol === targetSymbol);
    if (cloneTarget) {
      cloneTarget.underlyingBalance = existingTargetQty + targetQuantity;
    } else {
      cloneReserves.push({
        asset: { ...targetAsset, isNewlyAddedBySimUser: true },
        underlyingBalance: existingTargetQty + targetQuantity,
        underlyingBalanceUSD: 0,
        underlyingBalanceMarketReferenceCurrency: 0,
        usageAsCollateralEnabledOnUser: targetAsset.usageAsCollateralEnabled ?? false,
      });
    }
    const updated = updateDerivedHealthFactorData(clone, marketRefPrice);
    const liquidationScenario = getCalculatedLiquidationScenario(updated, marketRefPrice) ?? [];
    return { healthFactor: updated.healthFactor ?? null, liquidationScenario };
  };

  /** Projected health factor and liquidation scenario after repay (no state change). */
  const getProjectedHealthFactorAfterRepay = (params: {
    debtSymbol: string;
    mode: "manual" | "collateral";
    manualAmount?: number;
    collateralSymbol?: string;
    percentage?: number;
    collateralRepayAmount?: number;
    slippageBps?: number | null;
    /** When using collateral, optional liquidation bonus % (e.g. 5). Collateral seized = debtRepaid * (1 + bonus/100). */
    liquidationBonusPct?: number | null;
  }): { healthFactor: number | null; liquidationScenario: AssetDetails[] } => {
    const marketData = data?.[currentMarket];
    const workingData = marketData?.workingData as AaveHealthFactorData | undefined;
    const marketRefPrice = marketData?.marketReferenceCurrencyPriceInUSD ?? 1;
    if (!workingData) return { healthFactor: null, liquidationScenario: [] };
    const borrows = workingData.userBorrowsData ?? [];
    const debtItem = borrows.find((b) => b.asset.symbol === params.debtSymbol);
    if (!debtItem || debtItem.totalBorrows <= 0) return { healthFactor: null, liquidationScenario: [] };

    if (params.mode === "manual" && params.manualAmount != null) {
      const amount = Math.max(0, params.manualAmount);
      const newQty = Math.max(0, debtItem.totalBorrows - amount);
      const clone = JSON.parse(JSON.stringify(workingData)) as AaveHealthFactorData;
      const cloneDebt = clone.userBorrowsData.find((b) => b.asset.symbol === params.debtSymbol)!;
      cloneDebt.totalBorrows = newQty;
      const updated = updateDerivedHealthFactorData(clone, marketRefPrice);
      const liquidationScenario = getCalculatedLiquidationScenario(updated, marketRefPrice) ?? [];
      return { healthFactor: updated.healthFactor ?? null, liquidationScenario };
    }

    if (
      params.mode === "collateral" &&
      params.collateralSymbol != null &&
      (params.percentage != null || (params.collateralRepayAmount != null && params.collateralRepayAmount > 0))
    ) {
      const reserves = workingData.userReservesData ?? [];
      const collateralItem = reserves.find((r) => r.asset.symbol === params.collateralSymbol);
      const debtReduceUnitsTarget =
        params.collateralRepayAmount != null && params.collateralRepayAmount > 0
          ? Math.min(params.collateralRepayAmount, debtItem.totalBorrows)
          : (params.percentage ?? 0) * debtItem.totalBorrows;
      if (!collateralItem || collateralItem.underlyingBalance <= 0 || debtReduceUnitsTarget <= 0)
        return { healthFactor: null, liquidationScenario: [] };
      const debtPrice = debtItem.asset.priceInUSD || 1;
      const debtReduceUsdTarget = debtReduceUnitsTarget * debtPrice;
      const collateralPrice = collateralItem.asset.priceInUSD || 1;
      const bonus = params.liquidationBonusPct != null && params.liquidationBonusPct > 0
        ? params.liquidationBonusPct / 100
        : 0;

      let actualCollateralUnitsUsed: number;
      let actualDebtReduceUnits: number;

      if (bonus > 0) {
        const collateralUsdSeized = debtReduceUsdTarget * (1 + bonus);
        const collateralUnitsSeized = collateralUsdSeized / collateralPrice;
        actualCollateralUnitsUsed = Math.min(collateralUnitsSeized, collateralItem.underlyingBalance);
        const actualCollateralUsdSeized = actualCollateralUnitsUsed * collateralPrice;
        actualDebtReduceUnits = Math.min(
          actualCollateralUsdSeized / (1 + bonus) / debtPrice,
          debtItem.totalBorrows,
        );
      } else {
        const mult = getSwapFeeMultiplierForSlippageBps(params.slippageBps ?? DEFAULT_SLIPPAGE_BPS);
        const collateralUsdNeeded = debtReduceUsdTarget / mult;
        const collateralUnitsNeeded = collateralUsdNeeded / collateralPrice;
        actualCollateralUnitsUsed = Math.min(collateralUnitsNeeded, collateralItem.underlyingBalance);
        const actualReceiveUsd = actualCollateralUnitsUsed * collateralPrice * mult;
        actualDebtReduceUnits = Math.min(actualReceiveUsd / debtPrice, debtItem.totalBorrows);
      }

      const newCollateralQty = Math.max(0, collateralItem.underlyingBalance - actualCollateralUnitsUsed);
      const newDebtQty = Math.max(0, debtItem.totalBorrows - actualDebtReduceUnits);
      const clone = JSON.parse(JSON.stringify(workingData)) as AaveHealthFactorData;
      const cloneDebt = clone.userBorrowsData.find((b) => b.asset.symbol === params.debtSymbol)!;
      const cloneCollateral = clone.userReservesData.find((r) => r.asset.symbol === params.collateralSymbol)!;
      cloneDebt.totalBorrows = newDebtQty;
      cloneCollateral.underlyingBalance = newCollateralQty;
      const updated = updateDerivedHealthFactorData(clone, marketRefPrice);
      const liquidationScenario = getCalculatedLiquidationScenario(updated, marketRefPrice) ?? [];
      return { healthFactor: updated.healthFactor ?? null, liquidationScenario };
    }
    return { healthFactor: null, liquidationScenario: [] };
  };

  /** Projected health factor and liquidation scenario after borrowing more (no state change). */
  const getProjectedHealthFactorAfterBorrow = (
    symbol: string,
    additionalUnits: number,
  ): { healthFactor: number | null; liquidationScenario: AssetDetails[] } => {
    const marketData = data?.[currentMarket];
    const workingData = marketData?.workingData as AaveHealthFactorData | undefined;
    const marketRefPrice = marketData?.marketReferenceCurrencyPriceInUSD ?? 1;
    const availableAssets = marketData?.availableAssets ?? [];
    if (!workingData || additionalUnits <= 0) return { healthFactor: null, liquidationScenario: [] };
    const clone = JSON.parse(JSON.stringify(workingData)) as AaveHealthFactorData;
    const existing = clone.userBorrowsData.find((b) => b.asset.symbol === symbol);
    if (existing) {
      existing.totalBorrows = existing.totalBorrows + additionalUnits;
    } else {
      const asset = availableAssets.find((a) => a.symbol === symbol);
      if (!asset || !isBorrowableAsset(asset)) return { healthFactor: null, liquidationScenario: [] };
      const newBorrow: BorrowedAssetDataItem = {
        asset: { ...asset },
        totalBorrows: additionalUnits,
        totalBorrowsUSD: 0,
        totalBorrowsMarketReferenceCurrency: 0,
        stableBorrowAPY: 0,
      };
      clone.userBorrowsData.push(newBorrow);
    }
    const updated = updateDerivedHealthFactorData(clone, marketRefPrice);
    const liquidationScenario = getCalculatedLiquidationScenario(updated, marketRefPrice) ?? [];
    return { healthFactor: updated.healthFactor ?? null, liquidationScenario };
  };

  //console.log({ data })

  return {
    isFetching: isLoadingAny,
    currentAddress,
    currentMarket,
    addressData: data,
    addressDataStore: store.addressData?.[currentAddress],
    removeAsset,
    resetCurrentMarketChanges,
    addBorrowAsset,
    addReserveAsset,
    setCurrentMarket,
    setCurrentAddress,
    setBorrowedAssetQuantity,
    setReserveAssetQuantity,
    setAssetPriceInUSD,
    applyLiquidationScenario,
    setUseReserveAssetAsCollateral,
    setTxHistory,
    setRefreshState,
    setRefreshActive,
    isRefreshActive,
    simulateSwapDebt,
    simulateSwapCollateral,
    simulateRepayDebt,
    getProjectedHealthFactorAfterSwapDebt,
    getProjectedHealthFactorAfterSwapCollateral,
    getProjectedHealthFactorAfterRepay,
    getProjectedHealthFactorAfterBorrow,
    applyLoopingStateToPosition,
  };
}

/**
 *
 *  *** Aave-specific Utility Functions ***
 *
 */

export const getHealthFactorColor = (hf: number = 0) => {
  return hf < 1.1 ? "red" : hf > 3 ? "green" : "yellow";
};

export const isStablecoinAsset = (asset: AssetDetails) => {
  const stablecoinSymbols = [
    // Major USD stablecoins used in Aave
    "DAI",
    "USDC",
    "USDT",
    "TUSD",
    "USDP",
    "BUSD",
    "FRAX",
    "LUSD",
    "SUSD",
    "GUSD",
    "USDD",
    "DUSD",
    // Aave-specific stablecoins
    "GHO",
    "USD",
    "EUR",
    "MAI",
    "USDE",
    "SUSDE",
    "EUSDE",
    // Euro stablecoins used in Aave
    "EURT",
    "EURS",
    "AGEUR",
    "PAR",
  ];

  return !!stablecoinSymbols.find((symbol) =>
    asset.symbol?.toUpperCase().includes(symbol),
  );
};

export const isActiveAsset = (asset: AssetDetails) => {
  return asset.isActive && !asset.isPaused && !asset.isFrozen;
};

export const isBorrowableAsset = (asset: AssetDetails) => {
  return isActiveAsset(asset) && asset.borrowingEnabled;
};

export const isSuppliableAsset = (asset: AssetDetails) => {
  return isActiveAsset(asset) && asset.usageAsCollateralEnabled;
};

export const isFlashloanableAsset = (asset: AssetDetails) => {
  return isActiveAsset(asset) && asset.flashLoanEnabled;
};

export const getEligibleLiquidationScenarioReserves = (
  hfData: AaveHealthFactorData,
) => {
  const MINIMUM_CUMULATIVE_RESERVE_USD = 50;
  const MINIMUM_CUMULATIVE_RESERVE_PCT = 5;

  // Check if there are any borrowed assets that are not stablecoins
  // If so, exclude liquidation scenario entirely
  const hasNonStablecoinBorrows = hfData.userBorrowsData.some(
    (borrowItem: BorrowedAssetDataItem) => {
      return !isStablecoinAsset(borrowItem.asset);
    },
  );

  if (hasNonStablecoinBorrows) {
    return [];
  }

  const eligibleReserves: ReserveAssetDataItem[] =
    hfData.userReservesData.filter((reserve: ReserveAssetDataItem) => {
      const isStableCoin = isStablecoinAsset(reserve.asset);
      const isCollateralEnabled = !!reserve.usageAsCollateralEnabledOnUser;
      return !isStableCoin && isCollateralEnabled;
    }) || [];

  let cumulativeReserveUSDValue = 0;
  let cumulativeReserveMRCValue = 0;

  eligibleReserves.forEach((reserve) => {
    cumulativeReserveUSDValue += reserve.underlyingBalanceUSD;
    cumulativeReserveMRCValue +=
      reserve.underlyingBalanceMarketReferenceCurrency;
  });

  const exceedsMinResPct: boolean =
    cumulativeReserveMRCValue >
    hfData.totalCollateralMarketReferenceCurrency *
    (MINIMUM_CUMULATIVE_RESERVE_PCT / 100);
  const exceedsMinResUSD: boolean =
    cumulativeReserveUSDValue > MINIMUM_CUMULATIVE_RESERVE_USD;

  const hasSufficientValue = exceedsMinResPct && exceedsMinResUSD;

  if (!hasSufficientValue) return [];

  // in order for the non-stable reserves to be eligible for a liquidation scenario,
  // there must be at least one borrowed asset that is not included in the
  // eligible supply assets.
  const hasDifferentBorrowedAsset: boolean =
    !!hfData.userBorrowsData.length &&
    !!hfData.userBorrowsData.find(
      (borrowItem: BorrowedAssetDataItem) =>
        !eligibleReserves.find((reserveItem: ReserveAssetDataItem) => {
          return reserveItem.asset.symbol === borrowItem.asset.symbol;
        }),
    );

  return hasDifferentBorrowedAsset ? eligibleReserves : [];
};

/**
 * Assuming that the userReservesData or userBorrowsData has been updated in one of the following ways:
 *
 * - A userReservesData item has been added or removed
 * - A userBorrowsData item has been added or removed
 * - A userReservesData item.underlyingBalance has been modified
 * - A userReservesData item.asset.priceInUSD has been modified
 * - A userBorrowsData item.totalBorrows has been modified
 * - A userBorrowsData item.asset.priceInUSD has been modified
 *
 * This function will update all of the following derived data attributes if the value should change as a
 * result of one or more of the above item updates:
 *
 * (userReservesData) item.asset.priceInMarketReferenceCurrency (priceInUSD / marketReferenceCurrencyPriceInUSD)
 * (userReservesData) item.underlyingBalanceMarketReferenceCurrency (reserveData.priceInMarketReferenceCurrency * underlyingBalance)
 * (userReservesData) item.underlyingBalanceUSD (underlyingBalance * priceInUSD)
 * (userBorrowsData) item.totalBorrowsMarketReferenceCurrency (reserveData.priceInMarketReferenceCurrency * totalBorrows)
 * (userBorrowsData) item.totalBorrowsUSD (totalBorrows * asset.priceInUSD)
 * totalCollateralMarketReferenceCurrency
 * currentLiquidationThreshold
 * currentLoanToValue
 * healthFactor
 * availableBorrowsUSD
 *
 * @param hfData the healthFactorData to update
 * @returns hfData the updated healthFactorData
 */
export const updateDerivedHealthFactorData = (
  data: AaveHealthFactorData,
  currentMarketReferenceCurrencyPriceInUSD: number,
) => {
  let updatedCurrentLiquidationThreshold: BigNumber = new BigNumber(0);
  let updatedCurrentLoanToValue: BigNumber = new BigNumber(0);
  let updatedHealthFactor: BigNumber = new BigNumber(0);
  let updatedAvailableBorrowsUSD: BigNumber = new BigNumber(0);
  let updatedAvailableBorrowsMarketReferenceCurrency: BigNumber = new BigNumber(
    0,
  );
  let updatedTotalBorrowsUSD: BigNumber = new BigNumber(0);

  let updatedCollateral: BigNumber = new BigNumber(0);
  let weightedReservesETH: BigNumber = new BigNumber(0);
  let weightedLTVETH: BigNumber = new BigNumber(0);
  let totalBorrowsETH: BigNumber = new BigNumber(0);

  data.userReservesData.forEach((reserveItem) => {
    const underlyingBalance: BigNumber = new BigNumber(
      reserveItem.underlyingBalance,
    );
    const priceInUSD: BigNumber = new BigNumber(reserveItem.asset.priceInUSD);

    // Update reserveItem.priceInMarketReferenceCurrency
    const existingPriceInMarketReferenceCurrency = new BigNumber(
      reserveItem.asset.priceInMarketReferenceCurrency,
    );
    const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
      currentMarketReferenceCurrencyPriceInUSD,
    );
    if (
      !existingPriceInMarketReferenceCurrency.isEqualTo(
        updatedMarketReferenceCurrency,
      )
    ) {
      reserveItem.asset.priceInMarketReferenceCurrency =
        updatedMarketReferenceCurrency.toNumber();
    }

    // Update reserveItem.underlyingBalanceMarketReferenceCurrency
    const existingUnderlyingBalanceMarketReferenceCurrency: BigNumber =
      new BigNumber(reserveItem.underlyingBalanceMarketReferenceCurrency);
    const updatedUnderlyingBalanceMarketReferenceCurrency =
      updatedMarketReferenceCurrency.multipliedBy(underlyingBalance);
    if (
      !existingUnderlyingBalanceMarketReferenceCurrency.isEqualTo(
        updatedUnderlyingBalanceMarketReferenceCurrency,
      )
    ) {
      reserveItem.underlyingBalanceMarketReferenceCurrency =
        updatedUnderlyingBalanceMarketReferenceCurrency.toNumber();
    }

    // Update reserveItem.underlyingBalanceUSD
    const existingUnderlyingBalanceUSD = new BigNumber(
      reserveItem.underlyingBalanceUSD,
    );
    const updatedUnderlyingBalanceUSD =
      underlyingBalance.multipliedBy(priceInUSD);
    if (!existingUnderlyingBalanceUSD.isEqualTo(updatedUnderlyingBalanceUSD)) {
      reserveItem.underlyingBalanceUSD = updatedUnderlyingBalanceUSD.toNumber();
    }

    // Update the necessary accumulated values for updating healthFactor etc.
    if (reserveItem.usageAsCollateralEnabledOnUser) {
      updatedCollateral = updatedCollateral.plus(
        updatedUnderlyingBalanceMarketReferenceCurrency,
      );

      const isEmode: boolean =
        !!reserveItem.asset.eModeCategoryId &&
        reserveItem.asset.eModeCategoryId === data.userEmodeCategoryId;
      const lt: number = isEmode
        ? reserveItem.asset.eModeLiquidationThreshold || 0
        : reserveItem.asset.reserveLiquidationThreshold || 0;

      const ltv: number = isEmode
        ? reserveItem.asset.eModeLtv || 0
        : reserveItem.asset.baseLTVasCollateral || 0;

      const itemReserveLiquidationThreshold: BigNumber = new BigNumber(
        lt,
      ).dividedBy(10000);
      const itemBaseLoanToValue: BigNumber = new BigNumber(ltv).dividedBy(
        10000,
      );

      weightedReservesETH = weightedReservesETH.plus(
        itemReserveLiquidationThreshold.multipliedBy(
          updatedUnderlyingBalanceMarketReferenceCurrency,
        ),
      );
      weightedLTVETH = weightedLTVETH.plus(
        itemBaseLoanToValue.multipliedBy(
          updatedUnderlyingBalanceMarketReferenceCurrency,
        ),
      );
    }
  });

  data.userBorrowsData.forEach((borrowItem) => {
    const totalBorrows: BigNumber = new BigNumber(borrowItem.totalBorrows);
    const priceInUSD: BigNumber = new BigNumber(borrowItem.asset.priceInUSD);

    // Update borrowItem.priceInMarketReferenceCurrency
    const existingPriceInMarketReferenceCurrency = new BigNumber(
      borrowItem.asset.priceInMarketReferenceCurrency,
    );
    const updatedMarketReferenceCurrency = priceInUSD.dividedBy(
      currentMarketReferenceCurrencyPriceInUSD,
    );
    if (
      !existingPriceInMarketReferenceCurrency.isEqualTo(
        updatedMarketReferenceCurrency,
      )
    ) {
      borrowItem.asset.priceInMarketReferenceCurrency =
        updatedMarketReferenceCurrency.toNumber();
    }

    // Update borrowItem.totalBorrowsMarketReferenceCurrency
    const existingTotalBorrowsMarketReferenceCurrency: BigNumber =
      new BigNumber(borrowItem.totalBorrowsMarketReferenceCurrency);
    const updatedTotalBorrowsMarketReferenceCurrency =
      updatedMarketReferenceCurrency.multipliedBy(totalBorrows);
    if (
      !existingTotalBorrowsMarketReferenceCurrency.isEqualTo(
        updatedTotalBorrowsMarketReferenceCurrency,
      )
    ) {
      borrowItem.totalBorrowsMarketReferenceCurrency =
        updatedTotalBorrowsMarketReferenceCurrency.toNumber();
    }

    // Update borrowItem.totalBorrowsUSD
    const existingTotalBorrowsUSD = new BigNumber(borrowItem.totalBorrowsUSD);
    const updatedTotalBorrowsUSD = totalBorrows.multipliedBy(priceInUSD);
    if (!existingTotalBorrowsUSD.isEqualTo(updatedTotalBorrowsUSD)) {
      borrowItem.totalBorrowsUSD = updatedTotalBorrowsUSD.toNumber();
    }

    // Update the necessary accumulated values for updating healthFactor etc.
    totalBorrowsETH = totalBorrowsETH.plus(
      updatedTotalBorrowsMarketReferenceCurrency,
    );
  });

  // Update "totalCollateralMarketReferenceCurrency"
  if (
    !updatedCollateral.isEqualTo(
      new BigNumber(data.totalCollateralMarketReferenceCurrency),
    )
  ) {
    data.totalCollateralMarketReferenceCurrency = updatedCollateral.toNumber();
  }

  // Update "totalBorrowsMarketReferenceCurrency"
  if (
    !totalBorrowsETH.isEqualTo(
      new BigNumber(data.totalBorrowsMarketReferenceCurrency),
    )
  ) {
    data.totalBorrowsMarketReferenceCurrency = totalBorrowsETH.toNumber();
  }

  // Updated "currentLiquidationThreshold"
  if (
    weightedReservesETH.isGreaterThan(0) &&
    updatedCollateral.isGreaterThan(0)
  ) {
    updatedCurrentLiquidationThreshold =
      weightedReservesETH.dividedBy(updatedCollateral);
  }

  if (
    !updatedCurrentLiquidationThreshold.isEqualTo(
      new BigNumber(data.currentLiquidationThreshold),
    )
  ) {
    data.currentLiquidationThreshold =
      updatedCurrentLiquidationThreshold.toNumber();
  }

  // Update "currentLoanToValue"
  if (weightedLTVETH.isGreaterThan(0) && updatedCollateral.isGreaterThan(0)) {
    updatedCurrentLoanToValue = weightedLTVETH.dividedBy(updatedCollateral);
  }
  if (
    !updatedCurrentLoanToValue.isEqualTo(new BigNumber(data.currentLoanToValue))
  ) {
    data.currentLoanToValue = updatedCurrentLoanToValue.toNumber();
  }

  // Update "healthFactor"
  if (
    updatedCollateral.isGreaterThan(0) &&
    totalBorrowsETH.isGreaterThan(0) &&
    updatedCurrentLiquidationThreshold.isGreaterThan(0)
  ) {
    updatedHealthFactor = updatedCollateral
      .multipliedBy(updatedCurrentLiquidationThreshold)
      .dividedBy(totalBorrowsETH);
  } else if (totalBorrowsETH.isEqualTo(0)) {
    updatedHealthFactor = new BigNumber(Infinity);
  }

  if (!updatedHealthFactor.isEqualTo(new BigNumber(data.healthFactor))) {
    data.healthFactor = updatedHealthFactor.toNumber();
  }

  // Update "availableBorrowsUSD"
  updatedAvailableBorrowsMarketReferenceCurrency = updatedCollateral
    .multipliedBy(updatedCurrentLoanToValue)
    .minus(totalBorrowsETH);
  updatedAvailableBorrowsUSD =
    updatedAvailableBorrowsMarketReferenceCurrency.multipliedBy(
      currentMarketReferenceCurrencyPriceInUSD,
    );

  if (updatedAvailableBorrowsUSD.isLessThan(0))
    updatedAvailableBorrowsUSD = new BigNumber(0);

  if (
    !updatedAvailableBorrowsUSD.isEqualTo(
      new BigNumber(data.availableBorrowsUSD),
    )
  ) {
    data.availableBorrowsUSD = updatedAvailableBorrowsUSD.toNumber();
  }

  // Update "totalBorrowsUSD"
  updatedTotalBorrowsUSD = totalBorrowsETH.multipliedBy(
    currentMarketReferenceCurrencyPriceInUSD,
  );

  if (!updatedTotalBorrowsUSD.isEqualTo(new BigNumber(data.totalBorrowsUSD))) {
    data.totalBorrowsUSD = updatedTotalBorrowsUSD.toNumber();
  }

  return data;
};

/**
 *
 * @param hfData AaveHealthFactorData
 * @param currentMarketReferenceCurrencyPriceInUSD number
 * @returns AssetDetails[]
 *
 * Given a working position, return assets with updated priceInUSD that when applied would result in an hf ~1.00
 *
 */
export const getCalculatedLiquidationScenario = (
  hfData: AaveHealthFactorData,
  currentMarketReferenceCurrencyPriceInUSD: number,
) => {
  if (!hfData) return [];
  // deep clone to avoid mutating state
  hfData = JSON.parse(JSON.stringify(hfData)) as AaveHealthFactorData;

  const reserves: ReserveAssetDataItem[] =
    getEligibleLiquidationScenarioReserves(hfData);

  let assets: AssetDetails[] = reserves.map(
    (res: ReserveAssetDataItem) => res.asset,
  );

  let hf: number = hfData?.healthFactor || -1;

  const HF_LIMIT: number = 1.0049999999999;

  if (!assets.length || hf === Infinity || hf === -1) return [];

  // If the rounded hf === 1.00, just use the current asset prices since they represent a valid liquidation scenario.
  if (Math.round((hf + Number.EPSILON) * 100) / 100 === 1.0) {
    return assets;
  }

  // We're going to somewhat naively (and inefficiently) loop while we iteratively manipulate the asset
  // price until we get a HF that approaches ~1.00. While there is definitely more efficient
  // means of calculating the asset prices that would result in a hf of ~1.00, handling all the edge
  // cases with that approach proved rather elusive.

  let i = 0;

  // I don't expect this limit to get approached, but just in case things go haywire, don't let the app crash.
  const SHORT_CIRCUIT_LOOP_LIMIT = 500;

  // First, if we're below the HF_LIMIT, iteratively increase the price until hf > HF_LIMIT
  while (hf < HF_LIMIT && i < SHORT_CIRCUIT_LOOP_LIMIT) {
    i++;

    assets.forEach((asset) => {
      let priceIncrement = (asset.priceInUSD || 1) * 0.1;

      priceIncrement =
        Math.round((priceIncrement + Number.EPSILON) * 100) / 100;

      asset.priceInUSD = asset.priceInUSD + priceIncrement;

      const reserveItemAsset = hfData.userReservesData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (reserveItemAsset)
        reserveItemAsset.asset.priceInUSD = asset.priceInUSD;

      const borrowItemAsset = hfData.userBorrowsData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (borrowItemAsset) borrowItemAsset.asset.priceInUSD = asset.priceInUSD;

      const updatedWorkingData = updateDerivedHealthFactorData(
        hfData,
        currentMarketReferenceCurrencyPriceInUSD,
      );

      hf = updatedWorkingData.healthFactor;
    });
  }

  let shortCircuit = false;

  // Next, uniformly decrement the asset prices until we approach the liquidation threshold.
  while (hf > HF_LIMIT && i < SHORT_CIRCUIT_LOOP_LIMIT && !shortCircuit) {
    i++;

    // Track a uniform percentage to decrement asset prices, so that the overall decrement percentage
    // for all assets will be approximately the same.
    let decrementPercentage = 0;

    assets.forEach((asset) => {
      if (hf < HF_LIMIT) return;

      const initialPrice = asset.priceInUSD;

      let priceDecrement = decrementPercentage
        ? // Use the uniform percentage, if we  have it
        Math.max(0.01, (decrementPercentage * asset.priceInUSD) / 100)
        : // Else use an approximation based on the difference between current hf and HF_LIMIT
        Math.max(
          0.01,
          Math.min(
            asset.priceInUSD * ((hf - HF_LIMIT) * 0.45),
            asset.priceInUSD * 0.5,
          ),
        );

      priceDecrement =
        Math.round((priceDecrement + Number.EPSILON) * 100) / 100;

      if (!decrementPercentage) {
        decrementPercentage = (priceDecrement * 100) / asset.priceInUSD;
      }

      asset.priceInUSD = Math.max(asset.priceInUSD - priceDecrement, 0.01);

      // If all asset prices needs to go below one cent in order to arrive at liquidation threshold,
      // short circuit the operation and assume there is no viable price liquidation scenario for this
      // position.
      if (asset.priceInUSD === 0.01) {
        if (!assets.find((asset) => asset.priceInUSD > 0.01)) {
          shortCircuit = true;
        }
      }

      const reserveItemAsset = hfData.userReservesData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (reserveItemAsset)
        reserveItemAsset.asset.priceInUSD = asset.priceInUSD;

      const borrowItemAsset = hfData.userBorrowsData.find(
        (item) => item.asset.symbol === asset.symbol,
      );

      if (borrowItemAsset) borrowItemAsset.asset.priceInUSD = asset.priceInUSD;

      const updatedWorkingData = updateDerivedHealthFactorData(
        hfData,
        currentMarketReferenceCurrencyPriceInUSD,
      );

      if (updatedWorkingData.healthFactor < 1.0) {
        asset.priceInUSD = initialPrice;
        return;
      }

      hf = updatedWorkingData.healthFactor;
    });
  }

  if (shortCircuit || i === SHORT_CIRCUIT_LOOP_LIMIT) assets = [];

  return assets;
};

export const getIconNameFromAssetSymbol = (assetSymbol: string) => {
  if (!assetSymbol) return "";


  let iconName = assetSymbol.toLowerCase();


  // Handle special PT (Principal Token) cases
  if (iconName.includes("pt-")) {
    // Extract the base token from PT tokens
    // e.g., "PT-eUSDE-14AUG2025" -> "eusde"
    // e.g., "PT-sUSDE-25SEP2025" -> "susde"
    // e.g., "PT-USDe-31JUL2025" -> "usde"
    const ptMatch = iconName.match(/pt-(.+?)-/);
    if (ptMatch) {
      iconName = ptMatch[1];
    }
  }


  // Handle Ethereal/Ethena tokens
  if (iconName.includes("ethereal") || iconName.includes("ethena")) {
    // Extract the base token from the long name
    // e.g., "PT Ethereal eUSDE 14AUG2025" -> "eusde"
    // e.g., "PT Ethena sUSDE 25SEP2025" -> "susde"
    const etherealMatch = iconName.match(/(eusde|susde|usde)/);
    if (etherealMatch) {
      iconName = etherealMatch[1];
    }
  }


  // Apply standard transformations
  iconName = iconName
    .replace(".e", "")
    .replace(".b", "")
    .replace("m.", "")
    .replace("btcb", "btc");


  return iconName;
};

export const getIconNameFromMarket = (market?: AaveMarketDataType) => {
  return (
    market?.id
      ?.split("_")[0]
      .replace("BNB", "binance") // special case... follow aave interface convention
      .toLowerCase() || ""
  );
};
