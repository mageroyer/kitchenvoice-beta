import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sliderDB } from '../services/database/indexedDB';
import { FeatureSlider } from '../components/common/FeatureSlider';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Dropdown from '../components/common/Dropdown';
import Card from '../components/common/Card';
import Modal from '../components/common/Modal';
import Alert from '../components/common/Alert';
import styles from '../styles/pages/sliderconfigpage.module.css';

// Default slides template
const DEFAULT_SLIDE = {
  icon: '🍳',
  title: 'New Feature',
  image: '',
  alt: '',
  bubble: {
    text: 'Describe this feature...',
    position: 'bottom-right',
    style: 'primary'
  }
};

// Position and style options
const BUBBLE_POSITIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'center', label: 'Center' }
];

const BUBBLE_STYLES = [
  { value: 'primary', label: 'Primary (Blue)' },
  { value: 'secondary', label: 'Secondary (Green)' },
  { value: 'warning', label: 'Warning (Orange)' },
  { value: 'success', label: 'Success (Green)' },
  { value: 'dark', label: 'Dark (Gray)' },
  { value: 'light', label: 'Light (White)' }
];

const ANIMATION_TYPES = [
  { value: 'slide', label: 'Slide' },
  { value: 'fade', label: 'Fade' },
  { value: 'zoom', label: 'Zoom' }
];

const ICON_OPTIONS = [
  '🎤', '🤖', '⏱️', '☁️', '⚖️', '📱', '🔒', '👥',
  '📄', '📷', '🍳', '👨‍🍳', '🥗', '🍰', '🔥', '❄️',
  '📊', '💾', '🔔', '⚡', '🎯', '✨', '🚀', '💡'
];

/**
 * SliderConfigPage - Admin UI for configuring feature sliders
 */
