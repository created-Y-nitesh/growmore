# GrowMore — Complete Responsive Fintech Website

> A modern, multi-page financial-services website and portfolio dashboard built with **React**, **Vite**, and high-performance CSS. Featuring a premium dark navy, purple, white, and subtle cyan theme, interactive investment calculator, plan detail flow, dedicated **Rules & Disclosure** architecture, dual-wallet management (Top Up Wallet vs Withdraw Wallet), one-level referral ecosystem, and PWA / Android companion app readiness.

---

## 🌟 Implemented Pages and Core Features

### 1. Homepage (`/`)
- **Brand & Theme**: Deep navy blue (`#050814`) and purple (`#0f1738`) backdrop with glowing cyan (`#06b6d4`, `#22d3ee`) and purple (`#8b5cf6`, `#a855f7`) accents. Indian Rupee symbol (`₹`) formatted according to Indian numbering standards.
- **Header & Navigation**: Sticky blur navigation linking to Home, Features, Investment Plans, Calculator, How It Works, Rules & Disclosure, Download App, and Contact.
- **Hero Section**: Headline *"Grow Your Future with GrowMore"*, platform concept description, call-to-actions (*Explore Plans*, *Download App*), trust highlights, and an interactive **Mobile Dashboard Mockup** with real-time SVG sparkline charts.
- **Feature Highlights**: Simple navigation, account management, and real-time transaction ledger.
- **Curated Investment Plans**: Starter (min ₹1,000), Silver (min ₹5,000), Gold (min ₹10,000) cards displaying sample holding terms and the 10% illustrative assumption.
- **Working Investment Calculator**: Interactive Rupee calculation tool with duration selector (7, 30, 90, 365 days).
- **How It Works (3 Steps)**: 01 Create Account, 02 Explore Plans, 03 Track Your Activity.
- **One-Level Referral Section**: Direct single-tier invite architecture with demo invite code (`GM-ARJUN88`), one-click copy, and zero MLM policy.
- **Download Our App Section**: Official APK download trigger and styled QR-code placeholder.
- **Interactive FAQ Accordion**: Expandable answers addressing platform rules, calculations, and mobile availability.
- **Support & Contact Section**: Help desk coordinates with Dubai proposed location notice and interactive test message form.
- **Footer**: Corporate location statement, support email, social placeholders, and navigation to all legal documentation.

### 2. Dedicated "Rules & Disclosure" Page (`currentView: 'rules'`)
Inspired by rigorous compliance frameworks with clear numbered cards:
- **Section A: Read Before Participating**: Mandatory review of plan descriptions, minimum entries, applicable fees, holding durations, eligibility criteria, systemic risks, and withdrawal rules.
- **Section B: The Operating Flow**: 5-step operational lifecycle:
  1. *Account Setup & Verification* (identity and KYC verification)
  2. *Wallet Top-Up Verification* (bank webhook reconciliation; reference alone does not prove receipt)
  3. *Plan Selection & Allocation* (transparent calculation assumptions and terms)
  4. *Income & Results Tracking* (no fabricated background mining or guaranteed earnings)
  5. *Payout & Withdrawal Request* (verified balances, compliance, and supported payment rails)
- **Section C: Risk Disclosure & No-Mining Notice**: Market volatility, potential loss of capital, and clear notice that GrowMore does not operate cloud mining hardware or ASIC facilities.
- **Section D: Dual Wallet Separation Architecture**: Structural separation between **Top Up Wallet** (dedicated to plan subscriptions) and **Withdraw Wallet** (matured liquid returns eligible for settlement).
- **Section E: Platform Standards (8 Core Principles)**:
  1. *No Fabricated Activity* (no artificial user counts, fake deposits, or invented reviews)
  2. *No Guaranteed-Return Wording* (illustrations are never advertised as guaranteed income)
  3. *Transparent Plan Terms* (all parameters disclosed upfront)
  4. *Secure Payment Verification* (multi-node banking confirmation)
  5. *Strict Account Security* (cryptographic standards)
  6. *Fair Withdrawal Processing* (transparent limits and processing windows)
  7. *Accurate & Auditable Records* (double-entry ledger standards)
  8. *Accessible Support & Dispute Redressal* (direct compliance communication)
- **Section F: Referral Policy**: Single-tier 1-level referral policy with zero multi-level pyramid incentives.
- **Section G: Important Disclaimer**: Frontend demonstration declaration.

### 3. Dedicated Plan Detail Page (`currentView: 'plan-detail'`)
- Detailed breakdown of selected plan (Starter, Silver, or Gold).
- Minimum allocation amount, holding term, and sample 10% calculation.
- Applicable plan conditions and risk disclosure callout.
- "Continue to Plan Allocation (Demo)" button triggering an interactive confirmation modal that simulates plan activation and transitions to the dashboard.

### 4. Separate Dashboard View (`currentView: 'dashboard'`)
- **Dual Wallet Overview**:
  - **Top Up Wallet**: ₹5,000 (funds deposited for plan subscriptions).
  - **Withdraw Wallet**: ₹3,400 (matured liquid returns eligible for settlement).
