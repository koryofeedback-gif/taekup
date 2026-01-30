import React from 'react';
import { Link } from 'react-router-dom';

const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="min-h-screen bg-gray-900 text-gray-100">
        <div className="container mx-auto px-4 md:px-8 py-12 md:py-16 max-w-4xl">
            {children}
        </div>
    </div>
);

export const TermsPage: React.FC = () => (
    <PageWrapper>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Terms of Service</h1>
        <p className="text-gray-400 mb-4"><strong>Last Updated:</strong> January 2026</p>
        <p className="text-gray-400 mb-8"><strong>Operator:</strong> MyTaek Inc. (France)</p>
        
        <p className="text-gray-300 mb-8">
            Welcome to TaekUp, a platform operated by <strong>MyTaek Inc.</strong> ("Company", "we", "us"). 
            By accessing our website or mobile application, you agree to these Terms.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">1. Intellectual Property & Brand Protection</h2>
        <p className="text-gray-300 mb-4">
            The TaekUp platform, including its source code, database structures, algorithms, and User Interface design (UI/UX), 
            is the exclusive property of MyTaek Inc.
        </p>
        <p className="text-gray-300 mb-4"><strong>Strictly Prohibited:</strong></p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li>You may not reverse engineer, decompile, or disassemble any aspect of the platform.</li>
            <li><strong>Trade Dress:</strong> The specific combination of features known as <strong>HonorXP™</strong>, <strong>Legacy Cards™</strong>, <strong>Global Shogun Rank™</strong>, and the <strong>DojoMint™ Protocol</strong> are protected trade dress of MyTaek Inc. Copying these gamification mechanics or terminologies is a violation of our intellectual property rights.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">2. Accounts & Usage</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Club Owners:</strong> You are responsible for maintaining the confidentiality of your Stripe Connect account credentials.</li>
            <li><strong>Parents/Guardians:</strong> You must be at least 18 years old to create an account. You grant consent for your child's participation and video uploads.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">3. Payments & Revenue Split (The DojoMint™ Model)</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>SaaS Fees:</strong> Club Owners agree to the applicable software licensing fees as presented at the time of subscription.</li>
            <li><strong>Marketplace Revenue:</strong> For student subscriptions, the Platform automatically deducts a <strong>Platform Fee</strong> and applicable payment processing costs (e.g., Stripe fees) before transferring the remaining <strong>Net Revenue</strong> to the Club Owner's connected account.</li>
            <li><strong>Fee Visibility:</strong> The specific revenue share rates and fee structures are confidential and detailed within the <strong>Club Owner Dashboard</strong>. By connecting your Stripe account, you agree to these rates.</li>
            <li><strong>Refunds:</strong> SaaS fees are non-refundable. Student subscription refunds are handled at the discretion of the Club Owner.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">4. User-Generated Content (Videos)</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Ownership:</strong> Parents/Students retain ownership of their training videos.</li>
            <li><strong>License:</strong> By uploading, you grant MyTaek Inc. a worldwide, royalty-free license to host, encode, and process these videos for the purpose of providing the Service (e.g., for Coach review).</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">5. Physical Safety Disclaimer</h2>
        <p className="text-gray-300 mb-4">
            Martial arts involve physical exertion. MyTaek Inc. is a technology provider, not a fitness instructor. 
            We are not liable for any physical injuries that occur while practicing moves seen on or uploaded to the App. 
            Practice safely and under supervision.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">6. Limitation of Liability</h2>
        <p className="text-gray-300 mb-4">
            To the maximum extent permitted by law, MyTaek Inc. shall not be liable for any indirect, incidental, or consequential damages (including loss of data or revenue). Our total liability for any claim arising out of these Terms is limited to the <strong>amount you paid us in the 12 months preceding the claim</strong>.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">7. Modifications to Terms</h2>
        <p className="text-gray-300 mb-4">
            We reserve the right to modify these Terms at any time. We will notify you of significant changes via email or dashboard alert. Your continued use of the Service after such changes constitutes your acceptance of the new Terms.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">8. Governing Law & Jurisdiction</h2>
        <p className="text-gray-300 mb-4">
            These Terms are governed by the <strong>laws of France</strong>. Any dispute arising from these Terms shall be subject to the exclusive jurisdiction of the competent courts of <strong>France</strong>.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">9. Termination</h2>
        <p className="text-gray-300 mb-4">
            We reserve the right to terminate accounts that violate these terms or attempt to clone/scrape our data.
        </p>

        <div className="mt-10 pt-6 border-t border-gray-700">
            <p className="text-gray-400"><strong>Contact:</strong> <a href="mailto:hello@mytaek.com" className="text-cyan-400 hover:text-cyan-300">hello@mytaek.com</a></p>
        </div>
    </PageWrapper>
);

