import { useState, useEffect } from 'react';
import { BrowserRouter as Router, useNavigate, useLocation } from 'react-router-dom';
import { logoutUser } from './services/auth/firebaseAuth';
import { ROUTES } from './constants/routes';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AccessProvider, useAccess } from './contexts/AccessContext';
import MenuBar from './components/layout/MenuBar';
import PinModal from './components/common/PinModal';
import BetaBanner from './components/common/BetaBanner';
import FeedbackButton from './components/common/FeedbackButton';
import GuidedTour from './components/common/GuidedTour';
import Timer from './components/common/Timer';
import { isDemoMode } from './services/demo/demoService';

// Custom hooks for app state management
import { useCloudSync } from './hooks/useCloudSync';
import { useAppState } from './hooks/useAppState';
import { useInventoryAlerts } from './hooks/useInventoryAlerts';

// Routes component
import AppRoutes from './AppRoutes';

// ============================================
// DEV ONLY: Helper to clear cache (call from browser console)
// Usage: In browser console, type: clearAppCache()
// ============================================
if (import.meta.env.DEV) {
  window.clearAppCache = async () => {
    console.log('🗑️ Clearing all cached data...');
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          await new Promise((resolve, reject) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = () => {
              console.log(`  ✓ Deleted IndexedDB: ${db.name}`);
              resolve();
            };
            req.onerror = () => reject(req.error);
            req.onblocked = () => {
              console.warn(`  ⚠️ Database ${db.name} is blocked`);
              resolve();
            };
          });
        }
      }
      // Clear localStorage except auth
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.includes('firebase:authUser')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      console.log('✅ Cache cleared! Refreshing...');
      window.location.reload();
    } catch (error) {
      console.error('❌ Error:', error);
    }
  };

  // Full reset - clears EVERYTHING including Firebase auth
  window.fullReset = async () => {
    console.log('🔥 FULL RESET - Clearing ALL data including Firebase auth...');
    try {
      // Sign out from Firebase first
      const { getAuth, signOut } = await import('firebase/auth');
      const auth = getAuth();
      try {
        await signOut(auth);
        console.log('  ✓ Signed out from Firebase');
      } catch (e) {
        console.log('  ⚠️ No user to sign out');
      }

      // Delete ALL IndexedDB databases
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          await new Promise((resolve) => {
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = () => {
              console.log(`  ✓ Deleted IndexedDB: ${db.name}`);
              resolve();
            };
            req.onerror = () => {
              console.warn(`  ⚠️ Failed to delete: ${db.name}`);
              resolve();
            };
            req.onblocked = () => {
              console.warn(`  ⚠️ Database ${db.name} is blocked - close other tabs`);
              resolve();
            };
          });
        }
      }

      // Clear ALL localStorage
      localStorage.clear();
      console.log('  ✓ localStorage cleared');

      // Clear ALL sessionStorage
      sessionStorage.clear();
      console.log('  ✓ sessionStorage cleared');

      console.log('✅ FULL RESET complete! Redirecting to landing page...');
      window.location.href = '/';
    } catch (error) {
      console.error('❌ Error during full reset:', error);
    }
  };

  console.log('💡 DEV: Type clearAppCache() to clear data (keeps login)');
  console.log('💡 DEV: Type fullReset() to clear EVERYTHING (logout + fresh start)');
}
// ============================================
// Expose inventoryItemDB globally for console access
// Usage: inventoryItemDB.getAll() to view inventory items
// ============================================
import('./services/database/indexedDB').then(({ inventoryItemDB }) => {
  window.inventoryItemDB = inventoryItemDB;
  console.log('💡 inventoryItemDB available. Run inventoryItemDB.getAll() to view inventory items.');
});

import './styles/global.css';

import Button from './components/common/Button';
import Input from './components/common/Input';
import Modal from './components/common/Modal';
import Dropdown from './components/common/Dropdown';
import SearchBar from './components/common/SearchBar';
import Card from './components/common/Card';
import Badge from './components/common/Badge';
import Alert from './components/common/Alert';
import RecipeCard from './components/recipes/RecipeCard';
import IngredientList from './components/recipes/IngredientList';
import RecipeList from './components/recipes/RecipeList';
import MethodSteps from './components/recipes/MethodSteps';
import PlatingInstructions from './components/recipes/PlatingInstructions';
import Notes from './components/recipes/Notes';

