import PRsCard from "./prs";
import TotalCommitsCard from "./total-commits";
import RepoMetricCard from "./total-repositories";

export function MetricsCard() {
  return (
    <div className="mb-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
      <RepoMetricCard />
      <TotalCommitsCard />
      <PRsCard />
    </div>
  );
}