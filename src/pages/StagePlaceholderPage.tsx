import { Layers } from 'lucide-react';
import { EmptyState, PageHeader } from '@/design-system';

export function StagePlaceholderPage({
  title,
  subtitle,
  stageLabel,
  summary,
}: {
  title: string;
  subtitle: string;
  stageLabel: string;
  summary: string;
}) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title={`Scheduled for ${stageLabel}`}
        description={summary}
      />
    </div>
  );
}