// Component Showcase Page
function HomePage({ micFlag = false }) {
  const [inputValue, setInputValue] = useState('');
  const [voiceActive, setVoiceActive] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVoiceActive, setSearchVoiceActive] = useState(false);
  const [ingredients, setIngredients] = useState([
    { grouped: false, metric: '240g', quantity: '1', unit: 'cup', name: 'flour', specification: 'sifted' },
    { grouped: false, metric: '200g', quantity: '1', unit: 'cup', name: 'sugar', specification: '' },
    { grouped: true, metric: '150g', quantity: '3', unit: '', name: 'eggs', specification: 'beaten' },
    { grouped: true, metric: '150g', quantity: '1', unit: 'large', name: 'onion', specification: 'diced' },
    { grouped: false, metric: '250ml', quantity: '1', unit: 'cup', name: 'milk', specification: '' },
  ]);
  const [showAlert, setShowAlert] = useState(true);
  const [methodSteps, setMethodSteps] = useState([
    'Preheat oven to 350°F (175°C) and grease a 9-inch round cake pan',
    'In a large bowl, sift together flour and sugar',
    'Beat the eggs in a separate bowl until light and fluffy',
    'Combine wet and dry ingredients, mixing until just combined',
    'Pour batter into prepared pan and bake for 30-35 minutes',
    'Let cool for 10 minutes before removing from pan',
  ]);

  const [platingInstructions, setPlatingInstructions] = useState(null); // null = not created, [] = created but empty

  const [notes, setNotes] = useState(null); // null = not created, [] = created but empty

  return (
    <div className="p-xl">
      <h1>SmartCookBook - Component Library 🎨</h1>
      <p className="mt-md">Week 2 Progress: Common components extracted!</p>

      {/* DEV ONLY: Link to utilities page */}
      {import.meta.env.DEV && (
        <div style={{ marginTop: '20px', marginBottom: '10px' }}>
          <a
            href="/utilities"
            style={{
              padding: '12px 24px',
              background: '#3498db',
              color: 'white',
              borderRadius: '8px',
              textDecoration: 'none',
              display: 'inline-block',
              fontWeight: 'bold'
            }}
          >
            🛠️ View Utilities Library →
          </a>
        </div>
      )}

      {micFlag && (
        <div className="info-message mt-lg">
          🎤 Voice Mode Active - Click any input field or search bar to start voice input!
        </div>
      )}

      <div className="success-message mt-lg">
        ✅ 17 Components Extracted: MenuBar, Button, Input, Modal, Dropdown, SearchBar, Card, Badge, Spinner, Timer, Alert, RecipeCard, IngredientList, RecipeList, MethodSteps, PlatingInstructions, Notes
      </div>

      {/* MenuBar Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          MenuBar Component (Header)
        </h2>
        <p style={{ marginBottom: '15px', color: '#666' }}>
          The MenuBar is already shown at the top of this page. It includes:
        </p>
        <ul style={{ marginBottom: '15px', color: '#666', paddingLeft: '20px' }}>
          <li>App logo and title</li>
          <li>Navigation menu (Home, Recipes, Add Recipe, Settings)</li>
          <li>Global voice mode toggle (🎤 button)</li>
          <li>Responsive hamburger menu for mobile</li>
        </ul>
        <Card padding="medium">
          <h4 style={{ margin: '0 0 10px 0' }}>Features:</h4>
          <ul style={{ paddingLeft: '20px', lineHeight: '1.8' }}>
            <li><strong>Voice Toggle:</strong> Click the 🎤 button in the header to enable/disable global voice mode</li>
            <li><strong>Active Route:</strong> Current page is highlighted in the navigation</li>
            <li><strong>Sticky Positioning:</strong> Header stays visible when scrolling</li>
            <li><strong>Props:</strong> micFlag (boolean), onMicToggle (function)</li>
          </ul>
        </Card>
      </section>

      {/* Button Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Button Component
        </h2>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="link">Link Button</Button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <Button size="small">Small</Button>
          <Button size="medium">Medium</Button>
          <Button size="large">Large</Button>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <Button loading>Loading...</Button>
          <Button disabled>Disabled</Button>
          <Button fullWidth>Full Width Button</Button>
        </div>
      </section>

      {/* Input Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Input Component
        </h2>

        <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Input
            label="Recipe Name"
            placeholder="Enter recipe name..."
            required
          />

          <Input
            label="Voice Input Demo (Start voice to see flashing green mic!)"
            placeholder="Type or speak..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            showVoice
            showSend
            voiceActive={voiceActive}
            onVoiceClick={() => {
              console.log('Voice clicked! Stopping voice input');
              setVoiceActive(false);
            }}
            onSendClick={() => {
              alert(`Sending: "${inputValue}"`);
              setInputValue('');
            }}
            helperText={
              voiceActive
                ? '🟢 ACTIVE: Voice recording! Mic is FLASHING GREEN. Click mic to stop.'
                : '⚪ INACTIVE: No mic button shown. Use the button below to start voice.'
            }
          />

          <div style={{ marginTop: '10px', padding: '10px', background: '#ecf0f1', borderRadius: '5px' }}>
            <div style={{ marginBottom: '10px' }}>
              <strong>Current State:</strong> voiceActive = {voiceActive ? '✅ TRUE (Green mic visible)' : '❌ FALSE (No mic button)'}
            </div>
            <Button
              variant={voiceActive ? 'danger' : 'primary'}
              onClick={() => setVoiceActive(!voiceActive)}
            >
              {voiceActive ? '⏹️ Stop Voice Input' : '🎤 Start Voice Input'}
            </Button>
          </div>

          <Input
            label="With Helper Text"
            placeholder="Enter portions..."
            helperText="Enter the number of servings this recipe makes"
            type="number"
          />

          <Input
            label="With Error"
            placeholder="This field has an error..."
            error
            errorMessage="This field is required"
          />

          <Input
            label="Multiline (Textarea)"
            placeholder="Enter cooking instructions..."
            multiline
            rows={4}
          />

          <Input
            label="Disabled Input"
            value="This is disabled"
            disabled
          />
        </div>
      </section>

      {/* SearchBar Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          SearchBar Component
        </h2>

        <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <SearchBar
            value={searchQuery}
            onChange={(value) => {
              console.log('Search query (debounced):', value);
              setSearchQuery(value);
            }}
            placeholder="Search recipes (type or use voice)..."
            onSearch={(query) => alert(`Searching for: "${query}"`)}
            showVoice
            voiceActive={searchVoiceActive}
            onVoiceClick={() => {
              console.log('Search voice clicked! Stopping voice search');
              setSearchVoiceActive(false);
            }}
          />

          <div style={{ padding: '10px', background: '#ecf0f1', borderRadius: '5px' }}>
            <div style={{ marginBottom: '10px' }}>
              <strong>Current Search:</strong> {searchQuery || '(empty)'}
            </div>
            <div style={{ marginBottom: '10px' }}>
              <strong>Voice State:</strong> searchVoiceActive = {searchVoiceActive ? '✅ TRUE (Green mic visible)' : '❌ FALSE (Clear button shows if has text)'}
            </div>
            <Button
              variant={searchVoiceActive ? 'danger' : 'primary'}
              onClick={() => setSearchVoiceActive(!searchVoiceActive)}
              size="small"
            >
              {searchVoiceActive ? '⏹️ Stop Voice Search' : '🎤 Start Voice Search'}
            </Button>
          </div>

          <SearchBar
            placeholder="Small search..."
            size="small"
          />

          <SearchBar
            placeholder="Large search..."
            size="large"
          />

          <SearchBar
            placeholder="Disabled search..."
            disabled
          />
        </div>
      </section>

      {/* Dropdown Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Dropdown Component
        </h2>

        <div style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Dropdown
            label="Recipe Category"
            options={[
              'Appetizers',
              'Main Courses',
              'Desserts',
              'Beverages',
              'Salads',
              'Soups'
            ]}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            placeholder="Select a category..."
            required
          />

          <div style={{ padding: '10px', background: '#ecf0f1', borderRadius: '5px' }}>
            <strong>Selected Category:</strong> {selectedCategory || '(none)'}
          </div>

          <Dropdown
            label="With Object Options"
            options={[
              { value: 'easy', label: 'Easy (< 30 min)' },
              { value: 'medium', label: 'Medium (30-60 min)' },
              { value: 'hard', label: 'Hard (> 60 min)' }
            ]}
            placeholder="Select difficulty..."
          />

          <Dropdown
            label="With Error"
            options={['Option 1', 'Option 2']}
            error
            errorMessage="Please select an option"
          />

          <Dropdown
            label="Small Size"
            options={['Small 1', 'Small 2']}
            size="small"
          />

          <Dropdown
            label="Disabled"
            options={['Can\'t select']}
            disabled
          />
        </div>
      </section>

      {/* Modal Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Modal Component
        </h2>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <Button onClick={() => setShowModal(true)}>
            Open Modal
          </Button>
        </div>

        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title="Demo Modal"
          footer={
            <>
              <Button variant="secondary" onClick={() => setShowModal(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => {
                alert('Confirmed!');
                setShowModal(false);
              }}>
                Confirm
              </Button>
            </>
          }
        >
          <p>This is a fully functional modal with:</p>
          <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
            <li>✅ Backdrop click to close</li>
            <li>✅ Escape key to close</li>
            <li>✅ Body scroll lock when open</li>
            <li>✅ Custom footer with action buttons</li>
            <li>✅ Smooth animations</li>
          </ul>

          <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '5px' }}>
            <strong>Try these:</strong>
            <ul style={{ marginLeft: '20px', marginTop: '10px' }}>
              <li>Press <code>Escape</code> to close</li>
              <li>Click outside the modal (backdrop) to close</li>
              <li>Click the red X button to close</li>
              <li>Use the Cancel/Confirm buttons</li>
            </ul>
          </div>
        </Modal>
      </section>

      {/* Card Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Card Component
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <Card title="Recipe Card" subtitle="Chocolate Cake">
            <p>A delicious chocolate cake recipe with rich frosting and moist layers.</p>
            <div style={{ marginTop: '10px' }}>
              <Badge variant="success">Easy</Badge>{' '}
              <Badge variant="info" outlined>30 min</Badge>
            </div>
          </Card>

          <Card hoverable clickable onClick={() => alert('Card clicked!')} title="Hoverable Card">
            <p>Hover over me! I lift up and show a shadow. Click me too!</p>
          </Card>

          <Card
            variant="outlined"
            header={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 'bold' }}>Custom Header</span>
              <Badge variant="danger" rounded>New</Badge>
            </div>}
            footer={
              <>
                <Button variant="secondary" size="small">Cancel</Button>
                <Button variant="primary" size="small">Save</Button>
              </>
            }
          >
            <p>Card with custom header and footer sections.</p>
          </Card>

          <Card variant="flat" padding="large">
            <p>Flat variant with large padding. No shadow or border.</p>
          </Card>
        </div>
      </section>

      {/* Badge Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Badge Component
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <strong>Color Variants:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <Badge variant="primary">Primary</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="danger">Danger</Badge>
              <Badge variant="info">Info</Badge>
            </div>
          </div>

          <div>
            <strong>Outlined Style:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <Badge variant="primary" outlined>Primary</Badge>
              <Badge variant="success" outlined>Success</Badge>
              <Badge variant="danger" outlined>Danger</Badge>
            </div>
          </div>

          <div>
            <strong>Sizes:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <Badge variant="primary" size="small">Small</Badge>
              <Badge variant="primary" size="medium">Medium</Badge>
              <Badge variant="primary" size="large">Large</Badge>
            </div>
          </div>

          <div>
            <strong>Rounded (Pills):</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
              <Badge variant="success" rounded>Active</Badge>
              <Badge variant="warning" rounded>Pending</Badge>
              <Badge variant="danger" rounded>Inactive</Badge>
            </div>
          </div>

          <div>
            <strong>Dot Badges (Status Indicators):</strong>
            <div style={{ display: 'flex', gap: '15px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <Badge variant="success" dot />
                <span>Online</span>
              </div>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <Badge variant="warning" dot />
                <span>Away</span>
              </div>
              <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                <Badge variant="danger" dot />
                <span>Offline</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Spinner Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Spinner Component
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <strong>Circle Spinner (Sizes):</strong>
            <div style={{ display: 'flex', gap: '20px', marginTop: '10px', alignItems: 'center' }}>
              <Spinner size="small" />
              <Spinner size="medium" />
              <Spinner size="large" />
            </div>
          </div>

          <div>
            <strong>Dots Spinner:</strong>
            <div style={{ display: 'flex', gap: '20px', marginTop: '10px', alignItems: 'center' }}>
              <Spinner variant="dots" size="small" />
              <Spinner variant="dots" size="medium" />
              <Spinner variant="dots" size="large" />
            </div>
          </div>

          <div>
            <strong>Bars Spinner:</strong>
            <div style={{ display: 'flex', gap: '20px', marginTop: '10px', alignItems: 'center' }}>
              <Spinner variant="bars" size="small" />
              <Spinner variant="bars" size="medium" />
              <Spinner variant="bars" size="large" />
            </div>
          </div>

          <div>
            <strong>Colors:</strong>
            <div style={{ display: 'flex', gap: '20px', marginTop: '10px', alignItems: 'center' }}>
              <Spinner color="primary" />
              <Spinner color="secondary" />
              <div style={{ background: '#333', padding: '10px', borderRadius: '5px' }}>
                <Spinner color="white" />
              </div>
            </div>
          </div>

          <div>
            <strong>In Buttons:</strong>
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <Button disabled>
                <Spinner size="small" color="white" /> Loading...
              </Button>
              <Button variant="secondary" disabled>
                <Spinner size="small" variant="dots" /> Processing...
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Timer Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Timer Component
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          <Timer
            initialMinutes={1}
            onComplete={() => alert('Timer complete!')}
          />

          <Timer
            initialMinutes={5}
            autoStart
            compact
            onComplete={() => console.log('Compact timer done!')}
          />
        </div>
      </section>

      {/* RecipeCard Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          RecipeCard Component
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          <RecipeCard
            recipe={{
              id: '1',
              name: 'Chocolate Cake',
              category: 'Desserts',
              portions: 8,
              ingredients: [
                { quantity: '2', unit: 'cups', name: 'flour' },
                { quantity: '1.5', unit: 'cups', name: 'sugar' },
                { quantity: '3/4', unit: 'cup', name: 'cocoa powder' },
                { quantity: '3', unit: '', name: 'eggs' },
              ],
              method: 'Mix dry ingredients. Add eggs and milk. Bake at 350°F for 30 minutes.',
              department: 'Pastry Kitchen',
            }}
            onClick={(recipe) => alert(`View recipe: ${recipe.name}`)}
            onEdit={(recipe) => alert(`Edit recipe: ${recipe.name}`)}
            onDelete={(recipe) => alert(`Delete recipe: ${recipe.name}`)}
          />

          <RecipeCard
            recipe={{
              id: '2',
              name: 'Caesar Salad',
              category: 'Salads',
              portions: 4,
              ingredients: [
                { quantity: '1', unit: 'head', name: 'romaine lettuce' },
                { quantity: '1/2', unit: 'cup', name: 'parmesan cheese' },
              ],
              method: 'Chop lettuce, add dressing and croutons.',
              department: 'Cold Kitchen',
              imageUrl: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400',
            }}
            onClick={(recipe) => console.log('Clicked:', recipe.name)}
            onEdit={(recipe) => console.log('Edit:', recipe.name)}
            onDelete={(recipe) => console.log('Delete:', recipe.name)}
          />

          <RecipeCard
            recipe={{
              id: '3',
              name: 'Spaghetti Carbonara',
              category: 'Main Courses',
              portions: 2,
              ingredients: [
                { quantity: '200', unit: 'g', name: 'spaghetti' },
                { quantity: '100', unit: 'g', name: 'pancetta' },
                { quantity: '2', unit: '', name: 'eggs' },
                { quantity: '50', unit: 'g', name: 'parmesan' },
                { quantity: '1', unit: 'clove', name: 'garlic' },
                { quantity: '2', unit: 'tbsp', name: 'olive oil' },
                { quantity: '1', unit: 'tsp', name: 'black pepper' },
              ],
              method: 'Cook pasta. Fry pancetta with garlic. Mix eggs and cheese. Combine everything while hot. The heat from the pasta will cook the eggs to create a creamy sauce. Season with black pepper.',
              department: 'Hot Kitchen',
            }}
            onClick={(recipe) => console.log('Clicked:', recipe.name)}
          />
        </div>
      </section>

      {/* IngredientList Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          IngredientList Component
        </h2>

        <Card padding="medium">
          <IngredientList
            ingredients={ingredients}
            onChange={(newIngredients) => {
              console.log('Ingredients updated:', newIngredients);
              setIngredients(newIngredients);
            }}
            editable
            showVoice
            voiceActive={false}
            onVoiceClick={() => alert('Voice dictation for bulk ingredient input!')}
            micFlag={micFlag}
          />
        </Card>

        <div style={{ marginTop: '20px' }}>
          <Card variant="outlined" padding="medium">
            <h4 style={{ margin: '0 0 10px 0' }}>Read-Only Mode</h4>
            <IngredientList
              ingredients={ingredients}
              editable={false}
            />
          </Card>
        </div>
      </section>

      {/* MethodSteps Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          MethodSteps Component
        </h2>

        <Card padding="medium">
          <MethodSteps
            steps={methodSteps}
            onChange={(newSteps) => {
              console.log('Method steps updated:', newSteps);
              setMethodSteps(newSteps);
            }}
            editable
            micFlag={micFlag}
            showVoice
            voiceActive={false}
            onVoiceClick={() => alert('Bulk voice dictation for method steps!')}
          />
        </Card>

        <div style={{ marginTop: '20px' }}>
          <Card variant="outlined" padding="medium">
            <h4 style={{ margin: '0 0 10px 0' }}>Read-Only Mode</h4>
            <MethodSteps
              steps={methodSteps}
              editable={false}
            />
          </Card>
        </div>
      </section>

      {/* PlatingInstructions Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          PlatingInstructions Component (Conditional)
        </h2>

        {platingInstructions === null ? (
          <Button
            variant="secondary"
            size="medium"
            onClick={() => setPlatingInstructions([])}
          >
            + Add Plating Instructions
          </Button>
        ) : (
          <Card padding="medium">
            <PlatingInstructions
              instructions={platingInstructions}
              onChange={(newInstructions) => {
                console.log('Plating instructions updated:', newInstructions);
                setPlatingInstructions(newInstructions); // Will be null if all instructions deleted
              }}
              editable
              micFlag={micFlag}
              showVoice
              voiceActive={false}
              onVoiceClick={() => alert('Bulk voice dictation for plating instructions!')}
            />
          </Card>
        )}

        {platingInstructions !== null && (
          <div style={{ marginTop: '20px' }}>
            <Card variant="outlined" padding="medium">
              <h4 style={{ margin: '0 0 10px 0' }}>Read-Only Mode</h4>
              <PlatingInstructions
                instructions={platingInstructions}
                editable={false}
              />
            </Card>
          </div>
        )}
      </section>

      {/* Notes Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Notes Component (Conditional)
        </h2>

        {notes === null ? (
          <Button
            variant="secondary"
            size="medium"
            onClick={() => setNotes([])}
          >
            + Add Notes
          </Button>
        ) : (
          <Card padding="medium">
            <Notes
              notes={notes}
              onChange={(newNotes) => {
                console.log('Notes updated:', newNotes);
                setNotes(newNotes); // Will be null if all notes deleted
              }}
              editable
              micFlag={micFlag}
              showVoice
              voiceActive={false}
              onVoiceClick={() => alert('Bulk voice dictation for notes!')}
            />
          </Card>
        )}

        {notes !== null && (
          <div style={{ marginTop: '20px' }}>
            <Card variant="outlined" padding="medium">
              <h4 style={{ margin: '0 0 10px 0' }}>Read-Only Mode</h4>
              <Notes
                notes={notes}
                editable={false}
              />
            </Card>
          </div>
        )}
      </section>

      <div className="info-message mt-xl">
        🎯 Try the components above! All are fully functional and reusable.
      </div>

      {/* Alert Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          Alert Component
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', maxWidth: '600px' }}>
          <Alert variant="success" show={showAlert} dismissible onDismiss={() => setShowAlert(false)}>
            Recipe saved successfully! Your changes have been saved to the database.
          </Alert>

          <Alert variant="info" title="Pro Tip">
            Use voice dictation to add ingredients faster! Just click the microphone button.
          </Alert>

          <Alert variant="warning">
            Low storage space. Consider archiving old recipes to free up space.
          </Alert>

          <Alert variant="danger" title="Connection Error">
            Failed to sync with cloud. Check your internet connection and try again.
          </Alert>

          <Alert variant="success" icon="🎉">
            Congratulations! You've created 100 recipes!
          </Alert>
        </div>
      </section>

      {/* RecipeList Showcase */}
      <section className="mt-xl">
        <h2 style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '15px' }}>
          RecipeList Component
        </h2>

        <RecipeList
          recipes={[
            {
              id: '1',
              name: 'Chocolate Cake',
              category: 'Desserts',
              portions: 8,
              ingredients: [
                { quantity: '2', unit: 'cups', name: 'flour' },
                { quantity: '1.5', unit: 'cups', name: 'sugar' },
              ],
              method: 'Mix and bake at 350°F for 30 minutes.',
              department: 'Pastry Kitchen',
            },
            {
              id: '2',
              name: 'Caesar Salad',
              category: 'Salads',
              portions: 4,
              ingredients: [
                { quantity: '1', unit: 'head', name: 'romaine lettuce' },
              ],
              method: 'Chop lettuce, add dressing.',
              department: 'Cold Kitchen',
              imageUrl: 'https://images.unsplash.com/photo-1546793665-c74683f339c1?w=400',
            },
            {
              id: '3',
              name: 'Tomato Soup',
              category: 'Soups',
              portions: 6,
              ingredients: [
                { quantity: '2', unit: 'lbs', name: 'tomatoes' },
              ],
              method: 'Simmer and blend.',
              department: 'Hot Kitchen',
            },
          ]}
          onRecipeClick={(recipe) => alert(`View: ${recipe.name}`)}
          onRecipeEdit={(recipe) => alert(`Edit: ${recipe.name}`)}
          onRecipeDelete={(recipe) => alert(`Delete: ${recipe.name}`)}
          micFlag={micFlag}
        />
      </section>

      <div className="warning-message mt-lg">
        📊 Progress: 15 components extracted - Week 2 Complete! 🎉
      </div>
    </div>
  );
}

