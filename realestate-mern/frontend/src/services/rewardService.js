import api from '../utils/axios';


// Get logged-in user's wallet
export const getWallet = async () => {
  const response = await api.get("/rewards/wallet");
  return response.data.wallet;
};

// Get logged-in user's reward transactions
export const getTransactions = async (page = 1, limit = 20) => {
  const response = await api.get(
    `/rewards/transactions?page=${page}&limit=${limit}`
  );

  return {
    transactions: response.data.transactions,
    page: response.data.page,
    pages: response.data.pages,
    total: response.data.total,
  };
};

// Get wallet and transactions together
export const getWalletData = async (page = 1, limit = 20) => {
  const [wallet, transactionData] = await Promise.all([
    getWallet(),
    getTransactions(page, limit),
  ]);

  return {
    wallet,
    ...transactionData,
  };
};