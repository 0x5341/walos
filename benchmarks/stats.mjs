export function statistics(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value)))
    throw new Error('Expected nonempty finite measurements');
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return {
    n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95: sorted[Math.ceil(n * 0.95) - 1],
    stddev: Math.sqrt(sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / n),
  };
}
export function summarize(samples) {
  const groups = new Map();
  for (const { scenario, trial, ...metrics } of samples) {
    const group = groups.get(scenario) ?? {};
    groups.set(scenario, group);
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value !== 'number') continue;
      (group[key] ??= []).push(value);
    }
  }
  return Object.fromEntries(
    [...groups].map(([scenario, metrics]) => [
      scenario,
      Object.fromEntries(
        Object.entries(metrics).map(([name, values]) => [name, statistics(values)]),
      ),
    ]),
  );
}
export function flatten(metrics, prefix = '') {
  return Object.fromEntries(
    Object.entries(metrics).flatMap(([key, value]) => {
      const name = prefix + key;
      return value && typeof value === 'object'
        ? Object.entries(flatten(value, `${name}.`))
        : [[name, value]];
    }),
  );
}

/** Independent bootstrap of the ratio of medians, with reproducible PRNG. */
export function bootstrapImprovement(baseline, candidate, iterations = 10000, seed = 0x5341) {
  statistics(baseline);
  statistics(candidate);
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const draw = (values) =>
    statistics(
      Array.from({ length: values.length }, () => values[Math.floor(random() * values.length)]),
    ).median;
  const estimates = Array.from(
    { length: iterations },
    () => 1 - draw(candidate) / draw(baseline),
  ).sort((a, b) => a - b);
  return {
    improvement: 1 - statistics(candidate).median / statistics(baseline).median,
    lower: estimates[Math.floor(iterations * 0.025)],
    upper: estimates[Math.ceil(iterations * 0.975) - 1],
    iterations,
    seed,
  };
}
