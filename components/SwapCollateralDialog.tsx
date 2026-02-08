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
  ReserveAssetDataItem,
  isSuppliableAsset,
  getSwapFeeBreakdown,
  getCollateralUsdNeededForRepay,
  fetchSlippageToleranceBps,
  DEFAULT_SLIPPAGE_BPS,
  markets,
} from "../hooks/useAaveData";

const SWAP_PERCENTAGES = [
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100% (max)" },
] as const;

export default function SwapCollateralDialog() {
  const [open, setOpen] = React.useState(false);
  const [sourceSymbol, setSourceSymbol] = React.useState<string | null>(null);
  const [targetSymbol, setTargetSymbol] = React.useState<string | null>(null);
  const [percentage, setPercentage] = React.useState<number>(1);
  const [sourceAmount, setSourceAmount] = React.useState<number | string>("");
  const [receiveUsdAmount, setReceiveUsdAmount] = React.useState<number | string>("");
  const [slippageBps, setSlippageBps] = React.useState<number | null>(null);

  const {
    addressData,
    currentMarket,
    simulateSwapCollateral,
    getProjectedHealthFactorAfterSwapCollateral,
  } = useAaveData("");

  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const market = markets.find((m) => m.id === currentMarket);

  React.useEffect(() => {
    if (!sourceSymbol || !targetSymbol || !market) {
      setSlippageBps(null);
      return;
    }
    const assetA = availableAssets.find((a) => a.symbol === sourceSymbol);
    const assetB = availableAssets.find((a) => a.symbol === targetSymbol);
    if (!assetA?.underlyingAsset || !assetB?.underlyingAsset) {
      setSlippageBps(DEFAULT_SLIPPAGE_BPS);
      return;
    }
    let cancelled = false;
    fetchSlippageToleranceBps(
      Number(market.chainId),
      assetA.underlyingAsset,
      assetB.underlyingAsset,
    ).then((bps) => {
      if (!cancelled) setSlippageBps(bps ?? DEFAULT_SLIPPAGE_BPS);
    });
    return () => {
      cancelled = true;
    };
  }, [sourceSymbol, targetSymbol, currentMarket, market?.chainId]);

  const reserves: ReserveAssetDataItem[] =
    addressData?.[currentMarket]?.workingData?.userReservesData ?? [];
  const suppliedCollateral = reserves.filter((r) => r.underlyingBalance > 0);
  const sourceOptions = suppliedCollateral.map((r) => ({
    value: r.asset.symbol,
    label: `${r.asset.symbol} (${r.underlyingBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })})`,
  }));

  const targetOptions = availableAssets
    .filter(
      (a) => a.symbol !== sourceSymbol && isSuppliableAsset(a),
    )
    .map((a) => ({
      value: a.symbol,
      label: a.symbol,
    }));

  const sourceItem = reserves.find((r) => r.asset.symbol === sourceSymbol);
  const targetItem = reserves.find((r) => r.asset.symbol === targetSymbol);
  const targetAsset = availableAssets.find((a) => a.symbol === targetSymbol);

  const sourceAmountNum =
    typeof sourceAmount === "number"
      ? sourceAmount
      : parseFloat(String(sourceAmount).trim()) || null;
  const receiveUsdNum =
    typeof receiveUsdAmount === "number"
      ? receiveUsdAmount
      : parseFloat(String(receiveUsdAmount).trim()) || null;
  const useSourceAmount = sourceAmountNum != null && sourceAmountNum > 0;
  const useReceiveUsd = receiveUsdNum != null && receiveUsdNum > 0;
  const useAmount = useSourceAmount || useReceiveUsd;
  const maxSwapUsd = sourceItem
    ? sourceItem.underlyingBalance * (sourceItem.asset.priceInUSD || 1)
    : 0;
  // When using receive-USD, user enters desired net USD (after fees). Work backwards to source amount.
  const requiredSwapUsd =
    useReceiveUsd && sourceItem && receiveUsdNum != null && receiveUsdNum > 0
      ? Math.min(
          getCollateralUsdNeededForRepay(receiveUsdNum, slippageBps),
          maxSwapUsd
        )
      : 0;
  const sourceUnitsToSwap =
    sourceItem && sourceSymbol
      ? useSourceAmount
        ? Math.min(sourceAmountNum!, sourceItem.underlyingBalance)
        : useReceiveUsd
          ? requiredSwapUsd / (sourceItem.asset.priceInUSD || 1)
          : sourceItem.underlyingBalance * percentage
      : 0;
  const swapUsd =
    sourceItem && sourceSymbol
      ? sourceUnitsToSwap * sourceItem.asset.priceInUSD
      : 0;
  const maxNetReceiveUsd =
    maxSwapUsd > 0
      ? getSwapFeeBreakdown(maxSwapUsd, slippageBps).receiveUsd
      : 0;

  const handleApply = () => {
    if (!sourceSymbol || !targetSymbol) return;
    simulateSwapCollateral(
      sourceSymbol,
      targetSymbol,
      percentage,
      slippageBps,
      useAmount ? sourceUnitsToSwap : undefined
    );
    setOpen(false);
    setSourceSymbol(null);
    setTargetSymbol(null);
    setPercentage(1);
    setSourceAmount("");
    setReceiveUsdAmount("");
  };

  const canApply =
    !!sourceSymbol &&
    !!targetSymbol &&
    sourceSymbol !== targetSymbol &&
    sourceOptions.some((o) => o.value === sourceSymbol) &&
    targetOptions.some((o) => o.value === targetSymbol) &&
    (useSourceAmount
      ? sourceItem != null && sourceAmountNum != null && sourceAmountNum > 0
      : useReceiveUsd
        ? sourceItem != null && receiveUsdNum != null && receiveUsdNum > 0 && requiredSwapUsd > 0
        : true);
  const feeBreakdown =
    swapUsd > 0 ? getSwapFeeBreakdown(swapUsd, slippageBps) : null;
  const sourceCollateralRemaining =
    sourceItem && sourceSymbol
      ? sourceItem.underlyingBalance - sourceUnitsToSwap
      : 0;
  const targetCollateralAfter =
    feeBreakdown && targetAsset
      ? (targetItem?.underlyingBalance ?? 0) +
        feeBreakdown.receiveUsd / (targetAsset.priceInUSD || 1)
      : targetItem?.underlyingBalance ?? 0;
  const currentHF = addressData?.[currentMarket]?.workingData?.healthFactor;
  const projected =
    sourceSymbol && targetSymbol && feeBreakdown
      ? getProjectedHealthFactorAfterSwapCollateral(
          sourceSymbol,
          targetSymbol,
          percentage,
          slippageBps,
          useAmount ? sourceUnitsToSwap : undefined
        )
      : null;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const liquidationScenario = projected?.liquidationScenario ?? [];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Swap collateral</Trans>
      </Button>
      <Modal
        opened={open}
        onClose={() => {
          setOpen(false);
          setSourceSymbol(null);
          setTargetSymbol(null);
          setPercentage(1);
          setSourceAmount("");
          setReceiveUsdAmount("");
        }}
        title={t`Simulate collateral swap`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            <Trans>
              Simulate swapping part of your supplied collateral from one asset to another (e.g. WETH → cbBTC) to see the effect on health factor.
            </Trans>
          </Text>

          <Select
            label={t`From (source collateral)`}
            placeholder={t`Select asset to swap from`}
            data={sourceOptions}
            value={sourceSymbol}
            onChange={setSourceSymbol}
            searchable
            nothingFound={t`No supplied assets with balance`}
          />

          <Select
            label={t`To (target collateral)`}
            placeholder={t`Select asset to swap to`}
            data={targetOptions}
            value={targetSymbol}
            onChange={setTargetSymbol}
            searchable
            nothingFound={t`No other supplied collateral`}
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
                  variant={percentage === value && !useAmount ? "filled" : "light"}
                  size="xs"
                  onClick={() => {
                    setPercentage(value);
                    setSourceAmount("");
                    setReceiveUsdAmount("");
                  }}
                >
                  {label}
                </Button>
              ))}
            </Group>
          </div>
          {sourceSymbol && sourceItem && (
            <>
              <NumberInput
                label={t`Amount of ${sourceSymbol} to swap`}
                placeholder={t`e.g. 0.5`}
                value={sourceAmount}
                onChange={(v) => {
                  setSourceAmount(v);
                  if (v !== "" && v !== null && Number(v) > 0) setReceiveUsdAmount("");
                }}
                min={0}
                step={0.00000001}
                precision={8}
                description={
                  sourceItem.underlyingBalance > 0
                    ? t`Max ${sourceItem.underlyingBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${sourceSymbol}`
                    : undefined
                }
              />
              <NumberInput
                label={t`Or amount to receive (USD, after fees)`}
                placeholder={t`e.g. 5000`}
                value={receiveUsdAmount}
                onChange={(v) => {
                  setReceiveUsdAmount(v);
                  if (v !== "" && v !== null && Number(v) > 0) setSourceAmount("");
                }}
                min={0}
                step={1}
                precision={2}
                description={
                  sourceItem && maxNetReceiveUsd > 0
                    ? t`Net after fees. Max $${maxNetReceiveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : undefined
                }
              />
            </>
          )}

          {feeBreakdown && (
            <Paper p="sm" withBorder radius="sm">
              <Text size="sm" weight={600} mb="xs">
                <Trans>Estimated fees</Trans>
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Swap value</Trans>: ${swapUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Swap fee (0.25%)</Trans>: ${feeBreakdown.swapFeeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Execution fee (0.05%)</Trans>: ${feeBreakdown.executionFeeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Slippage ({((feeBreakdown.slippageBps ?? DEFAULT_SLIPPAGE_BPS) / 100).toFixed(2)}%)</Trans>: ${feeBreakdown.slippageUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>Total fees + slippage</Trans>: ${(feeBreakdown.totalFeeUsd + feeBreakdown.slippageUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" weight={500} mt={4}>
                <Trans>You receive (after fees and slippage)</Trans>: ${feeBreakdown.receiveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>Estimated remaining collateral</Trans>: {sourceSymbol} {sourceCollateralRemaining.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                {targetSymbol && `, ${targetSymbol} ${targetCollateralAfter.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
              </Text>
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
            </Paper>
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
