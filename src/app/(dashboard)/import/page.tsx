import ImportWizard from "@/components/ImportWizard";

export default function ImportPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          Batch CSV Import
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Upload a CSV file to import tasks into a project
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
