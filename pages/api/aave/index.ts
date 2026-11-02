import type { NextApiRequest, NextApiResponse } from "next";
import { ethers } from "ethers";
import {
  UiPoolDataProvider,
  UiPoolDataProviderContext,
  UiIncentiveDataProvider,
  UiIncentiveDataProviderContext
} from "@aave/contract-helpers";
import dayjs from "dayjs";
import {
  ComputedUserReserve,
  FormatUserSummaryResponse,
  formatReserves,
  formatReservesAndIncentives,
  formatUserSummary,
  formatUserSummaryAndIncentives,
} from "@aave/math-utils";
import BigNumber from "bignumber.js";
import {
  AaveHealthFactorData,
  AaveMarketDataType,
  AssetDetails,
  BorrowedAssetDataItem,
  EmodeCategoryConfig,
  HealthFactorData,
  ReserveAssetDataItem,
  SIMULATED_EMODE_FALLBACK_CATEGORY_ID,
  getCalculatedLiquidationScenario,
  markets,
} from "../../../hooks/useAaveData";
import { getResolvedAddress } from "../resolver";

const allowedMethods = ["POST", "OPTIONS"];

const EMODE_POOL_ABI = [
  "function getReservesList() view returns (address[])",
  "function getEModeCategoryCollateralConfig(uint8 id) view returns (uint16 ltv, uint16 liquidationThreshold, uint16 liquidationBonus)",
  "function getEModeCategoryCollateralBitmap(uint8 id) view returns (uint128)",
  "function getEModeCategoryLtvzeroBitmap(uint8 id) view returns (uint128)",
  "function getIsEModeCategoryIsolated(uint8 id) view returns (bool)",
];

const POOL_ADDRESS_PROVIDER_ABI = [
  "function getPool() view returns (address)",
];

/** Symbols whose reserve-list index is set on an E-Mode bitmap. */
const symbolsEnabledOnBitmap = (
  bitmap: ethers.BigNumberish,
  reservesList: string[],
  symbolByUnderlying: Map<string, string>,
): string[] => {
  let bits = new BigNumber(bitmap.toString());
  const symbols: string[] = [];
  reservesList.forEach((address) => {
    if (bits.mod(2).isEqualTo(1)) {
      const symbol = symbolByUnderlying.get(address.toLowerCase());
      if (symbol) symbols.push(symbol.toUpperCase());
    }
    bits = bits.dividedToIntegerBy(2);
  });
  return symbols;
};

/**
 * Read current E-Mode LTV and liquidation threshold from the pool.
 * The UI data provider still reports reserve eModeCategoryId as 0, so its
 * eModeLtv / eModeLiquidationThreshold fields stay at 0 after Aave moved
 * those limits onto the category collateral bitmap.
 */
const loadEmodeCategories = async (
  provider: ethers.providers.Provider,
  poolAddress: string,
  reservesData: { symbol?: string; underlyingAsset?: string }[],
  categoryIds: number[],
): Promise<Record<number, EmodeCategoryConfig>> => {
  const categories: Record<number, EmodeCategoryConfig> = {};
  if (!poolAddress || categoryIds.length === 0) return categories;

  const pool = new ethers.Contract(poolAddress, EMODE_POOL_ABI, provider);
  let reservesList: string[] = [];
  try {
    reservesList = await pool.getReservesList();
  } catch (err) {
    console.error("Failed to load reserves list for eMode", err);
    return categories;
  }

  const symbolByUnderlying = new Map<string, string>();
  reservesData.forEach((reserve) => {
    if (reserve.underlyingAsset && reserve.symbol) {
      symbolByUnderlying.set(
        reserve.underlyingAsset.toLowerCase(),
        reserve.symbol,
      );
    }
  });

  await Promise.all(
    categoryIds.map(async (id) => {
      try {
        const [config, collateralBitmap] = await Promise.all([
          pool.getEModeCategoryCollateralConfig(id),
          pool.getEModeCategoryCollateralBitmap(id),
        ]);
        const liquidationThreshold = Number(config.liquidationThreshold);
        if (!liquidationThreshold) return;

        let ltvzeroBitmap: ethers.BigNumberish = 0;
        let isolated = false;
        try {
          [ltvzeroBitmap, isolated] = await Promise.all([
            pool.getEModeCategoryLtvzeroBitmap(id),
            pool.getIsEModeCategoryIsolated(id),
          ]);
        } catch {
          // Pools from before bitmap eModes do not expose these getters.
        }

        categories[id] = {
          ltv: Number(config.ltv),
          liquidationThreshold,
          isolated: Boolean(isolated),
          collateralSymbols: symbolsEnabledOnBitmap(
            collateralBitmap,
            reservesList,
            symbolByUnderlying,
          ),
          ltvzeroSymbols: symbolsEnabledOnBitmap(
            ltvzeroBitmap,
            reservesList,
            symbolByUnderlying,
          ),
        };
      } catch (err) {
        console.error(`Failed to load eMode category ${id}`, err);
      }
    }),
  );

  return categories;
};

