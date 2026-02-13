import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import {
  useAaveData,
  BorrowedAssetDataItem,
  isBorrowableAsset,
} from "../hooks/useAaveData";

export default function BorrowMoreDialog() {
  const [open, setOpen] = React.useState(false);
  const [symbol, setSymbol] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState<number | string>("");

  const {
    addressData,
    currentMarket,
    addBorrowAsset,
    setBorrowedAssetQuantity,
    getProjectedHealthFactorAfterBorrow,
  } = useAaveData("");

  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const borrows: BorrowedAssetDataItem[] =
    addressData?.[currentMarket]?.workingData?.userBorrowsData ?? [];
  const availableBorrowsUSD = Math.max(
    addressData?.[currentMarket]?.workingData?.availableBorrowsUSD ?? 0,
    0,
  );

  const borrowableOptions = availableAssets
    .filter(isBorrowableAsset)
    .map((a) => ({
      value: a.symbol,
      label: a.symbol,
    }));

  const selectedAsset = availableAssets.find((a) => a.symbol === symbol);
  const existingBorrow = borrows.find((b) => b.asset.symbol === symbol);
  const currentBalance = existingBorrow?.totalBorrows ?? 0;
  const priceInUSD = selectedAsset?.priceInUSD ?? 1;

  const amountNum =
    typeof amount === "number"
      ? amount
      : parseFloat(String(amount).trim()) || null;
  const additionalUnits = amountNum != null && amountNum > 0 ? amountNum : 0;
  const newTotal = currentBalance + additionalUnits;
  const additionalUsd = additionalUnits * priceInUSD;
  const maxBorrowUnits =
    priceInUSD > 0 ? availableBorrowsUSD / priceInUSD : 0;

  const projected =
    symbol && additionalUnits > 0
      ? getProjectedHealthFactorAfterBorrow(symbol, additionalUnits)
      : null;
  const currentHF = addressData?.[currentMarket]?.workingData?.healthFactor;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const liquidationScenario = projected?.liquidationScenario ?? [];

  const handleApply = () => {
    if (!symbol || additionalUnits <= 0) return;
    if (existingBorrow) {
      setBorrowedAssetQuantity(symbol, newTotal);
    } else {
      addBorrowAsset(symbol);
      setBorrowedAssetQuantity(symbol, additionalUnits);
    }
    setOpen(false);
    setSymbol(null);
    setAmount("");
  };

  const canApply =
    !!symbol &&
    selectedAsset != null &&
    amountNum != null &&
    amountNum > 0 &&
    additionalUsd <= availableBorrowsUSD;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Borrow more</Trans>
      </Button>
      <Modal
        opened={open}
        onClose={() => {
          setOpen(false);
          setSymbol(null);
          setAmount("");
        }}
        title={t`Simulate borrowing more`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            <Trans>
              Enter the amount you want to borrow. The new balance will be your current balance plus this amount. Health factor and liquidation scenario are updated for the simulated position.
            </Trans>
          </Text>

          <Select
            label={t`Asset to borrow`}
            placeholder={t`Select asset`}
            data={borrowableOptions}
            value={symbol}
            onChange={setSymbol}
            searchable
            nothingFound={t`No borrowable assets`}
          />

          {symbol && selectedAsset && (
            <>
              {currentBalance > 0 && (
                <Text size="sm" color="dimmed">
                  <Trans>Current balance</Trans>: {currentBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })} {symbol} (${(currentBalance * priceInUSD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                </Text>
              )}
              <NumberInput
                label={t`Amount to borrow (${symbol})`}
                placeholder={t`e.g. 1000`}
                value={amount}
                onChange={setAmount}
                min={0}
                step={0.01}
                precision={6}
                description={
                  maxBorrowUnits > 0
                    ? t`Max ~${maxBorrowUnits.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol} ($${availableBorrowsUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })})`
                    : undefined
                }
              />
            </>
          )}

          {projected != null && additionalUnits > 0 && (
            <Paper p="sm" withBorder radius="sm">
              <Text size="sm" weight={600} mb="xs">
                <Trans>Simulated result</Trans>
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Additional</Trans>: {additionalUnits.toLocaleString(undefined, { maximumFractionDigits: 6 })} {symbol} = ${additionalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>New {symbol} balance</Trans>: {newTotal.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </Text>
              <Text size="xs" weight={500} mt="xs">
                <Trans>Expected health factor</Trans>: {formatHF(currentHF)} → {formatHF(projected.healthFactor)}
              </Text>
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
              <Trans>Apply</Trans>
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
