import Link from 'next/link';

/**
 * Landing Page for kitchencommand.io
 *
 * Shows a simple landing when someone visits the root domain.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-marche-cream flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-4xl font-display font-bold text-marche-forest mb-4">
          KitchenCommand
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          Auto-generated websites for grocery stores with production kitchens.
        </p>
        <p className="text-sm text-gray-500 mb-8">
          Looking for your store? Visit{' '}
          <code className="bg-white px-2 py-1 rounded">your-store.kitchencommand.io</code>
        </p>
        <Link
          href="https://smartcookbook-2afe2.web.app"
          className="inline-block bg-marche-forest text-white px-6 py-3 rounded-full font-semibold hover:bg-opacity-90 transition"
        >
          Go to KitchenCommand App
        </Link>
      </div>
    </div>
  );
}