// RecipesPage removed - now using RecipeListPage component

function AccountingHubPage() {
  const navigate = useNavigate();

  return (
    <div className="p-xl" style={{ maxWidth: '900px', margin: '0 auto' }}>
      <h1>Accounting</h1>
      <p className="mt-md" style={{ color: '#666' }}>Invoice processing and ingredient price management</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '20px', marginTop: '30px' }}>
        <Card
          hoverable
          clickable
          onClick={() => navigate(ROUTES.INVOICE_UPLOAD)}
          style={{ textAlign: 'center', padding: '30px 20px' }}
        >
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📤</div>
          <h3 style={{ margin: '0 0 10px 0' }}>Upload Invoice</h3>
          <p style={{ color: '#666', margin: 0, fontSize: '14px' }}>
            Scan or upload vendor invoices. AI extracts items and prices automatically.
          </p>
        </Card>

        <Card
          hoverable
          clickable
          onClick={() => navigate('/invoices/list')}
          style={{ textAlign: 'center', padding: '30px 20px' }}
        >
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📋</div>
          <h3 style={{ margin: '0 0 10px 0' }}>View Invoices</h3>
          <p style={{ color: '#666', margin: 0, fontSize: '14px' }}>
            Manage saved invoices. Filter, review, and track status.
          </p>
        </Card>

        <Card
          hoverable
          clickable
          onClick={() => navigate(ROUTES.INGREDIENTS)}
          style={{ textAlign: 'center', padding: '30px 20px' }}
        >
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>🥕</div>
          <h3 style={{ margin: '0 0 10px 0' }}>Ingredients</h3>
          <p style={{ color: '#666', margin: 0, fontSize: '14px' }}>
            View and manage ingredient prices. Track costs over time.
          </p>
        </Card>
      </div>

      <div style={{ marginTop: '30px', padding: '20px', background: '#f8f9fa', borderRadius: '8px' }}>
        <h4 style={{ margin: '0 0 10px 0' }}>Coming Soon</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#666', lineHeight: '1.8' }}>
          <li>QuickBooks Online integration</li>
          <li>Automatic bill creation</li>
          <li>Recipe food cost calculations</li>
          <li>Vendor management</li>
        </ul>
      </div>
    </div>
  );
}

