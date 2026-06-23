'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AFRICAN_REGIONS } from '@/lib/regions';
import { FOOTBALL_POSITIONS } from '@/lib/positions';
import type { PlayerFilter, ProgressLevel } from '@/types';

const DEBOUNCE_MS = 300;

const LEVEL_OPTIONS: { label: string; value: ProgressLevel }[] = [
  { label: 'All', value: 0 },
  { label: 'Verified', value: 1 },
  { label: 'Performance', value: 2 },
  { label: 'Elite', value: 3 },
];

interface FilterState {
  region: string;
  position: string;
  level: ProgressLevel;
}

const DEFAULTS: FilterState = { region: '', position: '', level: 0 };

function toPlayerFilter(state: FilterState): PlayerFilter {
  return {
    region: state.region || undefined,
    position: state.position || undefined,
    minLevel: state.level,
  };
}

export interface PlayerFilterFormProps {
  onSearch: (filter: PlayerFilter) => void;
  className?: string;
}

export default function PlayerFilterForm({
  onSearch,
  className = '',
}: PlayerFilterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filter, setFilter] = useState<FilterState>(() => ({
    region: searchParams.get('region') ?? DEFAULTS.region,
    position: searchParams.get('position') ?? DEFAULTS.position,
    level: (Number(searchParams.get('level') ?? DEFAULTS.level)) as ProgressLevel,
  }));

  // Cancel pending debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    };
  }, []);

  // Fire an initial search on mount to populate results (restores URL state too)
  useEffect(() => {
    onSearch(toPlayerFilter(filter));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateURL = useCallback(
    (next: FilterState) => {
      const params = new URLSearchParams();
      if (next.region) params.set('region', next.region);
      if (next.position) params.set('position', next.position);
      if (next.level > 0) params.set('level', String(next.level));
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router],
  );

  const scheduleSearch = useCallback(
    (next: FilterState) => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearch(toPlayerFilter(next));
      }, DEBOUNCE_MS);
    },
    [onSearch],
  );

  const handleChange = useCallback(
    (field: keyof FilterState, raw: string) => {
      const value =
        field === 'level' ? (Number(raw) as ProgressLevel) : raw;
      const next = { ...filter, [field]: value } as FilterState;
      setFilter(next);
      updateURL(next);
      scheduleSearch(next);
    },
    [filter, updateURL, scheduleSearch],
  );

  const handleReset = useCallback(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    setFilter(DEFAULTS);
    updateURL(DEFAULTS);
    onSearch(toPlayerFilter(DEFAULTS));
  }, [onSearch, updateURL]);

  return (
    <div
      role="search"
      aria-label="Filter players"
      className={`flex flex-wrap gap-4 items-end ${className}`}
    >
      {/* Region */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-region"
          className="text-xs font-medium text-gray-400"
        >
          Region
        </label>
        <select
          id="filter-region"
          className="input w-44"
          value={filter.region}
          onChange={(e) => handleChange('region', e.target.value)}
        >
          <option value="">All regions</option>
          {AFRICAN_REGIONS.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Position */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-position"
          className="text-xs font-medium text-gray-400"
        >
          Position
        </label>
        <select
          id="filter-position"
          className="input w-40"
          value={filter.position}
          onChange={(e) => handleChange('position', e.target.value)}
        >
          <option value="">Any position</option>
          {FOOTBALL_POSITIONS.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Min Level */}
      <div className="flex flex-col gap-1">
        <label
          htmlFor="filter-level"
          className="text-xs font-medium text-gray-400"
        >
          Min Level
        </label>
        <select
          id="filter-level"
          className="input w-36"
          value={filter.level}
          onChange={(e) => handleChange('level', e.target.value)}
        >
          {LEVEL_OPTIONS.map(({ label, value }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Reset */}
      <button
        type="button"
        onClick={handleReset}
        className="px-4 py-2 rounded-lg border border-gray-700 text-sm text-gray-300 hover:border-brand-green hover:text-white transition"
      >
        Reset Filters
      </button>
    </div>
  );
}
