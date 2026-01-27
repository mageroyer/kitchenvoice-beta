import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStoreData } from '@/lib/api';
import MarcheTemplate from '@/components/templates/MarcheTemplate';

interface PageProps {
  params: { slug: string };
}

/**
 * Generate metadata for SEO
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await getStoreData(params.slug);

  if (!data) {
    return {
      title: 'Store Not Found',
    };
  }

  return {
    title: data.seo.title || `${data.store.name} - Menu`,
    description: data.seo.description || data.store.tagline || `Decouvrez notre menu frais chez ${data.store.name}`,
    openGraph: {
      title: data.seo.title || data.store.name,
      description: data.seo.description || data.store.tagline,
      images: data.store.coverPhoto ? [data.store.coverPhoto] : [],
      type: 'website',
    },
  };
}

/**
 * Dynamic Store Page
 *
 * Renders the appropriate template based on store settings.
 * Uses ISR (Incremental Static Regeneration) for caching.
 */
export default async function StorePage({ params }: PageProps) {
  const data = await getStoreData(params.slug);

  if (!data) {
    notFound();
  }

  // Select template based on settings
  // For now, only Marche is implemented
  switch (data.settings.template) {
    case 'marche':
    default:
      return <MarcheTemplate data={data} />;
  }
}

/**
 * Enable ISR with 5-minute revalidation
 */
export const revalidate = 300;
