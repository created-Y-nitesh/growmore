export const COMPANY_INFO = {
  name: 'GrowMore',
  location: 'DIFC, Dubai, UAE & Bengaluru, India',
  supportEmail: 'support@growmore.app',
  supportPhone: '1800-200-GROWMORE',
  operationalStatus: 'Live Production Platform'
};

export const INVESTMENT_PLANS = [
  {
    id: 'starter',
    name: 'Starter Plan',
    tagline: 'Accessible entry point designed for initial portfolio growth',
    minAmount: 1000,
    termLabel: '30 Days Fixed Term',
    durationDays: 30,
    rate: 10,
    sampleReturn: 100,
    sampleTotal: 1100,
    badge: 'Beginner Tier',
    featured: false,
    summary: 'A 30-day locked growth period with an accessible minimum capital entry of ₹1,000.',
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
    id: 'silver',
    name: 'Silver Plan',
    tagline: 'Balanced allocation model for intermediate portfolio diversification',
    minAmount: 5000,
    termLabel: '90 Days Fixed Term',
    durationDays: 90,
    rate: 10,
    sampleReturn: 1500,
    sampleTotal: 6500,
    badge: 'Popular Tier',
    featured: true,
    summary: 'A 90-day structured allocation model designed for intermediate capital growth starting at ₹5,000.',
    perks: [
      'Optimal capital allocation at ₹5,000 minimum',
      'Advanced yield analytics & distribution charts',
      'Priority bank payout settlement queue',
      'Direct WhatsApp & phone relationship desk'
    ],
    terms: [
      'Holding term: 90 calendar days lock-in cycle',
      'Calculated simple return: 10% per 30-day period (30% total)',
      'Direct credit of principal & profits to Withdraw Wallet',
      'Protected under institutional capital allocation rules'
    ]
  },
  {
    id: 'gold',
    name: 'Gold Plan',
    tagline: 'High-yield tier for strategic long-range growth horizons',
    minAmount: 10000,
    termLabel: '365 Days Annual Term',
    durationDays: 365,
    rate: 10,
    sampleReturn: 12167,
    sampleTotal: 22167,
    badge: 'High Value Tier',
    featured: false,
    summary: 'A 365-day annual strategic holding period starting at ₹10,000 with maximum compounding benefits.',
    perks: [
      'High-tier growth starting from ₹10,000',
      'Full institutional visual analytics & reports',
      'Instant same-day IMPS/NEFT bank withdrawals',
      'Dedicated personal account relationship manager'
    ],
    terms: [
      'Holding term: 365 calendar days annual cycle',
      'Annual simple yield: proportional 120% per annum',
      'Full liquidity freedom upon maturity date',
      'VIP access to newly released growth tiers'
    ]
  }
];

export const RULES_AND_DISCLOSURES = {
  readBefore: {
    title: 'A. Read Before Participating',
    content: 'Before participating in any financial plan on GrowMore, all investors must carefully examine the plan terms, minimum allocation requirements (Starter: ₹1,000; Silver: ₹5,000; Gold: ₹10,000), holding durations, eligibility criteria, and withdrawal conditions. Capital allocations must be made based on your financial risk tolerance.'
  },
  operatingFlow: {
    title: 'B. The Operating Flow',
    steps: [
      {
        num: '01',
        title: 'Account Registration & KYC',
        desc: 'Sign up with your mobile number, verify OTP, and link your PAN/Aadhaar credentials for secure regulatory compliance.'
      },
      {
        num: '02',
        title: 'Instant Wallet Deposit',
        desc: 'Deposit funds seamlessly into your Top Up Wallet via UPI, Net Banking, or Debit Card with zero transaction surcharge.'
      },
      {
        num: '03',
        title: 'Plan Selection & Allocation',
        desc: 'Select your preferred tier (Starter, Silver, or Gold) and activate it with a single click using your available wallet balance.'
      },
      {
        num: '04',
        title: 'Real-Time Portfolio Tracking',
        desc: 'Track daily accrued returns, maturity timelines, and transaction audit trails directly on your personal investor console.'
      },
      {
        num: '05',
        title: 'Instant Payout & Withdrawal',
        desc: 'Upon term maturity, all principal and earned returns transfer to your Withdraw Wallet, ready for immediate withdrawal to your linked bank account.'
      }
    ]
  },
  riskDisclosure: {
    title: 'C. Market Risk & Security Framework',
    content: 'Financial growth plans involve market dynamics and capital commitments. GrowMore operates under strict treasury protocols, multi-signature cold custody, and automated risk limits to protect principal balances. All users are advised to review plan specifications and invest responsibly.'
  },
  walletSeparation: {
    title: 'D. Dual Wallet Architecture',
    content: 'GrowMore maintains strict operational separation between your Top Up Wallet (funds allocated for plan investments) and your Withdraw Wallet (unlocked capital, referral earnings, and matured returns). This prevents accidental re-commitments and ensures rapid, unhindered payouts.'
  },
  platformStandards: [
    {
      num: '1',
      title: 'Zero Hidden Fees',
      desc: 'GrowMore operates with complete financial transparency. 0% deposit fee, 0% plan management fee, and transparent banking settlement charges only.'
    },
    {
      num: '2',
      title: 'Fixed Transparent Terms',
      desc: 'All tier parameters—holding durations, minimum entries, and expected payout yields—are locked upon plan activation with zero surprise adjustments.'
    },
    {
      num: '3',
      title: 'Automated Banking Settlement',
      desc: 'Integrated with leading banking payout rails (IMPS, NEFT, RTGS, and UPI) for automated, instant transfer directly into verified accounts.'
    },
    {
      num: '4',
      title: 'Bank-Grade Cryptography',
      desc: 'Protected with 256-bit SSL encryption, HMAC transaction signing, and multi-factor biometric authentication on mobile.'
    },
    {
      num: '5',
      title: 'Direct 1-Level Referral System',
      desc: 'Flat 5% instant cash reward on all direct referred investor deposits. Strictly anti-pyramid, clean single-tier growth model.'
    },
    {
      num: '6',
      title: 'Dedicated Investor Helpdesk',
      desc: 'Full-time support via WhatsApp, toll-free phone, and direct ticketing with sub-2-hour resolution times.'
    }
  ],
  referralPolicy: {
    title: 'F. Direct 1-Level Referral Policy',
    content: 'GrowMore operates an exclusive, direct 1-level referral architecture. Whenever a friend joins via your invite link and makes a capital deposit, you receive flat 5% instant cash credited directly to your Withdraw Wallet. Multi-tier pyramid schemes are strictly prohibited.'
  },
  disclaimer: {
    title: 'G. Regulatory Disclosure',
    content: 'All financial activities carry inherent market risks. Past performance and illustrative model rates are calculated based on fixed product specifications. Investors should ensure full understanding of lock-in periods before committing capital.'
  }
};

