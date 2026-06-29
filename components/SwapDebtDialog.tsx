import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Alert,
  ActionIcon,
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Text,
  Stack,
  Tooltip,
} from "@mantine/core";
import { FiRefreshCw } from "react-icons/fi";
import {
  useAaveData,
  BorrowedAssetDataItem,
  isBorrowableAsset,
  isWorkingDataEmodeActive,
  isEmodeAllowedDebtSymbol,
  getDebtSwapTargetUsd,
  getDebtSwapSlippageUsd,
  useSwapSlippageBps,
  DEFAULT_SLIPPAGE_BPS,
  markets,
  getSimulationAssetPriceInUsd,
  getMarketAssetPriceInUsd,
} from "../hooks/useAaveData";

const SWAP_PERCENTAGES = [
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100% (max)" },
] as const;

export default function SwapDebtDialog() {
  const [open, setOpen] = React.useState(false);
  const [sourceSymbol, setSourceSymbol] = React.useState<string | null>(null);
  const [targetSymbol, setTargetSymbol] = React.useState<string | null>(null);
  const [percentage, setPercentage] = React.useState<number>(1);

  const {
    addressData,
    currentMarket,
    simulateSwapDebt,
    getProjectedHealthFactorAfterSwapDebt,
    refreshCurrentMarketData,
    isRefreshActive,
  } = useAaveData("");

  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const market = markets.find((m) => m.id === currentMarket);
  const workingData = addressData?.[currentMarket]?.workingData;
  const marketLastFetched = addressData?.[currentMarket]?.lastFetched ?? 0;
  const emodeActive = isWorkingDataEmodeActive(workingData);

  const sourceAsset = availableAssets.find((a) => a.symbol === sourceSymbol);
  const targetAsset = availableAssets.find((a) => a.symbol === targetSymbol);
  const slippageEnabled = open && !!sourceSymbol && !!targetSymbol;
  const {
    slippageBps,
    lastUpdated: slippageLastUpdated,
    isRefreshing: isSlippageRefreshing,
    refreshSlippage,
  } = useSwapSlippageBps(
    slippageEnabled,
    market ? Number(market.chainId) : undefined,
    sourceAsset?.underlyingAsset,
    targetAsset?.underlyingAsset,
    refreshCurrentMarketData,
    { autoRefreshMarketData: isRefreshActive },
  );

  React.useEffect(() => {
    if (!emodeActive) return;
    if (sourceSymbol && !isEmodeAllowedDebtSymbol(sourceSymbol)) {
      setSourceSymbol(null);
      setTargetSymbol(null);
      return;
    }
    if (
      targetSymbol &&
      (!isEmodeAllowedDebtSymbol(targetSymbol) ||
        targetSymbol === sourceSymbol)
    ) {
      setTargetSymbol(null);
    }
  }, [emodeActive, sourceSymbol, targetSymbol]);

  const borrows = [
    ...(addressData?.[currentMarket]?.workingData?.userBorrowsData ?? []),
  ] as BorrowedAssetDataItem[];
  const reserves = workingData?.userReservesData ?? [];
  const useManualPrices = !isRefreshActive;
  const priceFor = (symbol: string) =>
    getSimulationAssetPriceInUsd(
      symbol,
      workingData,
      availableAssets,
      useManualPrices,
    );
  const sourceOptions = borrows
    .filter((b) => b.totalBorrows > 0)
    .filter((b) => !emodeActive || isEmodeAllowedDebtSymbol(b.asset.symbol))
    .map((b) => ({
      value: b.asset.symbol,
      label: `${b.asset.symbol} (${b.totalBorrows.toLocaleString(undefined, { maximumFractionDigits: 6 })})`,
    }));

  const targetOptions = availableAssets
    .filter(
      (a) =>
        a.symbol !== sourceSymbol &&
        isBorrowableAsset(a) &&
        (!emodeActive || isEmodeAllowedDebtSymbol(a.symbol)),
    )
    .map((a) => ({
      value: a.symbol,
      label: a.symbol,
    }));

  const handleApply = () => {
    if (!sourceSymbol || !targetSymbol) return;
    simulateSwapDebt(sourceSymbol, targetSymbol, percentage, slippageBps);
    setOpen(false);
    setSourceSymbol(null);
    setTargetSymbol(null);
    setPercentage(1);
  };

  const canApply =
    !!sourceSymbol &&
    !!targetSymbol &&
    sourceSymbol !== targetSymbol &&
    sourceOptions.some((o) => o.value === sourceSymbol) &&
    targetOptions.some((o) => o.value === targetSymbol);

  const sourceItem = borrows.find((b) => b.asset.symbol === sourceSymbol);
  const targetItem = borrows.find((b) => b.asset.symbol === targetSymbol);
  const swapUsd =
    sourceItem && sourceSymbol
      ? sourceItem.totalBorrows * priceFor(sourceSymbol) * percentage
      : 0;
  const slippageUsd =
    swapUsd > 0 ? getDebtSwapSlippageUsd(swapUsd, slippageBps) : 0;
  const effectiveSlippageBps = slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const targetDebtFromSwapUsd =
    swapUsd > 0 ? getDebtSwapTargetUsd(swapUsd, slippageBps) : 0;
  const sourceDebtRemaining =
    sourceItem && sourceSymbol
      ? sourceItem.totalBorrows * (1 - percentage)
      : 0;
  const targetDebtAfter =
    targetSymbol
      ? (targetItem?.totalBorrows ?? 0) +
        targetDebtFromSwapUsd / priceFor(targetSymbol)
      : targetItem?.totalBorrows ?? 0;
  const currentHF = addressData?.[currentMarket]?.workingData?.healthFactor;
  const currentAvailableBorrowsUSD = Math.max(
    addressData?.[currentMarket]?.workingData?.availableBorrowsUSD ?? 0,
    0,
  );
  const projected =
    sourceSymbol && targetSymbol && swapUsd > 0
      ? getProjectedHealthFactorAfterSwapDebt(sourceSymbol, targetSymbol, percentage, slippageBps)
      : null;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const liquidationScenario = projected?.liquidationScenario ?? [];
  const projectedAvailableBorrowsUSD = projected?.availableBorrowsUSD ?? null;
  const noBorrowHeadroomAfterSwap =
    projectedAvailableBorrowsUSD != null && projectedAvailableBorrowsUSD <= 0;
  const formatUsd = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const swapAssetSymbols = [sourceSymbol, targetSymbol].filter(
    (sym, i, arr): sym is string => !!sym && arr.indexOf(sym) === i,
  );
  const oraclePriceLine = swapAssetSymbols
    .map((sym) => {
      const oracle = getMarketAssetPriceInUsd(sym, availableAssets);
      return `${sym} $${formatUsd(oracle)}`;
    })
    .join(", ");
  const workingPriceForSymbol = (symbol: string) => {
    const fromBorrow = borrows.find((b) => b.asset.symbol === symbol)?.asset
      .priceInUSD;
    if (fromBorrow != null) return fromBorrow;
    return reserves.find((r) => r.asset.symbol === symbol)?.asset.priceInUSD;
  };
  const simulationPriceDiffers = (symbol: string | null) => {
    if (!symbol || isRefreshActive) return false;
    const oracle = getMarketAssetPriceInUsd(symbol, availableAssets);
    const working = workingPriceForSymbol(symbol);
    return (
      working != null &&
      Math.abs(oracle - working) > 0.01
    );
  };
  const simulationPriceLine = swapAssetSymbols
    .filter((sym) => simulationPriceDiffers(sym))
    .map((sym) => {
      const working = workingPriceForSymbol(sym);
      return working != null ? `${sym} $${formatUsd(working)}` : null;
    })
    .filter(Boolean)
    .join(", ");
  const quoteFreshnessMs = Math.max(slippageLastUpdated ?? 0, marketLastFetched);
  const [, setQuoteAgeTick] = React.useState(0);
  React.useEffect(() => {
    if (!open || !sourceSymbol || !targetSymbol) return;
    const id = setInterval(() => setQuoteAgeTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [open, sourceSymbol, targetSymbol]);
  const quoteAgeSec =
    quoteFreshnessMs > 0
      ? Math.max(0, Math.floor((Date.now() - quoteFreshnessMs) / 1000))
      : null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Swap debt</Trans>
      </Button>
      <Modal
        opened={open}
        onClose={() => {
          setOpen(false);
          setSourceSymbol(null);
          setTargetSymbol(null);
          setPercentage(1);
        }}
        title={t`Simulate debt swap`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            {emodeActive ? (
              <Trans>
                E-Mode is on: you can only swap debt between USDC and GHO. This shows the effect on health factor.
              </Trans>
            ) : (
              <Trans>
                Simulate swapping part of your debt from one asset to another (e.g. USDC → cbBTC). Aave debt swaps convert at USD par with no protocol swap fee; estimated slippage is added to the new debt.
              </Trans>
            )}
          </Text>

          <Select
            label={t`From (source debt)`}
            placeholder={t`Select asset to swap from`}
            data={sourceOptions}
            value={sourceSymbol}
            onChange={setSourceSymbol}
            searchable
            nothingFound={t`No borrowed assets with balance`}
          />

          <Select
            label={t`To (target debt)`}
            placeholder={t`Select asset to swap to`}
            data={targetOptions}
            value={targetSymbol}
            onChange={setTargetSymbol}
            searchable
            nothingFound={t`No borrowable assets`}
            disabled={!sourceSymbol}
          />

          <div>
            <Text size="sm" weight={500} mb={4}>
              <Trans>Swap percentage</Trans>
            </Text>
            <Group spacing="xs">
              {SWAP_PERCENTAGES.map(({ value, label }) => (
                <Button
                  key={value}
                  variant={percentage === value ? "filled" : "light"}
                  size="xs"
                  onClick={() => setPercentage(value)}
                >
                  {label}
                </Button>
              ))}
            </Group>
          </div>

          {sourceSymbol && targetSymbol && (
            <Paper p="sm" withBorder radius="sm">
              <Group position="apart" mb="xs" noWrap>
                <Text size="sm" weight={600}>
                  <Trans>Swap summary</Trans>
                </Text>
                <Tooltip label={t`Refresh prices and quote`}>
                  <ActionIcon
                    size="sm"
                    variant="subtle"
                    onClick={() => refreshSlippage()}
                    loading={isSlippageRefreshing}
                    aria-label={t`Refresh prices and quote`}
                  >
                    <FiRefreshCw size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              {quoteAgeSec != null && (
                <Text size="xs" color="dimmed" mb="xs">
                  {isSlippageRefreshing ? (
                    <Trans>Updating quote…</Trans>
                  ) : isRefreshActive ? (
                    <Trans>Prices and quote updated {quoteAgeSec}s ago (auto-refreshes every 30s)</Trans>
                  ) : (
                    <Trans>
                      Using manual prices. Slippage updated {quoteAgeSec}s ago — click refresh for live oracle prices.
                    </Trans>
                  )}
                </Text>
              )}
              {oraclePriceLine && (
                <Text size="xs" weight={500} mb="xs">
                  <Trans>Current market price</Trans>: {oraclePriceLine}
                </Text>
              )}
              {simulationPriceLine && (
                <Text size="xs" color="dimmed" mb="xs">
                  <Trans>Simulation price (used for swap)</Trans>: {simulationPriceLine}
                </Text>
              )}
              {swapUsd > 0 && (
                <>
              <Text size="xs" color="dimmed">
                <Trans>Swap value (USD par)</Trans>: ${formatUsd(swapUsd)}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Protocol swap fee</Trans>: 0 bps
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Estimated slippage ({(effectiveSlippageBps / 100).toFixed(2)}%, added to debt)</Trans>: ${formatUsd(slippageUsd)}
              </Text>
              <Text size="xs" weight={500} mt={4}>
                <Trans>New target debt from swap (par + slippage)</Trans>: ${formatUsd(targetDebtFromSwapUsd)}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>Estimated remaining debt</Trans>: {sourceSymbol} {sourceDebtRemaining.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                {targetSymbol && `, ${targetSymbol} ${targetDebtAfter.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
              </Text>
              {projected != null && projectedAvailableBorrowsUSD != null && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Estimated available to borrow</Trans>: ${formatUsd(currentAvailableBorrowsUSD)} → ${formatUsd(projectedAvailableBorrowsUSD)}
                </Text>
              )}
              {projected != null && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Expected health factor</Trans>: {formatHF(currentHF)} → {formatHF(projected.healthFactor)}
                </Text>
              )}
              {liquidationScenario.length > 0 && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Liquidation trigger (approx.)</Trans>:{" "}
                  {liquidationScenario
                    .map((a) => `${a.symbol} $${a.priceInUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                    .join(", ")}
                </Text>
              )}
                </>
              )}
            </Paper>
          )}

          {noBorrowHeadroomAfterSwap && (
            <Alert color="yellow" title={t`No borrow headroom after swap`}>
              <Trans>
                Aave requires some remaining borrow capacity after a debt swap. This swap would leave $0 available to borrow on-chain. You can still apply the simulation here, but the real transaction may fail or need a smaller swap amount.
              </Trans>
            </Alert>
          )}

          <Group position="right" mt="md">
            <Button variant="default" onClick={() => setOpen(false)}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleApply} disabled={!canApply}>
              <Trans>Apply swap</Trans>
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
