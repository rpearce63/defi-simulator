import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Stack,
  Text,
} from "@mantine/core";
import { useAaveData } from "../hooks/useAaveData";

type SupplyMoreDialogProps = {
  symbol: string;
  currentBalance: number;
  priceInUSD: number;
};

export default function SupplyMoreDialog({
  symbol,
  currentBalance,
  priceInUSD,
}: SupplyMoreDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState<number | "">("");
  const {
    addressData,
    currentMarket,
    setReserveAssetQuantity,
    getProjectedHealthFactorAfterSupply,
  } = useAaveData("");

  const amountNum =
    typeof amount === "number"
      ? amount
      : parseFloat(String(amount).trim()) || null;
  const additionalUnits = amountNum != null && amountNum > 0 ? amountNum : 0;
  const newTotal = currentBalance + additionalUnits;
  const additionalUsd = additionalUnits * priceInUSD;
  const projected =
    additionalUnits > 0
      ? getProjectedHealthFactorAfterSupply(symbol, additionalUnits)
      : null;
  const currentHF = addressData?.[currentMarket]?.workingData?.healthFactor;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const formatQty = (value: number) =>
    value.toLocaleString(undefined, { maximumFractionDigits: 8 });
  const formatUsd = (value: number) =>
    value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  const liquidationScenario = projected?.liquidationScenario ?? [];

  const resetForm = () => {
    setOpen(false);
    setAmount("");
  };

  const handleApply = () => {
    if (additionalUnits <= 0) return;
    setReserveAssetQuantity(symbol, newTotal);
    resetForm();
  };

  return (
    <>
      <Button variant="subtle" size="xs" compact onClick={() => setOpen(true)}>
        <Trans>Add more</Trans>
      </Button>
      <Modal
        opened={open}
        onClose={resetForm}
        title={t`Add ${symbol}`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            <Trans>
              Enter the amount of {symbol} to add. The new balance is your
              current balance plus this amount.
            </Trans>
          </Text>
          <Text size="sm">
            <Trans>Current balance</Trans>: {formatQty(currentBalance)} {symbol}
          </Text>
          <NumberInput
            label={t`Amount to add`}
            placeholder={t`e.g. 0.15`}
            value={amount}
            onChange={setAmount}
            min={0}
            step={0.01}
            precision={8}
          />
          {additionalUnits > 0 && (
            <Paper p="sm" withBorder radius="sm">
              <Text size="sm" weight={600} mb="xs">
                <Trans>New balance</Trans>
              </Text>
              <Text size="sm">
                {formatQty(currentBalance)} + {formatQty(additionalUnits)} ={" "}
                {formatQty(newTotal)} {symbol}
              </Text>
              <Text size="xs" color="dimmed" mt="xs">
                <Trans>Additional value</Trans>: ${formatUsd(additionalUsd)}
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
            <Button onClick={handleApply} disabled={additionalUnits <= 0}>
              <Trans>Apply</Trans>
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
