interface IndustryBenchmark {
  margins: string;
  costStructure: string;
  seasonality: string;
  keyMetrics: string[];
}

const BENCHMARKS: Record<string, IndustryBenchmark> = {
  restaurant: {
    margins: 'Average restaurant net margin: 3-9%. Full-service skews lower (3-5%), fast-casual higher (6-9%).',
    costStructure: 'Food costs typically 28-35% of revenue. Labor 25-35%. Occupancy 5-10%.',
    seasonality: 'Peak months: May-August (patios, tourism) and November-December (holidays). January-February typically slowest.',
    keyMetrics: [
      'Food cost percentage above 35% signals supplier or waste issues',
      'Labor over 35% of revenue is a red flag for overstaffing or low pricing',
      'Table turnover rate matters more than average check size for volume restaurants',
    ],
  },
  retail: {
    margins: 'Average retail net margin: 2-5%. Specialty retail can reach 8-12%.',
    costStructure: 'Cost of goods typically 50-65% of revenue. Rent 5-10%. Labor 10-20%.',
    seasonality: 'Q4 (October-December) drives 25-40% of annual revenue for most retailers. Post-holiday January is typically weakest.',
    keyMetrics: [
      'Inventory turnover below 4x/year suggests overstocking',
      'Gross margin under 40% limits room for marketing and growth investment',
      'Shrinkage above 2% of revenue warrants loss prevention review',
    ],
  },
  services: {
    margins: 'Average professional services margin: 15-25%. Solo consultants can exceed 40%.',
    costStructure: 'Labor is the dominant cost (50-70% of revenue). Overhead typically 15-25%.',
    seasonality: 'Varies by service type. Accounting peaks Q1 (tax season). Marketing/consulting often dips August and December.',
    keyMetrics: [
      'Utilization rate below 65% means too much non-billable time',
      'Client concentration above 30% from one client is a revenue risk',
      'Average project margin below 20% suggests underpricing or scope creep',
    ],
  },
  construction: {
    margins: 'Average construction net margin: 5-10%. Residential remodeling can reach 15%.',
    costStructure: 'Materials typically 40-50% of job cost. Labor 25-35%. Equipment 5-15%.',
    seasonality: 'Peak: April-October in northern climates. Year-round in southern. December-February typically slowest.',
    keyMetrics: [
      'Material costs rising faster than bid prices erodes margins on fixed-price contracts',
      'Change order revenue should be tracked separately from original contract value',
      'Cash flow gaps between milestone payments are the #1 cause of construction business failure',
    ],
  },
  healthcare: {
    margins: 'Average healthcare practice margin: 10-20%. Dental and specialty tend higher (15-25%).',
    costStructure: 'Staff costs typically 45-55% of revenue. Supplies 10-15%. Rent/facilities 8-12%.',
    seasonality: 'Steady year-round with dips in summer (vacation) and December. Insurance deductible resets drive Q4 volume.',
    keyMetrics: [
      'No-show rate above 10% signals scheduling or patient communication issues',
      'Revenue per visit trending down may indicate coding or payer mix changes',
      'Staff cost above 55% of revenue limits reinvestment capacity',
    ],
  },
  technology: {
    margins: 'Average tech company gross margin: 60-80%. Net margin varies widely (5-30%).',
    costStructure: 'Engineering labor is the dominant cost. Infrastructure 5-15% of revenue. Sales/marketing 20-40%.',
    seasonality: 'Enterprise sales peak Q4 (budget flush). SaaS revenue is typically steady. Hiring cycles create Q1 cost spikes.',
    keyMetrics: [
      'Customer acquisition cost (CAC) should be recovered within 12 months',
      'Monthly burn rate above 18 months of runway needs immediate attention',
      'Revenue growth below 20% YoY makes it hard to attract investment',
    ],
  },
  manufacturing: {
    margins: 'Average manufacturing net margin: 5-10%. High-value/custom work can reach 15%.',
    costStructure: 'Raw materials 40-60% of revenue. Labor 15-25%. Overhead/utilities 10-20%.',
    seasonality: 'Varies by product. Consumer goods peak Q3-Q4 for holiday production. Industrial tends steady.',
    keyMetrics: [
      'Scrap rate above 5% warrants process review',
      'Material cost increases not passed to customers erode margins silently',
      'Overtime costs above 10% of labor budget signal capacity constraints',
    ],
  },
  real_estate: {
    margins: 'Average property management margin: 10-15%. Brokerage margins: 5-15% after splits.',
    costStructure: 'Agent commissions/splits dominate (50-70% of gross revenue). Marketing 5-10%. Office overhead 10-15%.',
    seasonality: 'Residential sales peak May-August. Rentals peak May-September. Commercial is steadier year-round.',
    keyMetrics: [
      'Vacancy rate above local average signals pricing or property condition issues',
      'Marketing cost per transaction trending up may indicate market softening',
      'Maintenance reserves below 1% of property value per year risk deferred maintenance costs',
    ],
  },
  transportation: {
    margins: 'Average trucking/transport margin: 3-8%. Asset-light (brokerage) can reach 10-15%.',
    costStructure: 'Fuel typically 25-35% of revenue. Driver labor 30-40%. Insurance/maintenance 10-15%.',
    seasonality: 'Peak: Q4 (holiday freight). Produce season (spring-fall). January-February typically slowest.',
    keyMetrics: [
      'Revenue per mile below $2.50 (dry van) signals rate pressure',
      'Fuel costs above 35% of revenue suggest route inefficiency or old fleet',
      'Deadhead percentage above 15% means too many empty return trips',
    ],
  },
  other: {
    margins: 'Small business average net margin: 7-10% across industries.',
    costStructure: 'Varies widely. Track your top 3 expense categories as a percentage of revenue and compare quarter over quarter.',
    seasonality: 'Most businesses have at least one predictable peak and one slow period. Identifying yours enables cash reserve planning.',
    keyMetrics: [
      'Operating expenses growing faster than revenue is unsustainable long-term',
      'Any single expense category above 40% of revenue deserves a closer look',
      'Month-to-month revenue swings above 30% suggest dependency on a few large clients or seasonal factors',
    ],
  },
};

export function getIndustryBenchmarks(businessType: string | undefined): string | null {
  if (!businessType) return null;

  const bench = BENCHMARKS[businessType];
  if (!bench) return null;

  const lines = [
    bench.margins,
    bench.costStructure,
    bench.seasonality,
    ...bench.keyMetrics.map((m) => `- ${m}`),
  ];

  return lines.join('\n');
}