export const PrivacyPage: React.FC = () => (
    <PageWrapper>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        <p className="text-gray-400 mb-4"><strong>Effective Date:</strong> January 2026</p>
        <p className="text-gray-400 mb-8"><strong>Data Controller:</strong> MyTaek Inc. (France)</p>
        
        <p className="text-gray-300 mb-8">
            MyTaek Inc. ("Company", "we") is committed to protecting your privacy in compliance with the <strong>General Data Protection Regulation (GDPR)</strong> and the <strong>Children's Online Privacy Protection Act (COPPA)</strong>.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">1. Information We Collect</h2>
        <p className="text-gray-300 mb-4">We collect only the data necessary to provide the TaekUp service:</p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Account Data:</strong> Name, email, and encrypted billing information.</li>
            <li><strong>Student Data:</strong> First name, age, belt rank, and training videos.</li>
            <li><strong>Technical Data:</strong> IP address, browser type, and usage statistics (HonorXP™ logs).</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">2. Legal Basis for Processing (GDPR)</h2>
        <p className="text-gray-300 mb-4">We process your data based on the following legal grounds:</p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Performance of Contract:</strong> To provide the gamified dashboard, process payments, and calculate revenue splits for Club Owners.</li>
            <li><strong>Consent:</strong> For the processing of children's data and video uploads (provided by the Parent/Guardian).</li>
            <li><strong>Legal Obligation:</strong> Maintaining financial records for tax purposes.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">3. Children's Privacy & Safety</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Strict Consent:</strong> We do not knowingly collect data from children under 13 without verifiable parental consent. Accounts must be created by a Legal Guardian.</li>
            <li><strong>Private Visibility:</strong> Student videos are <strong>strictly private</strong>. They are accessible only by the Parent, the Student, and the authorized Instructors of their specific Dojo. They are never public.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">4. Third-Party Processors</h2>
        <p className="text-gray-300 mb-4">We share data only with trusted partners essential to our service:</p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Stripe:</strong> For secure payment processing and marketplace payouts.</li>
            <li><strong>SendGrid:</strong> For delivering transactional emails (receipts, progress reports).</li>
            <li><strong>Cloud Hosting (Vercel/AWS):</strong> For secure data and video storage.</li>
            <li><strong>Database Providers:</strong> For storing user profiles and game progress.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">5. International Data Transfers</h2>
        <p className="text-gray-300 mb-4">
            Some of our service providers (like Stripe or SendGrid) may be located outside the European Economic Area (EEA). We ensure your data is protected through standard contractual clauses (SCCs) or equivalent data privacy frameworks approved by the EU Commission.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">6. Data Retention</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Active Accounts:</strong> We keep your data as long as your account is active to provide the Service.</li>
            <li><strong>Inactive Accounts:</strong> If you cancel, we may retain "frozen" game data (Rank/XP) for up to 24 months in case of reactivation, unless you request immediate deletion.</li>
            <li><strong>Financial Records:</strong> Invoices and transaction data are kept for 10 years as required by French/EU tax laws.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">7. Your Rights (GDPR)</h2>
        <p className="text-gray-300 mb-4">Under GDPR, you have the right to:</p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Access:</strong> Request a copy of all data we hold about you or your child.</li>
            <li><strong>Rectification:</strong> Correct inaccurate information.</li>
            <li><strong>Erasure (Right to be Forgotten):</strong> Request permanent deletion of your account and videos.</li>
            <li><strong>Portability:</strong> Request your data in a structured, commonly used format.</li>
            <li><strong>Withdraw Consent:</strong> You may withdraw consent for video processing at any time (this will disable the feedback feature).</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">8. Cookies</h2>
        <p className="text-gray-300 mb-4">
            We use essential cookies to keep you logged in and functional cookies to remember your language preferences. We do <strong>not</strong> use third-party advertising cookies.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">9. Contact Us</h2>
        <p className="text-gray-300 mb-4">
            To exercise your rights or for any privacy questions, contact our Data Protection Officer at <a href="mailto:support@mytaek.com" className="text-cyan-400 hover:text-cyan-300">support@mytaek.com</a>.
        </p>
    </PageWrapper>
);

