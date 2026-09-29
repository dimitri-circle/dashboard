import { notFound } from "next/navigation";
import { WorkReview } from "@/components/WorkReview";
import { previewReviewSnapshot } from "@/lib/work-manager/preview";
import { getWorkReviewSnapshot } from "@/lib/work-manager/service";

export default async function WorkReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ item?: string }> }) {
  const { token } = await params;
  const { item } = await searchParams;
  if (process.env.NODE_ENV !== "production" && token === "preview") {
    return <WorkReview snapshot={previewReviewSnapshot} itemId={item} />;
  }

  try {
    return <WorkReview snapshot={await getWorkReviewSnapshot(token)} itemId={item} />;
  } catch {
    notFound();
  }
}
