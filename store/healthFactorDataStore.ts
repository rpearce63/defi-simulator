import React from "react";
import { hookstate, State } from "@hookstate/core";
import { HealthFactorData } from "../hooks/useAaveData";

interface HealthFactorStore {
  currentAddress: string;
  currentMarket: string;
  addressData: Record<string, Record<string, HealthFactorData>>;
  isRefreshActive: boolean;
}

const defaultState: HealthFactorStore = {
  currentAddress: "",
  currentMarket: "BASE_V3",
  addressData: {},
  isRefreshActive: true,
};

export const HealthFactorDataStore: HealthFactorStore = hookstate(defaultState);
