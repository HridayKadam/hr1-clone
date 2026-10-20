import { all, get, getSettings } from './db.js';
import { daysInMonth, monthBounds, eachDay, dow, weekOffSet, shiftFor, holidaySet } from './util.js';

const r2 = (n) => Math.round(n);

/** Indian new-regime income tax (FY 2025-26 slabs) incl. 87A rebate and 4% cess, on annual taxable income. */
export function annualTaxNewRegime(taxable) {
  if (taxable <= 1200000) return 0; // section 87A rebate
  const slabs = [[400000, 0], [800000, 0.05], [1200000, 0.1], [1600000, 0.15], [2000000, 0.2], [2400000, 0.25], [Infinity, 0.3]];
  let tax = 0; let prev = 0;
  for (const [limit, rate] of slabs) {
    if (taxable > prev) tax += (Math.min(taxable, limit) - prev) * rate;
    prev = limit;
  }
  // Marginal relief just above the rebate threshold: tax cannot exceed income above 12L.
  tax = Math.min(tax, taxable - 1200000);
  return tax * 1.04;
}

/** Monthly salary split for a structure, before attendance proration. */
export function breakup(structure, settings = getSettings()) {
  const monthly = (structure.ctc_annual || 0) / 12;
  const basicPct = structure.basic_pct ?? Number(settings.basic_pct);
  const hraPct = structure.hra_pct ?? Number(settings.hra_pct);
  const pfCap = Number(settings.pf_wage_cap);
  const esiLimit = Number(settings.esi_gross_limit);

  const basic = monthly * basicPct / 100;
  const employerPF = structure.pf_enabled ? 0.12 * Math.min(basic, pfCap) : 0;
  let gross = monthly - employerPF;
  let employerESI = 0;
  if (structure.esi_enabled && gross / 1.0325 <= esiLimit) { gross = gross / 1.0325; employerESI = gross * 0.0325; }
  const hra = Math.min(basic * hraPct / 100, Math.max(gross - basic, 0));
  const special = Math.max(gross - basic - hra, 0);
  return { monthly, basic, hra, special, gross, employerPF, employerESI, esiApplicable: employerESI > 0 };
}

/** Days counted as loss-of-pay for an employee in a month: approved unpaid leave (+ optionally unmarked absent days). */
export function lopDays(employeeId, month, settings = getSettings()) {
  const [from, to] = monthBounds(month);
  let lop = 0;
  const unpaid = all(`SELECT lr.from_date, lr.to_date, lr.half_day FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ? AND lr.status = 'approved' AND lt.paid = 0 AND lr.to_date >= ? AND lr.from_date <= ?`, employeeId, from, to);
  const offs = weekOffSet(shiftFor(employeeId));
  const hol = holidaySet(from, to);
  const leaveDates = new Set();
  for (const l of unpaid) {
    if (l.half_day) { lop += 0.5; leaveDates.add(l.from_date); continue; }
    for (const d of eachDay(l.from_date > from ? l.from_date : from, l.to_date < to ? l.to_date : to)) {
      if (!offs.has(dow(d)) && !hol.has(d)) { lop += 1; leaveDates.add(d); }
    }
  }
  if (settings.lop_from_attendance === '1') {
    const emp = get('SELECT doj, exit_date FROM employees WHERE id = ?', employeeId);
    const present = new Set(all('SELECT date FROM attendance WHERE employee_id = ? AND date BETWEEN ? AND ? AND check_in IS NOT NULL', employeeId, from, to).map((r) => r.date));
    const anyLeave = all(`SELECT from_date, to_date FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND to_date >= ? AND from_date <= ?`, employeeId, from, to);
    const onLeave = (d) => anyLeave.some((l) => d >= l.from_date && d <= l.to_date);
    for (const d of eachDay(from, to)) {
      if (emp?.doj && d < emp.doj) continue;
      if (emp?.exit_date && d > emp.exit_date) continue;
      if (offs.has(dow(d)) || hol.has(d) || present.has(d) || onLeave(d) || leaveDates.has(d)) continue;
      lop += 1;
    }
  }
  return lop;
}

