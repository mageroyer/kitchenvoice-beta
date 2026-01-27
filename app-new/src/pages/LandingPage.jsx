import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ROUTES } from '../constants/routes';
import { FeatureSlider } from '../components/common/FeatureSlider';
import { sliderDB } from '../services/database/indexedDB';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import styles from '../styles/pages/landingpage.module.css';

/**
 * LandingPage Component
 *
 * Marketing landing page for KitchenCommand.
 * Shown to unauthenticated users at the root path.
 */
// Default slides showcasing SmartCookBook features
const DEFAULT_FEATURE_SLIDES = [
  {
    id: 1,
    icon: '📖',
    title: 'AI Recipe Import',
    bubble: {
      text: 'Drop a PDF or photo - get a perfect recipe in seconds!',
      position: 'bottom-right',
      style: 'primary'
    }
  },
  {
    id: 2,
    icon: '🎤',
    title: 'Voice Input',
    bubble: {
      text: 'Dictate recipes hands-free while you cook!',
      position: 'bottom-left',
      style: 'secondary'
    }
  },
  {
    id: 3,
    icon: '💰',
    title: 'Live Cost Tracking',
    bubble: {
      text: 'Know your exact cost per portion - updates automatically!',
      position: 'top-right',
      style: 'warning'
    }
  },
  {
    id: 4,
    icon: '📄',
    title: 'Smart Invoices',
    bubble: {
      text: 'Upload invoices - AI extracts items & updates inventory!',
      position: 'bottom-right',
      style: 'success'
    }
  },
  {
    id: 5,
    icon: '⚖️',
    title: 'Batch Scaling',
    bubble: {
      text: 'Scale any recipe from 1 to 1,000 portions instantly!',
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
      } catch {
        // Use default slider config on error
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
          <img src="/favicon.svg" alt="KitchenCommand" className={styles.navLogoIcon} />
          KitchenCommand
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
          <button onClick={handleGetStarted} className={styles.navCta}>
            Créer un compte
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
              AI-Powered Kitchen Management
            </div>

            <h1 className={styles.heroTitle}>
              Your Recipes. Perfectly Organized.
              <span className={styles.heroTitleAccent}> AI Does the Paperwork.</span>
            </h1>

            <p className={styles.heroSubtitle}>
              Import recipes from PDFs, photos, or voice dictation.
              Track costs automatically as prices change.
              Scale for any batch size. Finally, software that works like you do.
            </p>

            <div className={styles.heroCtas}>
              <button
                onClick={handleGetStarted}
                className={`${styles.btn} ${styles.btnPrimary}`}
              >
                Start Free
                <span>→</span>
              </button>
              <span className={styles.heroCtaNote}>50 AI credits/month included</span>
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
                <span className={styles.mockupTitle}>KitchenCommand</span>
              </div>
              <div className={styles.mockupContent}>
                <div className={styles.mockupRecipe}>
                  <div className={styles.mockupRecipeHeader}>
                    <div className={styles.mockupRecipeTitle}>Boeuf Bourguignon</div>
                    <span className={styles.mockupRecipeCategory}>French Classic</span>
                  </div>

                  <div className={styles.mockupVoiceIndicator}>
                    <div className={styles.voiceWaves}>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                      <div className={styles.voiceWave}></div>
                    </div>
                    Imported from PDF
                  </div>

                  <div className={styles.mockupIngredients}>
                    <span className={styles.mockupIngQty}>2 kg</span>
                    <span className={styles.mockupIngName}>Boeuf à braiser</span>
                    <span className={styles.mockupIngSpec}>$18.50</span>

                    <span className={styles.mockupIngQty}>750 ml</span>
                    <span className={styles.mockupIngName}>Vin rouge Bourgogne</span>
                    <span className={styles.mockupIngSpec}>$12.00</span>

                    <span className={styles.mockupIngQty}>200 g</span>
                    <span className={styles.mockupIngName}>Lardons fumés</span>
                    <span className={styles.mockupIngSpec}>$4.25</span>
                  </div>

                  <div className={styles.mockupCost}>
                    <span>Cost per portion:</span>
                    <strong>$5.85</strong>
                  </div>
                </div>
              </div>
            </div>

            <div className={`${styles.heroFloating} ${styles.heroFloating1}`}>
              <span className={styles.floatingIcon}>📖</span>
              PDF → Recipe
            </div>

            <div className={`${styles.heroFloating} ${styles.heroFloating2}`}>
              <span className={styles.floatingIcon}>🎤</span>
              Voice Input
            </div>
          </div>
        </div>
      </section>

      {/* Full-Width Feature Slider Showcase */}
      <section className={styles.sliderShowcase}>
        <div className={styles.sliderShowcaseHeader}>
          <span className={styles.sectionLabel}>Powerful Features</span>
          <h2 className={styles.sectionTitle}>Everything You Need to Run Your Kitchen</h2>
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
          <span className={styles.sectionLabel}>Why KitchenCommand?</span>
          <h2 className={styles.sectionTitle}>Focus on Cooking, Not Paperwork</h2>
          <p className={styles.sectionSubtitle}>
            From home cooks to production kitchens, we handle the tedious stuff
            so you can focus on what matters: creating great food.
          </p>
        </div>

        <div className={styles.featuresGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📖</div>
            <h3 className={styles.featureTitle}>AI Recipe Import</h3>
            <p className={styles.featureDesc}>
              Drop a PDF, snap a photo, or paste text. AI extracts ingredients,
              quantities, and steps automatically. Your grandmother's recipes,
              digitized in seconds.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>🎤</div>
            <h3 className={styles.featureTitle}>Voice Input</h3>
            <p className={styles.featureDesc}>
              Dictate recipes hands-free while cooking. Add ingredients by voice.
              Perfect for busy kitchens where your hands are never clean.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>💰</div>
            <h3 className={styles.featureTitle}>Live Cost Tracking</h3>
            <p className={styles.featureDesc}>
              Know your exact cost per portion. When ingredient prices change,
              all your recipe costs update automatically. Price with confidence.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>⚖️</div>
            <h3 className={styles.featureTitle}>Smart Scaling</h3>
            <p className={styles.featureDesc}>
              Scale any recipe from 1 to 1,000 portions instantly.
              Automatic unit conversions. Perfect batch calculations every time.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📄</div>
            <h3 className={styles.featureTitle}>Invoice Automation</h3>
            <p className={styles.featureDesc}>
              Upload supplier invoices and watch AI extract every line item.
              Inventory updates automatically. Prices sync to your recipes.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIcon}>📊</div>
            <h3 className={styles.featureTitle}>Inventory Control</h3>
            <p className={styles.featureDesc}>
              Track stock levels in real-time. Par level alerts prevent shortages.
              Task completion automatically deducts ingredients used.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className={styles.howItWorks} id="how-it-works">
        <div className={styles.sectionHeader}>
          <span className={styles.sectionLabel}>Getting Started</span>
          <h2 className={styles.sectionTitle}>Up and Running in 60 Seconds</h2>
          <p className={styles.sectionSubtitle}>
            No complex setup. No training required. Just drop a recipe and go.
          </p>
        </div>

        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNumber}>1</div>
            <h3 className={styles.stepTitle}>Import a Recipe</h3>
            <p className={styles.stepDesc}>
              Drop a PDF, take a photo, or dictate by voice. AI does the rest.
            </p>
            <span className={styles.stepConnector}>→</span>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>2</div>
            <h3 className={styles.stepTitle}>Review & Adjust</h3>
            <p className={styles.stepDesc}>
              Quick review, tweak if needed. Link ingredients to your inventory.
            </p>
            <span className={styles.stepConnector}>→</span>
          </div>

          <div className={styles.step}>
            <div className={styles.stepNumber}>3</div>
            <h3 className={styles.stepTitle}>Cook & Track</h3>
            <p className={styles.stepDesc}>
              Scale for any batch size. Costs update live. Inventory deducts automatically.
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
            I imported 15 years of family recipes in one afternoon. Handwritten cards,
            old PDFs, even photos of my grandmother's cookbook. Now I can finally
            scale them properly and know exactly what each dish costs.
          </blockquote>

          <div className={styles.testimonialAuthor}>
            <div className={styles.testimonialAvatar}>👨‍🍳</div>
            <div className={styles.testimonialInfo}>
              <div className={styles.testimonialName}>Marco Pellegrini</div>
              <div className={styles.testimonialRole}>Chef-Owner, Trattoria Bella Vita</div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className={styles.cta}>
        <div className={styles.ctaContent}>
          <h2 className={styles.ctaTitle}>Ready to organize your recipes?</h2>
          <p className={styles.ctaSubtitle}>
            Join chefs who finally have their recipes under control.
            50 free AI credits per month. No credit card required.
          </p>
          <button onClick={handleGetStarted} className={`${styles.btn} ${styles.btnWhite}`}>
            Start Free
            <span>→</span>
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          <div>
            <div className={styles.footerBrand}>
              <img src="/favicon.svg" alt="" className={styles.footerLogoIcon} />
              KitchenCommand
            </div>
            <p className={styles.footerDesc}>
              AI-powered recipe management and kitchen operations.
              Import, organize, scale, and cost your recipes. Built in Montreal.
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
            <h4 className={styles.footerTitle}>Legal</h4>
            <ul className={styles.footerLinks}>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><a href="mailto:contact@smartcookbook.app">Contact</a></li>
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>© 2025 KitchenCommand. All rights reserved.</span>
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
              KitchenCommand est en version bêta fermée. Laissez votre email pour être notifié
              dès l'ouverture des inscriptions.
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
