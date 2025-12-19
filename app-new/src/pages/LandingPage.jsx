import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { FeatureSlider } from '../components/common/FeatureSlider';
import { sliderDB } from '../services/database/indexedDB';
import { enableDemoMode, initializeDemoData } from '../services/demo/demoService';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import styles from '../styles/pages/landingpage.module.css';

/**
 * LandingPage Component
 *
 * Marketing landing page for SmartCookBook.
 * Shown to unauthenticated users at the root path.
 */
// Default slides showcasing SmartCookBook features
const DEFAULT_FEATURE_SLIDES = [
  {
    id: 1,
    icon: '🎤',
    title: 'Voice-First Input',
    bubble: {
      text: 'Dictate recipes hands-free while cooking!',
      position: 'bottom-right',
      style: 'primary'
    }
  },
  {
    id: 2,
    icon: '🤖',
    title: 'AI Recipe Import',
    bubble: {
      text: 'Snap a photo or upload a PDF - AI extracts everything!',
      position: 'bottom-left',
      style: 'secondary'
    }
  },
  {
    id: 3,
    icon: '⏱️',
    title: 'Smart Timers',
    bubble: {
      text: 'Multiple timers running at once - never burn anything!',
      position: 'top-right',
      style: 'warning'
    }
  },
  {
    id: 4,
    icon: '☁️',
    title: 'Cloud Sync',
    bubble: {
      text: 'Access your recipes from any device, anywhere!',
      position: 'bottom-right',
      style: 'success'
    }
  },
  {
    id: 5,
    icon: '⚖️',
    title: 'Instant Scaling',
    bubble: {
      text: 'Scale from 4 to 400 portions in one click!',
      position: 'center',
      style: 'primary'
    }
  }
];

