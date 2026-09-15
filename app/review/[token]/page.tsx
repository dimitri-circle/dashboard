import { notFound } from "next/navigation";
import { WorkReview } from "@/components/WorkReview";
import { previewReviewSnapshot } from "@/lib/work-manager/preview";
import { getWorkReviewSnapshot } from "@/lib/work-manager/service";

export default async function WorkReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (process.env.NODE_ENV !== "production" && token === "preview") {
    return <WorkReview snapshot={previewReviewSnapshot} />;
  }

  try {
    return <WorkReview snapshot={await getWorkReviewSnapshot(token)} />;
  } catch {
    notFound();
  }
}