// Main App Content (inside Router)
function AppContent() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const {
    currentDepartment,
    isOwner,
    isEditor,
    authenticateWithPin,
    logout: accessLogout,
    userName,
    switchDepartment
  } = useAccess();

  // Custom hooks for extracted state management
  const { syncStatus } = useCloudSync(isAuthenticated, authLoading);
  const {
    micFlag,
    keypadFlag,
    showTimer,
    runTour,
    handleMicToggle,
    handleKeypadToggle,
    handleTimerToggle,
    handleTimerClose,
    handleTourComplete
  } = useAppState();
  const { criticalStockCount, lowStockCount } = useInventoryAlerts(isAuthenticated, authLoading, isOwner);

  // Remaining local state
  const [departments, setDepartments] = useState([]);
  const [currentRecipe, setCurrentRecipe] = useState(null);
  const [currentPrivilege, setCurrentPrivilege] = useState(null);

  // PIN Modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);

  // isUnlocked is derived from access context (has edit privileges)
  const isUnlocked = isOwner || isEditor;

  // Get access level string
  const accessLevel = isOwner ? 'owner' : isEditor ? 'editor' : 'viewer';

  // Load departments when authenticated OR in demo mode
  useEffect(() => {
    const inDemo = isDemoMode();

    // Skip if not authenticated and not in demo mode
    if ((!isAuthenticated && !inDemo) || authLoading) return;

    const loadDepartments = async () => {
      // In demo mode, use demo departments
      if (inDemo) {
        const { DEMO_DEPARTMENTS } = await import('./services/demo/demoData');
        const deptNames = DEMO_DEPARTMENTS.map(d => d.name);
        setDepartments(deptNames);
        console.log('📋 Demo departments loaded:', deptNames);
        return;
      }

      // Real mode: load from database
      try {
        const { departmentDB } = await import('./services/database/indexedDB');
        const depts = await departmentDB.getAll();
        const deptNames = depts.map(d => d.name);
        setDepartments(deptNames.length > 0 ? deptNames : ['Cuisine']);
      } catch (error) {
        console.error('Error loading departments:', error);
        setDepartments(['Cuisine']);
      }
    };

    loadDepartments();

    // Listen for department changes
    const handleDataSync = (event) => {
      if (event.detail?.type === 'departments') {
        loadDepartments();
      }
    };
    window.addEventListener('dataSync', handleDataSync);
    return () => window.removeEventListener('dataSync', handleDataSync);
  }, [isAuthenticated, authLoading]);

  // Check if in demo mode
  const inDemoMode = isDemoMode();

  // Check if on landing page (don't show MenuBar)
  const isLandingPage = location.pathname === '/';

  // Automatically detect current page type for MenuBar
  const isRecipeListPage = location.pathname === '/recipes' || location.pathname === ROUTES.RECIPES;

  const isTeamTasksPage = location.pathname === ROUTES.DEPARTMENT_TASKS || location.pathname === '/team-tasks';

  // page determines which nav buttons to show/hide:
  // 'browser' = recipe list page (hide Recipes button)
  // 'tasks' = team tasks page (hide Tasks button)
  // 'detail' or 'other' = show both buttons
  const page = isRecipeListPage ? 'browser' : (isTeamTasksPage ? 'tasks' : 'other');

  // MenuBar event handlers
  const handleDepartmentChange = (dept) => {
    switchDepartment(dept);
  };

  const handleBackClick = () => {
    // If already on recipes page, do nothing
    if (location.pathname === '/recipes' || location.pathname === ROUTES.RECIPES) {
      return;
    }

    // Only check for unsaved data on recipe editor pages
    const isRecipeEditorPage = location.pathname.match(/\/recipes\/(\d+|new)(\/edit)?$/);

    if (isRecipeEditorPage) {
      // Dispatch event to check for unsaved data in RecipeEditorPage
      const event = new CustomEvent('checkUnsavedData', {
        detail: {
          callback: (hasUnsaved, saveCallback) => {
            if (hasUnsaved) {
              const choice = window.confirm(
                'You have unsaved changes. Click OK to save, Cancel to discard.'
              );
              if (choice && saveCallback) {
                saveCallback(() => navigate('/recipes'));
              } else if (!choice) {
                navigate('/recipes');
              }
            } else {
              navigate('/recipes');
            }
          }
        }
      });
      window.dispatchEvent(event);
    } else {
      // Direct navigation for other pages (like Team Tasks)
      navigate('/recipes');
    }
  };

  const handleNewRecipe = () => {
    // Check if we're on a recipe editor page
    const isRecipeEditorPage = location.pathname.match(/\/recipes\/(\d+|new)(\/edit)?$/);

    if (isRecipeEditorPage) {
      // Already on recipe editor - dispatch event to reset form (no navigation)
      window.dispatchEvent(new CustomEvent('resetToNewRecipe'));
    } else {
      // Not on recipe editor - navigate to new recipe page
      navigate(ROUTES.RECIPE_NEW);
    }
  };

  const handleImportPDF = () => {
    navigate('/recipes/import-pdf');
  };

  const handleImportImage = () => {
    navigate('/recipes/import-image');
  };

  const handleTakeImage = () => {
    navigate('/recipes/import-image');
  };

  const handleDeleteRecipe = async () => {
    // Extract recipe ID from URL
    const match = location.pathname.match(/\/recipes\/(\d+)/);
    if (!match) return;

    const recipeId = parseInt(match[1]);

    if (confirm('Are you sure you want to delete this recipe? This cannot be undone.')) {
      try {
        const { recipeDB } = await import('./services/database/indexedDB');
        await recipeDB.delete(recipeId);
        alert('Recipe deleted successfully!');
        navigate('/recipes');
      } catch (error) {
        console.error('Error deleting recipe:', error);
        alert('Failed to delete recipe');
      }
    }
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  const handleControlPanelClick = () => {
    navigate(ROUTES.CONTROL_PANEL);
  };

  const handleHeartbeatClick = () => {
    navigate(ROUTES.HEARTBEAT);
  };

  const handleInventoryClick = () => {
    // Navigate to Control Panel with Inventory tab selected
    navigate(`${ROUTES.CONTROL_PANEL}?tab=inventory&subtab=dashboard`);
  };

  const handleLockToggle = () => {
    if (isUnlocked) {
      // Currently unlocked, lock it (logout from access)
      accessLogout();
      // Redirect to recipes if on a protected page (like Control Panel)
      if (location.pathname === ROUTES.CONTROL_PANEL) {
        navigate(ROUTES.RECIPES);
      }
    } else {
      // Currently locked, show PIN modal to unlock
      setPinError('');
      setShowPinModal(true);
    }
  };

  // Handle PIN submission
  const handlePinSubmit = async (pin) => {
    setPinLoading(true);
    setPinError('');

    try {
      const result = await authenticateWithPin(pin);
      if (result.success) {
        setShowPinModal(false);
        console.log(`✅ Authenticated as ${result.privilege.name} (${result.privilege.accessLevel})`);
      } else {
        setPinError(result.error || 'Invalid PIN');
      }
    } catch (error) {
      console.error('PIN verification error:', error);
      setPinError('Error verifying PIN');
    } finally {
      setPinLoading(false);
    }
  };

  // Handle PIN modal close (continue as viewer)
  const handlePinClose = () => {
    setShowPinModal(false);
    setPinError('');
  };

  const handleLogout = async () => {
    try {
      await logoutUser();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
      alert('Failed to logout. Please try again.');
    }
  };

  return (
      <div className="app">
        {/* Beta Banner - Shows on all pages */}
        <BetaBanner />

        {/* MenuBar Component - Show when authenticated OR in demo mode, and not on auth pages */}
        {!isLandingPage && (isAuthenticated || inDemoMode) && (
          <MenuBar
            appName="SmartCookBook"
            currentDepartment={currentDepartment}
            departments={departments}
            micFlag={micFlag}
            keypadFlag={keypadFlag}
            isUnlocked={isUnlocked}
            isOwner={isOwner}
            userName={userName}
            accessLevel={accessLevel}
            showTimer={showTimer}
            page={page}
            currentRecipe={currentRecipe || { id: 1 }}
            syncStatus={syncStatus}
            criticalStockCount={criticalStockCount}
            lowStockCount={lowStockCount}
            onDepartmentChange={handleDepartmentChange}
            onBackClick={handleBackClick}
            onMicToggle={handleMicToggle}
            onKeypadToggle={handleKeypadToggle}
            onNewRecipe={handleNewRecipe}
            onTimerToggle={handleTimerToggle}
            onImportPDF={handleImportPDF}
            onImportImage={handleImportImage}
            onTakeImage={handleTakeImage}
            onDeleteRecipe={handleDeleteRecipe}
            onSettingsClick={handleSettingsClick}
            onControlPanelClick={handleControlPanelClick}
            onHeartbeatClick={handleHeartbeatClick}
            onTeamTasksClick={() => navigate(ROUTES.DEPARTMENT_TASKS)}
            onInventoryClick={handleInventoryClick}
            onLockToggle={handleLockToggle}
            onLogout={handleLogout}
          />
        )}

        {/* Timer Component */}
        {showTimer && (isAuthenticated || inDemoMode) && (
          <Timer
            onClose={handleTimerClose}
            onComplete={() => {
              // Play sound is handled in Timer component
              console.log('Timer complete!');
            }}
          />
        )}

        {/* PIN Modal for unlock */}
        <PinModal
          isOpen={showPinModal}
          onClose={handlePinClose}
          onSubmit={handlePinSubmit}
          title="Enter PIN to Unlock"
          error={pinError}
          loading={pinLoading}
        />

        {/* Routes Component */}
        <AppRoutes
          micFlag={micFlag}
          isUnlocked={isUnlocked}
          currentDepartment={currentDepartment}
          isOwner={isOwner}
          currentPrivilege={currentPrivilege}
          HomePage={HomePage}
        />

        {/* Feedback Button - Shows on all pages */}
        <FeedbackButton />

        {/* Guided Tour - Shows in demo mode */}
        {inDemoMode && (
          <GuidedTour
            tourName="main"
            run={runTour}
            onComplete={handleTourComplete}
            onSkip={handleTourComplete}
          />
        )}
      </div>
  );
}

// Wrapper App component with Router, AuthProvider, and AccessProvider
function App() {
  return (
    <Router>
      <AuthProvider>
        <AccessProvider>
          <AppContent />
        </AccessProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
