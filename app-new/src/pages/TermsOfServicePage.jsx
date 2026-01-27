/**
 * Terms of Service Page
 *
 * Legal agreement between SmartCookBook and users
 * Last Updated: December 30, 2025
 */

import { Link } from 'react-router-dom';
import styles from '../styles/pages/legalpage.module.css';

function TermsOfServicePage() {
  return (
    <div className={styles.legalPage}>
      <div className={styles.legalContainer}>
        <nav className={styles.breadcrumb}>
          <Link to="/">Home</Link> / Terms of Service
        </nav>

        <h1>Terms of Service</h1>
        <p className={styles.lastUpdated}>Last Updated: December 30, 2025</p>

        <div className={styles.legalContent}>
          {/* AGREEMENT */}
          <section>
            <h2>1. Agreement to Terms</h2>
            <p>
              By accessing or using SmartCookBook ("the Service"), you agree to be bound
              by these Terms of Service ("Terms"). If you disagree with any part of these
              terms, you may not access the Service.
            </p>
            <p>
              These Terms constitute a legally binding agreement between you and SmartCookBook
              ("we", "us", "our") governing your use of our restaurant inventory management
              application.
            </p>
          </section>

          {/* DESCRIPTION */}
          <section>
            <h2>2. Description of Service</h2>
            <p>SmartCookBook provides:</p>
            <ul>
              <li>Restaurant inventory management tools</li>
              <li>Recipe costing and management</li>
              <li>AI-powered invoice parsing</li>
              <li>Vendor management</li>
              <li>Purchase order generation</li>
              <li>Optional cloud synchronization</li>
              <li>Optional QuickBooks integration</li>
            </ul>
            <p>
              The Service is provided "as is" and we reserve the right to modify, suspend,
              or discontinue any feature at any time.
            </p>
          </section>

          {/* ACCOUNTS */}
          <section>
            <h2>3. User Accounts</h2>

            <h3>3.1 Account Creation</h3>
            <p>To use certain features, you must create an account. You agree to:</p>
            <ul>
              <li>Provide accurate, current, and complete information</li>
              <li>Maintain the security of your password</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Notify us immediately of any unauthorized use</li>
            </ul>

            <h3>3.2 Account Requirements</h3>
            <p>You must be at least 18 years old to create an account. By creating an
            account, you represent that you are at least 18 years of age.</p>

            <h3>3.3 Account Termination</h3>
            <p>
              We may suspend or terminate your account if you violate these Terms or
              engage in any conduct that we determine is harmful to the Service or
              other users. You may delete your account at any time through the Settings page.
            </p>
          </section>

          {/* ACCEPTABLE USE */}
          <section>
            <h2>4. Acceptable Use</h2>
            <p>You agree NOT to:</p>
            <ul>
              <li>Use the Service for any illegal purpose</li>
              <li>Attempt to gain unauthorized access to the Service or its systems</li>
              <li>Interfere with or disrupt the Service or servers</li>
              <li>Upload malicious content, viruses, or harmful code</li>
              <li>Scrape, crawl, or use automated tools to access the Service</li>
              <li>Impersonate another person or entity</li>
              <li>Use the Service to send spam or unsolicited communications</li>
              <li>Resell or redistribute the Service without authorization</li>
              <li>Circumvent any security features or access controls</li>
              <li>Use the AI features to process data you don't have rights to</li>
            </ul>
          </section>

          {/* YOUR DATA */}
          <section>
            <h2>5. Your Data and Content</h2>

            <h3>5.1 Ownership</h3>
            <p>
              You retain all ownership rights to the data and content you input into
              SmartCookBook ("Your Content"). This includes recipes, inventory data,
              vendor information, and uploaded invoices.
            </p>

            <h3>5.2 License to Us</h3>
            <p>
              By using the Service, you grant us a limited license to process, store,
              and transmit Your Content solely for the purpose of providing the Service
              to you. We do not claim ownership of Your Content.
            </p>

            <h3>5.3 Your Responsibilities</h3>
            <p>You are responsible for:</p>
            <ul>
              <li>Ensuring you have the right to upload any content</li>
              <li>Maintaining backups of your important data</li>
              <li>The accuracy of the information you input</li>
              <li>Compliance with applicable laws regarding your business data</li>
            </ul>

            <h3>5.4 Data Export</h3>
            <p>
              You may export your data at any time through the Settings page. We provide
              data in standard formats (JSON, CSV) to ensure portability.
            </p>
          </section>

          {/* AI FEATURES */}
          <section>
            <h2>6. AI-Powered Features</h2>

            <h3>6.1 Invoice Parsing</h3>
            <p>
              SmartCookBook uses artificial intelligence (Claude by Anthropic) to parse
              invoice documents. You understand that:
            </p>
            <ul>
              <li>AI parsing may contain errors and requires human verification</li>
              <li>You are responsible for reviewing and correcting parsed data</li>
              <li>Invoice images are processed but not permanently stored</li>
              <li>Parsed data is not used to train AI models</li>
            </ul>

            <h3>6.2 No Guarantee of Accuracy</h3>
            <p>
              AI-generated results are provided for convenience and should not be relied
              upon for critical business decisions without verification. We do not
              guarantee the accuracy of any AI-processed data.
            </p>

            <h3>6.3 Authentication Required</h3>
            <p>
              AI features require an authenticated account. Demo mode users cannot
              access AI-powered invoice parsing.
            </p>
          </section>

          {/* FEES */}
          <section>
            <h2>7. Fees and Payment</h2>

            <h3>7.1 Current Pricing</h3>
            <p>
              SmartCookBook is currently offered free of charge during the beta period.
              We reserve the right to introduce paid features or subscription plans in
              the future.
            </p>

            <h3>7.2 Future Changes</h3>
            <p>
              If we introduce paid features, we will provide at least 30 days notice.
              Free features at the time of your registration will remain available, but
              new features may require payment.
            </p>
          </section>

          {/* THIRD PARTY */}
          <section>
            <h2>8. Third-Party Services</h2>
            <p>
              SmartCookBook integrates with third-party services including:
            </p>
            <ul>
              <li><strong>Google Firebase:</strong> Authentication and data storage</li>
              <li><strong>Anthropic Claude:</strong> AI invoice processing</li>
              <li><strong>Intuit QuickBooks:</strong> Accounting integration (optional)</li>
            </ul>
            <p>
              Your use of these integrations is subject to their respective terms of
              service. We are not responsible for the availability, accuracy, or
              policies of third-party services.
            </p>
          </section>

          {/* INTELLECTUAL PROPERTY */}
          <section>
            <h2>9. Intellectual Property</h2>

            <h3>9.1 Our Rights</h3>
            <p>
              SmartCookBook and its original content, features, and functionality are
              owned by us and are protected by copyright, trademark, and other
              intellectual property laws.
            </p>

            <h3>9.2 Limited License</h3>
            <p>
              We grant you a limited, non-exclusive, non-transferable license to use
              the Service for your internal business purposes, subject to these Terms.
            </p>

            <h3>9.3 Restrictions</h3>
            <p>You may not:</p>
            <ul>
              <li>Copy, modify, or distribute the Service's code or content</li>
              <li>Reverse engineer or decompile the Service</li>
              <li>Remove any copyright or proprietary notices</li>
              <li>Create derivative works based on the Service</li>
            </ul>
          </section>

          {/* DISCLAIMERS */}
          <section>
            <h2>10. Disclaimers</h2>

            <h3>10.1 "As Is" Provision</h3>
            <p>
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES
              OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO
              IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE,
              AND NON-INFRINGEMENT.
            </p>

            <h3>10.2 No Guarantees</h3>
            <p>We do not guarantee that:</p>
            <ul>
              <li>The Service will be uninterrupted or error-free</li>
              <li>Defects will be corrected</li>
              <li>The Service or servers are free of viruses</li>
              <li>Results from the Service will be accurate or reliable</li>
            </ul>

            <h3>10.3 Business Decisions</h3>
            <p>
              SmartCookBook is a tool to assist with inventory management. You are
              solely responsible for all business decisions made using information
              from the Service. We are not liable for any business losses resulting
              from your use of or reliance on the Service.
            </p>
          </section>

          {/* LIMITATION OF LIABILITY */}
          <section>
            <h2>11. Limitation of Liability</h2>
            <p>
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL SMARTCOOKBOOK,
              ITS DIRECTORS, EMPLOYEES, PARTNERS, AGENTS, SUPPLIERS, OR AFFILIATES BE
              LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
              DAMAGES, INCLUDING WITHOUT LIMITATION:
            </p>
            <ul>
              <li>Loss of profits, revenue, or data</li>
              <li>Business interruption</li>
              <li>Cost of substitute services</li>
              <li>Any damages arising from your use of the Service</li>
            </ul>
            <p>
              OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM THESE TERMS OR YOUR USE
              OF THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE TWELVE (12)
              MONTHS PRECEDING THE CLAIM, OR ONE HUNDRED CANADIAN DOLLARS (CAD $100),
              WHICHEVER IS GREATER.
            </p>
          </section>

          {/* INDEMNIFICATION */}
          <section>
            <h2>12. Indemnification</h2>
            <p>
              You agree to indemnify, defend, and hold harmless SmartCookBook and its
              officers, directors, employees, and agents from and against any claims,
              liabilities, damages, losses, and expenses (including legal fees) arising
              out of or in any way connected with:
            </p>
            <ul>
              <li>Your use of the Service</li>
              <li>Your violation of these Terms</li>
              <li>Your violation of any rights of another party</li>
              <li>Your Content uploaded to the Service</li>
            </ul>
          </section>

          {/* GOVERNING LAW */}
          <section>
            <h2>13. Governing Law and Disputes</h2>

            <h3>13.1 Governing Law</h3>
            <p>
              These Terms shall be governed by and construed in accordance with the
              laws of the Province of Quebec and the federal laws of Canada applicable
              therein, without regard to conflict of law principles.
            </p>

            <h3>13.2 Jurisdiction</h3>
            <p>
              Any disputes arising from these Terms or your use of the Service shall
              be resolved exclusively in the courts located in Montreal, Quebec, Canada.
              You consent to the personal jurisdiction of such courts.
            </p>

            <h3>13.3 Informal Resolution</h3>
            <p>
              Before filing any claim, you agree to first contact us at
              mageroyer@hotmail.com to attempt to resolve the dispute informally.
              We will attempt to resolve disputes within 30 days.
            </p>
          </section>

          {/* CHANGES */}
          <section>
            <h2>14. Changes to Terms</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will provide
              notice of material changes by:
            </p>
            <ul>
              <li>Posting the updated Terms on this page</li>
              <li>Updating the "Last Updated" date</li>
              <li>Sending an email notification for significant changes</li>
            </ul>
            <p>
              Your continued use of the Service after changes become effective
              constitutes acceptance of the revised Terms. If you do not agree to the
              new Terms, you must stop using the Service.
            </p>
          </section>

          {/* SEVERABILITY */}
          <section>
            <h2>15. Severability</h2>
            <p>
              If any provision of these Terms is found to be unenforceable or invalid,
              that provision shall be limited or eliminated to the minimum extent
              necessary, and the remaining provisions shall remain in full force and
              effect.
            </p>
          </section>

          {/* ENTIRE AGREEMENT */}
          <section>
            <h2>16. Entire Agreement</h2>
            <p>
              These Terms, together with our Privacy Policy, constitute the entire
              agreement between you and SmartCookBook regarding your use of the Service
              and supersede all prior agreements and understandings.
            </p>
          </section>

          {/* CONTACT */}
          <section>
            <h2>17. Contact Information</h2>
            <p>For questions about these Terms of Service, contact:</p>
            <div className={styles.contactBox}>
              <p><strong>SmartCookBook</strong></p>
              <p>4640 rue Adam, Montreal, QC H1V 1V3</p>
              <p>Email: mageroyer@hotmail.com</p>
            </div>
          </section>
        </div>

        <div className={styles.legalFooter}>
          <Link to="/privacy">Privacy Policy</Link>
          <span className={styles.separator}>|</span>
          <Link to="/">Return to Home</Link>
        </div>
      </div>
    </div>
  );
}

export default TermsOfServicePage;
