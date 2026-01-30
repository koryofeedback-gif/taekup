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
        <p className="text-gray-400 mb-8"><strong>Last Updated:</strong> January 2026</p>
        
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

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">6. Termination</h2>
        <p className="text-gray-300 mb-4">
            We reserve the right to terminate accounts that violate these terms or attempt to clone/scrape our data.
        </p>

        <div className="mt-10 pt-6 border-t border-gray-700">
            <p className="text-gray-400"><strong>Contact:</strong> <a href="mailto:legal@mytaek.com" className="text-cyan-400 hover:text-cyan-300">legal@mytaek.com</a></p>
        </div>
    </PageWrapper>
);

export const PrivacyPage: React.FC = () => (
    <PageWrapper>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-8">Privacy Policy</h1>
        <p className="text-gray-400 mb-8"><strong>Effective Date:</strong> January 2026</p>
        
        <p className="text-gray-300 mb-8">
            MyTaek Inc. ("we") values the privacy of our Dojo owners, parents, and young athletes.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">1. Information We Collect</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Account Data:</strong> Name, email, and billing information via our payment processor (Stripe).</li>
            <li><strong>Student Data:</strong> First name, belt rank, and training videos uploaded by the parent.</li>
            <li><strong>Usage Data:</strong> Progress stats, HonorXP™ earned, and login activity.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">2. Children's Privacy (COPPA Compliance)</h2>
        <p className="text-gray-300 mb-4">
            We do not knowingly collect personal information directly from children under 13 without verifiable parental consent.
        </p>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li><strong>Parental Control:</strong> All student accounts must be created and managed by a Parent or Legal Guardian.</li>
            <li><strong>Video Privacy:</strong> Videos uploaded are visible only to the Parent, the Student, and the authorized Club Instructors. They are <strong>not</strong> public.</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">3. How We Use Your Data</h2>
        <ul className="list-disc list-inside text-gray-300 mb-4 space-y-2 ml-4">
            <li>To provide the gamified training experience (TaekUp).</li>
            <li>To process payments and calculate revenue splits for Clubs.</li>
            <li>To send transactional emails (Welcome, Payment Receipts, Progress Reports).</li>
        </ul>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">4. Data Protection & Storage</h2>
        <p className="text-gray-300 mb-4">
            We use enterprise-grade encryption for all data in transit and at rest. We do <strong>not</strong> sell user data to third-party advertisers.
        </p>

        <h2 className="text-xl md:text-2xl font-bold text-white mt-10 mb-4">5. Deletion Rights</h2>
        <p className="text-gray-300 mb-4">
            You have the right to request the deletion of your account and all associated data. 
            Contact <a href="mailto:support@mytaek.com" className="text-cyan-400 hover:text-cyan-300">support@mytaek.com</a> to initiate this process.
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
                United States
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
