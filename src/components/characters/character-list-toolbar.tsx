"use client";

import { Search } from "lucide-react";
import Chip from "@/components/ui/chip";
import Input from "@/components/ui/input";
import Select from "@/components/ui/select";
import {
  CHARACTER_FILTER_LABEL,
  CHARACTER_SORT_LABEL,
  type CharacterFilter,
  type CharacterSort,
} from "./character-list";

/** Tìm, lọc và xếp danh sách nhân vật của kênh, ngay trên danh sách đã tải. */
export default function CharacterListToolbar({
  query,
  onQuery,
  filter,
  onFilter,
  sort,
  onSort,
}: {
  query: string;
  onQuery: (value: string) => void;
  filter: CharacterFilter;
  onFilter: (value: CharacterFilter) => void;
  sort: CharacterSort;
  onSort: (value: CharacterSort) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 th-text-tertiary" />
        <Input
          type="search"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder="Tìm theo tên nhân vật"
          aria-label="Tìm nhân vật"
          className="pl-9"
        />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Lọc nhân vật">
          {(Object.keys(CHARACTER_FILTER_LABEL) as CharacterFilter[]).map((value) => (
            <Chip key={value} role="radio" selected={filter === value} onClick={() => onFilter(value)}>
              {CHARACTER_FILTER_LABEL[value]}
            </Chip>
          ))}
        </div>
        <div className="sm:w-48">
          <Select value={sort} onChange={(event) => onSort(event.target.value as CharacterSort)} aria-label="Xếp nhân vật">
            {(Object.keys(CHARACTER_SORT_LABEL) as CharacterSort[]).map((value) => (
              <option key={value} value={value}>
                {CHARACTER_SORT_LABEL[value]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