- **Top Up Wallet Flow**: Amount input, payment method placeholder (UPI, Net Banking, Card), payment reference field (e.g. UTR), "Submit Top Up Request (Demo)" button, and "Demo Pending" status indicator.
- **Withdraw Wallet Flow**: Amount input (up to available balance), saved payment method placeholder, settlement summary, and "Demo Pending" submission status.
- **Investment Plans Tab**: Interactive capital allocation from Top Up Wallet into active plans.
- **Transaction History**: Filterable ledger with categories (Top Up, Allocation, Payout, Withdrawal) and search input.
- **Referral Tab**: Demo code `GM-ARJUN88`, copy button, and level-1 metrics.
- **Rules & Disclosure Tab**: Embedded summary with direct link to the full page.
- **Help & Support Tab**: Demo support ticket submission.
- **Profile & Security**: Simulated user details (Arjun Sharma), KYC "Verified (Demo)" status, 2FA, and biometric toggles.
- **Mobile Bottom Navigation Bar**: Quick touch navigation across Overview, Top Up, Withdraw, Plans, and Ledger.

### 5. Legal & Informational Pages Hub (`currentView: 'legal'`)
Dedicated multi-tab legal center with readable styling:
- **About GrowMore**: Company vision and location disclosure.
- **Terms & Conditions**: Prototype rules, intellectual property, and user eligibility.
- **Privacy Policy**: Zero server-side transmission notice, client-side memory privacy, and no false certification claims.
- **Risk Disclosure**: In-depth market and liquidity risk disclosures.
- **Refund & Cancellation Policy**: Unallocated funds refund rules and plan lockup clauses.
- **FAQ Knowledge Hub**: Complete question-and-answer library.
- **Contact & Support**: Help desk coordinates with Dubai location notice and ticket submission form.

### 6. Company Location & Contact Information
- **Proposed Business Location**: Dubai, United Arab Emirates
- **Registered legal entity and office address**: To be confirmed upon formal licensing.
- Zero invented building numbers, street addresses, registration numbers, or licenses.

---

## 🧮 Working Investment Calculator

- **Minimum Amount**: ₹1,000 (validates and displays alert if entered amount < ₹1,000).
- **Default Amount**: ₹1,000.
- **Default Rate**: 10% single-term illustrative assumption.
- **Optional Duration Selector**: 7, 30, 90, and 365 days.
- **Mathematical Formula**:
  - `Illustrative Return = entered amount × 10 ÷ 100`
  - `Illustrative Total = entered amount + Illustrative Return`
  - *Example*: ₹1,000 → ₹100 illustrative return → ₹1,100 illustrative total.
- **Duration Independence**: The duration selector demonstrates the planned holding term and **does not** multiply or compound the 10% rate.
- **Mandatory Warning Displayed**:
  > *“Figures are illustrative and for demonstration only. They are not a promise or guarantee of earnings. Actual investment outcomes can differ and losses may occur. Review the relevant product terms and risks before making any financial decision.”*

---

## 📱 Android APK & PWA Integration

- **Target Path**: `/downloads/growmore.apk`
- **Smart Detection**: Clicking "Download Android App" sends a `HEAD` request to verify if `public/downloads/growmore.apk` exists.
- **Coming Soon Modal**: If the APK is absent, a friendly announcement modal appears with developer instructions. Zero fake APK files are created.
- **How to Link the Real APK**:
  1. Compile your production APK from `growmore_app` or CI/CD.
  2. Place the compiled binary at:
     ```text
     public/downloads/growmore.apk
     ```
  3. The website will automatically detect and serve the file when users click download.
- **PWA & Mobile Ready**: Includes `public/manifest.json` with theme color `#0a0f24`, standalone display mode, and iOS Safari viewport tags.

---

## 💻 Beginner-Friendly Windows Setup Instructions

### 1. Requirements
- Node.js v18 or higher (Node v24 is installed).
- PowerShell or Windows Command Prompt.

### 2. Launch the Development Server
Open PowerShell in `D:\Downloads\growmore`:
```powershell
cd D:\Downloads\growmore
npm run dev
```
Open your browser at:
```text
http://localhost:3000
```

### 3. Build for Production / Static Hosting
To create an optimized production build in `dist/`:
```powershell
npm run build
```
To preview the production build locally:
```powershell
npm run preview
```

---

## ⚠️ What Is Implemented vs What Requires a Backend

| Feature | Current Frontend State | Production Requirements |
| :--- | :--- | :--- |
| **Authentication** | In-memory demo with email/password validation and show/hide toggle | JWT/OAuth2 backend, encrypted password hashing (bcrypt), SMS/Email OTP |
| **Top Up Wallet** | Client-side state simulation with "Demo Pending" status | Payment gateway integration (Razorpay/Stripe/UPI), bank webhook reconciliation |
| **Withdraw Wallet** | Client-side state with balance checks and mock IMPS payout | Banking API (IMPS/NEFT), AML compliance screening, ledger balance locks |
| **Investment Plans** | Interactive state management and allocation simulation | PostgreSQL relational schema, scheduled daily interest calculation crons |
| **Referrals** | Direct 1-level code copy (`GM-ARJUN88`) and mock metrics | Server-side attribution engine, fraud detection, qualification rules |
| **Android APK** | Smart detection with "Coming Soon" modal | Native Flutter compile to `public/downloads/growmore.apk` |

---

## 🚀 How to Publish on GitHub & Static Hosting

1. **Initialize Git Repository** (if not already initialized):
   ```powershell
   git init
   git add .
   git commit -m "feat: complete GrowMore responsive fintech website"
   ```
2. **Push to GitHub**:
   ```powershell
   git remote add origin https://github.com/YOUR_USERNAME/growmore.git
   git branch -M main
   git push -u origin main
   ```
3. **Deploy to Free Static Hosting (Vercel / Netlify / Cloudflare Pages / GitHub Pages)**:
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Framework Preset: `Vite`
