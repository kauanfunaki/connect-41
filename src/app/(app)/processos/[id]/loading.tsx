import { SkeletonBack, SkeletonPageHeader, SkeletonBlocks } from "@/components/shared/SkeletonParts";

export default function LoadingProcesso() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <SkeletonBack />
      <SkeletonPageHeader />
      <SkeletonBlocks />
    </div>
  );
}