function SliderConfigPage() {
  const navigate = useNavigate();

  // Slider list state
  const [sliders, setSliders] = useState([]);
  const [selectedSliderId, setSelectedSliderId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Current slider config
  const [config, setConfig] = useState({
    name: 'Landing Page Slider',
    location: 'landing-hero',
    autoPlay: true,
    interval: 5000,
    animation: 'fade',
    showDots: true,
    showArrows: true,
    slides: []
  });

  // UI state
  const [editingSlideIndex, setEditingSlideIndex] = useState(null);
  const [showSlideModal, setShowSlideModal] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [alert, setAlert] = useState({ show: false, variant: 'success', message: '' });
  const [hasChanges, setHasChanges] = useState(false);

  // Current slide being edited
  const [currentSlide, setCurrentSlide] = useState({ ...DEFAULT_SLIDE });

  // Load sliders on mount
  useEffect(() => {
    loadSliders();
  }, []);

  const loadSliders = async () => {
    try {
      setLoading(true);
      const allSliders = await sliderDB.getAll();
      setSliders(allSliders);

      // Load landing-hero slider by default if exists
      const landingSlider = allSliders.find(s => s.location === 'landing-hero');
      if (landingSlider) {
        setSelectedSliderId(landingSlider.id);
        setConfig(landingSlider);
      } else if (allSliders.length > 0) {
        setSelectedSliderId(allSliders[0].id);
        setConfig(allSliders[0]);
      }
    } catch (error) {
      console.error('Error loading sliders:', error);
      showAlert('danger', 'Failed to load sliders');
    } finally {
      setLoading(false);
    }
  };

  const showAlert = (variant, message) => {
    setAlert({ show: true, variant, message });
    setTimeout(() => setAlert({ show: false, variant: 'success', message: '' }), 3000);
  };

  // Handle slider selection change
  const handleSliderSelect = async (sliderId) => {
    if (hasChanges) {
      if (!confirm('You have unsaved changes. Discard them?')) return;
    }

    const slider = sliders.find(s => s.id === parseInt(sliderId));
    if (slider) {
      setSelectedSliderId(slider.id);
      setConfig(slider);
      setHasChanges(false);
    }
  };

  // Create new slider
  const handleCreateSlider = async () => {
    const newConfig = {
      name: `New Slider ${sliders.length + 1}`,
      location: `slider-${Date.now()}`,
      autoPlay: true,
      interval: 5000,
      animation: 'slide',
      showDots: true,
      showArrows: true,
      slides: []
    };

    try {
      const id = await sliderDB.add(newConfig);
      await loadSliders();
      setSelectedSliderId(id);
      setConfig({ ...newConfig, id });
      showAlert('success', 'New slider created!');
    } catch (error) {
      console.error('Error creating slider:', error);
      showAlert('danger', 'Failed to create slider');
    }
  };

  // Delete current slider
  const handleDeleteSlider = async () => {
    if (!selectedSliderId) return;
    if (!confirm('Are you sure you want to delete this slider?')) return;

    try {
      await sliderDB.delete(selectedSliderId);
      await loadSliders();
      setSelectedSliderId(null);
      setConfig({
        name: '',
        location: '',
        autoPlay: true,
        interval: 5000,
        animation: 'slide',
        showDots: true,
        showArrows: true,
        slides: []
      });
      showAlert('success', 'Slider deleted!');
    } catch (error) {
      console.error('Error deleting slider:', error);
      showAlert('danger', 'Failed to delete slider');
    }
  };

  // Save current configuration
  const handleSave = async () => {
    try {
      if (selectedSliderId) {
        await sliderDB.update(selectedSliderId, config);
      } else {
        const id = await sliderDB.add(config);
        setSelectedSliderId(id);
      }
      await loadSliders();
      setHasChanges(false);
      showAlert('success', 'Slider configuration saved!');
    } catch (error) {
      console.error('Error saving slider:', error);
      showAlert('danger', 'Failed to save slider');
    }
  };

  // Update config field
  const updateConfig = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  // Open slide editor modal
  const openSlideEditor = (index = null) => {
    if (index !== null) {
      setCurrentSlide({ ...config.slides[index] });
      setEditingSlideIndex(index);
    } else {
      setCurrentSlide({ ...DEFAULT_SLIDE, id: Date.now() });
      setEditingSlideIndex(null);
    }
    setShowSlideModal(true);
  };

  // Save slide from modal
  const handleSaveSlide = () => {
    const newSlides = [...config.slides];

    if (editingSlideIndex !== null) {
      newSlides[editingSlideIndex] = currentSlide;
    } else {
      newSlides.push(currentSlide);
    }

    updateConfig('slides', newSlides);
    setShowSlideModal(false);
    setEditingSlideIndex(null);
  };

  // Delete a slide
  const handleDeleteSlide = (index) => {
    if (!confirm('Delete this slide?')) return;
    const newSlides = config.slides.filter((_, i) => i !== index);
    updateConfig('slides', newSlides);
  };

  // Move slide up/down
  const handleMoveSlide = (index, direction) => {
    const newSlides = [...config.slides];
    const newIndex = index + direction;

    if (newIndex < 0 || newIndex >= newSlides.length) return;

    [newSlides[index], newSlides[newIndex]] = [newSlides[newIndex], newSlides[index]];
    updateConfig('slides', newSlides);
  };

  // Update current slide field
  const updateSlide = (field, value) => {
    setCurrentSlide(prev => ({ ...prev, [field]: value }));
  };

  // Update bubble field
  const updateBubble = (field, value) => {
    setCurrentSlide(prev => ({
      ...prev,
      bubble: { ...prev.bubble, [field]: value }
    }));
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading slider configuration...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <Button variant="ghost" onClick={() => navigate(-1)}>
            ← Back
          </Button>
          <h1 className={styles.title}>Slider Configuration</h1>
        </div>
        <div className={styles.headerRight}>
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Alert */}
      {alert.show && (
        <Alert
          variant={alert.variant}
          show={alert.show}
          dismissible
          onDismiss={() => setAlert({ ...alert, show: false })}
        >
          {alert.message}
        </Alert>
      )}

      <div className={styles.content}>
        {/* Sidebar - Slider List */}
        <div className={styles.sidebar}>
          <Card padding="medium">
            <div className={styles.sidebarHeader}>
              <h3>Sliders</h3>
              <Button size="small" onClick={handleCreateSlider}>+ New</Button>
            </div>

            <div className={styles.sliderList}>
              {sliders.length === 0 ? (
                <p className={styles.emptyText}>No sliders yet</p>
              ) : (
                sliders.map(slider => (
                  <div
                    key={slider.id}
                    className={`${styles.sliderItem} ${slider.id === selectedSliderId ? styles.active : ''}`}
                    onClick={() => handleSliderSelect(slider.id)}
                  >
                    <span className={styles.sliderName}>{slider.name}</span>
                    <span className={styles.sliderLocation}>{slider.location}</span>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <div className={styles.main}>
          {/* Preview Section */}
          {showPreview && (
            <div className={styles.previewSection}>
              <h3>Live Preview</h3>
              <div className={styles.previewContainer}>
                <FeatureSlider
                  slides={config.slides}
                  autoPlay={config.autoPlay}
                  interval={config.interval}
                  animation={config.animation}
                  showDots={config.showDots}
                  showArrows={config.showArrows}
                />
              </div>
            </div>
          )}

          {/* General Settings */}
          <Card padding="medium" className={styles.settingsCard}>
            <h3>General Settings</h3>

            <div className={styles.settingsGrid}>
              <Input
                label="Slider Name"
                value={config.name}
                onChange={(e) => updateConfig('name', e.target.value)}
                placeholder="e.g., Landing Page Hero"
              />

              <Input
                label="Location Key"
                value={config.location}
                onChange={(e) => updateConfig('location', e.target.value)}
                placeholder="e.g., landing-hero"
                helperText="Unique identifier used to load this slider"
              />

              <Dropdown
                label="Animation Type"
                options={ANIMATION_TYPES}
                value={config.animation}
                onChange={(e) => updateConfig('animation', e.target.value)}
              />

              <Input
                label="Interval (ms)"
                type="number"
                value={config.interval}
                onChange={(e) => updateConfig('interval', parseInt(e.target.value) || 5000)}
                helperText="Time between slides in milliseconds"
              />
            </div>

            <div className={styles.togglesRow}>
              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={config.autoPlay}
                  onChange={(e) => updateConfig('autoPlay', e.target.checked)}
                />
                <span>Auto-play</span>
              </label>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={config.showDots}
                  onChange={(e) => updateConfig('showDots', e.target.checked)}
                />
                <span>Show Dots</span>
              </label>

              <label className={styles.toggle}>
                <input
                  type="checkbox"
                  checked={config.showArrows}
                  onChange={(e) => updateConfig('showArrows', e.target.checked)}
                />
                <span>Show Arrows</span>
              </label>
            </div>

            {selectedSliderId && (
              <div className={styles.dangerZone}>
                <Button variant="danger" size="small" onClick={handleDeleteSlider}>
                  Delete This Slider
                </Button>
              </div>
            )}
          </Card>

          {/* Slides Section */}
          <Card padding="medium" className={styles.slidesCard}>
            <div className={styles.slidesHeader}>
              <h3>Slides ({config.slides.length})</h3>
              <Button onClick={() => openSlideEditor()}>+ Add Slide</Button>
            </div>

            {config.slides.length === 0 ? (
              <div className={styles.emptySlides}>
                <p>No slides yet. Add your first slide to get started!</p>
                <Button variant="primary" onClick={() => openSlideEditor()}>
                  + Add First Slide
                </Button>
              </div>
            ) : (
              <div className={styles.slidesList}>
                {config.slides.map((slide, index) => (
                  <div key={slide.id || index} className={styles.slideCard}>
                    <div className={styles.slidePreview}>
                      {slide.image ? (
                        <img src={slide.image} alt={slide.alt || slide.title} />
                      ) : (
                        <div className={styles.slideIcon}>{slide.icon}</div>
                      )}
                    </div>

                    <div className={styles.slideInfo}>
                      <div className={styles.slideTitle}>{slide.title || 'Untitled'}</div>
                      <div className={styles.slideBubble}>
                        <span
                          className={styles.bubblePreview}
                          style={{
                            background: slide.bubble?.style === 'primary' ? '#3498db' :
                                       slide.bubble?.style === 'secondary' ? '#27ae60' :
                                       slide.bubble?.style === 'warning' ? '#f39c12' :
                                       slide.bubble?.style === 'success' ? '#27ae60' :
                                       slide.bubble?.style === 'dark' ? '#2c3e50' : '#fff'
                          }}
                        ></span>
                        {slide.bubble?.text?.substring(0, 40)}...
                      </div>
                      <div className={styles.slidePosition}>
                        Position: {slide.bubble?.position}
                      </div>
                    </div>

                    <div className={styles.slideActions}>
                      <button
                        className={styles.moveBtn}
                        onClick={() => handleMoveSlide(index, -1)}
                        disabled={index === 0}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        className={styles.moveBtn}
                        onClick={() => handleMoveSlide(index, 1)}
                        disabled={index === config.slides.length - 1}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        className={styles.editBtn}
                        onClick={() => openSlideEditor(index)}
                        title="Edit"
                      >
                        ✏️
                      </button>
                      <button
                        className={styles.deleteBtn}
                        onClick={() => handleDeleteSlide(index)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Slide Editor Modal */}
      <Modal
        isOpen={showSlideModal}
        onClose={() => setShowSlideModal(false)}
        title={editingSlideIndex !== null ? 'Edit Slide' : 'Add New Slide'}
        size="large"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowSlideModal(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSaveSlide}>
              {editingSlideIndex !== null ? 'Update Slide' : 'Add Slide'}
            </Button>
          </>
        }
      >
        <div className={styles.slideEditor}>
          {/* Icon Selection */}
          <div className={styles.editorSection}>
            <label>Icon (shown when no image)</label>
            <div className={styles.iconPicker}>
              {ICON_OPTIONS.map(icon => (
                <button
                  key={icon}
                  className={`${styles.iconOption} ${currentSlide.icon === icon ? styles.selected : ''}`}
                  onClick={() => updateSlide('icon', icon)}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>

          <Input
            label="Title"
            value={currentSlide.title}
            onChange={(e) => updateSlide('title', e.target.value)}
            placeholder="Feature title..."
          />

          <Input
            label="Image URL (optional)"
            value={currentSlide.image || ''}
            onChange={(e) => updateSlide('image', e.target.value)}
            placeholder="https://example.com/image.png"
            helperText="Leave empty to use icon placeholder"
          />

          <Input
            label="Alt Text"
            value={currentSlide.alt || ''}
            onChange={(e) => updateSlide('alt', e.target.value)}
            placeholder="Describe the image for accessibility"
          />

          <div className={styles.bubbleSection}>
            <h4>Bubble Text</h4>

            <Input
              label="Bubble Message"
              value={currentSlide.bubble?.text || ''}
              onChange={(e) => updateBubble('text', e.target.value)}
              placeholder="What should the bubble say?"
              multiline
              rows={2}
            />

            <div className={styles.bubbleOptions}>
              <Dropdown
                label="Position"
                options={BUBBLE_POSITIONS}
                value={currentSlide.bubble?.position || 'bottom-right'}
                onChange={(e) => updateBubble('position', e.target.value)}
              />

              <Dropdown
                label="Style"
                options={BUBBLE_STYLES}
                value={currentSlide.bubble?.style || 'primary'}
                onChange={(e) => updateBubble('style', e.target.value)}
              />
            </div>
          </div>

          {/* Mini Preview */}
          <div className={styles.miniPreview}>
            <h4>Preview</h4>
            <div className={styles.miniPreviewBox}>
              <div className={styles.miniSlide}>
                {currentSlide.image ? (
                  <img src={currentSlide.image} alt={currentSlide.alt} />
                ) : (
                  <span className={styles.miniIcon}>{currentSlide.icon}</span>
                )}
                <div className={styles.miniTitle}>{currentSlide.title}</div>
              </div>
              <div
                className={`${styles.miniBubble} ${styles[`bubble-${currentSlide.bubble?.position}`]}`}
                style={{
                  background: currentSlide.bubble?.style === 'primary' ? '#3498db' :
                             currentSlide.bubble?.style === 'secondary' ? '#27ae60' :
                             currentSlide.bubble?.style === 'warning' ? '#f39c12' :
                             currentSlide.bubble?.style === 'success' ? '#27ae60' :
                             currentSlide.bubble?.style === 'dark' ? '#2c3e50' : '#fff',
                  color: currentSlide.bubble?.style === 'light' ? '#333' : '#fff'
                }}
              >
                {currentSlide.bubble?.text || 'Bubble text...'}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default SliderConfigPage;
