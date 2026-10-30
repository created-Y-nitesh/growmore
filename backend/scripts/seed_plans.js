const pool = require('../db');

const OFFICIAL_PLANS = [
  {
    plan_code: 'basic',
    name: 'Basic Plan',
    tagline: 'Accessible entry point designed for initial portfolio growth',
    description: 'Basic Membership Plan. Deposit range from ₹1,000 to ₹20,000 with 10% return.',
    minimum_amount: 1000.00,
    duration_days: 30,
    return_rate_percentage: 10.00,
    currency: 'INR',
    is_active: true,
    perks: [
      'Low minimum entry at ₹1,000',
      'Instant real-time portfolio analytics',
      'Automated wallet settlement upon maturity',
      '24/7 priority customer support'
    ],
    terms: [
      'Holding term: 30 calendar days lock-in cycle',
      'Fixed yield: 10% net monthly return upon cycle completion',
      'Instant reinvestment or payout to verified bank account',
      'Zero maintenance or platform management fees'
    ]
  },
  {
    plan_code: 'vip1',
    name: 'VIP Member',
    tagline: 'VIP Exclusive Membership with 12% to 15% return',
    description: 'VIP Exclusive Membership. Deposit range from ₹20,000 to ₹1,00,000. Offers 12% to 15% return (12% baseline). Completing this qualifies you to become a Daily Earning Plan 1 member.',
    minimum_amount: 20000.00,
    duration_days: 90,
    return_rate_percentage: 12.00,
    currency: 'INR',
    is_active: true,
    perks: [
      '₹20,000 – ₹1,00,000 Deposit Range',
      '12% – 15% Return Rate (12% Baseline)',
      'Pre-qualifies for Daily Earning Plan 1',
      'Priority bank payout settlement queue'
    ],
    terms: [
      'Holding term: 90 calendar days lock-in cycle',
      'Calculated return: 12% to 15%',
      'Pre-qualifies for Daily Earning Plan 1',
      'Direct credit of principal & profits to Withdraw Wallet'
    ]
  },
  {
    plan_code: 'daily_plan_1',
    name: 'Daily Earning Plan 1',
    tagline: 'Official Daily Earning Plan 1 for deposits from ₹5,000 to ₹1,50,000',
    description: 'Official Daily Earning Plan 1 for deposits from ₹5,000 to ₹1,50,000. Offers 18% to 21% return (18% baseline). Includes ₹99 Daily Earning Bonus credited automatically every night after 12:00 AM.',
    minimum_amount: 5000.00,
    duration_days: 180,
    return_rate_percentage: 18.00,
    currency: 'INR',
    is_active: true,
    perks: [
      '₹5,000 – ₹1,50,000 Deposit Range',
      '18% – 21% Return Rate (18% Baseline)',
      '₹99 Daily Bonus Earning (After 12 AM)',
      '₹1,000 Bonus Withdrawal Threshold'
    ],
    terms: [
      'Holding term: 180 calendar days cycle',
      'Return rate: 18% – 21% baseline',
      'Automatic midnight bonus credit',
      'Full liquidity upon maturity'
    ]
  },
  {
    plan_code: 'daily_super',
    name: 'Daily Earning Super Plan',
    tagline: 'Daily Earning Super Plan for deposits of ₹10,000+ (No Limit)',
    description: 'Daily Earning Super Plan for deposits of ₹10,000+ (No Limit). Shows 20% to 25% return (20% baseline). Includes ₹300 Daily Earning Bonus credited every night after 12:00 AM. Minimum withdrawal threshold is ₹3,000.',
    minimum_amount: 10000.00,
    duration_days: 365,
    return_rate_percentage: 20.00,
    currency: 'INR',
    is_active: true,
    perks: [
      '₹10,000+ Deposit (No Limit)',
      '20% – 25% Return Rate (20% Baseline)',
      '₹300 Daily Bonus Earning (After 12 AM)',
      '₹3,000 Bonus Withdrawal Threshold'
    ],
    terms: [
      'Holding term: 365 calendar days annual cycle',
      'Return rate: 20% – 25% baseline',
      'Automatic midnight bonus credit',
      'Executive priority settlements'
    ]
  }
];

async function seedPlans() {
  const client = await pool.connect();
  try {
    console.log('[Seed] Synchronizing official investment plans...');
    await client.query('BEGIN');

    // Deactivate previous unconfigured duplicates and legacy plans
    await client.query(`
      UPDATE investment_plans 
      SET is_active = FALSE 
      WHERE plan_code IS NULL OR plan_code IN ('starter', 'silver', 'gold') OR plan_code NOT IN ('basic', 'vip1', 'daily_plan_1', 'daily_super');
    `);

    for (const plan of OFFICIAL_PLANS) {
      // Check if plan with this plan_code exists
      const existing = await client.query(
        'SELECT id FROM investment_plans WHERE plan_code = $1 LIMIT 1;',
        [plan.plan_code]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE investment_plans 
           SET name = $1, tagline = $2, description = $3, minimum_amount = $4,
               duration_days = $5, return_rate_percentage = $6, currency = $7,
               is_active = $8, perks = $9, terms = $10, updated_at = NOW()
           WHERE plan_code = $11;`,
          [
            plan.name,
            plan.tagline,
            plan.description,
            plan.minimum_amount,
            plan.duration_days,
            plan.return_rate_percentage,
            plan.currency,
            plan.is_active,
            JSON.stringify(plan.perks),
            JSON.stringify(plan.terms),
            plan.plan_code
          ]
        );
        console.log(`[Seed] Updated plan: ${plan.name} (${plan.plan_code})`);
      } else {
        await client.query(
          `INSERT INTO investment_plans 
           (plan_code, name, tagline, description, minimum_amount, duration_days, return_rate_percentage, currency, is_active, perks, terms)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11);`,
          [
            plan.plan_code,
            plan.name,
            plan.tagline,
            plan.description,
            plan.minimum_amount,
            plan.duration_days,
            plan.return_rate_percentage,
            plan.currency,
            plan.is_active,
            JSON.stringify(plan.perks),
            JSON.stringify(plan.terms)
          ]
        );
        console.log(`[Seed] Inserted new plan: ${plan.name} (${plan.plan_code})`);
      }
    }

    await client.query('COMMIT');
    console.log('[Seed] Investment plans synchronized successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Seed] Plan synchronization failed:', err.message);
  } finally {
    client.release();
    if (require.main === module) {
      await pool.end();
    }
  }
}

if (require.main === module) {
  seedPlans();
}

module.exports = seedPlans;
