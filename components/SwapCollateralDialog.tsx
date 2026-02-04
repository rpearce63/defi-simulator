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
  Alert,
} from "@mantine/core";
import {
  useAaveData,
  ReserveAssetDataItem,
  isSuppliableAsset,
  getSwapFeeBreakdown,
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

  const {
    addressData,
    currentMarket,
    simulateSwapCollateral,
  } = useAaveData("");

  const reserves: ReserveAssetDataItem[] =
    addressData?.[currentMarket]?.workingData?.userReservesData ?? [];
  const sourceOptions = reserves
    .filter((r) => r.underlyingBalance > 0)
    .map((r) => ({
      value: r.asset.symbol,
      label: `${r.asset.symbol} (${r.underlyingBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })})`,
    }));

  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const targetOptions = availableAssets
    .filter(
      (a) =>
        a.symbol !== sourceSymbol && isSuppliableAsset(a),
    )
    .map((a) => ({
      value: a.symbol,
      label: a.symbol,
    }));

  const handleApply = () => {
    if (!sourceSymbol || !targetSymbol) return;
    simulateSwapCollateral(sourceSymbol, targetSymbol, percentage);
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

  const sourceItem = reserves.find((r) => r.asset.symbol === sourceSymbol);
  const swapUsd =
    sourceItem && sourceSymbol
      ? sourceItem.underlyingBalance * sourceItem.asset.priceInUSD * percentage
      : 0;
  const feeBreakdown = swapUsd > 0 ? getSwapFeeBreakdown(swapUsd) : null;

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
        }}
        title={t`Simulate collateral swap`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            <Trans>
              Simulate swapping part of your supplied collateral from one asset to another (e.g. WETH → cbBTC) to see the effect on health factor. Auto-refresh is turned off when you apply.
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
            nothingFound={t`No suppliable assets`}
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
                <Trans>Slippage (1.5%)</Trans>: ${feeBreakdown.slippageUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>Total fees + slippage</Trans>: ${(feeBreakdown.totalFeeUsd + feeBreakdown.slippageUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" weight={500} mt={4}>
                <Trans>You receive (after fees and slippage)</Trans>: ${feeBreakdown.receiveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
            </Paper>
          )}

          <Alert color="blue" variant="light">
            <Trans>Auto-refresh will be turned off when you apply so your simulation is not overwritten. You can turn it back on in the app bar.</Trans>
          </Alert>

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
