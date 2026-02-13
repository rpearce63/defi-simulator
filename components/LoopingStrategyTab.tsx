import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  SegmentedControl,
} from "@mantine/core";
import {
  useAaveData,
  updateDerivedHealthFactorData,
  ReserveAssetDataItem,
  BorrowedAssetDataItem,
  AaveHealthFactorData,
  AssetDetails,
} from "../hooks/useAaveData";

const COLLATERAL_SYMBOL = "cbBTC";
const BORROW_SYMBOL = "USDC";

type ConstraintMode = "minHF" | "maxLTV" | "both";

type LoopingStrategyTabProps = {
  onApplyToPosition?: () => void;
};

export default function LoopingStrategyTab({ onApplyToPosition }: LoopingStrategyTabProps) {
  const { addressData, currentMarket, applyLoopingStateToPosition } = useAaveData("");
  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const marketRefPrice = addressData?.[currentMarket]?.marketReferenceCurrencyPriceInUSD ?? 1;
  const reserves = addressData?.[currentMarket]?.workingData?.userReservesData ?? [];
  const borrows = addressData?.[currentMarket]?.workingData?.userBorrowsData ?? [];

  const [useCurrentPosition, setUseCurrentPosition] = React.useState(true);
  const [initialCbBTC, setInitialCbBTC] = React.useState<number | string>("");
  const [initialUSDC, setInitialUSDC] = React.useState<number | string>("");
  const [borrowPerLoopUSD, setBorrowPerLoopUSD] = React.useState<number | string>("");
  const [numLoops, setNumLoops] = React.useState(3);
  const [constraintMode, setConstraintMode] = React.useState<ConstraintMode>("minHF");
  const [minHF, setMinHF] = React.useState(2);
  const [maxLTVPct, setMaxLTVPct] = React.useState(80);

  const cbBTCAsset = availableAssets.find(
    (a) => a.symbol.toUpperCase() === COLLATERAL_SYMBOL.toUpperCase()
  ) as AssetDetails | undefined;
  const usdcAsset = availableAssets.find(
    (a) => a.symbol.toUpperCase() === BORROW_SYMBOL.toUpperCase()
  ) as AssetDetails | undefined;

  const cbBTCRecentBalance = reserves.find(
    (r) => r.asset.symbol.toUpperCase() === COLLATERAL_SYMBOL.toUpperCase()
  )?.underlyingBalance ?? 0;
  const usdcRecentDebt = borrows.find(
    (b) => b.asset.symbol.toUpperCase() === BORROW_SYMBOL.toUpperCase()
  )?.totalBorrows ?? 0;

  const priceCbBTC = cbBTCAsset?.priceInUSD ?? 1;
  const priceUSDC = usdcAsset?.priceInUSD ?? 1;
  const ltvBps = cbBTCAsset?.baseLTVasCollateral ?? 7500; // 75%
  const liqThresholdBps = cbBTCAsset?.reserveLiquidationThreshold ?? 7800; // 78%
  const ltv = ltvBps / 10000;
  const liqThreshold = liqThresholdBps / 10000;

  const initialCollateral =
    useCurrentPosition && cbBTCRecentBalance >= 0
      ? cbBTCRecentBalance
      : typeof initialCbBTC === "number"
        ? initialCbBTC
        : parseFloat(String(initialCbBTC).trim()) || 0;
  const initialDebt =
    useCurrentPosition && usdcRecentDebt >= 0
      ? usdcRecentDebt
      : typeof initialUSDC === "number"
        ? initialUSDC
        : parseFloat(String(initialUSDC).trim()) || 0;

  const borrowPerLoop =
    typeof borrowPerLoopUSD === "number"
      ? borrowPerLoopUSD
      : parseFloat(String(borrowPerLoopUSD).trim()) || 0;

  const steps = React.useMemo(() => {
    if (!cbBTCAsset || !usdcAsset) return [];
    const rows: Array<{
      loop: number;
      label: string;
      collateralCbBTC: number;
      debtUSDC: number;
      collateralUSD: number;
      debtUSD: number;
      borrowThisLoop: number;
      availableBorrowsUSD: number;
      hf: number;
      ltvPct: number;
    }> = [];
    let collateralCbBTC = initialCollateral;
    let debtUSDC = initialDebt;
    const marketRef = marketRefPrice;

    const pushRow = (loop: number, label: string, borrowThisLoop: number) => {
      const colUsd = collateralCbBTC * priceCbBTC;
      const debUsd = debtUSDC * priceUSDC;
      const syntheticAfter = buildSyntheticPosition(cbBTCAsset, usdcAsset, collateralCbBTC, debtUSDC, marketRef);
      updateDerivedHealthFactorData(syntheticAfter, marketRef);
      const hf = syntheticAfter.healthFactor ?? 0;
      const availableBorrowsUSD = Math.max(syntheticAfter.availableBorrowsUSD ?? 0, 0);
      const ltvPct = colUsd > 0 ? (100 * debUsd) / colUsd : 0;
      rows.push({
        loop,
        label,
        collateralCbBTC,
        debtUSDC,
        collateralUSD: colUsd,
        debtUSD: debUsd,
        borrowThisLoop,
        availableBorrowsUSD,
        hf,
        ltvPct,
      });
    };

    pushRow(0, "Start", 0);

    for (let i = 1; i <= numLoops; i++) {
      const collateralUSD = collateralCbBTC * priceCbBTC;
      const debtUSD = debtUSDC * priceUSDC;

      const synthetic: AaveHealthFactorData = buildSyntheticPosition(
        cbBTCAsset,
        usdcAsset,
        collateralCbBTC,
        debtUSDC,
        marketRef
      );
      updateDerivedHealthFactorData(synthetic, marketRef);
      const availableBorrowsUSD = Math.max(synthetic.availableBorrowsUSD ?? 0, 0);

      let maxBorrowByHF = Infinity;
      if (constraintMode === "minHF" || constraintMode === "both") {
        const denom = minHF - liqThreshold;
        if (denom > 0) {
          const num = collateralUSD * liqThreshold - minHF * debtUSD;
          maxBorrowByHF = Math.max(0, num / denom);
        }
      }
      let maxBorrowByLTV = Infinity;
      if (constraintMode === "maxLTV" || constraintMode === "both") {
        maxBorrowByLTV = collateralUSD * (maxLTVPct / 100) - debtUSD;
      }

      const borrowThisLoop = Math.max(
        0,
        Math.min(
          borrowPerLoop,
          availableBorrowsUSD,
          maxBorrowByHF,
          maxBorrowByLTV
        )
      );

      if (borrowThisLoop <= 0 && i === 1) break;

      collateralCbBTC += borrowThisLoop / priceCbBTC;
      debtUSDC += borrowThisLoop / priceUSDC;

      pushRow(i, String(i), borrowThisLoop);
    }
    return rows;
  }, [
    cbBTCAsset,
    usdcAsset,
    initialCollateral,
    initialDebt,
    borrowPerLoop,
    numLoops,
    constraintMode,
    minHF,
    maxLTVPct,
    priceCbBTC,
    priceUSDC,
    liqThreshold,
    marketRefPrice,
  ]);

  const formatHF = (hf: number) =>
    hf <= 0 || !Number.isFinite(hf) ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);

  if (!cbBTCAsset || !usdcAsset) {
    return (
      <Paper p="md" withBorder>
        <Text size="sm" color="dimmed">
          <Trans>cbBTC and USDC are required for this market. Switch to a market that has both (e.g. Base).</Trans>
        </Text>
      </Paper>
    );
  }

  return (
    <Stack spacing="md">
      <Text size="sm" color="dimmed">
        <Trans>
          Simulate a looping strategy: borrow USDC, use it to buy and deposit more cbBTC, then repeat. Each loop increases collateral and debt. Use the constraints to cap how much you borrow per loop (min health factor or max LTV %).
        </Trans>
      </Text>

      <SegmentedControl
        value={useCurrentPosition ? "current" : "manual"}
        onChange={(v) => setUseCurrentPosition(v === "current")}
        data={[
          { label: t`Use current position`, value: "current" },
          { label: t`Manual initial`, value: "manual" },
        ]}
      />

      {useCurrentPosition ? (
        <Text size="sm">
          <Trans>Initial from position</Trans>: {initialCollateral.toLocaleString(undefined, { maximumFractionDigits: 6 })} cbBTC, {initialDebt.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
        </Text>
      ) : (
        <Group grow>
          <NumberInput
            label={t`Initial cbBTC`}
            value={initialCbBTC}
            onChange={setInitialCbBTC}
            min={0}
            step={0.0001}
            precision={6}
          />
          <NumberInput
            label={t`Initial USDC debt`}
            value={initialUSDC}
            onChange={setInitialUSDC}
            min={0}
            step={1}
            precision={2}
          />
        </Group>
      )}

      <NumberInput
        label={t`USDC to borrow per loop`}
        description={t`Amount borrowed each loop and used to buy/deposit cbBTC`}
        value={borrowPerLoopUSD}
        onChange={setBorrowPerLoopUSD}
        min={0}
        step={100}
        precision={2}
        placeholder="e.g. 5000"
      />

      <div>
        <Text size="sm" weight={500} mb={4}>
          <Trans>Limit borrow per loop by</Trans>
        </Text>
        <SegmentedControl
          value={constraintMode}
          onChange={(v) => setConstraintMode(v as ConstraintMode)}
          data={[
            { label: t`Min health factor`, value: "minHF" },
            { label: t`Max LTV %`, value: "maxLTV" },
            { label: t`Both`, value: "both" },
          ]}
        />
      </div>

      <Group grow>
        {(constraintMode === "minHF" || constraintMode === "both") && (
          <NumberInput
            label={t`Min health factor`}
            value={minHF}
            onChange={(v) => setMinHF(typeof v === "number" ? v : parseFloat(String(v)) || 2)}
            min={0.5}
            max={10}
            step={0.01}
            precision={2}
          />
        )}
        {(constraintMode === "maxLTV" || constraintMode === "both") && (
          <NumberInput
            label={t`Max LTV %`}
            value={maxLTVPct}
            onChange={(v) => setMaxLTVPct(typeof v === "number" ? v : parseFloat(String(v)) || 80)}
            min={1}
            max={99}
            step={1}
            precision={0}
          />
        )}
      </Group>

      <Group>
        <Text size="sm" weight={500}>
          <Trans>Number of loops</Trans>: {numLoops}
        </Text>
        <Button variant="light" size="xs" onClick={() => setNumLoops((n) => Math.max(1, n - 1))}>
          −
        </Button>
        <Button variant="light" size="xs" onClick={() => setNumLoops((n) => n + 1)}>
          +
        </Button>
        <Button variant="filled" size="xs" onClick={() => setNumLoops((n) => n + 1)}>
          <Trans>Add loop</Trans>
        </Button>
      </Group>

      {steps.length > 0 && (
        <Paper p="sm" withBorder>
          <Text size="sm" weight={600} mb="xs">
            <Trans>Loop results</Trans>
          </Text>
          <Table fontSize="xs" withBorder withColumnBorders>
            <thead>
              <tr>
                <th><Trans>Loop</Trans></th>
                <th>cbBTC</th>
                <th>USDC debt</th>
                <th><Trans>Collateral $</Trans></th>
                <th><Trans>Debt $</Trans></th>
                <th><Trans>Borrow this loop $</Trans></th>
                <th><Trans>Available to borrow $</Trans></th>
                <th>HF</th>
                <th><Trans>LTV %</Trans></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {steps.map((row) => (
                <tr key={row.loop}>
                  <td>{row.label}</td>
                  <td>{row.collateralCbBTC.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                  <td>{row.debtUSDC.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td>${row.collateralUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>${row.debtUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>${row.borrowThisLoop.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>${row.availableBorrowsUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td>{formatHF(row.hf)}</td>
                  <td>{row.ltvPct.toFixed(1)}%</td>
                  <td>
                    <Button
                      variant="light"
                      size="xs"
                      onClick={() => {
                        applyLoopingStateToPosition(
                          cbBTCAsset.symbol,
                          row.collateralCbBTC,
                          usdcAsset.symbol,
                          row.debtUSDC,
                        );
                        onApplyToPosition?.();
                      }}
                    >
                      <Trans>Apply</Trans>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {steps.length > 1 && (
            <Text size="xs" mt="xs" color="dimmed">
              <Trans>After {numLoops} loop(s)</Trans>: {steps[steps.length - 1].collateralCbBTC.toLocaleString(undefined, { maximumFractionDigits: 6 })} cbBTC, {steps[steps.length - 1].debtUSDC.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC, HF = {formatHF(steps[steps.length - 1].hf)}
            </Text>
          )}
        </Paper>
      )}
    </Stack>
  );
}

function buildSyntheticPosition(
  cbBTCAsset: AssetDetails,
  usdcAsset: AssetDetails,
  collateralCbBTC: number,
  debtUSDC: number,
  marketRefPrice: number
): AaveHealthFactorData {
  const reserve: ReserveAssetDataItem = {
    asset: { ...cbBTCAsset, priceInMarketReferenceCurrency: (cbBTCAsset.priceInUSD || 1) / marketRefPrice },
    underlyingBalance: collateralCbBTC,
    underlyingBalanceUSD: collateralCbBTC * (cbBTCAsset.priceInUSD || 1),
    underlyingBalanceMarketReferenceCurrency: collateralCbBTC * (cbBTCAsset.priceInUSD || 1) / marketRefPrice,
    usageAsCollateralEnabledOnUser: true,
  };
  const borrow: BorrowedAssetDataItem = {
    asset: { ...usdcAsset, priceInMarketReferenceCurrency: (usdcAsset.priceInUSD || 1) / marketRefPrice },
    totalBorrows: debtUSDC,
    totalBorrowsUSD: debtUSDC * (usdcAsset.priceInUSD || 1),
    totalBorrowsMarketReferenceCurrency: debtUSDC * (usdcAsset.priceInUSD || 1) / marketRefPrice,
    stableBorrowAPY: 0,
  };
  return {
    healthFactor: 0,
    totalBorrowsUSD: 0,
    availableBorrowsUSD: 0,
    totalCollateralMarketReferenceCurrency: 0,
    totalBorrowsMarketReferenceCurrency: 0,
    currentLiquidationThreshold: 0,
    currentLoanToValue: 0,
    userReservesData: [reserve],
    userBorrowsData: [borrow],
    txHistory: { data: [], isFetching: false, fetchError: "", lastFetched: 0 },
  };
}