/**
 * Compute a payslip for one employee/month.
 * adjustments: { bonus, other_earning_label, other_deduction, other_deduction_label, lop_override }
 */
export function computePayslip(employee, month, adjustments = {}, settings = getSettings()) {
  const structure = get('SELECT * FROM salary_structures WHERE employee_id = ?', employee.id);
  if (!structure || !structure.ctc_annual) return null;
  const b = breakup(structure, settings);
  const [from, to] = monthBounds(month);
  const totalDays = daysInMonth(month);

  // Employees joining/leaving mid-month are paid only for days on the rolls.
  let rollDays = totalDays;
  if (employee.doj && employee.doj > from) rollDays -= Math.max(0, Math.min(totalDays, Number(employee.doj.slice(8, 10)) - 1));
  if (employee.exit_date && employee.exit_date < to && employee.exit_date >= from) rollDays -= totalDays - Number(employee.exit_date.slice(8, 10));

  const lop = adjustments.lop_override != null && adjustments.lop_override !== '' ? Number(adjustments.lop_override) : lopDays(employee.id, month, settings);
  const paidDays = Math.max(0, rollDays - lop);
  const f = paidDays / totalDays;

  const basic = b.basic * f; const hra = b.hra * f; const special = b.special * f;
  const gross = basic + hra + special;
  const pfCap = Number(settings.pf_wage_cap);
  const pf = structure.pf_enabled ? 0.12 * Math.min(basic, pfCap) : 0;
  const esi = b.esiApplicable ? gross * 0.0075 : 0;
  const isFeb = month.endsWith('-02');
  const ptBase = Number(settings.pt_amount);
  const pt = structure.pt_enabled && gross >= 15000 ? (isFeb && ptBase === 200 ? 300 : ptBase) : 0;
  const tds = structure.tds_enabled ? annualTaxNewRegime(Math.max(0, b.gross * 12 - 75000)) / 12 : 0;

  const reimb = get(`SELECT COALESCE(SUM(amount),0) n FROM expenses WHERE employee_id = ? AND status = 'approved' AND paid_run_id IS NULL AND date <= ?`, employee.id, to).n;
  const loans = all(`SELECT id, emi, balance FROM loans WHERE employee_id = ? AND status = 'approved' AND balance > 0`, employee.id);
  const loanEmi = loans.reduce((s, l) => s + Math.min(l.emi, l.balance), 0);

  const bonus = Number(adjustments.bonus || 0);
  const otherDed = Number(adjustments.other_deduction || 0);

  const earnings = [
    ['Basic', r2(basic)], ['HRA', r2(hra)], ['Special Allowance', r2(special)],
  ];
  if (bonus) earnings.push([adjustments.other_earning_label || 'Bonus', r2(bonus)]);
  if (reimb) earnings.push(['Reimbursements', r2(reimb)]);
  const deductions = [];
  if (pf) deductions.push(['Provident Fund', r2(pf)]);
  if (esi) deductions.push(['ESI', r2(esi)]);
  if (pt) deductions.push(['Professional Tax', r2(pt)]);
  if (tds) deductions.push(['Income Tax (TDS)', r2(tds)]);
  if (loanEmi) deductions.push(['Loan / Advance EMI', r2(loanEmi)]);
  if (otherDed) deductions.push([adjustments.other_deduction_label || 'Other Deduction', r2(otherDed)]);
  const employer = [];
  if (pf) employer.push(['Employer PF', r2(pf)]);
  if (b.esiApplicable) employer.push(['Employer ESI', r2(gross * 0.0325)]);

  const grossTotal = earnings.reduce((s, [, v]) => s + v, 0);
  const totalDed = deductions.reduce((s, [, v]) => s + v, 0);
  return {
    employee_id: employee.id, working_days: totalDays, paid_days: paidDays, lop_days: lop,
    earnings, deductions, employer, adjustments,
    gross: grossTotal, total_deductions: totalDed, net: grossTotal - totalDed,
  };
}
