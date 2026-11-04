import KioskApp from "@/components/KioskApp";

export default async function KioskPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <KioskApp slug={slug} />;
}