const handler = async (_req: NextApiRequest, res: NextApiResponse) => {
  try {
    if (!allowedMethods.includes(_req.method!)) {
      return res.status(405).send({ message: "Method not allowed." });
    }

    const { address } = JSON.parse(_req.body);
    const { marketId } = JSON.parse(_req.body);

    const market = markets.find(
      (m: AaveMarketDataType) => m.id === marketId
    ) as AaveMarketDataType;
    const data: HealthFactorData = await getAaveData(address, market);
    res.status(200).json(data);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ statusCode: 500, message: err.message });
  }
};

export const getAaveData = async (address: string, market: AaveMarketDataType) => {
  const provider = new ethers.providers.StaticJsonRpcProvider(
    market.api,
    market.chainId
  );

  const UiPoolDataCtx: UiPoolDataProviderContext = {
    uiPoolDataProviderAddress: market.addresses.UI_POOL_DATA_PROVIDER,
    provider,
    chainId: market.chainId,
  };
  const poolDataProviderContract = new UiPoolDataProvider(UiPoolDataCtx);

  const UiIncentiveDataCtx: UiIncentiveDataProviderContext = {
    uiIncentiveDataProviderAddress: market.addresses.UI_INCENTIVE_DATA_PROVIDER,
    provider,
    chainId: market.chainId,
  };

  const incentiveDataProviderContract = new UiIncentiveDataProvider(UiIncentiveDataCtx);

  const user = (await getResolvedAddress(address)) || "0x87cCC67f0c1b67745989542152DD4acff3841CD6";
  const addressesProvider = new ethers.Contract(
    market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
    POOL_ADDRESS_PROVIDER_ABI,
    provider,
  );

  const [reserves, userReserves, reserveIncentives, userIncentives, poolAddress] = await Promise.all([
    poolDataProviderContract.getReservesHumanized({
      lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
    }),
    poolDataProviderContract.getUserReservesHumanized({
      lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
      user
    }),
    incentiveDataProviderContract.getReservesIncentivesDataHumanized({
      lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER
    }),
    incentiveDataProviderContract.getUserReservesIncentivesDataHumanized({
      lendingPoolAddressProvider: market.addresses.LENDING_POOL_ADDRESS_PROVIDER,
      user
    }),
    addressesProvider.getPool().catch(() => ""),
  ]);

  const reservesArray = reserves.reservesData;
  const { baseCurrencyData } = reserves;
  const userReservesArray = userReserves.userReserves;

  const currentTimestamp = dayjs().unix();

  const formattedPoolReserves = formatReservesAndIncentives({
    reserves: reservesArray,
    currentTimestamp,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    reserveIncentives
  });

  const userSummary = formatUserSummaryAndIncentives({
    currentTimestamp,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    userReserves: userReservesArray,
    formattedReserves: formattedPoolReserves,
    userEmodeCategoryId: userReserves.userEmodeCategoryId,
    reserveIncentives,
    userIncentives
  });

  const userCategoryId = Number(userReserves.userEmodeCategoryId) || 0;
  const categoryIds = Array.from(
    new Set(
      [userCategoryId, SIMULATED_EMODE_FALLBACK_CATEGORY_ID].filter((id) => id > 0),
    ),
  );
  const emodeCategories = await loadEmodeCategories(
    provider,
    poolAddress,
    reservesArray,
    categoryIds,
  );

  const hf: HealthFactorData = aaveUserSummaryToHealthFactor(
    userSummary,
    address,
    user, // if address is an ens, user will point to the resolved address.
    market,
    baseCurrencyData,
    userReserves.userEmodeCategoryId,
    emodeCategories,
  );
  return hf;
};