export const ContactPage: React.FC = () => (
    <PageWrapper>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Contact MyTaek</h1>
        
        <p className="text-gray-300 mb-10">
            We are here to help your Dojo grow and your students thrive. Please choose the right channel so we can assist you faster.
        </p>

        <div className="mb-10">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🏢</span> Headquarters
            </h2>
            <p className="text-gray-300 ml-9">
                <strong>MyTaek Inc.</strong><br />
                France
            </p>
        </div>

        <h2 className="text-xl md:text-2xl font-bold text-white mb-6">📧 Email Us</h2>
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-10">
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-cyan-500 transition-colors">
                <div className="text-3xl mb-3">💬</div>
                <h3 className="font-bold text-white mb-2">General Inquiries</h3>
                <a href="mailto:hello@mytaek.com" className="text-cyan-400 hover:text-cyan-300 text-sm">hello@mytaek.com</a>
                <p className="text-gray-500 text-xs mt-2">Questions about features, branding, or partnerships</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-green-500 transition-colors">
                <div className="text-3xl mb-3">💳</div>
                <h3 className="font-bold text-white mb-2">Billing & Payments</h3>
                <a href="mailto:billing@mytaek.com" className="text-green-400 hover:text-green-300 text-sm">billing@mytaek.com</a>
                <p className="text-gray-500 text-xs mt-2">Subscriptions, invoices, or payouts</p>
            </div>
            
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-yellow-500 transition-colors">
                <div className="text-3xl mb-3">🔧</div>
                <h3 className="font-bold text-white mb-2">Technical Support</h3>
                <a href="mailto:support@mytaek.com" className="text-yellow-400 hover:text-yellow-300 text-sm">support@mytaek.com</a>
                <p className="text-gray-500 text-xs mt-2">App bugs, login issues, or video uploads</p>
            </div>
        </div>

        <div className="bg-gradient-to-r from-red-900/30 to-red-800/20 rounded-xl p-8 border border-red-700/50">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🥋</span> For Club Owners
            </h2>
            <p className="text-gray-300 mb-4">Looking to digitize your Dojo?</p>
            <Link 
                to="/wizard" 
                className="inline-block bg-red-600 hover:bg-red-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
                Start Your 14-Day Free Trial
            </Link>
        </div>
    </PageWrapper>
);

export const SupportPage: React.FC = () => (
    <PageWrapper>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Support Center</h1>
        
        <h2 className="text-xl md:text-2xl font-bold text-white mt-8 mb-6">Frequently Asked Questions (FAQ)</h2>

        <div className="mb-10">
            <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                <span className="text-xl">🥋</span> For Club Owners
            </h3>
            
            <div className="space-y-6 ml-7">
                <div className="bg-gray-800 rounded-lg p-5 border-l-4 border-cyan-500">
                    <p className="font-bold text-white mb-2">Q: How do I get paid?</p>
                    <p className="text-gray-300">
                        A: We use Stripe Connect. You receive the <strong>Net Revenue</strong> from your students' subscriptions 
                        (Total Subscription Cost minus Platform Fees and Processing Costs). 
                        Payouts are transferred automatically to your bank account on a rolling basis.
                    </p>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-5 border-l-4 border-cyan-500">
                    <p className="font-bold text-white mb-2">Q: Where can I see my revenue share rates?</p>
                    <p className="text-gray-300">
                        A: Once you log in to your <strong>Admin Dashboard</strong> and connect your bank account, 
                        you will see all fee structures and revenue details in the DojoMint™ Protocol section.
                    </p>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-5 border-l-4 border-cyan-500">
                    <p className="font-bold text-white mb-2">Q: Why do I need to connect a Stripe account?</p>
                    <p className="text-gray-300">
                        A: This is required to legally split the revenue. Without a connected account, we cannot send your share of the earnings.
                    </p>
                </div>
            </div>
        </div>

        <div className="mb-10">
            <h3 className="text-lg font-bold text-green-400 mb-4 flex items-center gap-2">
                <span className="text-xl">👨‍👩‍👧‍👦</span> For Parents
            </h3>
            
            <div className="space-y-6 ml-7">
                <div className="bg-gray-800 rounded-lg p-5 border-l-4 border-green-500">
                    <p className="font-bold text-white mb-2">Q: How do I upload a video?</p>
                    <p className="text-gray-300">
                        A: Go to the "Arena" tab, select the technique, and tap "Upload". 
                        Your Sensei will review it within 24-48 hours.
                    </p>
                </div>
                
                <div className="bg-gray-800 rounded-lg p-5 border-l-4 border-green-500">
                    <p className="font-bold text-white mb-2">Q: Can I cancel anytime?</p>
                    <p className="text-gray-300">
                        A: Yes. You can cancel your subscription from your Profile settings. 
                        Your child's rank will be frozen but not deleted.
                    </p>
                </div>
            </div>
        </div>

        <div className="bg-gray-800 rounded-xl p-8 border border-gray-700 text-center">
            <h3 className="text-lg font-bold text-white mb-4">Still need help?</h3>
            <p className="text-gray-400 mb-4">If you couldn't find your answer, our support team is ready.</p>
            <a 
                href="mailto:support@mytaek.com" 
                className="inline-block bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-3 px-6 rounded-lg transition-colors"
            >
                Email Support
            </a>
            <p className="text-gray-500 text-sm mt-4">Average response time: 24 hours</p>
        </div>
    </PageWrapper>
);
