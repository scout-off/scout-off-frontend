import type { Scout } from '@/types';
import { fetchScoutProfile } from '@/lib/api';
import ActivityFeed from '@/components/scout/ActivityFeed';
import ScoutProfileCard from '@/components/scout/ScoutProfileCard';
import EmptyState from '@/components/ui/EmptyState';

type PageProps = {
  params: {
    locale: string;
    id: string;
  };
};

async function loadScoutProfile(scoutId: string): Promise<Scout | null> {
  try {
    return await fetchScoutProfile(scoutId);
  } catch {
    return null;
  }
}

export default async function ScoutProfilePage({ params }: PageProps) {
  const scout = await loadScoutProfile(params.id);

  if (!scout) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <EmptyState
          title="Scout not found"
          description="The scout profile you are looking for does not exist."
        />
      </div>
    );
  }

  return (
    <main className="max-w-5xl mx-auto py-10 px-4 flex flex-col gap-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold text-white">Scout Profile</h1>
        <p className="text-sm text-gray-400">
          Browse this scout&apos;s subscription details and recent activity.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <ScoutProfileCard scout={scout} />
          <ActivityFeed scoutId={scout.id} />
        </div>
      </div>
    </main>
  );
}
