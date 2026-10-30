const pool = require('../db');

// GET /api/plans - Retrieve all active investment plans from PostgreSQL
const getAllPlans = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        id, 
        plan_code, 
        name, 
        tagline, 
        description, 
        minimum_amount, 
        duration_days, 
        return_rate_percentage, 
        currency, 
        terms, 
        perks, 
        created_at
      FROM investment_plans
      WHERE is_active = TRUE
      ORDER BY minimum_amount ASC;
    `;

    const result = await pool.query(query);

    // Formatted plans array with parsed numeric values for API clarity
    const plans = result.rows.map(row => ({
      id: Number(row.id),
      planCode: row.plan_code || `plan-${row.id}`,
      name: row.name,
      tagline: row.tagline || '',
      description: row.description || '',
      minimumAmount: parseFloat(row.minimum_amount),
      durationDays: Number(row.duration_days),
      returnRatePercentage: parseFloat(row.return_rate_percentage || 0),
      currency: row.currency || 'INR',
      terms: Array.isArray(row.terms) ? row.terms : [],
      perks: Array.isArray(row.perks) ? row.perks : [],
      createdAt: row.created_at
    }));

    return res.status(200).json({
      success: true,
      count: plans.length,
      plans
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/plans/:id - Retrieve a specific active investment plan by ID
const getPlanById = async (req, res, next) => {
  try {
    const planId = req.params.id;

    const query = `
      SELECT 
        id, 
        plan_code, 
        name, 
        tagline, 
        description, 
        minimum_amount, 
        duration_days, 
        return_rate_percentage, 
        currency, 
        terms, 
        perks, 
        created_at
      FROM investment_plans
      WHERE id = $1 AND is_active = TRUE;
    `;

    const result = await pool.query(query, [planId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Investment plan with ID ${planId} was not found or is inactive.`
      });
    }

    const row = result.rows[0];
    const plan = {
      id: Number(row.id),
      planCode: row.plan_code || `plan-${row.id}`,
      name: row.name,
      tagline: row.tagline || '',
      description: row.description || '',
      minimumAmount: parseFloat(row.minimum_amount),
      durationDays: Number(row.duration_days),
      returnRatePercentage: parseFloat(row.return_rate_percentage || 0),
      currency: row.currency || 'INR',
      terms: Array.isArray(row.terms) ? row.terms : [],
      perks: Array.isArray(row.perks) ? row.perks : [],
      createdAt: row.created_at
    };

    return res.status(200).json({
      success: true,
      plan
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllPlans,
  getPlanById
};
