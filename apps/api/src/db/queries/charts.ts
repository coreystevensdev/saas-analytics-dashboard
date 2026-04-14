import { eq, asc } from 'drizzle-orm';
import type { ChartFilters, Granularity } from 'shared/types';
import { db, type DbTransaction } from '../../lib/db.js';
import { dataRows } from '../schema.js';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const DEFAULT_CHART_ROW_LIMIT = 2000;

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isInDateRange(rowDate: Date, from?: Date, to?: Date): boolean {
  const d = toISODate(rowDate);
  if (from && d < toISODate(from)) return false;
  if (to && d > toISODate(to)) return false;
  return true;
}

function mondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dayOfWeek = copy.getDay();
  const offset = (dayOfWeek + 6) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

function bucketKey(d: Date, granularity: Granularity): string {
  if (granularity === 'weekly') {
    const mon = mondayOfWeek(d);
    return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'weekly') {
    const parts = key.split('-');
    const monthIdx = parseInt(parts[1]!, 10) - 1;
    return `${MONTH_LABELS[monthIdx]} ${parseInt(parts[2]!, 10)}`;
  }
  const [year, month] = key.split('-');
  const monthIdx = parseInt(month!, 10) - 1;
  return `${MONTH_LABELS[monthIdx]} ${year}`;
}

/**
 * Aggregates an org's data_rows into chart-ready structures.
 *
 * Metadata (availableCategories, dateRange) always reflects the full dataset
 * so filter controls show all options regardless of current filter state.
 * Actual chart data is filtered by the provided params.
 *
 * Runs a single query, filters + aggregates in JS.
 * Capped at `limit` rows (default 2,000) — enough for chart visualization.
 * The curation pipeline uses getRowsByDataset() which stays unlimited.
 */
export async function getChartData(
  orgId: number,
  filters?: ChartFilters,
  limit = DEFAULT_CHART_ROW_LIMIT,
  client: typeof db | DbTransaction = db,
) {
  const granularity: Granularity = filters?.granularity ?? 'monthly';

  const rows = await client.query.dataRows.findMany({
    where: eq(dataRows.orgId, orgId),
    orderBy: asc(dataRows.date),
    limit,
  });

  const categorySet = new Set<string>();
  let minDate: Date | null = null;
  let maxDate: Date | null = null;

  for (const row of rows) {
    if (row.parentCategory === 'Expenses') {
      categorySet.add(row.category);
    }
    if (!minDate || row.date < minDate) minDate = row.date;
    if (!maxDate || row.date > maxDate) maxDate = row.date;
  }

  const availableCategories = [...categorySet].sort();
  const dateRange = minDate && maxDate
    ? { min: toISODate(minDate), max: toISODate(maxDate) }
    : null;

  const activeCategories = filters?.categories?.length
    ? new Set(filters.categories)
    : null;

  const revenueByBucket = new Map<string, number>();
  const expenseTotals = new Map<string, number>();
  const expenseByBucketCategory = new Map<string, Map<string, number>>();

  for (const row of rows) {
    if (!isInDateRange(row.date, filters?.dateFrom, filters?.dateTo)) continue;

    const amount = parseFloat(row.amount);
    const key = bucketKey(row.date, granularity);

    if (row.parentCategory === 'Income') {
      revenueByBucket.set(key, (revenueByBucket.get(key) ?? 0) + amount);
    } else if (row.parentCategory === 'Expenses') {
      if (activeCategories && !activeCategories.has(row.category)) continue;
      expenseTotals.set(row.category, (expenseTotals.get(row.category) ?? 0) + amount);

      if (!expenseByBucketCategory.has(key)) expenseByBucketCategory.set(key, new Map());
      const bucketMap = expenseByBucketCategory.get(key)!;
      bucketMap.set(row.category, (bucketMap.get(row.category) ?? 0) + amount);
    }
  }

  const revenueTrend = [...revenueByBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, revenue]) => ({
      month: bucketLabel(key, granularity),
      revenue: Math.round(revenue * 100) / 100,
    }));

  const expenseBreakdown = [...expenseTotals.entries()]
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
    .sort((a, b) => b.total - a.total);

  const allExpenseCategories = [...expenseTotals.keys()].sort();
  const expenseTrend = [...expenseByBucketCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, catMap]) => {
      const point: Record<string, string | number> = {
        month: bucketLabel(key, granularity),
      };
      for (const cat of allExpenseCategories) {
        point[cat] = Math.round((catMap.get(cat) ?? 0) * 100) / 100;
      }
      return point;
    });

  const allBucketKeys = new Set([...revenueByBucket.keys(), ...expenseByBucketCategory.keys()]);
  const monthlyComparison = [...allBucketKeys]
    .sort()
    .map((key) => {
      const revenue = Math.round((revenueByBucket.get(key) ?? 0) * 100) / 100;
      const totalExpense = expenseByBucketCategory.has(key)
        ? [...expenseByBucketCategory.get(key)!.values()].reduce((s, v) => s + v, 0)
        : 0;
      const expenses = Math.round(totalExpense * 100) / 100;
      return {
        month: bucketLabel(key, granularity),
        revenue,
        expenses,
        profit: Math.round((revenue - expenses) * 100) / 100,
      };
    });

  // YoY comparison — only meaningful with 2+ years of data
  const revenueByYearMonth = new Map<string, Map<number, number>>();
  for (const row of rows) {
    if (!isInDateRange(row.date, filters?.dateFrom, filters?.dateTo)) continue;
    if (row.parentCategory !== 'Income') continue;

    const year = String(row.date.getFullYear());
    const monthIdx = row.date.getMonth();
    const amount = parseFloat(row.amount);

    if (!revenueByYearMonth.has(year)) revenueByYearMonth.set(year, new Map());
    const yearMap = revenueByYearMonth.get(year)!;
    yearMap.set(monthIdx, (yearMap.get(monthIdx) ?? 0) + amount);
  }

  const years = [...revenueByYearMonth.keys()].sort();
  const yoyComparison = years.length >= 2
    ? Array.from({ length: 12 }, (_, monthIdx) => {
        const currentYear = years[years.length - 1]!;
        const priorYear = years[years.length - 2]!;
        const current = revenueByYearMonth.get(currentYear)?.get(monthIdx) ?? 0;
        const prior = revenueByYearMonth.get(priorYear)?.get(monthIdx) ?? 0;
        const changePercent = prior > 0 ? Math.round(((current - prior) / prior) * 1000) / 10 : null;
        return {
          month: MONTH_LABELS[monthIdx]!,
          currentYear: Math.round(current * 100) / 100,
          priorYear: Math.round(prior * 100) / 100,
          changePercent,
          currentYearLabel: currentYear,
          priorYearLabel: priorYear,
        };
      }).filter((p) => p.currentYear > 0 || p.priorYear > 0)
    : [];

  return { revenueTrend, expenseBreakdown, expenseTrend, monthlyComparison, yoyComparison, availableCategories, dateRange };
}