function LandingPage() {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sliderConfig, setSliderConfig] = useState(null);
  const [slides, setSlides] = useState(DEFAULT_FEATURE_SLIDES);
  const [showWaitlistModal, setShowWaitlistModal] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  // Ref for timer cleanup
  const waitlistTimerRef = useRef(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (waitlistTimerRef.current) {
        clearTimeout(waitlistTimerRef.current);
      }
    };
  }, []);

  // Load slider configuration from database
  useEffect(() => {
    const loadSliderConfig = async () => {
      try {
        const config = await sliderDB.getByLocation('landing-hero');
        if (config) {
          setSliderConfig(config);
          if (config.slides && config.slides.length > 0) {
            setSlides(config.slides);
          }
        }
      } catch (error) {
        console.log('Using default slider config:', error.message);
      }
    };
    loadSliderConfig();
  }, []);

  const handleGetStarted = () => {
    setMobileMenuOpen(false);
    // Navigate directly to registration
    navigate(ROUTES.REGISTER);
  };

  const handleLogin = () => {
    setMobileMenuOpen(false);
    navigate(ROUTES.LOGIN);
  };

  // Launch demo mode
  const handleTryDemo = async () => {
    setDemoLoading(true);
    try {
      enableDemoMode();
      await initializeDemoData();
      navigate(ROUTES.RECIPES);
    } catch (error) {
      console.error('Error starting demo:', error);
      alert('Erreur lors du chargement de la démo. Veuillez réessayer.');
    } finally {
      setDemoLoading(false);
    }
  };

  // Submit email to waitlist
  const handleWaitlistSubmit = async (e) => {
    e.preventDefault();
    if (!waitlistEmail.trim()) return;

    setWaitlistSubmitting(true);
    try {
      const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { app } = await import('../services/auth/firebaseAuth');
      const db = getFirestore(app);

      await addDoc(collection(db, 'waitlist'), {
        email: waitlistEmail.trim().toLowerCase(),
        timestamp: serverTimestamp(),
        source: 'landing-page'
      });

      setWaitlistSuccess(true);
      waitlistTimerRef.current = setTimeout(() => {
        setShowWaitlistModal(false);
        setWaitlistSuccess(false);
        setWaitlistEmail('');
      }, 3000);
    } catch (error) {
      console.error('Error adding to waitlist:', error);
      alert('Erreur lors de l\'inscription. Veuillez réessayer.');
    } finally {
      setWaitlistSubmitting(false);
    }
  };

  const handleNavClick = () => {
    setMobileMenuOpen(false);
  };

  return (
    <div className={styles.landing}>
      {/* Navigation */}
      <nav className={styles.nav} id="nav">
        <a href="#" className={styles.navLogo}>
          <span className={styles.navLogoIcon}>🍳</span>
          SmartCookBook
        </a>

        {/* Hamburger Button */}
        <button
          className={`${styles.hamburger} ${mobileMenuOpen ? styles.hamburgerOpen : ''}`}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div className={`${styles.navLinks} ${mobileMenuOpen ? styles.navLinksOpen : ''}`}>
          <a href="#features" className={styles.navLink} onClick={handleNavClick}>Fonctionnalités</a>
          <a href="#how-it-works" className={styles.navLink} onClick={handleNavClick}>Comment ça marche</a>
          <a href="#pricing" className={styles.navLink} onClick={handleNavClick}>Accès Bêta</a>
          <button onClick={handleLogin} className={styles.navLink}>Login</button>
          <button onClick={handleTryDemo} className={styles.navCta} disabled={demoLoading}>
            {demoLoading ? 'Chargement...' : 'Essayer la Démo'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className={styles.hero}>
        <div className={styles.heroBg}></div>
        <div className={styles.heroPattern}></div>

        <div className={styles.heroContent}>
          <div className={styles.heroText}>
            <div className={styles.heroBadge}>
              <span className={styles.heroBadgeDot}></span>
              Now with AI-Powered Recipe Import
            </div>

            <h1 className={styles.heroTitle}>
              Manage Recipes with Your
              <span className={styles.heroTitleAccent}> Voice</span>
            </h1>

            <p className={styles.heroSubtitle}>
              The professional kitchen's secret weapon. Dictate recipes hands-free,
              scale portions instantly, and keep your team in sync — all without
              touching a screen.
            </p>

            <div className={styles.heroCtas}>
              <button
                onClick={handleGetStarted}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                Créer un compte
                <span>→</span>
              </button>
              <button
                onClick={handleTryDemo}
                className={`${styles.btn} ${styles.btnSecondary}`}
                disabled={demoLoading}
              >
                {demoLoading ? 'Chargement...' : 'Essayer la Démo'}
              </button>
            </div>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.heroMockup}>
              <div className={styles.mockupHeader}>
                <div className={styles.mockupDots}>
                  <div className={styles.mockupDot}></div>
                  <div className={styles.mockupDot}></div>
                  <div className={styles.mockupDot}></div>
                </div>
                <span className={styles.mockupTitle}>SmartCookBook</span>
              </div>
              <div className={styles.mockupContent}>
                <div className={styles.mockupRecipe}>
                  <div className={styles.mockupRecipeHeader}>
                    <div className={styles.mockupRecipeTitle}>Pâté Chinois</div>
                    <span className={styles.mockupRecipeCategory}>Plat Principal</span>
                  </div>

                  <div className={styles.mockupVoiceIndicator}>
                    <div className={styles.voiceWaves}>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                    </div>
                    Écoute en cours...
                  </div>

                  <div className={styles.mockupIngredients}>
                    <span className={styles.mockupIngQty}>500g</span>
                    <span className={styles.mockupIngName}>Boeuf haché</span>
                    <span className={styles.mockupIngSpec}>maigre</span>

                    <span className={styles.mockupIngQty}>4 tasses</span>
                    <span className={styles.mockupIngName}>Pommes de terre</span>
                    <span className={styles.mockupIngSpec}>Yukon Gold</span>

                    <span className={styles.mockupIngQty}>2 boîtes</span>
                    <span className={styles.mockupIngName}>Maïs en crème</span>
                    <span className={styles.mockupIngSpec}>398ml</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${styles.heroFloating} ${styles.heroFloating1}`}>
              <span className={styles.floatingIcon}>⏱️</span>
              Multiple Timers
            </div>

            <div className={`${styles.heroFloating} ${styles.heroFloating2}`}>
              <span className={styles.floatingIcon}>☁️</span>
              Cloud Sync
            </div>
          </div>
        </div>
      </section>

      {/* Full-Width Feature Slider Showcase */}
      <section className={styles.sliderShowcase}>
        <div className={styles.sliderShowcaseHeader}>
          <span className={styles.sectionLabel}>See It In Action</span>
          <h2 className={styles.sectionTitle}>Discover What SmartCookBook Can Do</h2>
        </div>
        <div className={styles.sliderContainer}>
          <FeatureSlider
            slides={slides}
            autoPlay={sliderConfig?.autoPlay ?? true}
            interval={sliderConfig?.interval ?? 5000}
            animation={sliderConfig?.animation ?? 'fade'}
            showDots={sliderConfig?.showDots ?? true}
            showArrows={sliderConfig?.showArrows ?? true}
            pauseOnHover={true}
            className={styles.fullWidthSlider}
          />
        </div>
      </section>

      {/* Features Section */}
      <section className={styles.features} id="features">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Pourquoi SmartCookBook?</span>
          <h2 className={styles.sectionTitle}>Built for Professional Kitchens</h2>
          <p className={styles.sectionSubtitle}>
            Every feature designed with real kitchen workflows in mind.
            No more greasy screens or lost recipes.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎤</div>
            <h3 className={styles.featureTitle}>Voice-First Input</h3>
            <p className={styles.featureDesc}>
              Dictate recipes, ingredients, and cooking steps hands-free.
              Optimized for French-Canadian kitchen terminology with Google's
              most advanced speech recognition.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚖️</div>
            <h3 className={styles.featureTitle}>Instant Scaling</h3>
            <p className={styles.featureDesc}>
              Change portion sizes and watch all measurements update automatically.
              From 4 servings to 400 — math done for you.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📱</div>
            <h3 className={styles.featureTitle}>Works Anywhere</h3>
            <p className={styles.featureDesc}>
              Access your recipes from any device. Tablet in the kitchen,
              phone at the market, laptop for planning — always in sync.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🤖</div>
            <h3 className={styles.featureTitle}>AI Recipe Import</h3>
            <p className={styles.featureDesc}>
              Import recipes from PDFs or photos. Our AI extracts and
              structures ingredients, steps, and notes automatically.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⏱️</div>
            <h3 className={styles.featureTitle}>Multiple Timers</h3>
            <p className={styles.featureDesc}>
              Set multiple cooking timers that run independently.
              Never miss a step, even when juggling complex preparations.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🏢</div>
            <h3 className={styles.featureTitle}>Multi-Restaurant</h3>
            <p className={styles.featureDesc}>
              Manage recipes for multiple locations from one account.
              Perfect for chains, caterers, and food service consultants.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.howItWorks} id="how-it-works">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Getting Started</span>
          <h2 className={styles.sectionTitle}>Up and Running in Minutes</h2>
          <p className={styles.sectionSubtitle}>
            No complex setup. No training required. Just start cooking.
          </p>
        </div>

        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h3 className={styles.stepTitle}>Create Account</h3>
            <p className={styles.stepDesc}>
              Sign up free and add your first restaurant in under 2 minutes.
            </p>
            <span className={styles.stepConnector}>→</span>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h3 className={styles.stepTitle}>Add Recipes</h3>
            <p className={styles.stepDesc}>
              Import from PDF, dictate by voice, or type manually. Your choice.
            </p>
            <span className={styles.stepConnector}>→</span>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h3 className={styles.stepTitle}>Cook Hands-Free</h3>
            <p className={styles.stepDesc}>
              Access recipes on any device. Edit with voice. Scale portions. Done.
            </p>
          </div>
        </div>
      </section>

      {/* Beta Access Section */}
      <section className={styles.pricing} id="pricing">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Accès Bêta</span>
          <h2 className={styles.sectionTitle}>Gratuit Pendant la Bêta</h2>
          <p className={styles.sectionSubtitle}>
            Testez toutes les fonctionnalités gratuitement. Les tarifs seront annoncés prochainement.
          </p>
        </div>

        <div className={styles.pricingGrid}>
          {/* Beta Access Card */}
          <div className={`${styles.pricingCard} ${styles.featured}`}>
            <div className={styles.pricingBadge}>Bêta</div>

            <div className={styles.pricingHeader}>
              <div className={styles.pricingIcon}>🚀</div>
              <h3 className={styles.pricingName}>Accès Complet</h3>
              <p className={styles.pricingDesc}>Toutes les fonctionnalités incluses</p>
            </div>

            <div className={styles.pricingPrice}>
              <span className={styles.priceAmount}>
                <span className={styles.priceCurrency}>$</span>0
              </span>
              <span className={styles.pricePeriod}>pendant la bêta</span>
            </div>

            <ul className={styles.pricingFeatures}>
              <li><span className={styles.featureCheck}>✓</span> Recettes illimitées</li>
              <li><span className={styles.featureCheck}>✓</span> Entrée vocale</li>
              <li><span className={styles.featureCheck}>✓</span> Import PDF & images</li>
              <li><span className={styles.featureCheck}>✓</span> Synchronisation cloud</li>
              <li><span className={styles.featureCheck}>✓</span> Calcul des portions</li>
              <li><span className={styles.featureCheck}>✓</span> Gestion des factures</li>
              <li><span className={styles.featureCheck}>✓</span> Intégration QuickBooks</li>
            </ul>

            <button onClick={handleGetStarted} className={`${styles.btn} ${styles.btnPrimary} ${styles.pricingCta}`}>
              Essayer Gratuitement
            </button>

            <p className={styles.pricingNote}>
              Aucune carte de crédit requise. Les tarifs seront communiqués avant la fin de la bêta.
            </p>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className={styles.testimonial}>
        <div className={styles.testimonialContent}>
          <blockquote className={styles.testimonialQuote}>
            Finally, a recipe system that understands how real kitchens work.
            My hands are covered in dough? No problem — I just tell it what to add.
            Game changer for our bakery.
          </blockquote>

          <div className={styles.testimonialAuthor}>
            <div className={styles.testimonialAvatar}>👨‍🍳</div>
            <div className={styles.testimonialInfo}>
              <div className={styles.testimonialName}>Marc-Antoine Leblanc</div>
              <div className={styles.testimonialRole}>Head Baker, Boulangerie St-Denis</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Prêt à transformer votre cuisine?</h2>
          <p className={styles.ctaSubtitle}>
            Testez SmartCookBook gratuitement pendant la bêta.
            Aucune carte de crédit requise.
          </p>
          <button onClick={handleGetStarted} className={`${styles.btn} ${styles.btnWhite}`}>
            Commencer Gratuitement
            <span>→</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div>
            <div className={styles.footerBrand}>🍳 SmartCookBook</div>
            <p className={styles.footerDesc}>
              Voice-powered recipe management for professional kitchens.
              Built in Montreal, serving chefs worldwide.
            </p>
          </div>

          <div>
            <h4 className={styles.footerTitle}>Produit</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#features">Fonctionnalités</a></li>
              <li><a href="#pricing">Accès Bêta</a></li>
              <li><a href="#">Roadmap</a></li>
              <li><a href="#">Changelog</a></li>
            </ul>
          </div>

          <div>
            <h4 className={styles.footerTitle}>Resources</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#">Documentation</a></li>
              <li><a href="#">Video Tutorials</a></li>
              <li><a href="#">API (Coming)</a></li>
              <li><a href="#">Status</a></li>
            </ul>
          </div>

          <div>
            <h4 className={styles.footerTitle}>Company</h4>
            <ul className={styles.footerLinks}>
              <li><a href="#">About</a></li>
              <li><a href="#">Blog</a></li>
              <li><a href="#">Contact</a></li>
              <li><a href="#">Privacy</a></li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© 2025 SmartCookBook. All rights reserved.</span>
          <div className={styles.footerSocial}>
            <a href="#" title="LinkedIn">in</a>
            <a href="#" title="Twitter">𝕏</a>
            <a href="#" title="YouTube">▶</a>
          </div>
        </div>
      </footer>

      {/* Waitlist Modal */}
      <Modal
        isOpen={showWaitlistModal}
        onClose={() => setShowWaitlistModal(false)}
        title="Inscriptions bientôt ouvertes!"
        size="small"
      >
        {waitlistSuccess ? (
          <div className={styles.waitlistSuccess}>
            <span className={styles.waitlistSuccessIcon}>🎉</span>
            <h3>Merci!</h3>
            <p>Vous serez notifié dès l'ouverture des inscriptions.</p>
          </div>
        ) : (
          <div className={styles.waitlistContent}>
            <p className={styles.waitlistText}>
              SmartCookBook est en version bêta fermée. Laissez votre email pour être notifié
              dès l'ouverture des inscriptions.
            </p>

            <p className={styles.waitlistAlt}>
              Ou <button onClick={handleTryDemo} className={styles.waitlistDemoLink}>
                essayez la démo
              </button> pour découvrir l'application maintenant!
            </p>

            <form onSubmit={handleWaitlistSubmit} className={styles.waitlistForm}>
              <Input
                type="email"
                placeholder="votre@email.com"
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                required
              />
              <Button
                type="submit"
                variant="primary"
                loading={waitlistSubmitting}
                disabled={waitlistSubmitting}
              >
                {waitlistSubmitting ? 'Envoi...' : 'Me notifier'}
              </Button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default LandingPage;
