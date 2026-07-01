'use client';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import ScoutDashboardContent from '@/components/scout/ScoutDashboardContent';

export default function ScoutDashboard() {
  return (
    <ErrorBoundary>
      <ScoutDashboardContent />
    </ErrorBoundary>
  );
}
