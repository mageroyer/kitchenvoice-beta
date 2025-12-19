/**
 * FeedbackButton Component
 *
 * Floating button that opens a feedback/bug report modal
 */

import { useState } from 'react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import styles from '../../styles/components/feedbackbutton.module.css';

function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!message.trim()) {
      setError('Veuillez entrer un message.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      // Send feedback to Firebase
      const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
      const { app } = await import('../../services/auth/firebaseAuth');
      const db = getFirestore(app);

      await addDoc(collection(db, 'feedback'), {
        type: feedbackType,
        message: message.trim(),
        email: email.trim() || null,
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        timestamp: serverTimestamp(),
        status: 'new'
      });

      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setMessage('');
        setEmail('');
        setFeedbackType('bug');
      }, 2000);
    } catch (err) {
      console.error('Error submitting feedback:', err);
      setError('Erreur lors de l\'envoi. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setError('');
    setSubmitted(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        className={styles.floatingButton}
        onClick={() => setIsOpen(true)}
        title="Donner votre avis"
        data-tour="feedback"
      >
        <span className={styles.buttonIcon}>💬</span>
        <span className={styles.buttonText}>Feedback</span>
      </button>

      {/* Feedback Modal */}
      <Modal
        isOpen={isOpen}
        onClose={handleClose}
        title="Donnez votre avis"
        size="medium"
      >
        {submitted ? (
          <div className={styles.successMessage}>
            <span className={styles.successIcon}>✅</span>
            <h3>Merci pour votre feedback!</h3>
            <p>Nous apprécions votre contribution à l'amélioration de SmartCookBook.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {/* Feedback Type */}
            <div className={styles.typeSelector}>
              <button
                type="button"
                className={`${styles.typeButton} ${feedbackType === 'bug' ? styles.active : ''}`}
                onClick={() => setFeedbackType('bug')}
              >
                🐛 Bug
              </button>
              <button
                type="button"
                className={`${styles.typeButton} ${feedbackType === 'feature' ? styles.active : ''}`}
                onClick={() => setFeedbackType('feature')}
              >
                💡 Suggestion
              </button>
              <button
                type="button"
                className={`${styles.typeButton} ${feedbackType === 'other' ? styles.active : ''}`}
                onClick={() => setFeedbackType('other')}
              >
                💬 Autre
              </button>
            </div>

            {/* Message */}
            <div className={styles.field}>
              <label htmlFor="feedback-message">
                {feedbackType === 'bug' ? 'Décrivez le problème' :
                 feedbackType === 'feature' ? 'Décrivez votre idée' :
                 'Votre message'}
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  feedbackType === 'bug'
                    ? "Qu'est-ce qui ne fonctionne pas? Quelles étapes reproduisent le problème?"
                    : feedbackType === 'feature'
                    ? "Quelle fonctionnalité aimeriez-vous voir? Comment l'utiliseriez-vous?"
                    : "Partagez vos pensées..."
                }
                rows={5}
                className={styles.textarea}
              />
            </div>

            {/* Email (optional) */}
            <div className={styles.field}>
              <label htmlFor="feedback-email">
                Email (optionnel)
                <span className={styles.hint}> - pour recevoir une réponse</span>
              </label>
              <Input
                id="feedback-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="votre@email.com"
              />
            </div>

            {error && (
              <div className={styles.error}>{error}</div>
            )}

            {/* Actions */}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={handleClose} type="button">
                Annuler
              </Button>
              <Button variant="primary" type="submit" loading={submitting}>
                {submitting ? 'Envoi...' : 'Envoyer'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

export default FeedbackButton;
