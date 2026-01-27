import Link from 'next/link';

/**
 * 404 Page for stores not found
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-marche-cream flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="text-6xl mb-4">?</div>
        <h1 className="text-3xl font-display font-bold text-marche-forest mb-4">
          Magasin introuvable
        </h1>
        <p className="text-gray-600 mb-8">
          Ce magasin n'existe pas ou n'a pas encore active son site web.
        </p>
        <Link
          href="https://smartcookbook-2afe2.web.app"
          className="inline-block bg-marche-forest text-white px-6 py-3 rounded-full font-semibold hover:bg-opacity-90 transition"
        >
          Retour a KitchenCommand
        </Link>
      </div>
    </div>
  );
}
