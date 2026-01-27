/**
 * Privacy Policy Page
 *
 * Compliant with Quebec Law 25 and PIPEDA
 * Last Updated: December 30, 2025
 */

import { Link } from 'react-router-dom';
import styles from '../styles/pages/legalpage.module.css';

function PrivacyPolicyPage() {
  return (
    <div className={styles.legalPage}>
      <div className={styles.legalContainer}>
        <nav className={styles.breadcrumb}>
          <Link to="/">Home</Link> / Privacy Policy
        </nav>

        <h1>Privacy Policy</h1>
        <p className={styles.lastUpdated}>Last Updated: December 30, 2025</p>

        <div className={styles.legalContent}>
          {/* INTRODUCTION */}
          <section>
            <h2>1. Introduction</h2>
            <p>
              SmartCookBook ("we", "us", "our") is committed to protecting your privacy
              and personal information. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our restaurant inventory
              management application.
            </p>
            <p>
              This policy complies with Quebec's <strong>Law 25</strong> (Act respecting the
              protection of personal information in the private sector) and Canada's
              <strong> Personal Information Protection and Electronic Documents Act (PIPEDA)</strong>.
            </p>
          </section>

          {/* PRIVACY OFFICER */}
          <section>
            <h2>2. Privacy Officer</h2>
            <p>
              We have designated a Privacy Officer responsible for our compliance with
              privacy legislation. For any privacy-related questions or to exercise your
              rights, contact:
            </p>
            <div className={styles.contactBox}>
              <p><strong>Privacy Officer: Mage Royer</strong></p>
              <p>SmartCookBook</p>
              <p>4640 rue Adam, Montreal, QC H1V 1V3</p>
              <p>Email: mageroyer@hotmail.com</p>
            </div>
          </section>

          {/* INFORMATION WE COLLECT */}
          <section>
            <h2>3. Information We Collect</h2>

            <h3>3.1 Account Information</h3>
            <p>When you create an account, we collect:</p>
            <ul>
              <li>Email address</li>
              <li>Display name (optional)</li>
              <li>Password (stored as a secure hash, never in plain text)</li>
            </ul>

            <h3>3.2 Business Data</h3>
            <p>When you use SmartCookBook, you may input:</p>
            <ul>
              <li>Recipe information (names, ingredients, methods, costs)</li>
              <li>Inventory data (stock levels, par levels, categories)</li>
              <li>Vendor information (names, contact details, account numbers)</li>
              <li>Invoice data (amounts, dates, line items, prices)</li>
              <li>Purchase orders and ordering history</li>
            </ul>

            <h3>3.3 Automatically Collected Information</h3>
            <p>We automatically collect:</p>
            <ul>
              <li>Device type and browser information</li>
              <li>Usage patterns within the application</li>
              <li>Error logs for troubleshooting</li>
              <li>IP address (for security purposes)</li>
            </ul>

            <h3>3.4 Invoice Images</h3>
            <p>
              When you upload invoices for AI-powered parsing, the images are:
            </p>
            <ul>
              <li>Processed by our AI service to extract text and data</li>
              <li>Not permanently stored on our servers after processing</li>
              <li>Not used to train AI models</li>
            </ul>
          </section>

          {/* HOW WE USE YOUR INFORMATION */}
          <section>
            <h2>4. How We Use Your Information</h2>
            <p>We use your information to:</p>
            <ul>
              <li><strong>Provide the Service:</strong> Enable inventory management, recipe costing, invoice processing, and order generation</li>
              <li><strong>Authenticate:</strong> Verify your identity when you log in</li>
              <li><strong>Sync Data:</strong> Synchronize your data across devices (if enabled)</li>
              <li><strong>Process Invoices:</strong> Use AI to extract data from uploaded invoice images</li>
              <li><strong>Improve the Service:</strong> Analyze usage patterns to enhance features</li>
              <li><strong>Communicate:</strong> Send important service updates and respond to inquiries</li>
              <li><strong>Security:</strong> Detect and prevent fraud or unauthorized access</li>
            </ul>
          </section>

          {/* DATA SHARING */}
          <section>
            <h2>5. Who We Share Your Information With</h2>
            <p>We share your information with the following third-party service providers:</p>

            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Purpose</th>
                  <th>Data Shared</th>
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Google Firebase</td>
                  <td>Authentication, database, hosting</td>
                  <td>Account info, business data</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>Anthropic (Claude AI)</td>
                  <td>Invoice parsing</td>
                  <td>Invoice images (temporary)</td>
                  <td>United States</td>
                </tr>
                <tr>
                  <td>Intuit QuickBooks</td>
                  <td>Accounting integration (optional)</td>
                  <td>Invoice data, vendor info</td>
                  <td>United States</td>
                </tr>
              </tbody>
            </table>

            <p>
              <strong>International Transfer:</strong> Your data may be transferred to and
              processed in the United States. We ensure these transfers comply with applicable
              data protection laws through contractual safeguards.
            </p>

            <p>We do NOT:</p>
            <ul>
              <li>Sell your personal information</li>
              <li>Share your data for advertising purposes</li>
              <li>Use your data to train AI models</li>
            </ul>
          </section>

          {/* DATA RETENTION */}
          <section>
            <h2>6. Data Retention</h2>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Data Type</th>
                  <th>Retention Period</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Account information</td>
                  <td>Until you delete your account</td>
                </tr>
                <tr>
                  <td>Business data (recipes, inventory, invoices)</td>
                  <td>Until you delete your account or the specific data</td>
                </tr>
                <tr>
                  <td>Invoice images (during processing)</td>
                  <td>Deleted immediately after processing</td>
                </tr>
                <tr>
                  <td>Usage logs</td>
                  <td>90 days</td>
                </tr>
                <tr>
                  <td>Security logs</td>
                  <td>1 year</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* LOCAL STORAGE */}
          <section>
            <h2>7. Local Data Storage</h2>
            <p>
              SmartCookBook uses your device's local storage (IndexedDB) to enable
              offline functionality. This data:
            </p>
            <ul>
              <li>Remains on your device</li>
              <li>Can be synced to the cloud (optional, requires account)</li>
              <li>Is deleted if you clear your browser data or uninstall the app</li>
            </ul>
            <p>
              <strong>Note:</strong> Local data is not encrypted at rest. If device security
              is a concern, we recommend using device-level encryption.
            </p>
          </section>

          {/* YOUR RIGHTS */}
          <section>
            <h2>8. Your Rights</h2>
            <p>Under Quebec Law 25 and PIPEDA, you have the right to:</p>

            <h3>8.1 Access Your Data</h3>
            <p>Request a copy of all personal information we hold about you.</p>

            <h3>8.2 Correct Your Data</h3>
            <p>Request correction of inaccurate or incomplete information.</p>

            <h3>8.3 Delete Your Data</h3>
            <p>
              Request deletion of your personal information. You can delete your account
              and all associated data through the Settings page.
            </p>

            <h3>8.4 Data Portability</h3>
            <p>
              Request your data in a structured, commonly used format (JSON export
              available in Settings).
            </p>

            <h3>8.5 Withdraw Consent</h3>
            <p>
              Withdraw your consent to data processing at any time. Note that withdrawing
              consent may limit your ability to use certain features.
            </p>

            <h3>8.6 File a Complaint</h3>
            <p>
              If you believe your privacy rights have been violated, you may file a
              complaint with:
            </p>
            <div className={styles.contactBox}>
              <p><strong>Commission d'accès à l'information du Québec (CAI)</strong></p>
              <p>Website: <a href="https://www.cai.gouv.qc.ca" target="_blank" rel="noopener noreferrer">www.cai.gouv.qc.ca</a></p>
              <p>Phone: 1-888-528-7741</p>
            </div>

            <p>To exercise any of these rights, contact our Privacy Officer at mageroyer@hotmail.com</p>
          </section>

          {/* SECURITY */}
          <section>
            <h2>9. Security Measures</h2>
            <p>We implement the following security measures to protect your data:</p>
            <ul>
              <li><strong>Encryption in Transit:</strong> All data transmitted uses TLS 1.3 encryption</li>
              <li><strong>Encryption at Rest:</strong> Cloud-stored data is encrypted using AES-256</li>
              <li><strong>Authentication:</strong> Secure password hashing (bcrypt) and optional multi-factor authentication</li>
              <li><strong>Access Control:</strong> API access requires authentication tokens</li>
              <li><strong>Secure Infrastructure:</strong> Hosted on Google Cloud Platform with SOC 2 certification</li>
            </ul>
            <p>
              While we take reasonable measures to protect your information, no method of
              transmission or storage is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          {/* COOKIES */}
          <section>
            <h2>10. Cookies and Tracking</h2>
            <p>SmartCookBook uses minimal cookies and tracking:</p>
            <ul>
              <li><strong>Essential Cookies:</strong> Required for authentication and session management</li>
              <li><strong>Local Storage:</strong> Used for offline data and user preferences</li>
            </ul>
            <p>We do NOT use:</p>
            <ul>
              <li>Advertising cookies</li>
              <li>Third-party tracking scripts</li>
              <li>Analytics that track individual users</li>
            </ul>
          </section>

          {/* CHILDREN */}
          <section>
            <h2>11. Children's Privacy</h2>
            <p>
              SmartCookBook is not intended for use by individuals under the age of 18.
              We do not knowingly collect personal information from children. If we become
              aware that we have collected personal information from a child, we will take
              steps to delete that information.
            </p>
          </section>

          {/* CHANGES */}
          <section>
            <h2>12. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of
              any material changes by:
            </p>
            <ul>
              <li>Posting the new policy on this page</li>
              <li>Updating the "Last Updated" date</li>
              <li>Sending an email notification for significant changes</li>
            </ul>
            <p>
              Your continued use of SmartCookBook after changes constitutes acceptance
              of the updated policy.
            </p>
          </section>

          {/* CONTACT */}
          <section>
            <h2>13. Contact Us</h2>
            <p>For questions about this Privacy Policy or our data practices, contact:</p>
            <div className={styles.contactBox}>
              <p><strong>SmartCookBook</strong></p>
              <p>4640 rue Adam, Montreal, QC H1V 1V3</p>
              <p>Email: mageroyer@hotmail.com</p>
            </div>
          </section>
        </div>

        <div className={styles.legalFooter}>
          <Link to="/terms">Terms of Service</Link>
          <span className={styles.separator}>|</span>
          <Link to="/">Return to Home</Link>
        </div>
      </div>
    </div>
  );
}

export default PrivacyPolicyPage;
