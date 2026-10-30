const walletService = require('../services/walletService');

// GET /api/wallet - Get user available balance and portfolio breakdown
const getWallet = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const summary = await walletService.getUserWalletSummary(userId);

    return res.status(200).json({
      success: true,
      wallet: summary
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/wallet/ledger - Get paginated immutable ledger entries
const getLedger = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await walletService.getPaginatedLedger(userId, req.query);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/transactions - Get user transaction history
const getTransactions = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const result = await walletService.getPaginatedTransactions(userId, req.query);

    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getWallet,
  getLedger,
  getTransactions
};
