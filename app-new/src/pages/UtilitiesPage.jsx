import { useState } from 'react';
import UtilityDemo from '../components/common/UtilityDemo';
import * as utils from '../utils';

function UtilitiesPage() {
  const [activeSection, setActiveSection] = useState('recipe');

  const sections = ['recipe', 'format', 'validation', 'voice'];

  return (
    <div className="p-xl">
      <div style={{ marginBottom: '20px' }}>
        <a
          href="/"
          style={{
            color: '#3498db',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 'bold',
          }}
        >
          ← Back to Component Library
        </a>
      </div>

      <h1>SmartCookBook - Utilities Library 🛠️</h1>
      <p className="mt-md" style={{ color: '#666', marginBottom: '30px' }}>
        Interactive playground for testing all utility functions. Try different inputs and see live results!
      </p>

      {/* Section Navigation */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '30px', flexWrap: 'wrap' }}>
        {sections.map((section) => (
          <button
            key={section}
            onClick={() => setActiveSection(section)}
            style={{
              padding: '10px 20px',
              border: activeSection === section ? '2px solid #3498db' : '1px solid #ddd',
              background: activeSection === section ? '#e3f2fd' : 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: activeSection === section ? 'bold' : 'normal',
              textTransform: 'capitalize',
            }}
          >
            {section} Utilities
          </button>
        ))}
      </div>

      {/* Recipe Utilities */}
      {activeSection === 'recipe' && (
        <section>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
            Recipe Utilities
          </h2>

          <UtilityDemo
            title="formatTime"
            description="Format minutes to human-readable time"
            inputs={[
              {
                name: 'minutes',
                label: 'Minutes',
                type: 'number',
                defaultValue: '90',
                placeholder: 'Enter minutes',
                required: true,
              },
            ]}
            execute={(minutes) => utils.formatTime(minutes)}
            codeExample={`import { formatTime } from '../utils';\n\nconst result = formatTime(90);\n// Returns: "1h 30m"`}
          />

          <UtilityDemo
            title="calculateTotalTime"
            description="Calculate total time from prep and cook times"
            inputs={[
              {
                name: 'prepTime',
                label: 'Prep Time (minutes)',
                type: 'number',
                defaultValue: '15',
                placeholder: 'Enter prep time',
              },
              {
                name: 'cookTime',
                label: 'Cook Time (minutes)',
                type: 'number',
                defaultValue: '30',
                placeholder: 'Enter cook time',
              },
            ]}
            execute={(prepTime, cookTime) => utils.calculateTotalTime(prepTime, cookTime)}
            codeExample={`import { calculateTotalTime } from '../utils';\n\nconst total = calculateTotalTime(15, 30);\n// Returns: 45`}
          />

          <UtilityDemo
            title="formatServings"
            description="Format servings count"
            inputs={[
              {
                name: 'servings',
                label: 'Servings',
                type: 'number',
                defaultValue: '4',
                placeholder: 'Enter servings',
              },
            ]}
            execute={(servings) => utils.formatServings(servings)}
            codeExample={`import { formatServings } from '../utils';\n\nconst result = formatServings(4);\n// Returns: "4 servings"`}
          />

          <UtilityDemo
            title="formatDifficulty"
            description="Format difficulty level with emoji"
            inputs={[
              {
                name: 'difficulty',
                label: 'Difficulty',
                type: 'text',
                defaultValue: 'medium',
                placeholder: 'easy, medium, or hard',
                hint: 'Enter: easy, medium, or hard',
              },
            ]}
            execute={(difficulty) => utils.formatDifficulty(difficulty)}
            codeExample={`import { formatDifficulty } from '../utils';\n\nconst result = formatDifficulty('medium');\n// Returns: "⭐⭐ Medium"`}
          />
        </section>
      )}

      {/* Format Utilities */}
      {activeSection === 'format' && (
        <section>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
            Formatting Utilities
          </h2>

          <UtilityDemo
            title="formatCurrency"
            description="Format amount as currency"
            inputs={[
              {
                name: 'amount',
                label: 'Amount',
                type: 'number',
                defaultValue: '12.50',
                placeholder: 'Enter amount',
              },
              {
                name: 'currency',
                label: 'Currency Symbol',
                type: 'text',
                defaultValue: '$',
                placeholder: 'Enter currency symbol',
              },
            ]}
            execute={(amount, currency) => utils.formatCurrency(amount, currency)}
            codeExample={`import { formatCurrency } from '../utils';\n\nconst result = formatCurrency(12.50, '$');\n// Returns: "$12.50"`}
          />

          <UtilityDemo
            title="capitalizeFirst"
            description="Capitalize first letter of string"
            inputs={[
              {
                name: 'text',
                label: 'Text',
                type: 'text',
                defaultValue: 'hello world',
                placeholder: 'Enter text',
              },
            ]}
            execute={(text) => utils.capitalizeFirst(text)}
            codeExample={`import { capitalizeFirst } from '../utils';\n\nconst result = capitalizeFirst('hello world');\n// Returns: "Hello world"`}
          />

          <UtilityDemo
            title="toTitleCase"
            description="Capitalize first letter of each word"
            inputs={[
              {
                name: 'text',
                label: 'Text',
                type: 'text',
                defaultValue: 'chocolate chip cookies',
                placeholder: 'Enter text',
              },
            ]}
            execute={(text) => utils.toTitleCase(text)}
            codeExample={`import { toTitleCase } from '../utils';\n\nconst result = toTitleCase('chocolate chip cookies');\n// Returns: "Chocolate Chip Cookies"`}
          />

          <UtilityDemo
            title="truncateText"
            description="Truncate text to specified length"
            inputs={[
              {
                name: 'text',
                label: 'Text',
                type: 'text',
                defaultValue: 'This is a very long recipe description',
                placeholder: 'Enter text',
              },
              {
                name: 'maxLength',
                label: 'Max Length',
                type: 'number',
                defaultValue: '20',
                placeholder: 'Enter max length',
              },
            ]}
            execute={(text, maxLength) => utils.truncateText(text, maxLength)}
            codeExample={`import { truncateText } from '../utils';\n\nconst result = truncateText('This is a very long recipe description', 20);\n// Returns: "This is a very lo..."`}
          />

          <UtilityDemo
            title="formatNumber"
            description="Format number with thousands separator"
            inputs={[
              {
                name: 'number',
                label: 'Number',
                type: 'number',
                defaultValue: '1234567',
                placeholder: 'Enter number',
              },
            ]}
            execute={(number) => utils.formatNumber(number)}
            codeExample={`import { formatNumber } from '../utils';\n\nconst result = formatNumber(1234567);\n// Returns: "1,234,567"`}
          />

          <UtilityDemo
            title="formatFileSize"
            description="Format bytes to human-readable size"
            inputs={[
              {
                name: 'bytes',
                label: 'Bytes',
                type: 'number',
                defaultValue: '1572864',
                placeholder: 'Enter bytes',
              },
            ]}
            execute={(bytes) => utils.formatFileSize(bytes)}
            codeExample={`import { formatFileSize } from '../utils';\n\nconst result = formatFileSize(1572864);\n// Returns: "1.50 MB"`}
          />

          <UtilityDemo
            title="formatPercentage"
            description="Calculate and format percentage"
            inputs={[
              {
                name: 'value',
                label: 'Value',
                type: 'number',
                defaultValue: '3',
                placeholder: 'Enter value',
              },
              {
                name: 'total',
                label: 'Total',
                type: 'number',
                defaultValue: '4',
                placeholder: 'Enter total',
              },
            ]}
            execute={(value, total) => utils.formatPercentage(value, total)}
            codeExample={`import { formatPercentage } from '../utils';\n\nconst result = formatPercentage(3, 4);\n// Returns: "75.0%"`}
          />
        </section>
      )}

      {/* Validation Utilities */}
      {activeSection === 'validation' && (
        <section>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
            Validation Utilities
          </h2>

          <UtilityDemo
            title="isValidEmail"
            description="Validate email address"
            inputs={[
              {
                name: 'email',
                label: 'Email',
                type: 'text',
                defaultValue: 'user@example.com',
                placeholder: 'Enter email',
              },
            ]}
            execute={(email) => utils.isValidEmail(email)}
            codeExample={`import { isValidEmail } from '../utils';\n\nconst result = isValidEmail('user@example.com');\n// Returns: true`}
          />

          <UtilityDemo
            title="isValidUrl"
            description="Validate URL"
            inputs={[
              {
                name: 'url',
                label: 'URL',
                type: 'text',
                defaultValue: 'https://example.com',
                placeholder: 'Enter URL',
              },
            ]}
            execute={(url) => utils.isValidUrl(url)}
            codeExample={`import { isValidUrl } from '../utils';\n\nconst result = isValidUrl('https://example.com');\n// Returns: true`}
          />

          <UtilityDemo
            title="validatePassword"
            description="Validate password strength"
            inputs={[
              {
                name: 'password',
                label: 'Password',
                type: 'text',
                defaultValue: 'MyP@ssw0rd123',
                placeholder: 'Enter password',
              },
            ]}
            execute={(password) => utils.validatePassword(password)}
            codeExample={`import { validatePassword } from '../utils';\n\nconst result = validatePassword('MyP@ssw0rd123');\n// Returns: { valid: true, strength: 'strong', errors: [] }`}
          />

          <UtilityDemo
            title="isRequired"
            description="Check if value is not empty"
            inputs={[
              {
                name: 'value',
                label: 'Value',
                type: 'text',
                defaultValue: 'some text',
                placeholder: 'Enter value',
              },
            ]}
            execute={(value) => utils.isRequired(value)}
            codeExample={`import { isRequired } from '../utils';\n\nconst result = isRequired('some text');\n// Returns: true`}
          />

          <UtilityDemo
            title="isInRange"
            description="Check if number is within range"
            inputs={[
              {
                name: 'value',
                label: 'Value',
                type: 'number',
                defaultValue: '5',
                placeholder: 'Enter value',
              },
              {
                name: 'min',
                label: 'Minimum',
                type: 'number',
                defaultValue: '1',
                placeholder: 'Enter min',
              },
              {
                name: 'max',
                label: 'Maximum',
                type: 'number',
                defaultValue: '10',
                placeholder: 'Enter max',
              },
            ]}
            execute={(value, min, max) => utils.isInRange(value, min, max)}
            codeExample={`import { isInRange } from '../utils';\n\nconst result = isInRange(5, 1, 10);\n// Returns: true`}
          />

          <UtilityDemo
            title="isPositiveNumber"
            description="Check if value is a positive number"
            inputs={[
              {
                name: 'value',
                label: 'Value',
                type: 'number',
                defaultValue: '5',
                placeholder: 'Enter value',
              },
            ]}
            execute={(value) => utils.isPositiveNumber(value)}
            codeExample={`import { isPositiveNumber } from '../utils';\n\nconst result = isPositiveNumber(5);\n// Returns: true`}
          />

          <UtilityDemo
            title="sanitizeInput"
            description="Remove HTML tags and trim whitespace"
            inputs={[
              {
                name: 'text',
                label: 'Text',
                type: 'text',
                defaultValue: '<script>alert("xss")</script>Hello',
                placeholder: 'Enter text with HTML',
              },
            ]}
            execute={(text) => utils.sanitizeInput(text)}
            codeExample={`import { sanitizeInput } from '../utils';\n\nconst result = sanitizeInput('<script>alert("xss")</script>Hello');\n// Returns: "Hello"`}
          />
        </section>
      )}

      {/* Voice Utilities */}
      {activeSection === 'voice' && (
        <section>
          <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
            Voice Recognition Utilities
          </h2>

          <UtilityDemo
            title="isSpeechRecognitionSupported"
            description="Check if browser supports speech recognition"
            inputs={[]}
            execute={() => utils.isSpeechRecognitionSupported()}
            codeExample={`import { isSpeechRecognitionSupported } from '../utils';\n\nconst supported = isSpeechRecognitionSupported();\n// Returns: true/false`}
          />

          <UtilityDemo
            title="cleanTranscript"
            description="Clean and format voice transcript"
            inputs={[
              {
                name: 'transcript',
                label: 'Transcript',
                type: 'text',
                defaultValue: '  hello world  ',
                placeholder: 'Enter transcript',
              },
            ]}
            execute={(transcript) => utils.cleanTranscript(transcript)}
            codeExample={`import { cleanTranscript } from '../utils';\n\nconst result = cleanTranscript('  hello world  ');\n// Returns: "Hello world"`}
          />

          <UtilityDemo
            title="convertWordsToNumbers"
            description="Convert number words to digits"
            inputs={[
              {
                name: 'text',
                label: 'Text',
                type: 'text',
                defaultValue: 'two cups of flour',
                placeholder: 'Enter text with number words',
              },
            ]}
            execute={(text) => utils.convertWordsToNumbers(text)}
            codeExample={`import { convertWordsToNumbers } from '../utils';\n\nconst result = convertWordsToNumbers('two cups of flour');\n// Returns: "2 cups of flour"`}
          />

          <UtilityDemo
            title="convertFractionsToDecimal"
            description="Convert fraction words to decimal"
            inputs={[
              {
                name: 'text',
                label: 'Text',
                type: 'text',
                defaultValue: 'one half cup sugar',
                placeholder: 'Enter text with fractions',
              },
            ]}
            execute={(text) => utils.convertFractionsToDecimal(text)}
            codeExample={`import { convertFractionsToDecimal } from '../utils';\n\nconst result = convertFractionsToDecimal('one half cup sugar');\n// Returns: "0.5 cup sugar"`}
          />

          <UtilityDemo
            title="processVoiceIngredient"
            description="Process voice input for ingredient parsing"
            inputs={[
              {
                name: 'transcript',
                label: 'Voice Transcript',
                type: 'text',
                defaultValue: 'two and a half cups flour',
                placeholder: 'Enter voice transcript',
              },
            ]}
            execute={(transcript) => utils.processVoiceIngredient(transcript)}
            codeExample={`import { processVoiceIngredient } from '../utils';\n\nconst result = processVoiceIngredient('two and a half cups flour');\n// Returns: "2 0.5 cups flour"`}
          />

          <UtilityDemo
            title="isVoiceCommand"
            description="Check if transcript is a command"
            inputs={[
              {
                name: 'transcript',
                label: 'Transcript',
                type: 'text',
                defaultValue: 'add ingredient flour',
                placeholder: 'Enter transcript',
              },
            ]}
            execute={(transcript) => utils.isVoiceCommand(transcript)}
            codeExample={`import { isVoiceCommand } from '../utils';\n\nconst result = isVoiceCommand('add ingredient flour');\n// Returns: true`}
          />
        </section>
      )}

      <div className="info-message mt-xl">
        📚 For complete API documentation, see{' '}
        <code>docs/UTILITIES_GUIDE.md</code>
      </div>
    </div>
  );
}

export default UtilitiesPage;
