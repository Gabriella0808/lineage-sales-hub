import lineageLogo from "@/assets/lineage-logo.png";

const EFFECTIVE_DATE = "July 15, 2026";
const CONTACT_EMAIL = "info@lineage-collections.com";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <img src={lineageLogo} alt="Lineage Collections" className="h-7 w-auto" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Portal</span>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs text-muted-foreground uppercase tracking-widest mb-2">Legal</p>
        <h1 className="text-3xl font-serif font-semibold mb-1">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Effective date: {EFFECTIVE_DATE} &nbsp;·&nbsp; Lineage Collections LLC
        </p>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold mb-2">1. Overview</h2>
            <p>
              Lineage Collections LLC ("Lineage Collections", "we", "us", or "our") operates the
              Lineage Collections Portal ("Portal"), a private internal business platform. This Privacy
              Policy explains what information we collect, how we use it, and the protections we apply.
              This policy applies to all authorized users of the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">2. Information We Collect</h2>
            <p className="mb-3">We collect the following categories of information in connection with the Portal:</p>

            <h3 className="font-medium mb-1 text-foreground/80">Account & Identity</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
              <li>Email address and login credentials used to authenticate to the Portal</li>
              <li>Name and business role (e.g. sales representative, manager, dealer, admin)</li>
              <li>Account creation date and profile metadata</li>
            </ul>

            <h3 className="font-medium mb-1 text-foreground/80">Business Contact Details</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
              <li>Contact information for dealers, accounts, and sales territories managed within the Portal</li>
              <li>Customer-facing quote and order contact data entered by authorized users</li>
            </ul>

            <h3 className="font-medium mb-1 text-foreground/80">Operational & Reporting Data</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
              <li>Sales figures, KPI data, bookings, invoicing totals, and inventory data synchronized from Acctivate</li>
              <li>Financial summaries, targets, and performance projections</li>
              <li>Order details, product catalog data, and SKU-level information</li>
              <li>QuickBooks and Acctivate-related business records, including transaction and inventory data</li>
            </ul>

            <h3 className="font-medium mb-1 text-foreground/80">Field & Activity Data</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground mb-4">
              <li>Field check-in records and location notes entered by sales representatives</li>
              <li>Travel log entries, trade show lead captures, and CRM account notes</li>
              <li>Task assignments, board subscriptions, and weekly review records</li>
            </ul>

            <h3 className="font-medium mb-1 text-foreground/80">Usage Logs</h3>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Login events, session activity, and page navigation (via Supabase Auth and database audit logs)</li>
              <li>Feature usage patterns used to support and improve the Portal</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">3. How We Use Your Information</h2>
            <p className="mb-3">Information collected through the Portal is used solely for internal business operations, including:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Authenticating and managing authorized user access</li>
              <li>Delivering sales reporting, KPI dashboards, and operational visibility tools</li>
              <li>Supporting integrations with Acctivate, QuickBooks, and Skyvia for data synchronization</li>
              <li>Enabling order management, customer quoting, and dealer coordination workflows</li>
              <li>Sending automated operational emails (e.g. weekly sales reports, task notifications, board subscriptions)</li>
              <li>Diagnosing technical issues and providing user support</li>
              <li>Maintaining security and auditing access</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">4. We Do Not Sell Your Data</h2>
            <p>
              Lineage Collections does not sell, rent, or trade personal information or business data to
              any third party for marketing or commercial purposes. Information is shared only as
              described in this policy, with service providers necessary to operate the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">5. Third-Party Processors</h2>
            <p className="mb-3">
              We engage the following third-party service providers to operate the Portal. Each provider
              processes data only as necessary to deliver their service and under appropriate data
              processing agreements:
            </p>
            <div className="space-y-3">
              <div>
                <p className="font-medium">Supabase</p>
                <p className="text-muted-foreground">
                  Cloud database, authentication, and serverless function infrastructure hosted on
                  Supabase Inc.'s platform. User credentials, Portal data, and operational records
                  are stored within Supabase-managed infrastructure.
                </p>
              </div>
              <div>
                <p className="font-medium">Intuit / QuickBooks</p>
                <p className="text-muted-foreground">
                  Financial and accounting data is managed within QuickBooks (Intuit Inc.). Data
                  synchronized from QuickBooks into the Portal may include transaction records,
                  customer information, and financial summaries.
                </p>
              </div>
              <div>
                <p className="font-medium">Acctivate (Alterity)</p>
                <p className="text-muted-foreground">
                  Inventory, order management, and operational data is sourced from Acctivate
                  (Alterity Inc.), which serves as the primary ERP system for Lineage Collections.
                </p>
              </div>
              <div>
                <p className="font-medium">Skyvia</p>
                <p className="text-muted-foreground">
                  Skyvia is used for automated data integration and synchronization between
                  Acctivate, QuickBooks, and the Portal database. Skyvia operates as a data
                  pipeline processor under our direction.
                </p>
              </div>
              <div>
                <p className="font-medium">Cloudflare Pages</p>
                <p className="text-muted-foreground">
                  The Portal frontend is hosted and delivered via Cloudflare Pages (Cloudflare Inc.),
                  which may process connection metadata including IP addresses and request logs as
                  part of serving the application.
                </p>
              </div>
              <div>
                <p className="font-medium">Resend</p>
                <p className="text-muted-foreground">
                  Transactional and operational emails sent from the Portal (such as sales reports
                  and notifications) are delivered through Resend, Inc.'s email delivery service.
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">6. Authorized Access</h2>
            <p>
              Access to the Portal is restricted to individuals explicitly authorized by Lineage
              Collections. Role-based access controls limit what each user can view or modify.
              Administrators, managers, sales representatives, and dealers each have access scoped
              to their business function. Access is reviewed and may be revoked at any time.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">7. Security</h2>
            <p>
              We implement technical and organizational measures to protect Portal data, including
              encrypted connections (TLS), row-level security policies enforced at the database layer,
              JWT-based authentication, and access controls managed through Supabase. While we take
              reasonable precautions, no system is entirely immune to security risks. Users are
              responsible for protecting their own login credentials and reporting suspected breaches
              promptly.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">8. Data Retention</h2>
            <p>
              We retain operational and business data for as long as necessary to support business
              operations and comply with legal obligations. User account data is retained while the
              account is active. If access is revoked, account data may be archived for auditing
              purposes before deletion. Data originating from Acctivate or QuickBooks follows the
              retention policies of those systems.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">9. Cookies and Local Storage</h2>
            <p>
              The Portal uses browser local storage and session cookies to maintain login sessions
              and user preferences (such as saved filter states and projection overrides). These are
              used strictly for operational functionality and are not used for advertising or
              cross-site tracking.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. When we do, we will update the
              effective date above. Continued use of the Portal after changes are posted constitutes
              acceptance of the revised policy. We encourage authorized users to review this policy
              periodically.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">11. Contact</h2>
            <p>
              For questions, concerns, or requests related to this Privacy Policy or your data,
              please contact:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-14 pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <a href="/terms" className="hover:text-foreground transition-colors">Terms of Use (EULA)</a>
          <a href="/auth" className="hover:text-foreground transition-colors">Sign In</a>
          <span className="ml-auto">© {new Date().getFullYear()} Lineage Collections LLC</span>
        </div>
      </main>
    </div>
  );
}
