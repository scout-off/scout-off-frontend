"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Select from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import type { PlayerFilter, ProgressLevel } from "@/types";

const AFRICAN_REGIONS = [
  "West Africa",
  "East Africa",
  "North Africa",
  "Central Africa",
  "Southern Africa",
];

const POSITIONS = ["GK", "CB", "LB", "RB", "CM", "CAM", "LW", "RW", "ST"];

interface PlayerFilterFormProps {
  onFilter: (filter: PlayerFilter) => void;
}

export default function PlayerFilterForm({ onFilter }: PlayerFilterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [region, setRegion] = useState(searchParams.get("region") ?? "");
  const [position, setPosition] = useState(searchParams.get("position") ?? "");
  const [minLevel, setMinLevel] = useState(searchParams.get("minLevel") ?? "");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = useCallback(
    (r: string, p: string, l: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const filter: PlayerFilter = {};
        if (r) filter.region = r;
        if (p) filter.position = p;
        if (l) filter.minLevel = Number(l) as ProgressLevel;
        onFilter(filter);
      }, 300);
    },
    [onFilter]
  );

  // Sync URL params → state on mount
  useEffect(() => {
    emit(region, position, minLevel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateParams(r: string, p: string, l: string) {
    const params = new URLSearchParams(searchParams.toString());
    r ? params.set("region", r) : params.delete("region");
    p ? params.set("position", p) : params.delete("position");
    l ? params.set("minLevel", l) : params.delete("minLevel");
    router.replace(`?${params.toString()}`);
  }

  function handleRegion(e: React.ChangeEvent<HTMLSelectElement>) {
    setRegion(e.target.value);
    updateParams(e.target.value, position, minLevel);
    emit(e.target.value, position, minLevel);
  }

  function handlePosition(e: React.ChangeEvent<HTMLSelectElement>) {
    setPosition(e.target.value);
    updateParams(region, e.target.value, minLevel);
    emit(region, e.target.value, minLevel);
  }

  function handleMinLevel(e: React.ChangeEvent<HTMLSelectElement>) {
    setMinLevel(e.target.value);
    updateParams(region, position, e.target.value);
    emit(region, position, e.target.value);
  }

  function handleClear() {
    setRegion("");
    setPosition("");
    setMinLevel("");
    updateParams("", "", "");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFilter({});
  }

  return (
    <div className="bg-brand-card border border-gray-800 rounded-xl p-5 flex flex-wrap gap-4 items-end">
      <Select label="Region" value={region} onChange={handleRegion} className="w-44">
        <option value="">Any</option>
        {AFRICAN_REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </Select>

      <Select label="Position" value={position} onChange={handlePosition} className="w-32">
        <option value="">Any</option>
        {POSITIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </Select>

      <Select label="Min Level" value={minLevel} onChange={handleMinLevel} className="w-36">
        <option value="">Any</option>
        <option value="1">Verified Identity</option>
        <option value="2">Performance Milestones</option>
        <option value="3">Elite Tier</option>
      </Select>

      <Button variant="secondary" type="button" onClick={handleClear}>
        Clear
      </Button>
    </div>
  );
}
