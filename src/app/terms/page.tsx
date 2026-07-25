import Link from "next/link";

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-800">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-8 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Back to Wah We Doin
        </Link>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 md:p-12">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 mb-2">
            Terms of Service
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            Effective Date: July 24, 2026 &middot; Last Updated: July 24, 2026
          </p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                1. Acceptance of Terms
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                By accessing or using Wah We Doin (the &quot;Service&quot;), you agree to be bound by these
                Terms of Service (&quot;Terms&quot;). If you do not agree to these Terms, do not use the
                Service. These Terms constitute a legally binding agreement between you and Lathan-Quinn Hoyte
                (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;).
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                2. Description of Service
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                Wah We Doin is a project management and team collaboration platform that provides task
                tracking, team workspaces, project organization, file management, and optional integration
                with third-party services such as Google Calendar, Google Drive, and Gmail.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                3. Account Registration
              </h2>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>You must be at least 13 years old to use the Service.</li>
                <li>You must provide accurate and complete information when creating an account.</li>
                <li>You are responsible for maintaining the security of your account credentials.</li>
                <li>You must not share your account with others or create multiple accounts for deceptive purposes.</li>
                <li>You must notify us immediately of any unauthorized use of your account.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                4. Acceptable Use
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>Violate any applicable law, regulation, or third-party rights</li>
                <li>Upload or transmit malware, viruses, or other harmful code</li>
                <li>Attempt to gain unauthorized access to the Service or other users&apos; accounts</li>
                <li>Interfere with or disrupt the integrity or performance of the Service</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                <li>Use the Service to send spam, phishing attempts, or unsolicited communications</li>
                <li>Scrape, crawl, or use automated means to access the Service without our written permission</li>
                <li>Impersonate another person or misrepresent your affiliation with any entity</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                5. Your Content
              </h2>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                Ownership
              </h3>
              <p className="text-slate-700 dark:text-slate-300">
                You retain all rights to the content you create, upload, or share through the Service
                (&quot;Your Content&quot;). We do not claim ownership over Your Content.
              </p>

              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                License Grant
              </h3>
              <p className="text-slate-700 dark:text-slate-300">
                By using the Service, you grant us a limited, non-exclusive license to host, store, and
                display Your Content solely for the purpose of operating and providing the Service to you.
                This license ends when you delete Your Content or your account.
              </p>

              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                Sharing
              </h3>
              <p className="text-slate-700 dark:text-slate-300">
                Content you create within a team is visible to all members of that team. You are responsible
                for managing access levels and ensuring sensitive content is only shared with appropriate
                team members.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                6. Third-Party Integrations
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                The Service offers optional integrations with third-party platforms (e.g., Google Workspace).
                These integrations are governed by both these Terms and the respective third-party&apos;s
                terms of service. When you connect a third-party account:
              </p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>You authorize us to access and use data from that service on your behalf</li>
                <li>You can revoke access at any time from the Service settings</li>
                <li>We are not responsible for the practices of third-party services</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                7. Intellectual Property
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                The Service, including its design, code, features, and branding, is owned by Lathan-Quinn Hoyte
                and protected by copyright, trademark, and other intellectual property laws. You may
                not copy, modify, distribute, sell, or lease any part of the Service without our written
                consent.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                8. Limitation of Liability
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                To the maximum extent permitted by law:
              </p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind.</li>
                <li>We do not warrant that the Service will be uninterrupted, error-free, or secure.</li>
                <li>We are not liable for any indirect, incidental, special, consequential, or punitive damages.</li>
                <li>Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim, or $100, whichever is greater.</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                9. Termination
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                You may terminate your account at any time through the Service settings or by contacting
                us. We reserve the right to suspend or terminate your access to the Service at our discretion,
                with or without notice, for conduct that violates these Terms or is harmful to other users,
                third parties, or the business interests of the Service.
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                Upon termination, your right to use the Service ceases immediately. We will make your data
                available for export for 30 days following termination.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                10. Changes to Terms
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                We may revise these Terms at any time by updating this page. Material changes will be
                communicated via the Service or by email. Your continued use of the Service after changes
                are posted constitutes your acceptance of the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                11. Governing Law
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                These Terms are governed by the laws of Barbados, without regard to its conflict of law
                provisions. Any disputes arising under these Terms shall be resolved in the competent courts
                of Barbados.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                12. Contact Us
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                If you have any questions about these Terms, please contact us at{" "}
                <a
                  href="mailto:lathanquinnh@gmail.com"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  lathanquinnh@gmail.com
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
