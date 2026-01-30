# SmartCookBook Glossary

This glossary defines domain-specific terms used throughout the SmartCookBook commercial kitchen management system codebase. Terms are organized by category and sorted alphabetically.

## Business Domain Terms

### Handler
A person responsible for executing specific tasks or managing particular aspects of kitchen operations. In the codebase, handlers are often assigned to prep tasks and inventory management activities.

### In-House Production
The process of preparing and producing food items within the kitchen facility rather than purchasing pre-made products. Tracked through production workflows and task management systems.

### Invoice Line Item
Individual entries on vendor invoices that detail specific products, quantities, and prices. Used for cost tracking and inventory updates through the invoice processing system.

### Par Level
The minimum quantity of an ingredient or item that should be maintained in inventory. When stock falls below par level, the system can automatically generate orders or alerts.

### Prep List
A collection of preparation tasks that need to be completed, typically organized by priority and assigned to specific handlers. Managed through the task management system.

### Recipe Scaling
The process of adjusting recipe quantities up or down while maintaining proper ingredient ratios. Implemented through scaling algorithms in the recipe management system.

### Stock Adjustment
Manual corrections to inventory quantities to account for waste, spoilage, or discrepancies. Tracked through the inventory management system with audit trails.

### Vendor
Suppliers who provide ingredients, equipment, or services to the kitchen. Managed through vendor profiles that include contact information, pricing, and ordering details.

### Voice Dictation
Speech-to-text functionality that allows users to input recipe instructions, notes, and other text content using voice commands. Integrated throughout the recipe editing interface.

### Yield
The usable quantity of an ingredient after processing, accounting for waste and trim. Critical for accurate recipe costing and inventory calculations.

## Technical Terms

### Cloud Functions
Firebase serverless functions that handle backend processing, including data validation, automated calculations, and third-party integrations.

### Firestore
Google's NoSQL document database used as the primary data store for recipes, inventory, orders, and other application data.

### IndexedDB
Browser-based local storage used for offline data caching and synchronization when internet connectivity is limited.

### Vision Parser
AI-powered optical character recognition (OCR) system that extracts structured data from invoice images and documents.

## Codebase-Specific Terms

### Autopilot Agent
An autonomous code maintenance system that can analyze, modify, and test code changes without direct human intervention.

### Codebase Mapper
A utility that analyzes and documents the structure and relationships within the codebase, providing insights for maintenance and development.

### Credits Display
UI component that shows the current credit balance for API usage, particularly for AI-powered features like vision parsing and content generation.

### Offline Indicator
Component that displays the current network connectivity status and manages offline functionality throughout the application.

### Orchestrator
A system component that coordinates complex workflows and manages the interaction between multiple services and processes.

### Protected Route
React component that restricts access to certain pages based on user authentication and authorization levels.

### Validation Badge
UI component that displays the validation status of data entries, indicating whether information meets required standards or needs correction.

### Website Tab
Feature that automatically generates public-facing websites for restaurants based on their recipe and menu data stored in the system.
