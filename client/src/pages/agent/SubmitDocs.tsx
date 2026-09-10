import { ExternalLink, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const COGNITO_FORM_URL = "https://www.cognitoforms.com/MidAtlanticDistribution1/PACTACT";

export default function SubmitDocs() {
  return (
    <div className="bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <header className="rounded-xl border bg-white px-4 py-3 shadow-sm sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <FileText className="h-5 w-5" />
              </span>
              <div>
                <h1 className="text-base font-bold text-slate-800">Submit Docs</h1>
                <p className="text-xs text-slate-500">Complete the MidAtlantic PACT ACT documentation form.</p>
              </div>
            </div>
            <Button asChild size="sm" variant="outline" data-testid="btn-open-submit-docs">
              <a href={COGNITO_FORM_URL} target="_blank" rel="noreferrer">
                Open in new tab <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </header>
        <div className="min-h-[720px] flex-1 overflow-hidden rounded-xl border bg-white shadow-sm">
          <iframe
            title="PACT ACT document submission form"
            src={COGNITO_FORM_URL}
            className="h-full min-h-[720px] w-full border-0"
            data-testid="iframe-submit-docs"
          />
        </div>
      </div>
    </div>
  );
}