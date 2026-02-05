import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Button,
  Group,
  Modal,
  Paper,
  Select,
  Text,
  Stack,
} from "@mantine/core";
import {
  useAaveData,
  BorrowedAssetDataItem,
  isBorrowableAsset,
  getSwapFeeBreakdown,
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

export default function SwapDebtDialog() {
  const [open, setOpen] = React.useState(false);
  const [sourceSymbol, setSourceSymbol] = React.useState<string | null>(null);
  const [targetSymbol, setTargetSymbol] = React.useState<string | null>(null);
  const [percentage, setPercentage] = React.useState<number>(1);
  const [slippageBps, setSlippageBps] = React.useState<number | null>(null);

  const {
    addressData,
    currentMarket,
    simulateSwapDebt,
    getProjectedHealthFactorAfterSwapDebt,
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

  const borrows: BorrowedAssetDataItem[] =
    addressData?.[currentMarket]?.workingData?.userBorrowsData ?? [];
  const sourceOptions = borrows
    .filter((b) => b.totalBorrows > 0)
    .map((b) => ({
      value: b.asset.symbol,
      label: `${b.asset.symbol} (${b.totalBorrows.toLocaleString(undefined, { maximumFractionDigits: 6 })})`,
    }));

  const targetOptions = availableAssets
    .filter(
      (a) =>
        a.symbol !== sourceSymbol && isBorrowableAsset(a),
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
  const targetAsset = availableAssets.find((a) => a.symbol === targetSymbol);
  const swapUsd =
    sourceItem && sourceSymbol
      ? sourceItem.totalBorrows * sourceItem.asset.priceInUSD * percentage
      : 0;
  const feeBreakdown =
    swapUsd > 0 ? getSwapFeeBreakdown(swapUsd, slippageBps) : null;
  const sourceDebtRemaining =
    sourceItem && sourceSymbol
      ? sourceItem.totalBorrows * (1 - percentage)
      : 0;
  const targetDebtAfter =
    feeBreakdown && targetAsset
      ? (targetItem?.totalBorrows ?? 0) +
        feeBreakdown.receiveUsd / (targetAsset.priceInUSD || 1)
      : targetItem?.totalBorrows ?? 0;
  const currentHF = addressData?.[currentMarket]?.workingData?.healthFactor;
  const projected =
    sourceSymbol && targetSymbol && feeBreakdown
      ? getProjectedHealthFactorAfterSwapDebt(sourceSymbol, targetSymbol, percentage, slippageBps)
      : null;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const liquidationScenario = projected?.liquidationScenario ?? [];

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
            <Trans>
              Simulate swapping part of your debt from one asset to another (e.g. USDC → cbBTC) to see the effect on health factor.
            </Trans>
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
                <Trans>Estimated remaining debt</Trans>: {sourceSymbol} {sourceDebtRemaining.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                {targetSymbol && `, ${targetSymbol} ${targetDebtAfter.toLocaleString(undefined, { maximumFractionDigits: 6 })}`}
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