const aaveUserSummaryToHealthFactor = (
  userSummary: FormatUserSummaryResponse,
  address: string,
  resolvedAddress: string,
  market: AaveMarketDataType,
  baseCurrencyData: any,
  userEmodeCategoryId: number,
  emodeCategories?: Record<number, EmodeCategoryConfig>,
) => {
  const getAssetDetailsFromReserveItem = (reserveItem: ComputedUserReserve) => {
    const { reserve } = reserveItem;
    const details: AssetDetails = {
      symbol: reserve.symbol,
      name: reserve.name,
      priceInUSD: Number(reserve.priceInUSD),
      priceInMarketReferenceCurrency: new BigNumber(
        reserve.priceInMarketReferenceCurrency
      )
        .shiftedBy(baseCurrencyData.marketReferenceCurrencyDecimals * -1)
        .toNumber(),
      baseLTVasCollateral: Number(reserve.baseLTVasCollateral),
      reserveFactor: Number(reserve.reserveFactor),
      usageAsCollateralEnabled: reserve.usageAsCollateralEnabled,
      reserveLiquidationThreshold: Number(
        reserve.reserveLiquidationThreshold
      ),
      initialPriceInUSD: Number(reserve.priceInUSD),
      aTokenAddress: reserve.aTokenAddress,
      stableDebtTokenAddress: reserve.stableDebtTokenAddress,
      variableDebtTokenAddress: reserve.variableDebtTokenAddress,
      underlyingAsset: reserve.underlyingAsset,
      flashLoanEnabled: reserve.flashLoanEnabled,
      borrowingEnabled: reserve.borrowingEnabled,
      isFrozen: reserve.isFrozen,
      isPaused: reserve.isPaused,
      isActive: reserve.isActive,
      supplyAPY: Number(reserve.supplyAPY),
      variableBorrowAPY: Number(reserve.variableBorrowAPY),
      stableBorrowAPY: Number(reserve.stableBorrowAPY),
      supplyAPR: Number(reserve.supplyAPR),
      variableBorrowAPR: Number(reserve.variableBorrowAPR),
      stableBorrowAPR: Number(reserve.stableBorrowAPR),
      availableLiquidity: Number(reserve.availableLiquidity),
      borrowCap: Number(reserve.borrowCap),
      supplyCap: Number(reserve.supplyCap),
      eModeLtv: Number(reserve.eModeLtv),
      eModeLiquidationThreshold: Number(reserve.eModeLiquidationThreshold),
      eModeCategoryId: Number(reserve.eModeCategoryId),
      eModeLabel: reserve.eModeLabel,
      borrowableInIsolation: Boolean(reserve.borrowableInIsolation),
      isSiloedBorrowing: Boolean(reserve.isSiloedBorrowing)
    };
    return details;
  };

  const reserveData = {
    healthFactor: Number(userSummary?.healthFactor),
    totalBorrowsUSD: Number(userSummary?.totalBorrowsUSD),
    availableBorrowsUSD: Number(userSummary?.availableBorrowsUSD),
    totalCollateralMarketReferenceCurrency: Number(
      userSummary?.totalCollateralMarketReferenceCurrency
    ),
    totalBorrowsMarketReferenceCurrency: Number(
      userSummary?.totalBorrowsMarketReferenceCurrency
    ),
    currentLiquidationThreshold: Number(
      userSummary?.currentLiquidationThreshold
    ),
    currentLoanToValue: Number(userSummary?.currentLoanToValue),
    userReservesData: userSummary?.userReservesData
      ?.filter(
        (reserveItem: ComputedUserReserve) =>
          reserveItem?.underlyingBalance &&
          reserveItem.underlyingBalance !== "0"
      )
      .map((reserveItem: ComputedUserReserve) => {
        const item: ReserveAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          underlyingBalance: Number(reserveItem.underlyingBalance),
          underlyingBalanceUSD: Number(reserveItem.underlyingBalanceUSD),
          underlyingBalanceMarketReferenceCurrency: Number(
            reserveItem.underlyingBalanceMarketReferenceCurrency
          ),
          usageAsCollateralEnabledOnUser:
            reserveItem.usageAsCollateralEnabledOnUser,
        };
        return item;
      }),
    userBorrowsData: userSummary?.userReservesData
      ?.filter(
        (reserveItem: ComputedUserReserve) =>
          reserveItem?.totalBorrows && reserveItem.totalBorrows !== "0"
      )
      .map((reserveItem: ComputedUserReserve) => {
        const item: BorrowedAssetDataItem = {
          asset: getAssetDetailsFromReserveItem(reserveItem),
          stableBorrows: Number(reserveItem.stableBorrows),
          variableBorrows: Number(reserveItem.variableBorrows),
          totalBorrowsUSD: Number(reserveItem.totalBorrowsUSD),
          totalBorrows: Number(reserveItem.totalBorrows),
          stableBorrowAPY: Number(reserveItem.stableBorrowAPY),
          totalBorrowsMarketReferenceCurrency: Number(
            reserveItem.totalBorrowsMarketReferenceCurrency
          ),
        };

        return item;
      }),
    userEmodeCategoryId,
    isInIsolationMode: userSummary.isInIsolationMode,
  };
  const reserveDataCopy = { ...reserveData };

  const marketReferenceCurrencyPriceInUSD = new BigNumber(
    baseCurrencyData.marketReferenceCurrencyPriceInUsd
  )
    .shiftedBy(-8)
    .toNumber();

  const fetchedData = {
    healthFactor: reserveData.healthFactor,
    totalBorrowsUSD: reserveData.totalBorrowsUSD,
    availableBorrowsUSD: reserveData.availableBorrowsUSD,
    totalCollateralMarketReferenceCurrency:
      reserveData.totalCollateralMarketReferenceCurrency,
    totalBorrowsMarketReferenceCurrency:
      reserveData.totalBorrowsMarketReferenceCurrency,
    currentLiquidationThreshold: reserveData.currentLiquidationThreshold,
    currentLoanToValue: reserveData.currentLoanToValue,
    userReservesData: reserveData.userReservesData,
    userBorrowsData: reserveData.userBorrowsData,
    userEmodeCategoryId: reserveData.userEmodeCategoryId,
    isInIsolationMode: reserveData.isInIsolationMode,
    ...(emodeCategories && Object.keys(emodeCategories).length
      ? { emodeCategories }
      : {}),
  };

  const hf: HealthFactorData = {
    address,
    resolvedAddress,
    fetchError: "",
    isFetching: false,
    lastFetched: Date.now(),
    market,
    marketReferenceCurrencyPriceInUSD,
    availableAssets: userSummary.userReservesData.map((asset) =>
      getAssetDetailsFromReserveItem(asset)
    ),
    fetchedData,
    workingData: JSON.parse(JSON.stringify(fetchedData)),
  };
  const liquidationScenario = getCalculatedLiquidationScenario(
    hf.workingData as AaveHealthFactorData,
    marketReferenceCurrencyPriceInUSD
  );
  hf.workingData.liquidationScenario = liquidationScenario;
  return hf;
};

export default handler;
