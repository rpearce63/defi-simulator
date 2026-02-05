import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/router";
import { ethers } from "ethers";
import { t } from "@lingui/macro";

import { ActionIcon, Autocomplete, Center, Tooltip } from "@mantine/core";
import { FaCopy, FaExternalLinkAlt } from "react-icons/fa";
import { GiDiceSixFacesFive } from "react-icons/gi";
import { markets, useAaveData } from "../hooks/useAaveData";
import { RandomAddressButton } from "../pages";

const STORAGE_KEY = "defi-simulator-recent-addresses";
const MAX_RECENT = 20;

function getRecentAddresses(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function addRecentAddress(address: string): void {
  const trimmed = address.trim();
  if (!trimmed) return;
  const prev = getRecentAddresses();
  const next = [trimmed, ...prev.filter((a) => a.toLowerCase() !== trimmed.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

type Props = {};

const AddressInput = ({ }: Props) => {
  const [inputAddress, setInputAddress] = useState("");
  const [showCopied, setShowCopied] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState<string[]>([]);
  const router = useRouter();

  const { currentAddress, currentMarket } = useAaveData("");

  const market = markets.find((market) => market.id === currentMarket);

  // Keep dropdown list in sync with localStorage (single source of truth; avoids stale state overwriting the list)
  const refreshRecentFromStorage = useCallback(() => {
    setRecentAddresses(getRecentAddresses());
  }, []);

  useEffect(() => {
    refreshRecentFromStorage();
  }, [refreshRecentFromStorage]);

  const handleSelectAddress = useCallback(
    (address: string) => {
      const trimmed = address?.trim() ?? "";
      setInputAddress(trimmed);
      if (ethers.utils.isAddress(trimmed) || isValidENSAddress(trimmed)) {
        addRecentAddress(trimmed);
        refreshRecentFromStorage();
        const query = { ...router?.query };
        query.address = trimmed;
        router.push({
          pathname: router.pathname,
          query,
        });
      } else if (trimmed.length > 0) {
        console.error("THE PROVIDED ADDRESS IS INVALID: ", trimmed);
      }
    },
    [router, refreshRecentFromStorage]
  );

  const handleSelectAddressRef = useRef(handleSelectAddress);
  handleSelectAddressRef.current = handleSelectAddress;
  const lastSyncedFromUrlRef = useRef<string | null>(null);

  // Sync from URL/currentAddress into input, without overwriting when the user just selected
  // a different address (router hasn't updated yet).
  useEffect(() => {
    if (currentAddress) {
      addRecentAddress(currentAddress);
      refreshRecentFromStorage();
      const inputIsValid =
        ethers.utils.isAddress(inputAddress) || isValidENSAddress(inputAddress);
      if (
        inputAddress === "" ||
        !inputIsValid ||
        inputAddress.toLowerCase() === currentAddress.toLowerCase()
      ) {
        setInputAddress(currentAddress);
        lastSyncedFromUrlRef.current = currentAddress;
      }
    } else if (inputAddress) {
      const inputIsValid =
        ethers.utils.isAddress(inputAddress) || isValidENSAddress(inputAddress);
      if (!inputIsValid) setInputAddress("");
      lastSyncedFromUrlRef.current = null;
    }
  }, [currentAddress, inputAddress, refreshRecentFromStorage]);

  // When user types a valid address, navigate. Skip when the value was just synced from URL.
  useEffect(() => {
    const isValid =
      ethers.utils.isAddress(inputAddress) || isValidENSAddress(inputAddress);
    if (
      !isValid ||
      (lastSyncedFromUrlRef.current !== null &&
        inputAddress.toLowerCase() === lastSyncedFromUrlRef.current.toLowerCase())
    ) {
      return;
    }
    lastSyncedFromUrlRef.current = null;
    handleSelectAddressRef.current(inputAddress);
  }, [inputAddress]);

  const handleCopy = () => {
    navigator.clipboard.writeText(inputAddress);
    setShowCopied(true);
    setTimeout(() => setShowCopied(false), 2500);
  };

  // Exclude the current address from the dropdown since it's already in the field
  const dropdownOptions = recentAddresses.filter(
    (a) => a.toLowerCase() !== (inputAddress || "").toLowerCase().trim()
  );

  return (
    <Autocomplete
      value={inputAddress || ""}
      size="lg"
      placeholder={t`0x...1234 or bobloblaw.eth`}
      data={dropdownOptions}
      onChange={(value) => setInputAddress(value?.trim() ?? "")}
      onItemSubmit={(item) => handleSelectAddress(item.value)}
      filter={(value, item) => {
        const q = value.toLowerCase().trim();
        if (!q) return true;
        // When field already shows the current address (exact match), show all options in the list
        if (inputAddress && q === inputAddress.toLowerCase().trim()) return true;
        return item.value.toLowerCase().includes(q);
      }}
      inputWrapperOrder={["label", "error", "input", "description"]}
      rightSection={
        <Center>
          <RandomAddressButton>
            <Tooltip label={t`Use Random Address`} position="left" withArrow>
              <ActionIcon bg="#25262b" pr={4} pl={4}>
                <GiDiceSixFacesFive title={t`Use Random Address`} size={16} />
              </ActionIcon>
            </Tooltip>
          </RandomAddressButton>
          <Tooltip
            label={
              showCopied
                ? t`Address copied to clipboard!`
                : t`Copy address to clipboard`
            }
            opened={showCopied ? true : undefined}
            color={showCopied ? "green" : undefined}
            position="left"
            withArrow
          >
            <ActionIcon bg="#25262b" pr={8}>
              <FaCopy
                title={t`Copy address to clipboard`}
                size={16}
                onClick={handleCopy}
              />
            </ActionIcon>
          </Tooltip>
          <Tooltip
            label={t`View address on ${market?.explorerName}`}
            position="left"
            withArrow
          >
            <a
              title={t`Visit address details on Etherscan`}
              target="_blank"
              href={market?.explorer.replace("{{ADDRESS}}", inputAddress)}
              style={{
                color: "#e9ecef",
                marginRight: "44px",
                marginTop: "2px",
              }}
              rel="noreferrer"
            >
              <FaExternalLinkAlt size={16} />
            </a>
          </Tooltip>
        </Center>
      }
    />
  );
};

export default AddressInput;

export const isValidENSAddress = (address: string) =>
  !!address?.length && address.length > 4 && address.endsWith(".eth");