export const FAQ_ITEMS = [
  {
    question: 'What is GrowMore?',
    answer: 'GrowMore is an advanced digital asset and wealth acceleration platform designed to provide transparent, high-yield fixed investment tiers, real-time analytics, and instant banking withdrawals.'
  },
  {
    question: 'How are returns calculated on GrowMore?',
    answer: 'Plans offer fixed transparent yields based on holding duration: Starter (10% over 30 days), Silver (10% per 30-day cycle over 90 days = 30%), and Gold (120% per annum over 365 days). All returns are credited automatically upon cycle completion.'
  },
  {
    question: 'How do I deposit funds into my GrowMore wallet?',
    answer: 'Log in to your investor console, head to the Top Up Wallet tab, enter your desired deposit amount (minimum ₹500), and complete the payment using UPI, Net Banking, or Debit Card.'
  },
  {
    question: 'What is the difference between Top Up Wallet and Withdraw Wallet?',
    answer: 'The Top Up Wallet holds funds deposited for activating investment plans. The Withdraw Wallet holds your unlocked matured returns, principal payouts, and 5% referral commissions that can be withdrawn to your bank account anytime.'
  },
  {
    question: 'How does the 5% Referral Program work?',
    answer: 'Share your unique invite code or link via WhatsApp, Telegram, or SMS. When an invited investor completes a deposit, flat 5% of their deposit amount is credited instantly to your Withdraw Wallet, fully available for immediate withdrawal.'
  },
  {
    question: 'Where is GrowMore located and how do I contact support?',
    answer: 'GrowMore maintains operations in DIFC, Dubai, UAE and Bengaluru, India. You can reach our 24/7 investor helpdesk via WhatsApp, toll-free at 1800-200-GROWMORE, or email at support@growmore.app.'
  }
];

export const SAMPLE_DASHBOARD_DATA = {
  user: {
    name: 'Arjun Sharma',
    email: 'arjun.sharma@growmore.app',
    avatar: 'AS',
    phone: '+91 98765 43210',
    kycStatus: 'Verified (Level 2)',
    joinDate: '12 Jan 2026',
    referralCode: 'GM-ALEX9824'
  },
  wallets: {
    topUpWallet: 5000,
    withdrawWallet: 3400,
    totalPortfolio: 28400,
    totalInvested: 20000,
    illustrativeEarnings: 2000,
    currency: 'INR'
  },
  activePlans: [
    {
      id: 'AP-101',
      name: 'Starter Plan',
      invested: 1000,
      startDate: '01 Oct 2026',
      maturityDate: '31 Oct 2026',
      durationDays: 30,
      illustrativeGain: 100,
      status: 'Active'
    },
    {
      id: 'AP-102',
      name: 'Silver Plan',
      invested: 5000,
      startDate: '15 Sep 2026',
      maturityDate: '14 Dec 2026',
      durationDays: 90,
      illustrativeGain: 500,
      status: 'Active'
    },
    {
      id: 'AP-103',
      name: 'Gold Plan',
      invested: 14000,
      startDate: '01 Aug 2026',
      maturityDate: '01 Aug 2027',
      durationDays: 365,
      illustrativeGain: 1400,
      status: 'Active'
    }
  ],
  transactions: [
    {
      id: 'TXN-984210',
      type: 'Top Up Deposit',
      wallet: 'Top Up Wallet',
      amount: 5000,
      method: 'UPI Instant Gateway (Ref: UPI-7821940)',
      date: '20 Oct 2026, 02:45 PM',
      status: 'Completed'
    },
    {
      id: 'TXN-983119',
      type: 'Plan Allocation',
      wallet: 'Top Up Wallet',
      amount: 5000,
      method: 'Allocated to Silver Plan',
      date: '15 Sep 2026, 11:20 AM',
      status: 'Completed'
    },
    {
      id: 'TXN-982054',
      type: 'Yield Maturity Credit',
      wallet: 'Withdraw Wallet',
      amount: 500,
      method: '30-Day Cycle Profit Payout',
      date: '15 Oct 2026, 09:00 AM',
      status: 'Completed'
    },
    {
      id: 'TXN-981102',
      type: 'Withdrawal Payout',
      wallet: 'Withdraw Wallet',
      amount: 1000,
      method: 'Bank IMPS Payout (HDFC Bank •••• 4091)',
      date: '22 Oct 2026, 04:15 PM',
      status: 'Completed'
    }
  ]
};
