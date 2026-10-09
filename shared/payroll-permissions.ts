export const PAYROLL_ACTION_PERMS = [
  {
    module: "payroll",
    action: "manage",
    label: "Manage Payroll",
    description: "Can edit pay rates, schedules, and recurring items, and create, rebuild, or finalize payroll runs. Also requires Payroll module access.",
  },
  {
    module: "payroll",
    action: "approve_overtime",
    label: "Review Overtime Claims",
    description: "Can review, adjust, or reject employee overtime claims without access to pay rates or payroll runs.",
  },
] as const;

export const PAYROLL_PERMISSION_DEFINITIONS = [
  {
    module: "payroll",
    action: "view",
    description: "Payroll: view employee pay profiles, schedules, payroll runs, and payslips",
  },
  ...PAYROLL_ACTION_PERMS.map(({ module, action, description }) => ({ module, action, description })),
];
