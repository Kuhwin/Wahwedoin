import Link from "next/link";

export default function PrivacyPolicy() {
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
            Privacy Policy
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-8">
            Effective Date: July 24, 2026 &middot; Last Updated: July 24, 2026
          </p>

          <div className="prose prose-slate dark:prose-invert max-w-none text-sm leading-relaxed space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                1. Introduction
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                Wah We Doin (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) is a project management platform
                operated by Lathan-Quinn Hoyte. This Privacy Policy explains how we collect, use, disclose,
                and safeguard your information when you use our web application and related services
                (collectively, the &quot;Service&quot;).
              </p>
              <p className="text-slate-700 dark:text-slate-300">
                By using the Service, you agree to the collection and use of information in accordance with
                this policy. If you do not agree, please discontinue use of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                2. Information We Collect
              </h2>
              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                Account Information
              </h3>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>Name and email address (provided via Google OAuth or email/password sign-up)</li>
                <li>Profile picture (if provided through Google or uploaded manually)</li>
                <li>User ID and authentication tokens</li>
              </ul>

              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                Content You Create
              </h3>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>Projects, tasks, subtasks, comments, and notes</li>
                <li>Team names, descriptions, and member lists</li>
                <li>File attachments you upload</li>
                <li>Custom fields and field values</li>
              </ul>

              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                Google Account Data (Optional)
              </h3>
              <p className="text-slate-700 dark:text-slate-300">
                If you choose to link additional Google accounts, we request access to:
              </p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Google Calendar</strong> &mdash; to display your events within the app</li>
                <li><strong>Google Drive</strong> (read-only) &mdash; to access and attach files from your Drive</li>
                <li><strong>Gmail</strong> (read-only) &mdash; to surface relevant emails alongside your projects</li>
              </ul>
              <p className="text-slate-700 dark:text-slate-300">
                We store only the OAuth tokens necessary to access these services on your behalf. We do not
                store the content of your calendar events, Drive files, or emails beyond what is needed to
                display them within the Service.
              </p>

              <h3 className="text-lg font-medium text-slate-900 dark:text-slate-100 mt-4 mb-2">
                Usage Data
              </h3>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>Log data (IP address, browser type, pages visited, timestamps)</li>
                <li>Feature interaction data for improving the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                3. How We Use Your Information
              </h2>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>To provide, maintain, and improve the Service</li>
                <li>To authenticate your identity and manage your account</li>
                <li>To sync your projects, tasks, and team data across devices</li>
                <li>To integrate with third-party services (Google) at your request</li>
                <li>To send important service-related notifications (e.g., task reminders, team invites)</li>
                <li>To detect and prevent fraud, abuse, and security incidents</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                4. How We Share Your Information
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                We do <strong>not</strong> sell your personal information. We may share information with:
              </p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li><strong>Team members</strong> &mdash; your name, email, and avatar are visible to members of teams you belong to</li>
                <li><strong>Service providers</strong> &mdash; third-party vendors who assist in operating the Service (e.g., Supabase for hosting and database, Vercel for deployment)</li>
                <li><strong>Legal requirements</strong> &mdash; if required by law, regulation, or valid legal process</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                5. Data Security
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                We implement industry-standard security measures including encryption in transit (TLS/HTTPS),
                encrypted storage, role-based access controls, and row-level security policies. However, no
                method of electronic transmission or storage is 100% secure, and we cannot guarantee absolute
                security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                6. Data Retention
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                We retain your data for as long as your account is active. If you delete your account, we
                will remove your personal data within 30 days, except where we are required to retain certain
                records for legal or legitimate business purposes. Team data you contributed to may persist
                after your account deletion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                7. Your Rights
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                Depending on your jurisdiction, you may have the right to:
              </p>
              <ul className="list-disc list-inside text-slate-700 dark:text-slate-300 space-y-1">
                <li>Access the personal data we hold about you</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your personal data</li>
                <li>Revoke consent for data processing (including revoking Google account access)</li>
                <li>Export your data in a portable format</li>
              </ul>
              <p className="text-slate-700 dark:text-slate-300">
                To exercise these rights, contact us at the email address below.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                8. Google API Services
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                Our use of information received from Google APIs adheres to the{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. We use Google data solely to provide the features
                you have explicitly opted into within the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                9. Children&apos;s Privacy
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                The Service is not intended for children under 13. We do not knowingly collect personal
                information from children. If you believe a child has provided us with personal data,
                please contact us so we can delete it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                10. Changes to This Policy
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                We may update this Privacy Policy from time to time. We will notify you of material changes
                by posting the updated policy on this page with a revised effective date. Continued use of
                the Service after changes are posted constitutes acceptance of the updated policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-8 mb-3">
                11. Contact Us
              </h2>
              <p className="text-slate-700 dark:text-slate-300">
                If you have any questions about this Privacy Policy, please contact us at{" "}
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
