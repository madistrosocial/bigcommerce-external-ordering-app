import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface BigCommerceCategoryTreeItem {
  id: number;
  name: string;
  parent_id: number;
}

interface BigCommerceCategoryTreeProps {
  categories: BigCommerceCategoryTreeItem[];
  selectedIds: number[];
  onChange: (selectedIds: number[]) => void;
  disabled?: boolean;
  singleSelect?: boolean;
  title?: string;
  maxHeightClassName?: string;
}

export default function BigCommerceCategoryTree({
  categories,
  selectedIds,
  onChange,
  disabled = false,
  singleSelect = false,
  title = "Assigned categories",
  maxHeightClassName = "max-h-[24rem]",
}: BigCommerceCategoryTreeProps) {
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const selectedSignature = selectedIds.join(",");
  const childrenByParent = useMemo(() => {
    const children = new Map<number, BigCommerceCategoryTreeItem[]>();
    for (const category of categories) {
      const parentId = category.parent_id || 0;
      children.set(parentId, [...(children.get(parentId) || []), category]);
    }
    return children;
  }, [categories]);
  const matchingIds = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return null;
    const visible = new Set<number>();
    for (const category of categories) {
      if (!category.name.toLowerCase().includes(query)) continue;
      let current: BigCommerceCategoryTreeItem | undefined = category;
      while (current && !visible.has(current.id)) {
        visible.add(current.id);
        current = categoriesById.get(current.parent_id);
      }
    }
    return visible;
  }, [categories, categoriesById, search]);

  useEffect(() => {
    setExpandedIds((current) => {
      const next = new Set(current);
      for (const selectedId of selectedIds) {
        let category = categoriesById.get(selectedId);
        const seen = new Set<number>();
        while (category?.parent_id && !seen.has(category.id)) {
          seen.add(category.id);
          next.add(category.parent_id);
          category = categoriesById.get(category.parent_id);
        }
      }
      return next;
    });
  }, [categoriesById, selectedSignature]);

  const toggleCategory = (categoryId: number, checked: boolean) => {
    if (singleSelect) {
      onChange(checked ? [categoryId] : selectedIds.filter((id) => id !== categoryId));
      return;
    }
    onChange(checked
      ? selectedIds.includes(categoryId) ? selectedIds : [...selectedIds, categoryId]
      : selectedIds.filter((id) => id !== categoryId));
  };

  const renderCategory = (category: BigCommerceCategoryTreeItem, depth = 0): React.ReactNode => {
    if (matchingIds && !matchingIds.has(category.id)) return null;
    const children = (childrenByParent.get(category.id) || [])
      .filter((child) => !matchingIds || matchingIds.has(child.id));
    const expanded = Boolean(matchingIds) || expandedIds.has(category.id);
    return (
      <div key={category.id}>
        <div className="flex items-center gap-1 rounded py-1.5 pr-2 hover:bg-slate-50" style={{ paddingLeft: 8 + depth * 18 }}>
          {children.length > 0
            ? <button
                type="button"
                aria-label={`${expanded ? "Collapse" : "Expand"} ${category.name}`}
                aria-expanded={expanded}
                onClick={() => setExpandedIds((current) => {
                  const next = new Set(current);
                  if (next.has(category.id)) next.delete(category.id);
                  else next.add(category.id);
                  return next;
                })}
                className="rounded p-0.5 text-slate-400 hover:bg-slate-200"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
              </button>
            : <span className="w-5" />}
          <input
            type="checkbox"
            disabled={disabled}
            checked={selectedIds.includes(category.id)}
            onChange={(event) => toggleCategory(category.id, event.target.checked)}
            aria-label={category.name}
          />
          <span className="text-xs text-slate-700">{category.name}</span>
        </div>
        {expanded && children.map((child) => renderCategory(child, depth + 1))}
      </div>
    );
  };

  const roots = categories.filter((category) => !categoriesById.has(category.parent_id));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <p className="mt-1 text-xs text-slate-500">{selectedIds.length} selected</p>
        </div>
        <Input
          className="h-8 w-full sm:max-w-[190px]"
          placeholder="Search categories"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search categories"
        />
      </div>
      <p className="mt-2 text-[10px] text-slate-500">Expand a category to browse its subcategories.</p>
      <div className={`mt-2 overflow-y-auto rounded-md border border-slate-200 py-2 ${maxHeightClassName}`}>
        {roots.map((category) => renderCategory(category))}
      </div>
    </div>
  );
}
