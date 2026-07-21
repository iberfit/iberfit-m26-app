export const PERFORMANCE_BUDGETS = Object.freeze({
  bootMs: 1800,
  renderMs: 80,
  interactionMs: 120,
  javascriptBytes: 420000,
  stylesheetBytes: 110000,
});

export function recordMetric(metrics = {}, key, duration) {
  const value = Math.max(0, Number(duration || 0));
  const previous = metrics[key] || { count: 0, total: 0, max: 0, last: 0 };
  return {
    ...metrics,
    [key]: {
      count: previous.count + 1,
      total: previous.total + value,
      max: Math.max(previous.max, value),
      last: value,
      average: (previous.total + value) / (previous.count + 1),
    },
  };
}

export function evaluatePerformance(metrics = {}, budgets = PERFORMANCE_BUDGETS) {
  const render = metrics.render || { last: 0, max: 0 };
  const boot = metrics.boot || { last: 0, max: 0 };
  return {
    pass: Number(render.max || 0) <= budgets.renderMs && Number(boot.max || 0) <= budgets.bootMs,
    render: { value: Number(render.max || 0), budget: budgets.renderMs, pass: Number(render.max || 0) <= budgets.renderMs },
    boot: { value: Number(boot.max || 0), budget: budgets.bootMs, pass: Number(boot.max || 0) <= budgets.bootMs },
  };
}

export function resourceBudget({ javascriptBytes = 0, stylesheetBytes = 0 } = {}, budgets = PERFORMANCE_BUDGETS) {
  return {
    pass: javascriptBytes <= budgets.javascriptBytes && stylesheetBytes <= budgets.stylesheetBytes,
    javascript: { value: javascriptBytes, budget: budgets.javascriptBytes, pass: javascriptBytes <= budgets.javascriptBytes },
    stylesheet: { value: stylesheetBytes, budget: budgets.stylesheetBytes, pass: stylesheetBytes <= budgets.stylesheetBytes },
  };
}
