import lineageLogo from "@/assets/lineage-logo.png";

const EFFECTIVE_DATE = "July 15, 2026";
const CONTACT_EMAIL = "info@lineage-collections.com";

export default function TermsPage() {
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
        <h1 className="text-3xl font-serif font-semibold mb-1">End User License Agreement</h1>
        <p className="text-sm text-muted-foreground mb-10">
          Effective date: {EFFECTIVE_DATE} &nbsp;·&nbsp; Lineage Collections LLC
        </p>

        <div className="space-y-8 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the Lineage Collections Portal ("Portal"), you confirm that you are
              an authorized user granted access by Lineage Collections LLC ("Lineage Collections", "we",
              "us", or "our") and that you agree to be bound by this End User License Agreement ("EULA").
              If you do not agree to these terms, you must not access or use the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">2. Authorized Use</h2>
            <p className="mb-3">
              The Portal is a private, internal business platform made available exclusively to employees,
              independent sales representatives, managers, dealers, and other parties explicitly authorized
              by Lineage Collections. The Portal is provided for the following approved business purposes:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Sales reporting, KPI tracking, and performance dashboards</li>
              <li>Order visibility, inventory management, and product catalog access</li>
              <li>Customer quoting, dealer management, and CRM functions</li>
              <li>Task management, field check-ins, and operational workflows</li>
              <li>Integration with connected business systems (QuickBooks, Acctivate, Skyvia)</li>
              <li>Internal communications and document distribution</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">3. Prohibited Use</h2>
            <p className="mb-3">You may not:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Share your credentials or grant access to any unauthorized person</li>
              <li>Use the Portal for any purpose outside approved business operations</li>
              <li>Export, copy, or distribute data obtained through the Portal for non-business purposes</li>
              <li>Attempt to reverse engineer, decompile, or otherwise access underlying source code or infrastructure</li>
              <li>Circumvent, disable, or interfere with security features or access controls</li>
              <li>Use the Portal to transmit malicious code, spam, or unauthorized solicitations</li>
              <li>Scrape, aggregate, or systematically collect data through automated means</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">4. Access and Account Security</h2>
            <p>
              Access to the Portal is granted on an individual basis and is non-transferable. You are
              responsible for maintaining the confidentiality of your login credentials. You must notify
              Lineage Collections immediately at{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>{" "}
              if you believe your account has been compromised. Lineage Collections reserves the right to
              suspend or terminate access at any time, with or without notice, if unauthorized or improper
              use is suspected.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">5. Intellectual Property</h2>
            <p>
              All content, designs, software, data structures, and business logic within the Portal are
              the proprietary property of Lineage Collections LLC or its licensors. No license to any
              intellectual property is granted beyond what is strictly necessary to use the Portal for
              approved business purposes. You may not reproduce, modify, create derivative works from,
              or redistribute any part of the Portal.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">6. Data Accuracy Disclaimer</h2>
            <p>
              The Portal displays data sourced from Acctivate, QuickBooks, and other integrated business
              systems. While Lineage Collections takes reasonable steps to maintain data accuracy, we make
              no warranties or representations regarding the completeness, timeliness, or accuracy of any
              information displayed. Data should be verified against source systems before being relied
              upon for significant business decisions. Reporting figures, KPI calculations, and inventory
              counts are provided for operational guidance only.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, Lineage Collections LLC and its officers,
              employees, agents, and licensors shall not be liable for any indirect, incidental, special,
              consequential, or punitive damages arising from or related to your use of, or inability to
              use, the Portal — including but not limited to loss of business, loss of data, or loss of
              profits — even if Lineage Collections has been advised of the possibility of such damages.
              In no event shall our total liability to you exceed the amount paid, if any, for access to
              the Portal in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">8. No Warranty</h2>
            <p>
              The Portal is provided "as is" and "as available" without warranty of any kind, express or
              implied, including without limitation any warranty of merchantability, fitness for a
              particular purpose, or non-infringement. We do not warrant that the Portal will be
              uninterrupted, error-free, or free of viruses or other harmful components.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">9. Modifications</h2>
            <p>
              Lineage Collections reserves the right to update or modify this EULA at any time. Continued
              use of the Portal following notice of any changes constitutes your acceptance of the revised
              terms. It is your responsibility to review this agreement periodically.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">10. Governing Law</h2>
            <p>
              This EULA is governed by and construed in accordance with the laws of the State of Florida,
              United States, without regard to its conflict of law provisions. Any disputes arising under
              or in connection with this EULA shall be subject to the exclusive jurisdiction of the state
              and federal courts located in Florida.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold mb-2">11. Contact</h2>
            <p>
              Questions about this EULA should be directed to:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-primary underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>
            </p>
          </section>

        </div>

        {/* Footer nav */}
        <div className="mt-14 pt-6 border-t border-border flex flex-wrap gap-4 text-xs text-muted-foreground">
          <a href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="/auth" className="hover:text-foreground transition-colors">Sign In</a>
          <span className="ml-auto">© {new Date().getFullYear()} Lineage Collections LLC</span>
        </div>
      </main>
    </div>
  );
}
