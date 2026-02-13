import * as React from "react";
import { t, Trans } from "@lingui/macro";
import {
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SegmentedControl,
  Stack,
  Text,
} from "@mantine/core";
import {
  useAaveData,
  BorrowedAssetDataItem,
  ReserveAssetDataItem,
  getSwapFeeBreakdown,
  getCollateralUsdNeededForRepay,
  fetchSlippageToleranceBps,
  DEFAULT_SLIPPAGE_BPS,
  markets,
} from "../hooks/useAaveData";

const REPAY_PERCENTAGES = [
  { value: 0.25, label: "25%" },
  { value: 0.5, label: "50%" },
  { value: 0.75, label: "75%" },
  { value: 1, label: "100% (max)" },
] as const;

type RepayMode = "manual" | "collateral";

export default function RepayDebtDialog() {
  const [open, setOpen] = React.useState(false);
  const [debtSymbol, setDebtSymbol] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<RepayMode>("manual");
  const [manualAmount, setManualAmount] = React.useState<number | string>("");
  const [collateralSymbol, setCollateralSymbol] = React.useState<string | null>(null);
  const [percentage, setPercentage] = React.useState<number>(1);
  const [collateralRepayAmount, setCollateralRepayAmount] = React.useState<number | string>("");
  const [slippageBps, setSlippageBps] = React.useState<number | null>(null);
  const [simulateLiquidation, setSimulateLiquidation] = React.useState(false);
  const [liquidationBonusPct, setLiquidationBonusPct] = React.useState(5);

  const {
    addressData,
    currentMarket,
    simulateRepayDebt,
    getProjectedHealthFactorAfterRepay,
  } = useAaveData("");

  const availableAssets = addressData?.[currentMarket]?.availableAssets ?? [];
  const market = markets.find((m) => m.id === currentMarket);

  React.useEffect(() => {
    if (mode !== "collateral" || !debtSymbol || !collateralSymbol || !market) {
      setSlippageBps(null);
      return;
    }
    const collateralAsset = availableAssets.find((a) => a.symbol === collateralSymbol);
    const debtAsset = availableAssets.find((a) => a.symbol === debtSymbol);
    if (!collateralAsset?.underlyingAsset || !debtAsset?.underlyingAsset) {
      setSlippageBps(DEFAULT_SLIPPAGE_BPS);
      return;
    }
    let cancelled = false;
    fetchSlippageToleranceBps(
      Number(market.chainId),
      collateralAsset.underlyingAsset,
      debtAsset.underlyingAsset,
    ).then((bps) => {
      if (!cancelled) setSlippageBps(bps ?? DEFAULT_SLIPPAGE_BPS);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, debtSymbol, collateralSymbol, currentMarket, market?.chainId]);

  const borrows: BorrowedAssetDataItem[] =
    addressData?.[currentMarket]?.workingData?.userBorrowsData ?? [];
  const reserves: ReserveAssetDataItem[] =
    addressData?.[currentMarket]?.workingData?.userReservesData ?? [];

  const debtOptions = borrows
    .filter((b) => b.totalBorrows > 0)
    .map((b) => ({
      value: b.asset.symbol,
      label: `${b.asset.symbol} (${b.totalBorrows.toLocaleString(undefined, { maximumFractionDigits: 6 })})`,
    }));

  const collateralOptions = reserves
    .filter((r) => r.underlyingBalance > 0)
    .map((r) => ({
      value: r.asset.symbol,
      label: `${r.asset.symbol} (${r.underlyingBalance.toLocaleString(undefined, { maximumFractionDigits: 6 })})`,
    }));

  const debtItem = borrows.find((b) => b.asset.symbol === debtSymbol);

  const collateralRepayAmountNum =
    typeof collateralRepayAmount === "number"
      ? collateralRepayAmount
      : parseFloat(String(collateralRepayAmount).trim()) || null;
  const useAmountForCollateral =
    mode === "collateral" && collateralRepayAmountNum != null && collateralRepayAmountNum > 0;
  const debtReduceUnits =
    debtItem && debtSymbol && mode === "collateral"
      ? useAmountForCollateral
        ? Math.min(collateralRepayAmountNum!, debtItem.totalBorrows)
        : debtItem.totalBorrows * percentage
      : 0;
  const debtReduceUsd =
    debtItem && debtReduceUnits > 0
      ? debtReduceUnits * (debtItem.asset.priceInUSD || 1)
      : 0;
  const collateralUsdNeeded =
    mode === "collateral" && debtReduceUsd > 0 && !simulateLiquidation
      ? getCollateralUsdNeededForRepay(debtReduceUsd, slippageBps)
      : 0;
  const collateralUsdSeizedLiquidation =
    mode === "collateral" && debtReduceUsd > 0 && simulateLiquidation && liquidationBonusPct >= 0
      ? debtReduceUsd * (1 + liquidationBonusPct / 100)
      : 0;
  const collateralUsdForRepay =
    mode === "collateral" && debtReduceUsd > 0
      ? simulateLiquidation ? collateralUsdSeizedLiquidation : collateralUsdNeeded
      : 0;
  const feeBreakdown =
    mode === "collateral" && collateralUsdNeeded > 0 && !simulateLiquidation
      ? getSwapFeeBreakdown(collateralUsdNeeded, slippageBps)
      : null;
  const collateralItem = reserves.find((r) => r.asset.symbol === collateralSymbol);
  const actualDebtReduceUnits =
    mode === "collateral" && debtItem && collateralItem && (collateralItem.asset.priceInUSD || 0) > 0 && (debtItem.asset.priceInUSD || 0) > 0
      ? simulateLiquidation && liquidationBonusPct >= 0
        ? Math.min(
            debtReduceUnits,
            (collateralItem.underlyingBalance * (collateralItem.asset.priceInUSD || 1) / (1 + liquidationBonusPct / 100)) / (debtItem.asset.priceInUSD || 1),
            debtItem.totalBorrows,
          )
        : debtReduceUnits
      : debtReduceUnits;
  const debtRemainingAfter =
    debtItem && debtSymbol && mode === "collateral"
      ? debtItem.totalBorrows - actualDebtReduceUnits
      : 0;
  const actualCollateralUsdUsed =
    mode === "collateral" && debtItem && collateralItem && actualDebtReduceUnits > 0
      ? simulateLiquidation && liquidationBonusPct >= 0
        ? actualDebtReduceUnits * (debtItem.asset.priceInUSD || 1) * (1 + liquidationBonusPct / 100)
        : collateralUsdForRepay
      : collateralUsdForRepay;
  const collateralRemainingAfter =
    mode === "collateral" &&
    collateralItem &&
    (collateralItem.asset.priceInUSD || 0) > 0
      ? collateralItem.underlyingBalance -
        (actualCollateralUsdUsed > 0 ? actualCollateralUsdUsed / (collateralItem.asset.priceInUSD || 1) : 0)
      : collateralItem?.underlyingBalance ?? 0;

  const manualAmountNum =
    mode === "manual"
      ? typeof manualAmount === "number"
        ? manualAmount
        : parseFloat(String(manualAmount).trim()) || 0
      : 0;
  const currentHF = addressData?.[currentMarket]?.workingData?.healthFactor;
  const formatHF = (hf: number | undefined | null) =>
    hf == null || hf < 0 ? "—" : hf === Infinity ? "∞" : hf.toFixed(2);
  const projectedManual =
    mode === "manual" &&
    debtSymbol &&
    manualAmountNum > 0
      ? getProjectedHealthFactorAfterRepay({
          debtSymbol,
          mode: "manual",
          manualAmount: manualAmountNum,
        })
      : null;
  const projectedCollateral =
    mode === "collateral" &&
    debtSymbol &&
    collateralSymbol != null &&
    (feeBreakdown != null || (simulateLiquidation && debtReduceUnits > 0))
      ? getProjectedHealthFactorAfterRepay({
          debtSymbol,
          mode: "collateral",
          collateralSymbol,
          ...(useAmountForCollateral
            ? { collateralRepayAmount: Math.min(collateralRepayAmountNum!, debtItem?.totalBorrows ?? 0) }
            : { percentage }),
          slippageBps: simulateLiquidation ? undefined : slippageBps,
          ...(simulateLiquidation && liquidationBonusPct >= 0
            ? { liquidationBonusPct }
            : {}),
        })
      : null;
  const liquidationScenarioManual = projectedManual?.liquidationScenario ?? [];
  const liquidationScenarioCollateral = projectedCollateral?.liquidationScenario ?? [];

  const handleApply = () => {
    if (!debtSymbol) return;
    if (mode === "manual") {
      const amount = typeof manualAmount === "number" ? manualAmount : parseFloat(String(manualAmount)) || 0;
      simulateRepayDebt({ debtSymbol, mode: "manual", manualAmount: amount });
    } else if (collateralSymbol != null && (percentage != null || (collateralRepayAmountNum != null && collateralRepayAmountNum > 0))) {
      simulateRepayDebt({
        debtSymbol,
        mode: "collateral",
        collateralSymbol,
        ...(useAmountForCollateral
          ? { collateralRepayAmount: Math.min(collateralRepayAmountNum!, debtItem?.totalBorrows ?? 0) }
          : { percentage }),
        slippageBps: simulateLiquidation ? undefined : slippageBps,
        ...(simulateLiquidation && liquidationBonusPct >= 0 ? { liquidationBonusPct } : {}),
      });
    }
    setOpen(false);
    setDebtSymbol(null);
    setMode("manual");
    setManualAmount("");
    setCollateralSymbol(null);
    setPercentage(1);
    setCollateralRepayAmount("");
    setSimulateLiquidation(false);
    setLiquidationBonusPct(5);
  };

  const canApplyManual =
    !!debtSymbol &&
    mode === "manual" &&
    (typeof manualAmount === "number" ? manualAmount > 0 : parseFloat(String(manualAmount)) > 0);

  const canApplyCollateral =
    !!debtSymbol &&
    mode === "collateral" &&
    !!collateralSymbol &&
    collateralOptions.some((o) => o.value === collateralSymbol) &&
    (useAmountForCollateral ? (debtReduceUnits > 0) : true);

  const canApply = mode === "manual" ? canApplyManual : canApplyCollateral;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Trans>Repay debt</Trans>
      </Button>
      <Modal
        opened={open}
        onClose={() => {
          setOpen(false);
          setDebtSymbol(null);
          setMode("manual");
          setManualAmount("");
          setCollateralSymbol(null);
          setPercentage(1);
          setCollateralRepayAmount("");
          setSimulateLiquidation(false);
          setLiquidationBonusPct(5);
        }}
        title={t`Simulate repay debt`}
      >
        <Stack spacing="md">
          <Text size="sm" color="dimmed">
            <Trans>
              Simulate repaying debt with a manual amount or by using collateral to repay a percentage of the debt (fees and slippage apply when using collateral).
            </Trans>
          </Text>

          <Select
            label={t`Debt to repay`}
            placeholder={t`Select debt`}
            data={debtOptions}
            value={debtSymbol}
            onChange={setDebtSymbol}
            searchable
            nothingFound={t`No borrowed assets with balance`}
          />

          <div>
            <Text size="sm" weight={500} mb={4}>
              <Trans>Repay using</Trans>
            </Text>
            <SegmentedControl
              value={mode}
              onChange={(v) => setMode(v as RepayMode)}
              data={[
                { label: t`Manual amount`, value: "manual" },
                { label: t`Use collateral`, value: "collateral" },
              ]}
            />
          </div>

          {mode === "manual" && debtSymbol && (
            <>
              <NumberInput
                label={t`Amount to repay (${debtSymbol})`}
                placeholder="0"
                value={manualAmount}
                onChange={setManualAmount}
                min={0}
                step={0.01}
                precision={6}
              />
              {projectedManual != null && (
                <>
                  <Text size="sm" weight={500}>
                    <Trans>Expected health factor</Trans>: {formatHF(currentHF)} → {formatHF(projectedManual.healthFactor)}
                  </Text>
                  {liquidationScenarioManual.length > 0 && (
                    <Text size="sm" weight={500} mt={4}>
                      <Trans>Liquidation trigger (approx.)</Trans>:{" "}
                      {liquidationScenarioManual
                        .map((a) => `${a.symbol} $${a.priceInUSD.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
                        .join(", ")}
                    </Text>
                  )}
                </>
              )}
            </>
          )}

          {mode === "collateral" && debtSymbol && (
            <>
              <Select
                label={t`Collateral to use`}
                placeholder={t`Select collateral`}
                data={collateralOptions}
                value={collateralSymbol}
                onChange={setCollateralSymbol}
                searchable
                nothingFound={t`No supplied assets with balance`}
              />
              <div>
                <Text size="sm" weight={500} mb={4}>
                  <Trans>Percentage of debt to repay</Trans>
                </Text>
                <Group spacing="xs">
                  {REPAY_PERCENTAGES.map(({ value, label }) => (
                    <Button
                      key={value}
                      variant={percentage === value && !useAmountForCollateral ? "filled" : "light"}
                      size="xs"
                      onClick={() => {
                        setPercentage(value);
                        setCollateralRepayAmount("");
                      }}
                    >
                      {label}
                    </Button>
                  ))}
                </Group>
              </div>
              <NumberInput
                label={t`Or specify amount to repay (${debtSymbol})`}
                placeholder={t`e.g. 20000`}
                value={collateralRepayAmount}
                onChange={setCollateralRepayAmount}
                min={0}
                step={0.01}
                precision={6}
                description={
                  debtItem
                    ? t`Max ${debtItem.totalBorrows.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${debtSymbol}`
                    : undefined
                }
              />
              <Checkbox
                label={t`Simulate liquidation (include liquidation bonus)`}
                description={t`Model the liquidator fee: more collateral is seized than the debt repaid`}
                checked={simulateLiquidation}
                onChange={(e) => setSimulateLiquidation(e.currentTarget.checked)}
              />
              {simulateLiquidation && (
                <NumberInput
                  label={t`Liquidation bonus %`}
                  description={t`Liquidator receives this % extra collateral (e.g. 5 = 5%)`}
                  value={liquidationBonusPct}
                  onChange={(v) => setLiquidationBonusPct(typeof v === "number" ? v : parseFloat(String(v)) || 5)}
                  min={0}
                  max={50}
                  step={0.5}
                  precision={1}
                />
              )}
            </>
          )}

          {(feeBreakdown || (simulateLiquidation && debtItem && debtSymbol && debtReduceUsd > 0)) && debtItem && debtSymbol && (
            <Paper p="sm" withBorder radius="sm">
              <Text size="sm" weight={600} mb="xs">
                {simulateLiquidation ? <Trans>Liquidation scenario</Trans> : <Trans>Estimated fees</Trans>}
              </Text>
              <Text size="xs" color="dimmed">
                <Trans>Debt to repay</Trans>: {debtReduceUnits.toLocaleString(undefined, { maximumFractionDigits: 6 })} {debtSymbol}
                {debtItem.totalBorrows > 0 && ` (${((100 * debtReduceUnits) / debtItem.totalBorrows).toFixed(1)}%)`}
                {" "}= ${debtReduceUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </Text>
              {simulateLiquidation ? (
                <Text size="xs" color="dimmed">
                  <Trans>Collateral seized (with {liquidationBonusPct}% liquidation bonus)</Trans>: ${collateralUsdSeizedLiquidation.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
              ) : (
                <>
                  <Text size="xs" color="dimmed">
                    <Trans>Collateral value needed (before fees)</Trans>: ${collateralUsdNeeded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text size="xs" color="dimmed">
                    <Trans>Swap fee (0.25%)</Trans>: ${feeBreakdown!.swapFeeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text size="xs" color="dimmed">
                    <Trans>Execution fee (0.05%)</Trans>: ${feeBreakdown!.executionFeeUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text size="xs" color="dimmed">
                    <Trans>Slippage ({((feeBreakdown!.slippageBps ?? DEFAULT_SLIPPAGE_BPS) / 100).toFixed(2)}%)</Trans>: ${feeBreakdown!.slippageUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text size="xs" weight={500} mt="xs">
                    <Trans>Total fees + slippage</Trans>: ${(feeBreakdown!.totalFeeUsd + feeBreakdown!.slippageUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </Text>
                  <Text size="xs" weight={500} mt={4}>
                    <Trans>Amount applied to debt</Trans>: ${feeBreakdown!.receiveUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    (~{(feeBreakdown!.receiveUsd / (debtItem.asset.priceInUSD || 1)).toLocaleString(undefined, { maximumFractionDigits: 4 })} {debtSymbol})
                  </Text>
                </>
              )}
              <Text size="xs" weight={500} mt="xs">
                <Trans>Estimated remaining debt</Trans>: {debtSymbol} {debtRemainingAfter.toLocaleString(undefined, { maximumFractionDigits: 6 })}
              </Text>
              {collateralSymbol && collateralItem && (
                <Text size="xs" weight={500} mt={4}>
                  <Trans>Estimated remaining collateral</Trans>: {collateralSymbol} {Math.max(0, collateralRemainingAfter).toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </Text>
              )}
              {projectedCollateral != null && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Expected health factor</Trans>: {formatHF(currentHF)} → {formatHF(projectedCollateral.healthFactor)}
                </Text>
              )}
              {liquidationScenarioCollateral.length > 0 && (
                <Text size="xs" weight={500} mt="xs">
                  <Trans>Liquidation trigger (approx.)</Trans>:{" "}
                  {liquidationScenarioCollateral
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
              <Trans>Apply repay</Trans>
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
