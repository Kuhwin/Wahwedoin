"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import Button from "@/components/ui/Button";

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename: string;
  label?: string;
}

export default function ExportButton({ data, filename, label = "Export CSV" }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    if (data.length === 0) return;
    setExporting(true);
    
    // Build CSV
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(h => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        // Escape quotes and wrap in quotes if contains comma/newline/quote
        if (str.includes(",") || str.includes("\n") || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(",")
    );
    
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    
    setTimeout(() => setExporting(false), 1000);
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleExport} disabled={exporting || data.length === 0}>
      <Download className="w-4 h-4 mr-1" />
      {exporting ? "Exporting..." : label}
    </Button>
  );
}
