import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:growmore_app/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('GrowMore complete redesign functionality test', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const GrowMoreApp(initialHome: GrowMoreMainScreen()));
    await tester.pumpAndSettle();

    // 1. Requirement 1: Home Screen Header
    // - "Welcome Back! 👋" and user name "Alex Morgan"
    expect(find.text('Welcome Back! 👋'), findsOneWidget);
    expect(find.text('Alex Morgan'), findsWidgets);
    // - Notification bell & Gift icon & Compact Search icon
    expect(find.byIcon(Icons.notifications_none_rounded), findsOneWidget);
    expect(find.byIcon(Icons.card_giftcard_rounded), findsWidgets);
    expect(find.byIcon(Icons.search_rounded), findsWidgets);
    // - Separate tune/settings shortcut removed from header
    expect(find.byIcon(Icons.tune_rounded), findsNothing);

    // 2. Requirement 2: Dedicated Search Plans Screen
    await tester.tap(find.byTooltip('Search Plans'));
    await tester.pumpAndSettle();
    expect(find.text('Search Plans'), findsOneWidget);
    expect(find.text('Low Risk'), findsOneWidget);
    // Return to Home screen using back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    // 3. Requirement 3: Refer & Earn card replaces 2026 SIP Booster
    expect(find.text('2026 SIP Booster'), findsNothing);
    expect(find.text('Refer & Earn'), findsOneWidget);
    expect(find.text('Invite friends and earn rewards'), findsOneWidget);
    await tester.tap(find.text('Invite Now'));
    await tester.pumpAndSettle();
    expect(find.text('Invite Friends & Grow Together'), findsOneWidget);
    expect(find.text('GROWMORE2026'), findsOneWidget);

    // Verify Unique Personal Code & Referral Link
    expect(find.text('Your Unique Referral Code'), findsOneWidget);
    expect(find.text('UNIQUE'), findsOneWidget);
    expect(find.text('GM-ALEX9824'), findsOneWidget);
    expect(find.text('https://growmore.app/join/GM-ALEX9824'), findsOneWidget);

    // Verify WhatsApp, Message, and Copy Link Options
    expect(find.text('WhatsApp'), findsOneWidget);
    expect(find.text('Message'), findsOneWidget);
    expect(find.text('Copy Link'), findsWidgets);

    // Test WhatsApp button tap
    await tester.tap(find.text('WhatsApp'));
    await tester.pumpAndSettle();
    expect(find.textContaining('WhatsApp referral message & unique link copied!'), findsOneWidget);

    // Verify Cartoon Reward Journey & ₹5,000 Step
    expect(find.text('CARTOON REWARD JOURNEY'), findsOneWidget);
    expect(find.text('How You Earn ₹5,000 Real Cash! 🤑'), findsOneWidget);
    expect(find.text('You Get Flat 5% (₹5,000 Direct Cash!)'), findsOneWidget);
    expect(find.text('Cartoon 5% Reward Ladder 🎯'), findsOneWidget);

    // Scroll down to view Terms & Conditions and details
    await tester.drag(find.byType(ListView), const Offset(0, -600));
    await tester.pumpAndSettle();

    // Verify Terms & Conditions (5% Wallet Credit Policy)
    expect(find.text('Terms & Conditions (5% Referral Policy)'), findsOneWidget);
    expect(find.text('Flat 5% Commission on Deposit'), findsOneWidget);
    expect(find.text('Instant Credit to Wallet'), findsOneWidget);

    // Return using Back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    // 4. Requirement 4: Bottom Navigation – Five Items (Home, Plans, ₹, Withdraw, More)
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Plans'), findsWidgets);
    expect(find.text('₹'), findsWidgets);
    expect(find.text('Withdraw'), findsWidgets);
    expect(find.text('More'), findsOneWidget);

    // Test Center ₹ Button triggers Add Money screen
    await tester.tap(find.byType(RainbowGlowingRupeeButton));
    await tester.pumpAndSettle();
    expect(find.text('Add Money'), findsOneWidget);
    expect(find.text('Confirm Deposit'), findsOneWidget);
    // Back to dashboard
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();

    // 5. Test Tab 1: Plans
    await tester.tap(find.text('Plans').first);
    await tester.pumpAndSettle();
    expect(find.text('Membership Plans'), findsOneWidget);
    expect(find.text('Basic Plan'), findsWidgets);

    // 6. Test Tab 2: Withdraw
    await tester.tap(find.text('Withdraw').first);
    await tester.pumpAndSettle();
    expect(find.text('Withdraw Funds'), findsOneWidget);
    expect(find.text('Available to Withdraw'), findsOneWidget);
    expect(find.text('RETURNS ONLY'), findsOneWidget);
    expect(find.text('1 YEAR LOCK'), findsOneWidget);
    expect(find.textContaining('Locked Principal: ₹20,000.00'), findsOneWidget);
    expect(find.text('HDFC Bank Ltd •••• 4821'), findsOneWidget);
    expect(find.text('Submit Withdrawal Request'), findsOneWidget);

    // Verify 24 to 48 hours policy banner and compliance note
    expect(
        find.text(
            'Policy: Money will be debited and credited to your account within 24 to 48 hours.'),
        findsOneWidget);
    expect(find.text('Official Withdrawal Policy (24 to 48 Hours)'), findsOneWidget);

    // Verify numeric keyboard setup on withdrawal amount field
    final withdrawFieldFinder = find.byType(TextField);
    expect(withdrawFieldFinder, findsOneWidget);
    final TextField withdrawField = tester.widget<TextField>(withdrawFieldFinder);
    expect(withdrawField.keyboardType, const TextInputType.numberWithOptions(signed: false, decimal: false));

    // Verify minimum ₹500 validation (amounts below ₹500 cannot be entered/processed)
    await tester.enterText(withdrawFieldFinder, '200');
    await tester.pumpAndSettle();
    expect(
        find.text('Minimum withdrawal is ₹500. Lower amounts not allowed.'),
        findsOneWidget);

    // Attempting to submit < 500 is blocked
    await tester.tap(find.text('Submit Withdrawal Request'));
    await tester.pumpAndSettle();
    expect(
        find.text(
            'Minimum withdrawal amount is ₹500. Customized amounts lower than ₹500 cannot be processed.'),
        findsOneWidget);

    // Attempting to withdraw locked capital (e.g. 10000, exceeding available returns) is blocked
    await tester.enterText(withdrawFieldFinder, '10000');
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Exceeds withdrawable returns'),
        findsOneWidget);
    await tester.tap(find.text('Submit Withdrawal Request'));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Only earned returns (₹4,850.75) can be withdrawn'),
        findsOneWidget);

    // Entering valid amount (>= 500 and within available returns) clears error and succeeds
    await tester.enterText(withdrawFieldFinder, '500');
    await tester.pumpAndSettle();
    expect(
        find.text('Minimum withdrawal is ₹500. Lower amounts not allowed.'),
        findsNothing);
    await tester.tap(find.text('Submit Withdrawal Request'));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('As per policy, money will be debited and credited within 24 to 48 hours.'),
        findsOneWidget);

    // 7. Test Tab 3: More & Profile
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();
    expect(find.text('More & Profile'), findsOneWidget);
    expect(find.text('Alex Morgan'), findsWidgets);
    expect(find.text('+91 98765 43210'), findsOneWidget);

    // 8. Requirement 6: Five Investment Levels (5K, 10K, 25K, 50K, 1,00,000)
    expect(find.text('Level 1'), findsOneWidget);
    expect(find.text('Level 2'), findsOneWidget);
    expect(find.text('Level 3'), findsOneWidget);
    expect(find.text('Level 4'), findsOneWidget);
    expect(find.text('Level 5'), findsOneWidget);
    expect(find.text('₹5,000'), findsWidgets);
    expect(find.text('₹10,000'), findsWidgets);
    expect(find.text('₹25,000'), findsWidgets);
    expect(find.text('₹50,000'), findsWidgets);
    expect(find.text('₹1,00,000'), findsWidgets);

    // Tap Investment Levels section to open detailed Levels screen
    await tester.tap(find.text('Investment Levels').first);
    await tester.pumpAndSettle();
    expect(find.text('Defined Tier Thresholds (Cumulative)'), findsOneWidget);
    expect(find.text('Level 1: Starter'), findsOneWidget);
    expect(find.text('Level 4: Premier'), findsOneWidget);
    expect(find.text('Level 5: VIP Priority Crown'), findsOneWidget);
    // Return using Back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    // 9. Requirement 5: Profile Details Screen
    await tester.tap(find.text('+91 98765 43210'));
    await tester.pumpAndSettle();
    expect(find.text('Profile Details'), findsOneWidget);
    expect(find.text('Personal Information'), findsOneWidget);
    expect(find.text('Pending Verification'), findsOneWidget);
    expect(find.text('Save Changes'), findsOneWidget);
    // Return using Back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    // 10. Requirement 8 & 9: Retained menu items present, unwanted removed
    expect(find.text('SIP Booster Program'), findsNothing);
    expect(find.text('Currency Settings'), findsNothing);
    expect(find.text('Reset Demo State'), findsNothing);
    expect(find.text('Security & Biometrics'), findsOneWidget);
    expect(find.text('Change Password'), findsOneWidget);
    expect(find.text('Help & Support'), findsOneWidget);
    expect(find.text('About GrowMore'), findsOneWidget);
  });

  testWidgets('Center ₹ Floating Button Design and Responsive Layout Test', (WidgetTester tester) async {
    // Test on mobile viewport (360x800 typical Android)
    tester.view.physicalSize = const Size(360, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const GrowMoreApp(initialHome: GrowMoreMainScreen()));
    await tester.pumpAndSettle();

    // 1. Verify 5 Bottom Navigation items are present
    expect(find.text('Home'), findsOneWidget);
    expect(find.text('Plans'), findsWidgets);
    expect(find.byType(RainbowGlowingRupeeButton), findsOneWidget);
    expect(find.text('Withdraw'), findsWidgets);
    expect(find.text('More'), findsOneWidget);

    // 2. Verify white ₹ icon is rendered inside RainbowGlowingRupeeButton
    final rupeeFinder = find.descendant(
      of: find.byType(RainbowGlowingRupeeButton),
      matching: find.text('₹'),
    );
    expect(rupeeFinder, findsOneWidget);

    // 3. Verify CustomPaint for glowing rings and halo is present
    final customPaintFinder = find.descendant(
      of: find.byType(RainbowGlowingRupeeButton),
      matching: find.byType(CustomPaint),
    );
    expect(customPaintFinder, findsWidgets);

    // 4. Verify Center Button Tap triggers existing Add Money screen
    await tester.tap(find.byType(RainbowGlowingRupeeButton));
    await tester.pumpAndSettle();

    expect(find.text('Add Money'), findsOneWidget);

    // 5. Back navigation works smoothly
    await tester.tap(find.byType(BackButton));
    await tester.pumpAndSettle();
    expect(find.byType(RainbowGlowingRupeeButton), findsOneWidget);
  });

  testWidgets('Policy, FAQ, About Us, and Telegram Customer Support System Test', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const GrowMoreApp(initialHome: GrowMoreMainScreen()));
    await tester.pumpAndSettle();

    // 1. Navigate to More Tab
    await tester.tap(find.text('More'));
    await tester.pumpAndSettle();

    // Verify newly added Menu Items
    expect(find.text('Rules & Disclosure'), findsOneWidget);
    expect(find.text('Frequently Asked Questions (FAQ)'), findsOneWidget);
    expect(find.text('Help & Support'), findsOneWidget);
    expect(find.text('About GrowMore'), findsOneWidget);

    // 2. Test Rules & Disclosure Screen ("How it works")
    await tester.tap(find.text('Rules & Disclosure'));
    await tester.pumpAndSettle();

    // Verify Screenshot layout elements
    expect(find.text('RULES & DISCLOSURE'), findsOneWidget);
    expect(find.text('How it works'), findsOneWidget);
    expect(find.text('READ BEFORE ALLOCATING'), findsOneWidget);
    expect(find.text('Clear terms.\nVisible movements.'), findsOneWidget);
    expect(find.text('The operating flow'), findsOneWidget);
    expect(find.text('Top up your wallet'), findsOneWidget);
    expect(find.text('Activate a plan'), findsOneWidget);

    // Scroll down to reveal risk disclosure and platform standards in ListView
    await tester.drag(find.byType(ListView), const Offset(0, -700));
    await tester.pumpAndSettle();

    expect(find.text('Income matures daily'), findsOneWidget);
    expect(find.text('Request payout'), findsOneWidget);
    expect(find.text('Risk disclosure'), findsOneWidget);
    expect(find.text('Wallet separation'), findsOneWidget);
    expect(find.text('Platform standards'), findsOneWidget);
    expect(find.text('No fabricated activity'), findsOneWidget);
    expect(find.text('No guaranteed-return wording'), findsOneWidget);
    expect(find.text('One-level referrals'), findsOneWidget);

    // Return using back button
    await tester.tap(find.byIcon(Icons.arrow_back_ios_new_rounded));
    await tester.pumpAndSettle();

    // 3. Test Frequently Asked Questions (FAQ) Screen
    await tester.tap(find.text('Frequently Asked Questions (FAQ)'));
    await tester.pumpAndSettle();

    expect(find.text('Frequently Asked Questions'), findsOneWidget);
    expect(find.text('Search questions, policies, lock-in...'), findsOneWidget);
    expect(find.text('How does the 1-Year principal lock policy work?'), findsOneWidget);
    expect(find.text('What is the minimum withdrawal amount?'), findsOneWidget);
    expect(find.text('Why do withdrawals take 24 to 48 hours to credit?'), findsOneWidget);
    expect(find.text('How does the 5% referral bonus work and when is it credited?'), findsOneWidget);

    // Expand an FAQ
    await tester.tap(find.text('How does the 1-Year principal lock policy work?'));
    await tester.pumpAndSettle();
    expect(find.textContaining('all deposited principal is locked for 365 days (1 year)'), findsOneWidget);

    // Return using back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    // 4. Test Customer Support Screen (Telegram Support Desk)
    await tester.tap(find.text('Help & Support'));
    await tester.pumpAndSettle();

    expect(find.text('Customer Support Desk'), findsOneWidget);
    expect(find.text('@GrowMoreSupport'), findsWidgets);
    expect(find.text('Alex Morgan (GM-9824-IND)'), findsOneWidget);
    expect(find.text('● Live Support Bot Active'), findsOneWidget);
    expect(find.text('Send Ticket'), findsOneWidget);

    // Submit a customer support query in live in-app chat
    final queryField = find.byWidgetPredicate(
      (widget) => widget is TextField && widget.decoration?.hintText == 'Type your message or question...',
    );
    expect(queryField, findsOneWidget);
    await tester.enterText(queryField, 'I requested ₹500 withdrawal yesterday, please check status.');
    await tester.pumpAndSettle();

    // Tap Send Ticket (dispatches directly in-app without popup dialogs)
    await tester.tap(find.text('Send Ticket'));
    await tester.pumpAndSettle();

    // Verify message appears in conversation thread immediately
    expect(find.textContaining('I requested ₹500 withdrawal yesterday'), findsOneWidget);

    // Pump timer for live support bot reply
    await tester.pump(const Duration(milliseconds: 1500));
    await tester.pumpAndSettle();

    // Verify automated live support bot response
    expect(find.textContaining('credited within 24 to 48 hours'), findsOneWidget);

    // Return using back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    // 5. Test About GrowMore Screen
    await tester.tap(find.text('About GrowMore'));
    await tester.pumpAndSettle();

    expect(find.text('GrowMore Technologies'), findsOneWidget);
    expect(find.text('Version 2.4.0 (Build 2026.10)'), findsOneWidget);
    expect(find.text('Isolated Wallet Architecture'), findsOneWidget);
    expect(find.text('1-Year Capital Integrity'), findsOneWidget);
    expect(find.text('24–48h Secured Payouts'), findsOneWidget);
    expect(find.text('Flat 5% Direct Referral Reward'), findsOneWidget);
    expect(find.text('Telegram Official Desk'), findsOneWidget);

    // Return using back button
    await tester.tap(find.byIcon(Icons.arrow_back_rounded));
    await tester.pumpAndSettle();

    expect(find.text('More & Profile'), findsOneWidget);
  });

  testWidgets('GrowMore Splash, 4-Page Onboarding, and Auth flow test', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    // 1. Splash Screen
    await tester.pumpWidget(const GrowMoreApp(initialHome: SplashScreen()));
    await tester.pump();
    expect(find.byType(GrowMoreBrandLogo), findsOneWidget);
    expect(find.text('Smart Investing • Assured Returns'), findsOneWidget);

    // Advance timer past splash duration (2200ms)
    await tester.pump(const Duration(milliseconds: 2300));
    await tester.pumpAndSettle();

    // 2. Onboarding Page 1 (Grow your wealth, your way)
    expect(find.text('Grow your wealth, your way'), findsOneWidget);
    expect(find.text('Build better money habits with a plan that fits your goals.'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);
    expect(find.text('Next'), findsOneWidget);
    expect(find.byType(GrowingPlantIllustration), findsOneWidget);

    // Advance to Page 2 (Plans for your goals)
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Plans for your goals'), findsOneWidget);
    expect(find.text('Explore investment plans designed around different financial goals.'), findsOneWidget);
    expect(find.byType(FinancialGoalsIllustration), findsOneWidget);

    // Advance to Page 3 via horizontal swipe/drag
    await tester.drag(find.byType(PageView), const Offset(-500, 0));
    await tester.pumpAndSettle();
    expect(find.text('See your progress'), findsOneWidget);
    expect(find.text('Keep your investments organized and follow your financial journey in one place.'), findsOneWidget);
    expect(find.byType(PortfolioProgressIllustration), findsOneWidget);

    // Advance to Page 4 via Next button
    await tester.tap(find.text('Next'));
    await tester.pumpAndSettle();
    expect(find.text('Start with confidence'), findsOneWidget);
    expect(find.text('Take the first step toward building a more thoughtful financial future.'), findsOneWidget);
    expect(find.byType(StartConfidenceIllustration), findsOneWidget);

    // Button label on 4th slide must be "Get Started"
    expect(find.text('Get Started'), findsOneWidget);

    // Tap Get Started to complete onboarding and navigate to Auth Screen
    await tester.tap(find.text('Get Started'));
    await tester.pumpAndSettle();

    // 3. Login / Register Screen
    expect(find.text('Log In'), findsWidgets);
    expect(find.text('Create Account'), findsWidgets);
    expect(find.textContaining('Full Name'), findsOneWidget);
    expect(find.text('Date of Birth'), findsOneWidget);
    expect(find.text('Mobile Number'), findsOneWidget);

    // Verify persistence was saved
    final completed = await OnboardingService.isCompleted();
    expect(completed, isTrue);

    // Subsequent app launch with completed onboarding skips onboarding directly to LoginRegisterScreen
    await tester.pumpWidget(const GrowMoreApp(initialHome: SplashScreen()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 2300));
    await tester.pumpAndSettle();
    expect(find.text('Grow your wealth, your way'), findsNothing);
    expect(find.text('Log In'), findsWidgets);
  });

  testWidgets('GrowMore Onboarding Skip button completes onboarding immediately', (WidgetTester tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const GrowMoreApp(initialHome: OnboardingScreen()));
    await tester.pumpAndSettle();

    expect(find.text('Grow your wealth, your way'), findsOneWidget);
    expect(find.text('Skip'), findsOneWidget);

    // Tap Skip
    await tester.tap(find.text('Skip'));
    await tester.pumpAndSettle();

    // Verify we are on Auth Screen and onboarding is marked completed
    expect(find.text('Log In'), findsWidgets);
    final completed = await OnboardingService.isCompleted();
    expect(completed, isTrue);
  });

  testWidgets('GrowMore Full-Page Notifications Screen Test', (WidgetTester tester) async {
    tester.view.physicalSize = const Size(800, 1400);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(const GrowMoreApp(initialHome: GrowMoreMainScreen()));
    await tester.pumpAndSettle();

    // Verify Notification bell exists on dashboard header
    expect(find.byIcon(Icons.notifications_none_rounded), findsOneWidget);

    // Tap notification bell
    await tester.tap(find.byTooltip('Notifications'));
    await tester.pumpAndSettle();

    // 1. Verify Full-Page Notifications Screen Header
    expect(find.text('Notifications'), findsOneWidget);
    expect(find.byTooltip('Back to Dashboard'), findsOneWidget);
    expect(find.text('2 new'), findsOneWidget);
    expect(find.text('Mark all as read'), findsOneWidget);

    // 2. Verify all initial notifications are displayed
    expect(find.text('Portfolio Snapshot'), findsOneWidget);
    expect(find.text('Refer & Earn Launched'), findsOneWidget);
    expect(find.text('New ESG Curated Plan Added'), findsOneWidget);

    // 3. Verify Filter Chips
    expect(find.text('All (3)'), findsOneWidget);
    expect(find.text('Unread (2)'), findsOneWidget);

    // Tap Unread chip
    await tester.tap(find.text('Unread (2)'));
    await tester.pumpAndSettle();
    expect(find.text('Portfolio Snapshot'), findsOneWidget);
    expect(find.text('Refer & Earn Launched'), findsOneWidget);
    expect(find.text('New ESG Curated Plan Added'), findsNothing);

    // Return to All filter
    await tester.tap(find.text('All (3)'));
    await tester.pumpAndSettle();
    expect(find.text('New ESG Curated Plan Added'), findsOneWidget);

    // 4. Test Notification Card Click -> Opens Details
    await tester.tap(find.text('Portfolio Snapshot'));
    await tester.pumpAndSettle();
    expect(find.text('Weekly evaluation verified across live indices.'), findsOneWidget);
    expect(find.text('Dismiss'), findsOneWidget);

    // Dismiss dialog
    await tester.tap(find.text('Dismiss'));
    await tester.pumpAndSettle();

    // 5. Test "Mark all as read"
    await tester.tap(find.text('Mark all as read'));
    await tester.pumpAndSettle();
    expect(find.text('All notifications marked as read'), findsOneWidget);
    expect(find.text('2 new'), findsNothing);

    // 6. Test Back button to return to Dashboard
    await tester.tap(find.byTooltip('Back to Dashboard'));
    await tester.pumpAndSettle();

    // Verify dashboard is visible
    expect(find.text('Welcome Back! 👋'), findsOneWidget);
  });
}


