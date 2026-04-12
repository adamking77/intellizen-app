import { ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";

type SignalCardProps = {
  title: string;
  url: string;
  source: string | null;
  publishedAt: string | null;
  watchDomain?: string | null;
  snippet: string | null;
  score: number | null;
  actions?: React.ReactNode;
};

export function SignalCard({
  title,
  url,
  source,
  publishedAt,
  watchDomain,
  snippet,
  score,
  actions,
}: SignalCardProps) {
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {watchDomain ? <Badge variant="accent">{watchDomain}</Badge> : null}
          <Badge variant="neutral">{source ?? "Unknown source"}</Badge>
          <Badge variant="neutral">{formatDate(publishedAt)}</Badge>
          {typeof score === "number" ? (
            <Badge variant="warning">Score {score.toFixed(2)}</Badge>
          ) : null}
        </div>
        <CardTitle className="text-xl leading-7">
          <a
            className="inline-flex items-start gap-2 hover:text-[var(--accent)]"
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <span>{title}</span>
            <ExternalLink className="mt-1 h-4 w-4 shrink-0" />
          </a>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-[var(--muted-foreground)]">
          {snippet ?? "No snippet available for this result."}
        </p>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </CardContent>
    </Card>
  );
}
