import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Text,
  Stack,
} from "@mantine/core";
import {
  useAaveData,
  isSuppliableAsset,
  DEFAULT_SLIPPAGE_BPS,
  markets,
  getSimulationAssetPriceInUsd,
  getMarketAssetPriceInUsd,
  getBuyAndDepositQuote,
  BUY_AND_DEPOSIT_SOURCE_SYMBOL,
  useSwapSlippageBps,
} from "../hooks/useAaveData";

export default function BuyAndDepositDialog() {
  const [open, setOpen] = React.useState(false);
  const [targetSymbol, setTargetSymbol] = React.useState<string | null>(null);
  const [usdcAmount, setUsdcAmount] = React.useState<number | "">("");

  const {
    addressData,
    currentMarket,
    simulateBuyAndDepositCollateral,
    getProjectedHealthFactorAfterBuyAndDeposit,
    isRefreshActive,
    refreshCurrentMarketData,
  } = useAaveData("");

  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const workingData = addressData?.[currentMarket]?.workingData;
  const reserves = workingData?.userReservesData ?? [];
  const market = markets.find((m) => m.id === currentMarket);
  const useManualPrices = !isRefreshActive;
  const usdcAsset = availableAssets.find(
    (a) => a.symbol.toUpperCase() === BUY_AND_DEPOSIT_SOURCE_SYMBOL,
  );

  const targetOptions = availableAssets
    .filter(
      (a) =>
        isSuppliableAsset(a) &&
        a.symbol.toUpperCase() !== BUY_AND_DEPOSIT_SOURCE_SYMBOL,
    )
    .map((a) => ({
      value: a.symbol,
      label: a.symbol,
    }));
  const cbbtcSymbol = availableAssets.find(
    (a) =>
      isSuppliableAsset(a) && a.symbol.toUpperCase() === "CBBTC",
  )?.symbol;

  React.useEffect(() => {
    if (!open || targetSymbol) return;
    if (cbbtcSymbol) setTargetSymbol(cbbtcSymbol);
  }, [open, targetSymbol, cbbtcSymbol]);

  const targetAsset = availableAssets.find((a) => a.symbol === targetSymbol);
  const slippageEnabled = open && !!targetSymbol && !!usdcAsset;
  const { slippageBps, isRefreshing: isSlippageRefreshing } = useSwapSlippageBps(
    slippageEnabled,
    market ? Number(market.chainId) : undefined,
    usdcAsset?.underlyingAsset,
    targetAsset?.underlyingAsset,
    refreshCurrentMarketData,
    { autoRefreshMarketData: isRefreshActive },
  );

  const usdcAmountNum =
    typeof usdcAmount === "number"
      ? usdcAmount
      : parseFloat(String(usdcAmount).trim()) || 0;
  const quote =
    targetSymbol && usdcAmountNum > 0
      ? getBuyAndDepositQuote(
          usdcAmountNum,
          targetSymbol,
          workingData,
          availableAssets,
          useManualPrices,
          slippageBps,
        )
      : null;

  const existingQty =
    reserves.find((r) => r.asset.symbol === targetSymbol)?.underlyingBalance ??
    0;
  const newQty = existingQty + (quote?.targetQuantity ?? 0);
  const currentHF = workingData?.healthFactor;
  const projected =
    targetSymbol && usdcAmountNum > 0
      ? getProjectedHealthFactorAfterBuyAndDeposit(
          targetSymbol,
          usdcAmountNum,
          slippageBps,
        )
      : null;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const formatUsd = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const formatQty = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const liquidationScenario = projected?.liquidationScenario ?? [];
  const feeBreakdown = quote?.feeBreakdown;
  const effectiveSlippageBps = feeBreakdown?.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const simulationPrice =
    targetSymbol &&
    getSimulationAssetPriceInUsd(
      targetSymbol,
      workingData,
      availableAssets,
      useManualPrices,
    );
  const marketPrice =
    targetSymbol && getMarketAssetPriceInUsd(targetSymbol, availableAssets);
  const showSimulationPrice =
    useManualPrices &&
    simulationPrice != null &&
    marketPrice != null &&
    Math.abs(simulationPrice - marketPrice) > 0.01;

  const resetForm = () => {
    setOpen(false);
    setTargetSymbol(null);
    setUsdcAmount("");
  };

  const handleApply = () => {
    if (!targetSymbol || !quote) return;
    simulateBuyAndDepositCollateral(targetSymbol, usdcAmountNum, slippageBps);
    resetForm();
  };

  const canApply = !!targetSymbol && !!quote;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Buy & deposit</Trans>
      </Button>
      <Modal
        opened={open}
        onClose={resetForm}
        title={t`Simulate buy and deposit with USDC`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            <Trans>
              Spend USDC from your wallet to buy a token and deposit it as
              collateral (e.g. buy cbBTC with USDC). This does not change Aave
              USDC supply or debt.
            </Trans>
          </Text>

          <Select
            label={t`Token to buy and deposit`}
            placeholder={t`Select asset`}
            data={targetOptions}
            value={targetSymbol}
            onChange={setTargetSymbol}
            searchable
            nothingFound={t`No suppliable assets`}
            withinPortal
            zIndex={10000}
            dropdownPosition="bottom"
            maxDropdownHeight={280}
          />

          <NumberInput
            label={t`USDC to spend`}
            placeholder={t`e.g. 10000`}
            value={usdcAmount}
            onChange={setUsdcAmount}
            min={0}
            step={100}
            precision={2}
          />

          {quote && feeBreakdown && targetSymbol && (
            <Paper p="sm" withBorder radius="sm">
              <Text size="sm" weight={600} mb="xs">
                <Trans>Estimated purchase</Trans>
              </Text>
              {!isRefreshActive && (
                <Text size="xs" color="dimmed" mb="xs">
                  <Trans>Using manual prices from the Position tab.</Trans>
                </Text>
              )}
              {marketPrice != null && (
                <Text size="xs" weight={500} mb="xs">
                  <Trans>Current market price</Trans>: {targetSymbol} $
                  {formatUsd(marketPrice)}
                </Text>
              )}
              {showSimulationPrice && simulationPrice != null && (
                <Text size="xs" color="dimmed" mb="xs">
                  <Trans>Simulation price (used for buy)</Trans>: {targetSymbol} $
                  {formatUsd(simulationPrice)}
                </Text>
              )}
              {isSlippageRefreshing && (
                <Text size="xs" color="dimmed" mb="xs">
                  <Trans>Updating quote…</Trans>
                </Text>
              )}
              <Text size="xs" color="dimmed">
                <Trans>USDC spent</Trans>: {formatQty(usdcAmountNum)} ($
                {formatUsd(quote.spendUsd)})
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Swap fee (0.25%)</Trans>: $
                {formatUsd(feeBreakdown.swapFeeUsd)}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Execution fee (0.05%)</Trans>: $
                {formatUsd(feeBreakdown.executionFeeUsd)}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Slippage ({(effectiveSlippageBps / 100).toFixed(2)}%)</Trans>: $
                {formatUsd(feeBreakdown.slippageUsd)}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>You receive (after fees and slippage)</Trans>:{" "}
                {formatQty(quote.targetQuantity)} {targetSymbol} ($
                {formatUsd(feeBreakdown.receiveUsd)})
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>Collateral after deposit</Trans>: {formatQty(existingQty)}{" "}
                → {formatQty(newQty)} {targetSymbol}
              </Text>
              {projected != null && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Expected health factor</Trans>: {formatHF(currentHF)} →{" "}
                  {formatHF(projected.healthFactor)}
                </Text>
              )}
              {liquidationScenario.length > 0 && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Liquidation trigger (approx.)</Trans>:{" "}
                  {liquidationScenario
                    .map(
                      (a) =>
                        `${a.symbol} $${a.priceInUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    )
                    .join(", ")}
                </Text>
              )}
            </Paper>
          )}

          <Group position="right" mt="md">
            <Button variant="default" onClick={resetForm}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={handleApply} disabled={!canApply}>
              <Trans>Apply</Trans>
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
